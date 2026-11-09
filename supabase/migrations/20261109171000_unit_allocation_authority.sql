begin;

-- Initial registration never carries examiner-owned data, even through a
-- SECURITY DEFINER registration RPC. Preserve unrelated form fields.
create or replace function unit_allocation_internal.requester_input(p_input jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
 from jsonb_each(case when jsonb_typeof(p_input)='object' then p_input else '{}'::jsonb end)
 where left(key,10)<>'allocated_'
$$;

create or replace function public.guard_unit_allocation_authority()
returns trigger language plpgsql security invoker set search_path='' as $$
declare clean jsonb; previous_reserved jsonb; next_reserved jsonb;
begin
 if tg_op='INSERT' then
  -- Inline sanitization also covers direct inserts without granting private schema access.
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into clean
   from jsonb_each(coalesce(new.form_input_data,'{}'::jsonb)) where left(key,10)<>'allocated_';
  new.form_input_data:=clean;
  if lower(coalesce(clean->>'request_mode',clean->>'request_category',''))='unit' then
   new.data_snapshot:=coalesce(new.data_snapshot,'{}'::jsonb)
    -'allocated_units'-'allocated_project'-'allocated_unit_count'-'allocated_by_signature_id'-'allocated_at'
    -'verification_drafts'-'verification_inputs'-'revision'-'applied_revision';
   new.data_snapshot:=jsonb_set(new.data_snapshot,'{input}',clean);
  end if;
  return new;
 end if;
 if current_user in ('postgres','supabase_admin','service_role') then return new;end if;
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into previous_reserved
  from jsonb_each(coalesce(old.form_input_data,'{}'::jsonb)) where left(key,10)='allocated_';
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into next_reserved
  from jsonb_each(coalesce(new.form_input_data,'{}'::jsonb)) where left(key,10)='allocated_';
 if previous_reserved is distinct from next_reserved then
  raise exception 'Alokasi Unit wajib disimpan melalui pemeriksaan resmi.' using errcode='42501';
 end if;
 if lower(coalesce(old.form_input_data->>'request_mode',old.form_input_data->>'request_category',''))='unit' then
  if old.status::text in ('DONE','SELESAI','COMPLETED')
    and (new.form_input_data is distinct from old.form_input_data or new.data_snapshot is distinct from old.data_snapshot) then
   raise exception 'Data Unit selesai tidak dapat diubah langsung.' using errcode='42501';
  end if;
  if (coalesce(new.data_snapshot,'{}'::jsonb)-'attachments')
    is distinct from (coalesce(old.data_snapshot,'{}'::jsonb)-'attachments') then
   raise exception 'Snapshot pemeriksaan Unit wajib melalui alur resmi.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_unit_allocation_authority() from public,anon,authenticated,service_role;
drop trigger if exists guard_unit_allocation_authority on public.surat_registrasi;
create trigger guard_unit_allocation_authority before insert or update of form_input_data,data_snapshot on public.surat_registrasi
 for each row execute function public.guard_unit_allocation_authority();

-- Sanitize at the registration boundary as well, before any snapshot construction.
do $$declare source text; anchor text:=E'begin\n  if v_actor is null then';begin
 source:=replace(pg_get_functiondef('public.create_surat_registrasi_core(jsonb,uuid)'::regprocedure),E'\r\n',E'\n');
 if position('unit_allocation_internal.requester_input' in source)=0 then
  if position(anchor in source)=0 then raise exception 'Unknown registration core; audit before applying';end if;
  execute replace(source,anchor,E'begin\n  p_payload:=jsonb_set(p_payload,''{form_input_data}'',unit_allocation_internal.requester_input(p_payload->''form_input_data''));\n  if v_actor is null then');
 end if;
end $$;

-- Service-only read: no client marker can confer examiner authority. The existing
-- canonical gate also supports immutable, resolved external addendum revisions.
create or replace function public.get_verified_unit_allocation(p_surat_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc public.surat_registrasi; receipt public.surat_unit_allocation_history;
begin
 select * into strict doc from public.surat_registrasi where id=p_surat_id;
 select h.* into receipt from public.surat_unit_allocation_history h
 join public.surat_signatures s on s.id=h.signature_id and s.surat_id=h.surat_id
 where h.surat_id=doc.id and s.verification_status='verified'
  and s.verified_by=h.actor_id and s.verified_at=h.verified_at
  and h.signature_id::text=doc.form_input_data->>'allocated_by_signature_id'
 order by h.created_at desc,h.id desc limit 1;
 if receipt.id is null
  or not unit_allocation_internal.has_valid_review(doc.id,doc.form_input_data)
  or receipt.request_snapshot is distinct from jsonb_build_object(
   'requested_project',doc.form_input_data->'requested_project','requested_unit_count',doc.form_input_data->'requested_unit_count')
  or unit_allocation_internal.without_addendum_values(receipt.allocation_snapshot->'allocated_units')
   is distinct from unit_allocation_internal.without_addendum_values(doc.form_input_data->'allocated_units') then
  raise exception 'Data alokasi Unit tidak sesuai bukti pemeriksaan. Ulangi pemeriksaan.' using errcode='42501';
 end if;
 return doc.form_input_data;
end $$;
revoke all on function unit_allocation_internal.requester_input(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.get_verified_unit_allocation(uuid) from public,anon,authenticated;
grant execute on function public.get_verified_unit_allocation(uuid) to service_role;
notify pgrst,'reload schema';
commit;
