begin;

-- Publish only participant/admin-protected tables. Never broadcast profiles.
do $$
declare v_table text;
begin
  foreach v_table in array array['surat_attachments','surat_linked_documents','surat_recommendation_tasks','surat_revision_events','activity_logs'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||v_table) and relrowsecurity) then
      raise exception 'Realtime requires RLS: %',v_table;
    end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
      execute format('alter publication supabase_realtime add table public.%I',v_table);
    end if;
  end loop;
  if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime drop table public.profiles;
  end if;
end $$;

drop policy if exists surat_revision_events_participants_select on public.surat_revision_events;
create policy surat_revision_events_participants_select on public.surat_revision_events for select to authenticated using (
  actor_id=auth.uid() or auth.uid()=any(target_user_ids)
  or exists(select 1 from public.surat_registrasi sr where sr.id=surat_revision_events.surat_id and sr.created_by=auth.uid())
  or exists(select 1 from public.surat_signatures ss where ss.surat_id=surat_revision_events.surat_id
    and (ss.user_id=auth.uid() or (auth.uid() is not null and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)))))
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role::text in ('admin','super_admin'))
);

-- Keep the canonical verifier authorization, locks, audit and revision lifecycle.
do $$ begin
  if to_regprocedure('public.verify_surat_signature_pre_fund_items(uuid,text,jsonb)') is null then
    alter function public.verify_surat_signature_v2(uuid,text,jsonb) rename to verify_surat_signature_pre_fund_items;
  end if;
end $$;
revoke all on function public.verify_surat_signature_pre_fund_items(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.verify_surat_signature_pre_fund_items(uuid,text,jsonb) to service_role;

create or replace function public.verify_surat_signature_v2(p_sig_id uuid,p_note text default null,p_payload jsonb default '{}')
returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_sig public.surat_signatures%rowtype;
  v_surat public.surat_registrasi%rowtype;
  v_checks jsonb;
  v_items jsonb;
  v_input jsonb;
begin
  if auth.uid() is null then raise exception 'Tidak terautentikasi' using errcode='42501'; end if;
  select * into v_sig from public.surat_signatures where id=p_sig_id for update;
  if not found then raise exception 'Tugas pemeriksaan tidak ditemukan' using errcode='22023'; end if;
  if not coalesce(v_sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)),false)
     and not exists(select 1 from public.profiles where id=auth.uid() and role::text='admin' and is_active and deleted_at is null) then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini' using errcode='42501';
  end if;
  select * into v_surat from public.surat_registrasi where id=v_sig.surat_id for update;
  if v_sig.input_schema_snapshot->>'review_mode'='fund_item_checklist' then
    v_items:=coalesce(v_surat.form_input_data->'items','[]');
    v_input:=case when coalesce(p_payload,'{}')<>'{}' then p_payload else
      coalesce(v_surat.data_snapshot #> array['verification_drafts',p_sig_id::text,'input'],'{}') end;
    begin v_checks:=(v_input #>> '{checker_input,item_checks}')::jsonb;
    exception when others then raise exception 'Checklist item dana tidak valid' using errcode='22023'; end;
    if jsonb_typeof(v_checks) is distinct from 'array' or jsonb_typeof(v_items) is distinct from 'array' then
      raise exception 'Checklist item dana wajib diisi' using errcode='22023';
    end if;
    if jsonb_array_length(v_items)=0 or jsonb_array_length(v_items)<>jsonb_array_length(v_checks) or exists(
      select 1 from jsonb_array_elements(v_items) with ordinality item(value,n)
      where v_checks->(item.n::integer-1)->'checked' is distinct from 'true'::jsonb
        or v_checks->(item.n::integer-1)->'item_index' is distinct from to_jsonb(item.n-1)
        or v_checks->(item.n::integer-1)->'item' is distinct from item.value
        or jsonb_typeof(v_checks->(item.n::integer-1)->'note') is distinct from 'string'
        or length(v_checks->(item.n::integer-1)->>'note')>2000
    ) then raise exception 'Periksa semua item dana terbaru sebelum melanjutkan' using errcode='22023'; end if;
  end if;
  return public.verify_surat_signature_pre_fund_items(p_sig_id,p_note,p_payload);
end $$;
revoke all on function public.verify_surat_signature_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.verify_surat_signature_v2(uuid,text,jsonb) to authenticated,service_role;

-- The legacy RPC must not bypass item validation; other historical workflows keep their contract.
do $$ begin
  if to_regprocedure('public.verify_surat_signature_pre_fund_items(uuid,text)') is null then
    alter function public.verify_surat_signature(uuid,text) rename to verify_surat_signature_pre_fund_items;
  end if;
end $$;
revoke all on function public.verify_surat_signature_pre_fund_items(uuid,text) from public,anon,authenticated;
grant execute on function public.verify_surat_signature_pre_fund_items(uuid,text) to service_role;
create or replace function public.verify_surat_signature(p_sig_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.surat_signatures where id=p_sig_id and input_schema_snapshot->>'review_mode'='fund_item_checklist') then
    return public.verify_surat_signature_v2(p_sig_id,p_note,'{}'::jsonb);
  end if;
  return public.verify_surat_signature_pre_fund_items(p_sig_id,p_note);
end $$;
revoke all on function public.verify_surat_signature(uuid,text) from public,anon;
grant execute on function public.verify_surat_signature(uuid,text) to authenticated,service_role;

-- Default is limited to PGD Dana / HRD examination; KEU and completed signatures stay unchanged.
-- Existing tester verifier assignments on UJI STAGING are preserved.
do $$
declare v_step record; v_usman uuid; v_hrd uuid;
  v_schema jsonb:='{"review_mode":"fund_item_checklist","title":"Pemeriksaan item dana","description":"Periksa setiap item sebelum diteruskan ke manager.","fields":[{"key":"item_checks","label":"Checklist item dana","type":"text","required":true}]}';
begin
  select id into v_hrd from public.master_departments where lower(name)='hrd & ga';
  select p.id into v_usman from public.profiles p where lower(trim(p.full_name))='usman huda'
    and p.department_id=v_hrd and p.is_active and p.deleted_at is null;
  for v_step in select s.id,u.name from public.form_usage_steps s join public.form_usages u on u.id=s.usage_id
    join public.master_forms f on f.id=u.form_id where u.status='active'
    and trim(upper(f.nomor_form)) ~ '(^|[.-])PGD([.-]|$)' and u.name ilike '%Pengajuan Dana%'
    and s.role_name='memeriksa' and s.signer_department_id=v_hrd
  loop
    if v_step.name like '[UJI STAGING%' or v_usman is not null then
      update public.form_usage_steps set action_type='configured_input',input_schema=v_schema,
        verifier_department_id=case when v_step.name like '[UJI STAGING%' then verifier_department_id else v_hrd end,
        verifier_scope=case when v_step.name like '[UJI STAGING%' then verifier_scope else 'head_office' end where id=v_step.id;
      if v_step.name not like '[UJI STAGING%' then
        insert into public.form_usage_step_verifiers(usage_step_id,user_id) values(v_step.id,v_usman) on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
