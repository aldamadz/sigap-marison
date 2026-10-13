begin;

create schema if not exists issuing_office_internal;
revoke all on schema issuing_office_internal from public, anon, authenticated;

-- Current wizard drafts wrap formData; historical RPC callers used flat payloads.
create or replace function issuing_office_internal.draft_context(p_payload jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_context jsonb;
  v_key text;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Data draft tidak valid.' using errcode = '22023';
  end if;
  if p_payload ? 'formData' then
    if jsonb_typeof(p_payload->'formData') is distinct from 'object' then
      raise exception 'Data formulir draft tidak valid.' using errcode = '22023';
    end if;
    v_context := p_payload->'formData';
    foreach v_key in array array['office_id','entity_id','letter_type_id','project_id','dept_id'] loop
      if p_payload ? v_key and nullif(p_payload->>v_key,'')
          is distinct from nullif(v_context->>v_key,'') then
        raise exception 'Konteks draft tidak konsisten.' using errcode = '22023';
      end if;
    end loop;
  else
    v_context := p_payload;
  end if;
  if nullif(v_context->>'office_id','') is null then
    raise exception 'Kantor draft wajib diisi.' using errcode = '22023';
  end if;
  return v_context;
end;
$$;
revoke all on function issuing_office_internal.draft_context(jsonb) from public, anon, authenticated, service_role;

do $patch$
declare v_definition text;
begin
  v_definition := replace(pg_get_functiondef('public.create_surat_registration_draft(integer,text,jsonb,jsonb)'::regprocedure), E'\r\n', E'\n');
  if position('issuing_office_internal.draft_context(p_payload)' in v_definition) = 0 then
    if position('  v_reservation_id uuid;' in v_definition) = 0
      or position('r.office_id = nullif(p_payload->>''office_id''' in v_definition) = 0 then
      raise exception 'Unknown delegated draft reservation guard';
    end if;
    v_definition := replace(v_definition, '  v_reservation_id uuid;',
      '  v_reservation_id uuid;' || E'\n' || '  v_context jsonb := issuing_office_internal.draft_context(p_payload);');
    v_definition := replace(v_definition, 'p_payload->>''office_id''', 'v_context->>''office_id''');
    v_definition := replace(v_definition, 'p_payload->>''entity_id''', 'v_context->>''entity_id''');
    v_definition := replace(v_definition, 'p_payload->>''letter_type_id''', 'v_context->>''letter_type_id''');
    v_definition := replace(v_definition, 'p_payload->>''project_id''', 'v_context->>''project_id''');
    execute v_definition;
  end if;
end $patch$;

create or replace function public.guard_draft_issuing_office()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_office uuid; v_context jsonb;
begin
  if new.status <> 'DRAFT' or new.reservation_id is null then return new; end if;
  v_context := issuing_office_internal.draft_context(new.payload);
  select r.office_id into v_office from public.surat_reservations r
    where r.id = new.reservation_id and r.reserved_by = new.created_by and r.status = 'PENDING';
  if v_office is null or nullif(v_context->>'office_id','')::uuid is distinct from v_office then
    raise exception 'Kantor draft tidak sesuai reservasi nomor.' using errcode = '42501';
  end if;
  if not public.can_issue_for_office(v_office) then
    raise exception 'Akses kantor penerbit telah dicabut.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_draft_issuing_office() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
