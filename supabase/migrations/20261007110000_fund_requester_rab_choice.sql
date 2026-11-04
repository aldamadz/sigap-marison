begin;

-- Resolve from the document/signature snapshot, never from a browser-supplied waiver.
create or replace function public.is_fund_planning_signature(p_sig_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select
    sr.form_input_data->>'request_category'='non_asset'
    and ss.role_name='memeriksa' and ss.label_jabatan ilike '%perencanaan%'
    and upper(trim(coalesce(sr.location_snapshot #>> '{form,nomor_form}',sr.data_snapshot #>> '{form,nomor_form}',f.nomor_form,''))) ~ '(^|[.-])PGD([.-]|$)'
  from public.surat_signatures ss join public.surat_registrasi sr on sr.id=ss.surat_id
  left join public.form_usages u on u.id=sr.form_usage_id left join public.master_forms f on f.id=u.form_id
  where ss.id=p_sig_id),false);
$$;
revoke all on function public.is_fund_planning_signature(uuid) from public,anon,authenticated;
grant execute on function public.is_fund_planning_signature(uuid) to service_role;

create or replace function public.effective_fund_rab_requirements(p_sig_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_sig public.surat_signatures%rowtype; v_surat public.surat_registrasi%rowtype; v_rules jsonb; v_provided boolean;
begin
  select * into v_sig from public.surat_signatures where id=p_sig_id;
  v_rules:=coalesce(v_sig.attachment_requirements_snapshot,'[]');
  if not public.is_fund_planning_signature(p_sig_id) then return v_rules; end if;
  select * into v_surat from public.surat_registrasi where id=v_sig.surat_id;
  if not coalesce(v_surat.form_input_data,'{}') ? 'requester_has_rab' then return v_rules; end if;
  if not exists(select 1 from jsonb_array_elements(v_rules) r where r->>'requirement_key'='rab') then
    v_rules:=v_rules || '[{"requirement_key":"rab","label":"RAB hasil pemeriksaan","is_required":true,"min_files":1,"max_files":1,"allow_multiple":false,"allowed_types":["application/pdf"],"max_size_bytes":10485760}]'::jsonb;
  end if;
  v_provided:=v_surat.form_input_data->'requester_has_rab'='true'::jsonb;
  if coalesce(v_provided,false) and not exists(select 1 from public.surat_attachments a where a.surat_id=v_surat.id
    and a.stage='initial' and a.requirement_key='rab' and a.signature_id is null) then
    raise exception 'RAB dari pemohon belum dilampirkan. Kembalikan pengajuan untuk dilengkapi.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(case when r->>'requirement_key'='rab' then
    r || jsonb_build_object('is_required',not coalesce(v_provided,false),'min_files',
      case when coalesce(v_provided,false) then 0 else greatest(1,coalesce((r->>'min_files')::integer,1)) end)
    else r end order by n),'[]') into v_rules
  from jsonb_array_elements(v_rules) with ordinality t(r,n);
  return v_rules;
end $$;
revoke all on function public.effective_fund_rab_requirements(uuid) from public,anon,authenticated;
grant execute on function public.effective_fund_rab_requirements(uuid) to service_role;

-- Keep the existing canonical lifecycle intact. Replace only its attachment source.
do $$
declare v_source text; v_old text:='coalesce(v_signature.attachment_requirements_snapshot, ''[]''::jsonb)';
  v_new text:='public.effective_fund_rab_requirements(v_signature.id)';
begin
  select pg_get_functiondef('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)'::regprocedure) into v_source;
  if position(v_new in v_source)=0 then
    if position(v_old in v_source)=0 or (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1 then
      raise exception 'Canonical verifier attachment source drift: audit before applying RAB policy';
    end if;
    execute replace(v_source,v_old,v_new);
  end if;
end $$;

-- Enforce RAB also on verifier stages whose configured action is plain approval.
do $$ begin
  if to_regprocedure('public.verify_surat_signature_pre_requester_rab(uuid,text,jsonb)') is null then
    alter function public.verify_surat_signature_v2(uuid,text,jsonb) rename to verify_surat_signature_pre_requester_rab;
  end if;
end $$;
revoke all on function public.verify_surat_signature_pre_requester_rab(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.verify_surat_signature_pre_requester_rab(uuid,text,jsonb) to service_role;
create or replace function public.verify_surat_signature_v2(p_sig_id uuid,p_note text default null,p_payload jsonb default '{}')
returns boolean language plpgsql security definer set search_path=public as $$
declare v_sig public.surat_signatures%rowtype; v_surat public.surat_registrasi%rowtype; v_rule jsonb;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi' using errcode='42501'; end if;
  select * into v_sig from public.surat_signatures where id=p_sig_id for update;
  if not found then raise exception 'Tugas pemeriksaan tidak ditemukan' using errcode='22023'; end if;
  if not coalesce(v_sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)),false)
    and not exists(select 1 from public.profiles where id=auth.uid() and role::text='admin' and is_active and deleted_at is null) then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini' using errcode='42501';
  end if;
  select * into v_surat from public.surat_registrasi where id=v_sig.surat_id for update;
  if public.is_fund_planning_signature(p_sig_id) then
    for v_rule in select value from jsonb_array_elements(public.effective_fund_rab_requirements(p_sig_id))
      where value->>'requirement_key'='rab' and value->'is_required'='true'::jsonb
    loop
      if (select count(*) from public.surat_attachments a where a.surat_id=v_surat.id and a.signature_id=p_sig_id
        and a.stage='approval' and a.requirement_key='rab') < greatest(1,coalesce((v_rule->>'min_files')::integer,1)) then
        raise exception 'Lampiran pemeriksaan belum lengkap: RAB hasil pemeriksaan.' using errcode='22023';
      end if;
    end loop;
  end if;
  return public.verify_surat_signature_pre_requester_rab(p_sig_id,p_note,p_payload);
end $$;
revoke all on function public.verify_surat_signature_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.verify_surat_signature_v2(uuid,text,jsonb) to authenticated,service_role;

-- The legacy RPC must pass the same attachment and actor guards.
create or replace function public.verify_surat_signature(p_sig_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if public.is_fund_planning_signature(p_sig_id) or exists(select 1 from public.surat_signatures
    where id=p_sig_id and input_schema_snapshot->>'review_mode'='fund_item_checklist') then
    return public.verify_surat_signature_v2(p_sig_id,p_note,'{}'::jsonb);
  end if;
  return public.verify_surat_signature_pre_fund_items(p_sig_id,p_note);
end $$;
revoke all on function public.verify_surat_signature(uuid,text) from public,anon;
grant execute on function public.verify_surat_signature(uuid,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
