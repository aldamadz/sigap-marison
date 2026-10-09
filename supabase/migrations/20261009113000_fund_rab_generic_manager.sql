begin;

-- Generic configurable manager labels must not hide the optional Fund RAB.
create or replace function public.fund_rab_stage(p_sig_id uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when ss.label_jabatan ilike '%perencanaan%' then 'planning'
    when ss.label_jabatan ilike '%hrd%' or ss.label_jabatan ilike '%sdm%'
      or ss.label_jabatan ilike '%sumber daya manusia%' then 'hrd'
    when ss.label_jabatan ~* '^\s*(manager|mgr\.?)\s+terkait\s*$' then 'reviewer'
    else null end
  from public.surat_signatures ss join public.surat_registrasi sr on sr.id=ss.surat_id
  left join public.form_usages u on u.id=sr.form_usage_id
  left join public.master_forms f on f.id=u.form_id
  where ss.id=p_sig_id and ss.role_name='memeriksa'
    and coalesce(sr.form_input_data->>'request_category',sr.form_input_data->>'request_mode')='non_asset'
    and upper(trim(coalesce(sr.location_snapshot#>>'{form,nomor_form}',
      sr.data_snapshot#>>'{form,nomor_form}',f.nomor_form,''))) ~ '(^|[.-])PGD([.-]|$)'
$$;
revoke all on function public.fund_rab_stage(uuid) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
