create or replace function public.create_surat_registrasi(p_payload jsonb)
returns public.surat_registrasi
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.surat_registrasi;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia. Silakan login ulang.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'Akun deaktif.';
  end if;

  insert into public.surat_registrasi (
    no_surat,
    entity_id,
    office_id,
    project_id,
    dept_id,
    letter_type_id,
    penggunaan_id,
    judul_surat,
    file_path,
    lampiran_path,
    is_aset,
    status,
    current_step,
    created_by,
    requester_nik,
    request_place,
    request_date,
    form_input_data,
    requester_snapshot,
    location_snapshot,
    pdf_path,
    data_snapshot
  )
  values (
    nullif(p_payload->>'no_surat', ''),
    nullif(p_payload->>'entity_id', '')::uuid,
    nullif(p_payload->>'office_id', '')::uuid,
    nullif(p_payload->>'project_id', '')::uuid,
    nullif(p_payload->>'dept_id', '')::uuid,
    nullif(p_payload->>'letter_type_id', '')::uuid,
    nullif(p_payload->>'penggunaan_id', '')::uuid,
    coalesce(nullif(p_payload->>'judul_surat', ''), 'Tanpa Judul'),
    nullif(p_payload->>'file_path', ''),
    nullif(p_payload->>'lampiran_path', ''),
    coalesce(nullif(p_payload->>'is_aset', '')::boolean, false),
    coalesce(nullif(p_payload->>'status', ''), 'PROSES'),
    coalesce(nullif(p_payload->>'current_step', '')::integer, 1),
    v_actor,
    nullif(p_payload->>'requester_nik', ''),
    nullif(p_payload->>'request_place', ''),
    nullif(p_payload->>'request_date', '')::date,
    coalesce(p_payload->'form_input_data', '{}'::jsonb),
    coalesce(p_payload->'requester_snapshot', '{}'::jsonb),
    coalesce(p_payload->'location_snapshot', '{}'::jsonb),
    nullif(p_payload->>'pdf_path', ''),
    coalesce(p_payload->'data_snapshot', '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_surat_registrasi(jsonb) from public, anon;
grant execute on function public.create_surat_registrasi(jsonb) to authenticated, service_role;
