-- REC-03: all-rejected asset recommendations deliberately produce no outbound job.

drop trigger if exists skip_all_rejected_asset_dispatch_before_change on public.marison_outbound_dispatches;
drop function if exists public.skip_all_rejected_asset_dispatch();

create or replace function public.recommendation_all_items_rejected(p_parent_surat_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_items jsonb;v_item jsonb;v_detail jsonb;v_details jsonb;v_status text;v_total integer:=0;v_rejected integer:=0;v_nested_total integer;v_nested_rejected integer;
begin
  select coalesce(c.form_input_data#>'{recommendation_multi_detail,items}',c.form_input_data->'recommendation_items',p.data_snapshot#>'{recommendation,items}',p.data_snapshot->'recommendation_decisions',p.form_input_data#>'{recommendation_multi_detail,items}',p.form_input_data->'recommendation_items') into v_items
  from public.surat_registrasi p left join lateral (
    select child.form_input_data from public.surat_linked_documents l join public.surat_registrasi child on child.id=l.child_surat_id
    where l.parent_surat_id=p.id and l.link_type='recommendation' and l.status='active' order by l.updated_at desc,l.id desc limit 1
  ) c on true where p.id=p_parent_surat_id;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)=0 then return false; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_total:=v_total+1;
    v_status:=regexp_replace(lower(btrim(coalesce(v_item->>'status',v_item->>'recommendation_status',v_item->>'recommendation_action',v_item->>'action',''))),'[[:space:]_-]+','_','g');
    if v_status in ('not_recommended','tidak_direkomendasikan','rejected','ditolak') or lower(coalesce(v_item->>'is_recommended','true'))='false'
       or (nullif(btrim(coalesce(v_item->>'tidak_direkomendasikan','')),'') is not null and lower(btrim(v_item->>'tidak_direkomendasikan')) not in ('false','0','no','tidak','-')) then
      v_rejected:=v_rejected+1;
    else
      v_details:=case when jsonb_typeof(v_item->'details')='array' then v_item->'details' when jsonb_typeof(v_item->'recommendation_details')='array' then v_item->'recommendation_details' else null end;
      v_nested_total:=0;v_nested_rejected:=0;
      for v_detail in select value from jsonb_array_elements(coalesce(v_details,'[]')) loop
        v_nested_total:=v_nested_total+1;
        v_status:=regexp_replace(lower(btrim(coalesce(v_detail->>'status',v_detail->>'recommendation_status',v_detail->>'recommendation_action',v_detail->>'action',''))),'[[:space:]_-]+','_','g');
        if v_status in ('not_recommended','tidak_direkomendasikan','rejected','ditolak') or lower(coalesce(v_detail->>'is_recommended','true'))='false'
           or (nullif(btrim(coalesce(v_detail->>'tidak_direkomendasikan','')),'') is not null and lower(btrim(v_detail->>'tidak_direkomendasikan')) not in ('false','0','no','tidak','-')) then v_nested_rejected:=v_nested_rejected+1; end if;
      end loop;
      if v_nested_total>0 and v_nested_total=v_nested_rejected then v_rejected:=v_rejected+1; end if;
    end if;
  end loop;
  return v_total>0 and v_rejected=v_total;
end;
$$;

drop function public.ensure_marison_outbound_dispatch(uuid,text);
create function public.ensure_marison_outbound_dispatch(p_surat_id uuid,p_environment text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_surat public.surat_registrasi%rowtype;v_input jsonb;v_category text;v_kind text;v_endpoint text;v_skip_code text;v_skip_reason text;v_job_id uuid;
begin
  if p_environment not in ('staging','production') then raise exception 'Invalid Marison environment' using errcode='22023'; end if;
  if not exists(select 1 from public.marison_outbound_settings where singleton and environment=p_environment and enabled) then return jsonb_build_object('dispatch_id',null,'skipped',true,'code','dispatch_disabled','no_dispatch',true); end if;
  perform pg_advisory_xact_lock(hashtextextended('marison-dispatch:'||p_environment||':'||p_surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=p_surat_id for update;
  if not found then raise exception 'Surat not found' using errcode='P0002'; end if;
  if upper(coalesce(v_surat.status::text,'')) not in ('SELESAI','DONE') then return jsonb_build_object('dispatch_id',null,'skipped',true,'code','surat_not_final','no_dispatch',true); end if;
  select id into v_job_id from public.marison_outbound_dispatches where surat_id=p_surat_id and environment=p_environment order by generation desc limit 1;
  if found then return jsonb_build_object('dispatch_id',v_job_id,'skipped',false,'code',null,'no_dispatch',false); end if;
  if coalesce(v_surat.data_snapshot#>>'{marison_dispatch,status}','')='success' and v_surat.data_snapshot#>>'{marison_dispatch,environment}'=p_environment then return jsonb_build_object('dispatch_id',null,'skipped',true,'code','legacy_dispatch_succeeded','no_dispatch',true); end if;
  v_input:=coalesce(v_surat.data_snapshot->'input','{}')||coalesce(v_surat.data_snapshot#>'{verification_inputs,latest}','{}')||coalesce(v_surat.form_input_data,'{}');
  v_category:=lower(btrim(coalesce(v_input->>'request_category',v_input->>'request_mode','')));
  if exists(select 1 from public.surat_linked_documents where child_surat_id=p_surat_id and link_type='recommendation' and status='active') or lower(coalesce(v_input->>'linked_document_type',''))='recommendation' or nullif(v_input->>'linked_parent_surat_id','') is not null then
    v_skip_code:='recommendation_child';v_skip_reason:='Dokumen rekomendasi mengikuti pengajuan induk dan tidak dikirim terpisah.';
  elsif v_category='unit' then v_kind:='unit';v_endpoint:='/unit-submissions';
  elsif v_category in ('non_unit','nonunit') then v_kind:='non_unit';v_endpoint:='/non-unit-submissions';
  elsif v_category='asset' and public.recommendation_all_items_rejected(p_surat_id) then return jsonb_build_object('dispatch_id',null,'skipped',true,'code','all_recommendations_rejected','no_dispatch',true);
  elsif v_category='asset' then v_kind:='asset';v_endpoint:='/asset-purchase-requests';
  else v_skip_code:='unsupported_category';v_skip_reason:=format('Kategori %s belum memiliki endpoint outbound Marison.',coalesce(nullif(v_category,''),'-')); end if;
  insert into public.marison_outbound_dispatches(surat_id,environment,generation,kind,endpoint,idempotency_key,status,skipped_code,skipped_reason,completed_at)
  values(p_surat_id,p_environment,1,v_kind,v_endpoint,format('sigap:%s:%s:%s',p_environment,coalesce(v_kind,'skipped'),p_surat_id),case when v_skip_code is null then 'pending'::public.marison_outbound_dispatch_status else 'skipped'::public.marison_outbound_dispatch_status end,v_skip_code,v_skip_reason,case when v_skip_code is null then null else clock_timestamp() end) returning id into v_job_id;
  return jsonb_build_object('dispatch_id',v_job_id,'skipped',v_skip_code is not null,'code',v_skip_code,'no_dispatch',false);
end;
$$;

drop function public.create_marison_outbound_replacement(uuid,uuid,text);
create function public.create_marison_outbound_replacement(p_dispatch_id uuid,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.marison_outbound_dispatches%rowtype;v_existing uuid;v_new uuid;
begin
  if not exists(select 1 from public.profiles where id=p_actor_id and role::text='admin' and is_active and deleted_at is null) then raise exception 'Active admin is required' using errcode='42501'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Reason is required' using errcode='22023'; end if;
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id;
  if not found then raise exception 'Dispatch not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended('marison-dispatch:'||v_old.environment||':'||v_old.surat_id::text,0));
  select * into v_old from public.marison_outbound_dispatches where id=p_dispatch_id for update;
  if v_old.environment<>'staging' or v_old.status<>'failed_terminal' or v_old.error_code is distinct from 'marison_http_422' or v_old.post_started_at is null or v_old.external_reference is not null then raise exception 'Only confirmed staging HTTP 422 dispatches can be replaced' using errcode='55000'; end if;
  if v_old.kind='asset' and public.recommendation_all_items_rejected(v_old.surat_id) then return jsonb_build_object('dispatch_id',null,'skipped',true,'code','all_recommendations_rejected','no_dispatch',true); end if;
  select id into v_existing from public.marison_outbound_dispatches where replacement_of_dispatch_id=v_old.id order by created_at desc,id desc limit 1;
  if v_existing is not null then return jsonb_build_object('dispatch_id',v_existing,'skipped',false,'code',null,'no_dispatch',false); end if;
  v_new:=public.create_marison_outbound_replacement_strict(p_dispatch_id,p_actor_id,p_reason);
  return jsonb_build_object('dispatch_id',v_new,'skipped',false,'code',null,'no_dispatch',false);
end;
$$;

update public.marison_outbound_dispatches d set status='skipped',skipped_code='all_recommendations_rejected',skipped_reason='Seluruh parent rekomendasi aset ditolak sebelum POST; dispatch sengaja dilewati.',completed_at=clock_timestamp(),lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
where d.kind='asset'
  and (d.status in ('pending','failed_retryable') or (d.status='processing' and (d.lease_expires_at is null or d.lease_expires_at<=clock_timestamp())))
  and d.response is null and d.external_reference is null and d.post_started_at is null
  and public.recommendation_all_items_rejected(d.surat_id);

create function public.skip_marison_outbound_if_all_rejected(p_job_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job public.marison_outbound_dispatches%rowtype;
begin
  select * into v_job from public.marison_outbound_dispatches where id=p_job_id for update;
  if not found or v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token or v_job.lease_expires_at<=clock_timestamp() or v_job.post_started_at is not null then raise exception 'Stale lease' using errcode='55000'; end if;
  if v_job.kind='asset' and public.recommendation_all_items_rejected(v_job.surat_id) then
    update public.marison_outbound_dispatches set status='skipped',skipped_code='all_recommendations_rejected',skipped_reason='Seluruh parent rekomendasi aset ditolak sebelum payload dibangun; dispatch sengaja dilewati.',completed_at=clock_timestamp(),lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp() where id=p_job_id;
    return jsonb_build_object('skipped',true,'code','all_recommendations_rejected','no_dispatch',false);
  end if;
  return jsonb_build_object('skipped',false,'code',null,'no_dispatch',false);
end;
$$;

revoke all on function public.ensure_marison_outbound_dispatch(uuid,text) from public,anon,authenticated;
grant execute on function public.ensure_marison_outbound_dispatch(uuid,text) to service_role;
revoke all on function public.create_marison_outbound_replacement(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_marison_outbound_replacement(uuid,uuid,text) to service_role;
revoke all on function public.skip_marison_outbound_if_all_rejected(uuid,uuid) from public,anon,authenticated;
grant execute on function public.skip_marison_outbound_if_all_rejected(uuid,uuid) to service_role;
