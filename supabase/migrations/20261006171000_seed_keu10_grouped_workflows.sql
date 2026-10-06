begin;

-- No employee creation, title edits, or environment-specific fixture IDs belong here.
do $$
declare
  v_finance uuid; v_legal uuid; v_business uuid; v_directors uuid; v_form uuid;
  v_ids uuid[]; v_group record; v_route uuid; v_usage uuid; v_config jsonb;
  v_roles text[]; v_labels text[]; v_departments uuid[]; v_step uuid; v_route_step uuid;
  v_order integer; v_count integer; v_candidates uuid[];
begin
  select array_agg(id) into v_ids from public.master_departments where lower(btrim(name))='keuangan & akuntansi';
  if cardinality(v_ids) is distinct from 1 then raise exception 'KEU10 requires exactly one Finance department'; end if;
  v_finance := v_ids[1];
  select array_agg(id) into v_ids from public.master_departments where lower(btrim(name))='legal lahan';
  if cardinality(v_ids) is distinct from 1 then raise exception 'KEU10 requires exactly one Legal Lahan department'; end if;
  v_legal := v_ids[1];
  select array_agg(id) into v_ids from public.master_departments where lower(btrim(name))='pengembangan bisnis';
  if cardinality(v_ids) is distinct from 1 then raise exception 'KEU10 requires exactly one Business Development department'; end if;
  v_business := v_ids[1];
  select array_agg(id) into v_ids from public.master_departments where lower(btrim(name))='direksi';
  if cardinality(v_ids) is distinct from 1 then raise exception 'KEU10 requires exactly one Direksi department'; end if;
  v_directors := v_ids[1];

  foreach v_step in array array[v_finance,v_legal,v_business] loop
    if not exists(select 1 from public.profiles profile join public.master_offices office on office.id=profile.office_id
      where profile.is_active is true and profile.deleted_at is null and profile.department_id=v_step
      and lower(btrim(office.kedudukan))='pusat'
      and (lower(btrim(profile.job_title)) ~ '^(mgr[.]?|manager)([[:space:]]|$)'
        or lower(btrim(to_jsonb(profile)->>'job_title_display')) ~ '^(mgr[.]?|manager)([[:space:]]|$)')) then
      raise exception 'KEU10 active HQ manager is missing for department %',v_step;
    end if;
  end loop;
  if not exists(select 1 from public.profiles profile join public.master_offices office on office.id=profile.office_id
    where profile.is_active is true and profile.deleted_at is null and profile.department_id=v_directors
    and lower(btrim(office.kedudukan))='pusat' and public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')='DI')
    or not exists(select 1 from public.profiles profile join public.master_offices office on office.id=profile.office_id
      where profile.is_active is true and profile.deleted_at is null and profile.department_id=v_directors
      and lower(btrim(office.kedudukan))='pusat' and public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')='DU') then
    raise exception 'KEU10 requires active HQ Direktur I and Direktur Utama; no fixture is seeded';
  end if;

  select array_agg(id) into v_ids from public.master_forms where upper(btrim(nomor_form))='FM-UAI.KEU-10-00';
  if cardinality(v_ids)>1 then raise exception 'KEU10 master form is ambiguous'; end if;
  v_form := v_ids[1];
  if v_form is null then
    insert into public.master_forms(nama_form,nomor_form,department_id,input_schema)
      values('FORM BIAYA PENGADAAN TANAH & PENGURUSAN IZIN','FM-UAI.KEU-10-00',v_finance,'[]') returning id into v_form;
  end if;

  for v_group in select * from (values
    ('legal_land','KEU10 - Legal Lahan',1,
      '[{"code":"ippt_izin","label":"Biaya IPPT dan izin lainnya"},{"code":"pembebasan_pertek","label":"Biaya pembebasan tanah dan perizinan Pertek"},{"code":"taktis_dprd","label":"Dana taktis fungsional teknik DPRD"},{"code":"survei_sertifikat_induk","label":"Biaya survei BPN dan Pemda untuk SK sertifikat induk"},{"code":"pelepasan_hak","label":"Biaya pelepasan hak"},{"code":"penggabungan_sertifikat","label":"Biaya penggabungan sertifikat"},{"code":"petak_bidang","label":"Biaya permohonan petak bidang"},{"code":"pecah_sertifikat","label":"Biaya pecah sertifikat"},{"code":"patok_lahan","label":"Biaya patok lahan sesuai sertifikat"},{"code":"sk_hgb_pendaftaran","label":"Biaya pelepasan dan permohonan SK HGB serta pendaftaran"},{"code":"penggabungan_bidang","label":"Biaya penggabungan bidang dan pendaftaran"},{"code":"pertek","label":"Biaya Pertek"},{"code":"ukur_proyek","label":"Biaya ukur proyek"},{"code":"blangko_pelepasan","label":"Material blangko pelepasan dan TTD kepala desa/saksi"}]'::jsonb),
    ('tactical_land','KEU10 - Taktis Lahan',2,
      '[{"code":"pengondisian_lahan","label":"Dana taktis pengondisian dan pengamanan lahan"}]'::jsonb),
    ('village_equipment','KEU10 - Perangkat Desa dan Perlengkapan',3,
      '[{"code":"perangkat_desa","label":"Biaya perangkat desa hasil sosialisasi"},{"code":"perlengkapan_sosialisasi","label":"Tiang bendera dan kursi plastik hasil sosialisasi"}]'::jsonb)
  ) as groups(disposition,label,ordinal,purposes) loop
    v_route := ('6e101000-0000-4000-8000-'||lpad(v_group.ordinal::text,12,'0'))::uuid;
    v_usage := ('6e102000-0000-4000-8000-'||lpad(v_group.ordinal::text,12,'0'))::uuid;
    v_config := jsonb_build_object('version',1,'disposition',v_group.disposition,'purposes',v_group.purposes,
      'approval_threshold',case when v_group.disposition='tactical_land' then 2000000 end);
    if exists(select 1 from public.form_usages where id=v_usage) then
      if not exists(select 1 from public.form_usages where id=v_usage and form_id=v_form and route_id=v_route and keu10_config=v_config) then
        raise exception 'KEU10 stable usage identity/configuration drift'; end if;
      perform public.assert_keu10_route(v_config,(select jsonb_agg(to_jsonb(step) order by step_order)
        from public.form_usage_steps step where usage_id=v_usage));
      continue;
    end if;
    if exists(select 1 from public.form_usages where keu10_config->>'disposition'=v_group.disposition)
      or exists(select 1 from public.approval_route_templates where id=v_route or name=v_group.label) then
      raise exception 'KEU10 group/route already exists under another identity'; end if;

    if v_group.disposition='tactical_land' then
      v_roles := array['membuat','memeriksa','verifikator','menyetujui'];
      v_labels := array['Branch Manager','Manager Pengembangan Bisnis','Mgr. Keuangan & Akuntansi','Direktur I / Direktur Utama'];
      v_departments := array[null::uuid,v_business,v_finance,v_directors];
    else
      v_roles := array['membuat','memeriksa','memeriksa','verifikator','menyetujui'];
      v_labels := array['Branch Manager',case when v_group.disposition='legal_land' then 'Manager Legal Lahan' else 'Manager Pengembangan Bisnis' end,
        'Direktur I','Mgr. Keuangan & Akuntansi','Direktur Utama'];
      v_departments := array[null::uuid,case when v_group.disposition='legal_land' then v_legal else v_business end,v_directors,v_finance,v_directors];
    end if;
    v_count := cardinality(v_roles);
    insert into public.approval_route_templates(id,name,description,status)
      values(v_route,v_group.label,'KEU10 v1: '||v_group.disposition,'active');
    insert into public.form_usages(id,form_id,route_id,name,description,request_category,scope_type,status,sort_order,first_maker_policy,keu10_config,external_revision_policy)
      values(v_usage,v_form,v_route,v_group.label,'KEU10 v1: '||v_group.disposition,'non_asset','cabang','active',80+v_group.ordinal,'configured',v_config,
        '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}');
    insert into public.form_usage_departments(usage_id,department_id)
      select distinct v_usage,profile.department_id from public.profiles profile join public.master_offices office on office.id=profile.office_id
      where profile.is_active is true and profile.deleted_at is null and profile.department_id is not null
      and lower(btrim(office.kedudukan)) in ('kc','kcp');
    if not exists(select 1 from public.form_usage_departments where usage_id=v_usage) then
      raise exception 'KEU10 has no authorized branch requester departments'; end if;
    for v_order in 1..v_count loop
      v_route_step := md5(v_route::text||':'||v_order::text)::uuid;
      v_step := md5(v_usage::text||':'||v_order::text)::uuid;
      insert into public.approval_route_steps(id,route_id,step_order,role_name,label,action_type)
        values(v_route_step,v_route,v_order,v_roles[v_order],v_labels[v_order],'approval');
      insert into public.form_usage_steps(id,usage_id,route_step_id,step_order,role_name,label,signer_department_id,action_type,
        assignee_mode,candidate_scope,input_schema,skip_if_no_candidate,candidate_fallback_mode)
        values(v_step,v_usage,v_route_step,v_order,v_roles[v_order],v_labels[v_order],v_departments[v_order],'approval','select',
          case when v_order=1 then 'request_office' else 'head_office' end,'{}',false,
          case when v_order=1 then 'related_branch_manager' end);
      if v_order=1 then continue; end if;
      select array_agg(profile.id order by profile.id) into v_candidates from public.profiles profile
        join public.master_offices office on office.id=profile.office_id
        where profile.is_active is true and profile.deleted_at is null and profile.department_id=v_departments[v_order]
        and lower(btrim(office.kedudukan))='pusat' and case
          when v_order=v_count then public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')=any(
            case when v_group.disposition='tactical_land' then array['DI','DU'] else array['DU'] end)
          when v_order=3 and v_count=5 then public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')='DI'
          else lower(btrim(profile.job_title)) ~ '^(mgr[.]?|manager)([[:space:]]|$)'
            or lower(btrim(to_jsonb(profile)->>'job_title_display')) ~ '^(mgr[.]?|manager)([[:space:]]|$)' end;
      if coalesce(cardinality(v_candidates),0)=0 then raise exception 'KEU10 required configured candidate is missing'; end if;
      insert into public.form_usage_step_users(usage_step_id,user_id) select v_step,unnest(v_candidates);
    end loop;
    perform public.assert_keu10_route(v_config,(select jsonb_agg(to_jsonb(step) order by step_order)
      from public.form_usage_steps step where usage_id=v_usage));
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
