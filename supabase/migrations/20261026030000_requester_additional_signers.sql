begin;

alter table public.surat_signatures add column if not exists is_additional boolean not null default false;
create schema if not exists signer_plan_internal;
revoke all on schema signer_plan_internal from public, anon, authenticated, service_role;
create table if not exists signer_plan_internal.initialization_permits (
  transaction_id bigint not null, surat_id uuid not null, primary key(transaction_id,surat_id)
);
alter table signer_plan_internal.initialization_permits enable row level security;
revoke all on signer_plan_internal.initialization_permits from public, anon, authenticated, service_role;

create or replace function signer_plan_internal.initializing(p_surat_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from signer_plan_internal.initialization_permits
    where transaction_id=txid_current() and surat_id=p_surat_id);
$$;

create or replace function signer_plan_internal.effective_order(p_surat_id uuid,p_step_id uuid,p_fallback integer)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce((select (item->>'step_order')::integer from public.surat_registrasi surat,
    lateral jsonb_array_elements(surat.policy_snapshot->'signer_plan') item
    where surat.id=p_surat_id and item->>'form_usage_step_id'=p_step_id::text),p_fallback);
$$;

create or replace function signer_plan_internal.route_count(p_surat_id uuid)
returns integer language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_array_length(policy_snapshot->'signer_plan'),
    jsonb_array_length(policy_snapshot->'keu10_steps')) from public.surat_registrasi where id=p_surat_id;
$$;

create or replace function signer_plan_internal.guard_plan_document()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if signer_plan_internal.initializing(new.id) then return new; end if;
  if tg_op='INSERT' then
    if new.policy_snapshot ? 'signer_plan' then
      raise exception 'Susunan penandatangan wajib dibuat melalui registrasi atomik.' using errcode='42501';
    end if;
  elsif new.policy_snapshot->'signer_plan' is distinct from old.policy_snapshot->'signer_plan'
    or new.policy_snapshot->'signer_plan_captured_by' is distinct from old.policy_snapshot->'signer_plan_captured_by'
    or new.policy_snapshot->'signer_plan_captured_at' is distinct from old.policy_snapshot->'signer_plan_captured_at' then
    raise exception 'Susunan penandatangan pengajuan yang telah dikirim tidak dapat diubah.' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists aa_guard_signer_plan_document on public.surat_registrasi;
create trigger aa_guard_signer_plan_document before insert or update on public.surat_registrasi
for each row execute function signer_plan_internal.guard_plan_document();

create or replace function signer_plan_internal.guard_plan_signature()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_id uuid; v_director_mutation boolean;
begin
  v_id := case when tg_op='DELETE' then old.surat_id else new.surat_id end;
  if signer_plan_internal.initializing(v_id) then return coalesce(new,old); end if;
  if tg_op='UPDATE' then
    if new.is_additional is distinct from old.is_additional or (new.surat_id is distinct from old.surat_id
      and (old.is_additional or exists(select 1 from public.surat_registrasi
        where id=old.surat_id and policy_snapshot ? 'signer_plan'))) then
      raise exception 'Identitas penandatangan tidak dapat dipindahkan atau diubah.' using errcode='42501';
    end if;
  end if;
  select * into v_surat from public.surat_registrasi where id=v_id for update;
  if tg_op='INSERT' and (new.is_additional or v_surat.policy_snapshot ? 'signer_plan') then
    raise exception 'Penandatangan tambahan wajib dibuat melalui registrasi atomik.' using errcode='42501';
  end if;
  if v_surat.policy_snapshot ? 'signer_plan' then
    if tg_op='DELETE' then raise exception 'Penandatangan pengajuan terkirim tidak dapat dihapus.' using errcode='42501'; end if;
    v_director_mutation := not new.is_additional and exists(select 1 from keu10_internal.mutation_permits
      where transaction_id=txid_current() and surat_id=v_surat.id);
    if tg_op='UPDATE' and (
      new.surat_id is distinct from old.surat_id or new.step_order is distinct from old.step_order
      or new.form_usage_step_id is distinct from old.form_usage_step_id
      or new.is_additional is distinct from old.is_additional or new.role_name is distinct from old.role_name
      or new.action_type is distinct from old.action_type or new.verification_required is distinct from old.verification_required
      or new.requires_unit_allocation is distinct from old.requires_unit_allocation
      or new.input_schema_snapshot is distinct from old.input_schema_snapshot
      or new.attachment_requirements_snapshot is distinct from old.attachment_requirements_snapshot
      or new.verifier_snapshot is distinct from old.verifier_snapshot
      or (not v_director_mutation and (new.user_id is distinct from old.user_id
        or new.label_jabatan is distinct from old.label_jabatan or new.signer_snapshot is distinct from old.signer_snapshot))
    ) then raise exception 'Identitas dan urutan penandatangan terkunci setelah pengiriman.' using errcode='42501'; end if;
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists aa_guard_signer_plan_signature on public.surat_signatures;
create trigger aa_guard_signer_plan_signature before insert or update or delete on public.surat_signatures
for each row execute function signer_plan_internal.guard_plan_signature();

create or replace function signer_plan_internal.stamp_revision_signer_metadata()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_surat_id uuid; v_plan jsonb;
begin
  if new.revision_event_id is null or jsonb_typeof(new.signer_assignments) is distinct from 'array' then return new; end if;
  select surat.id,surat.policy_snapshot->'signer_plan' into v_surat_id,v_plan
    from public.surat_revision_events event join public.surat_registrasi surat on surat.id=event.surat_id
    where event.id=new.revision_event_id;
  if v_plan is null then return new; end if;
  select coalesce(jsonb_agg(item||jsonb_build_object('is_additional',signature.is_additional,
    'client_id',(select plan->>'client_id' from jsonb_array_elements(v_plan) plan
      where plan->>'step_order'=item->>'step_order')) order by ordinality),'[]') into new.signer_assignments
    from jsonb_array_elements(new.signer_assignments) with ordinality as entries(item,ordinality)
    join public.surat_signatures signature on signature.surat_id=v_surat_id
      and signature.step_order=(item->>'step_order')::integer;
  return new;
end $$;
drop trigger if exists ab_stamp_revision_signer_metadata on public.surat_registration_drafts;
create trigger ab_stamp_revision_signer_metadata before insert or update of signer_assignments on public.surat_registration_drafts
for each row execute function signer_plan_internal.stamp_revision_signer_metadata();

-- Preserve the installed canonical candidate validator and KEU10 guards. Only
-- this transaction's private initialization permit may bypass their ordering.
do $patch$
declare v_name text; v_definition text; v_anchor integer; v_prefix text;
begin
  foreach v_name in array array['validate_form_usage_signature','guard_keu10_signature_mutation','guard_keu10_pdf_job'] loop
    if to_regprocedure('public.'||v_name||'()') is null then
      if v_name='guard_keu10_pdf_job' then continue; end if;
      raise exception 'Missing canonical signature guard: %',v_name;
    end if;
    v_definition := replace(pg_get_functiondef(to_regprocedure('public.'||v_name||'()')),E'\r\n',E'\n');
    if position('-- SUR38 initialization' in v_definition)>0 then continue; end if;
    v_anchor := strpos(lower(v_definition),E'\nbegin\n');
    if v_anchor=0 then raise exception 'Unknown body for %',v_name; end if;
    v_prefix := E'\nbegin\n  -- SUR38 initialization\n  if signer_plan_internal.initializing(case when tg_op=''DELETE'' then old.surat_id else new.surat_id end) then return coalesce(new,old); end if;\n';
    if v_name='validate_form_usage_signature' then
      v_prefix := v_prefix||E'  if new.is_additional or (tg_op=''UPDATE'' and exists(select 1 from public.surat_registrasi where id=new.surat_id and policy_snapshot ? ''signer_plan'')) then return new; end if;\n';
    end if;
    execute overlay(v_definition placing v_prefix from v_anchor for length(E'\nbegin\n'));
  end loop;
end $patch$;

create or replace function public.create_registration_with_signer_plan(p_payload jsonb,p_signers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid(); v_usage uuid; v_surat public.surat_registrasi%rowtype;
  v_step public.form_usage_steps%rowtype; v_profile public.profiles%rowtype;
  v_item jsonb; v_plan jsonb := '[]'; v_mandatory jsonb := '[]'; v_entry jsonb;
  v_order integer := 0; v_previous_config_order integer := 0; v_rank integer; v_previous_rank integer := 0;
  v_role text; v_additional boolean; v_id uuid; v_signature_id uuid; v_result jsonb;
  v_seen uuid[] := '{}'; v_steps uuid[] := '{}'; v_keu boolean; v_policy jsonb; v_required integer;
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor and is_active and deleted_at is null) then
    raise exception 'Pemohon aktif diperlukan.' using errcode='42501'; end if;
  if jsonb_typeof(p_signers) is distinct from 'array' or jsonb_array_length(p_signers) not between 2 and 8 then
    raise exception 'Penandatangan harus berjumlah 2 sampai 8 tahap.' using errcode='22023'; end if;
  v_usage := nullif(p_payload->>'form_usage_id','')::uuid;
  perform public.validate_form_usage_for_actor(v_usage,nullif(p_payload->>'dept_id','')::uuid);
  if not exists(select 1 from public.form_usage_steps where usage_id=v_usage) then
    raise exception 'Konfigurasi tahap wajib tidak tersedia.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('signer-plan:'||v_actor::text||':'||coalesce(p_payload->>'no_surat',''),0));
  for v_item in select value from jsonb_array_elements(p_signers) loop
    v_order := v_order+1;
    if v_item ? 'is_additional' and jsonb_typeof(v_item->'is_additional')<>'boolean' then
      raise exception 'Penanda tambahan tidak valid.' using errcode='22023'; end if;
    v_additional := coalesce((v_item->>'is_additional')::boolean,false);
    select * into v_profile from public.profiles where id=(v_item->>'user_id')::uuid and is_active and deleted_at is null;
    if not found then raise exception 'Penandatangan aktif tidak tersedia.' using errcode='42501'; end if;
    if v_additional then
      if nullif(v_item->>'form_usage_step_id','') is not null or v_item->>'role_name' not in ('membuat','memeriksa','menyetujui')
        or nullif(v_item->>'client_id','') is null then
        raise exception 'Tahap tambahan tidak valid.' using errcode='22023'; end if;
      v_id := (v_item->>'client_id')::uuid;
      if v_id=any(v_seen) then raise exception 'Identitas tambahan duplikat.' using errcode='22023'; end if;
      v_seen := array_append(v_seen,v_id);
      if (select count(*) from jsonb_array_elements(p_signers) item where item->>'user_id'=v_item->>'user_id')<>1 then
        raise exception 'Penandatangan tambahan sudah dipilih pada tahap lain.' using errcode='22023'; end if;
      v_role := v_item->>'role_name';
      v_entry := jsonb_build_object('client_id',v_id,'is_additional',true,'user_id',v_profile.id,'role_name',v_role);
    else
      select * into v_step from public.form_usage_steps where id=nullif(v_item->>'form_usage_step_id','')::uuid and usage_id=v_usage;
      if not found or v_step.id=any(v_steps) or v_step.step_order<=v_previous_config_order then
        raise exception 'Tahap wajib hilang, duplikat, atau urutannya berubah.' using errcode='22023'; end if;
      v_previous_config_order := v_step.step_order; v_steps := array_append(v_steps,v_step.id); v_role := v_step.role_name;
      v_mandatory := v_mandatory||jsonb_build_array(jsonb_build_object('user_id',v_profile.id,'form_usage_step_id',v_step.id));
      v_entry := jsonb_build_object('form_usage_step_id',v_step.id,'is_additional',false,
        'configured_order',v_step.step_order,'user_id',v_profile.id,'role_name',v_role);
    end if;
    v_rank := case v_role when 'membuat' then 1 when 'memeriksa' then 2 when 'verifikator' then 2 when 'menyetujui' then 3 else 0 end;
    if v_rank=0 or v_rank<v_previous_rank then raise exception 'Urutan kelompok penandatangan tidak valid.' using errcode='22023'; end if;
    v_previous_rank := v_rank;
    v_plan := v_plan||jsonb_build_array(v_entry||jsonb_build_object('step_order',v_order));
  end loop;
  if exists(select 1 from public.form_usage_steps where usage_id=v_usage and not coalesce(skip_if_no_candidate,false) and not id=any(v_steps)) then
    raise exception 'Pejabat wajib tidak dapat dihapus.' using errcode='22023'; end if;
  select * into v_surat from public.surat_registrasi where no_surat=p_payload->>'no_surat' for update;
  if found then
    if v_surat.created_by is distinct from v_actor or v_surat.form_usage_id is distinct from v_usage
      or v_surat.policy_snapshot->'signer_plan' is distinct from v_plan then
      raise exception 'Kirim ulang tidak dapat mengganti penandatangan.' using errcode='40001'; end if;
    return jsonb_build_object('surat',to_jsonb(v_surat),'created',false);
  end if;
  p_payload := jsonb_set(p_payload,'{policy_snapshot}',coalesce(p_payload->'policy_snapshot','{}')-'signer_plan');
  select keu10_config is not null into v_keu from public.form_usages where id=v_usage;
  if v_keu then
    v_result := public.create_keu10_registration(p_payload,v_mandatory);
    v_surat := jsonb_populate_record(null::public.surat_registrasi,v_result->'surat');
  else
    v_surat := public.create_surat_registrasi(p_payload);
  end if;
  if v_surat.created_by is distinct from v_actor or v_surat.form_usage_id is distinct from v_usage then
    raise exception 'Identitas pengajuan tidak sesuai pemohon.' using errcode='42501'; end if;
  if v_surat.policy_snapshot ? 'signer_plan' then
    if v_surat.policy_snapshot->'signer_plan' is distinct from v_plan then
      raise exception 'Kirim ulang tidak dapat mengganti penandatangan.' using errcode='40001'; end if;
    return jsonb_build_object('surat',to_jsonb(v_surat),'created',false);
  end if;
  if not v_keu and exists(select 1 from public.surat_signatures where surat_id=v_surat.id) then
    raise exception 'Pengajuan lama tidak dapat diganti susunan penandatangannya.' using errcode='40001'; end if;
  if v_surat.status<>'PROSES' or v_surat.current_step<>1 or exists(select 1 from public.surat_signatures where surat_id=v_surat.id and is_signed) then
    raise exception 'Pengajuan tidak tersedia untuk inisialisasi penandatangan.' using errcode='40001'; end if;
  -- Mandatory candidates are validated by the installed canonical triggers,
  -- before the private permit is created or any effective order is changed.
  if not v_keu then
    for v_item in select value from jsonb_array_elements(v_mandatory) loop
      select * into v_step from public.form_usage_steps where id=(v_item->>'form_usage_step_id')::uuid;
      insert into public.surat_signatures(surat_id,user_id,form_usage_step_id,step_order,role_name,label_jabatan,
        action_type,is_signed,status,attachment_requirements_snapshot,signer_snapshot)
      values(v_surat.id,(v_item->>'user_id')::uuid,v_step.id,v_step.step_order,v_step.role_name,v_step.label,
        v_step.action_type,false,'PENDING',coalesce((select jsonb_agg(to_jsonb(rule))
          from public.form_usage_attachment_requirements rule where usage_id=v_usage and stage_order=v_step.step_order),'[]'),
        (select jsonb_build_object('id',id,'full_name',full_name,'job_title',job_title,'nik',nik,'email',email)
          from public.profiles where id=(v_item->>'user_id')::uuid));
    end loop;
  end if;
  insert into signer_plan_internal.initialization_permits values(txid_current(),v_surat.id);
  if v_keu then insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'signer_plan'); end if;
  for v_item in select value from jsonb_array_elements(v_plan)
    where value->>'is_additional'='false' order by (value->>'step_order')::integer desc loop
    update public.surat_signatures set step_order=(v_item->>'step_order')::integer,
      available_at=case when (v_item->>'step_order')::integer=1 then clock_timestamp() end
      where surat_id=v_surat.id and form_usage_step_id=(v_item->>'form_usage_step_id')::uuid;
  end loop;
  for v_item in select value from jsonb_array_elements(v_plan) loop
    if (v_item->>'is_additional')::boolean then
      select * into v_profile from public.profiles where id=(v_item->>'user_id')::uuid;
      insert into public.surat_signatures(surat_id,user_id,is_additional,step_order,role_name,label_jabatan,action_type,
        is_signed,status,available_at,verification_required,verification_status,signer_snapshot)
      values(v_surat.id,v_profile.id,true,(v_item->>'step_order')::integer,v_item->>'role_name',v_profile.job_title,'approval',
        false,'PENDING',case when (v_item->>'step_order')::integer=1 then clock_timestamp() end,false,'not_required',
        jsonb_build_object('id',v_profile.id,'full_name',v_profile.full_name,'job_title',v_profile.job_title,'nik',v_profile.nik,'email',v_profile.email));
    else
      update public.surat_signatures set step_order=(v_item->>'step_order')::integer,
        available_at=case when (v_item->>'step_order')::integer=1 then clock_timestamp() end
        where surat_id=v_surat.id and form_usage_step_id=(v_item->>'form_usage_step_id')::uuid;
    end if;
  end loop;
  v_policy := v_surat.policy_snapshot||jsonb_build_object('signer_plan',v_plan,'signer_plan_captured_by',v_actor,'signer_plan_captured_at',clock_timestamp());
  v_required := nullif(v_policy#>>'{recommendation_config,required_before_step}','')::integer;
  if v_required is not null then
    select (item->>'step_order')::integer into v_required from jsonb_array_elements(v_plan) item where (item->>'configured_order')::integer=v_required;
    if v_required is not null then
      v_policy := jsonb_set(v_policy,'{recommendation_config,required_before_step}',to_jsonb(v_required));
      update public.surat_recommendation_tasks set required_before_step=v_required where parent_surat_id=v_surat.id;
      update public.surat_linked_documents set required_before_step=v_required where parent_surat_id=v_surat.id;
    end if;
  end if;
  for v_item in select jsonb_build_object('key',key,'value',value) from jsonb_each(coalesce(v_policy->'external_revision_policy','{}'))
    where key in ('recipient_step_order','approval_restart_step') and jsonb_typeof(value)='number'
      and (key<>'approval_restart_step' or value<>'1'::jsonb) loop
    select (item->>'step_order')::integer into v_required from jsonb_array_elements(v_plan) item
      where item->>'configured_order'=v_item->>'value';
    if v_required is not null then v_policy := jsonb_set(v_policy,array['external_revision_policy',v_item->>'key'],to_jsonb(v_required)); end if;
  end loop;
  update public.surat_registrasi set policy_snapshot=v_policy,
    data_snapshot=data_snapshot||jsonb_build_object('signers',(select jsonb_agg(signature.signer_snapshot||to_jsonb(signature) order by step_order)
      from public.surat_signatures signature where surat_id=v_surat.id)) where id=v_surat.id returning * into v_surat;
  if v_keu then
    update public.document_pdf_jobs set render_payload=public.keu10_pdf_render_payload(v_surat.id)
      where surat_id=v_surat.id and signature_id is null;
    delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id and operation='signer_plan';
  end if;
  delete from signer_plan_internal.initialization_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  return jsonb_build_object('surat',to_jsonb(v_surat),'created',true);
end $$;
revoke all on function public.create_registration_with_signer_plan(jsonb,jsonb) from public,anon;
grant execute on function public.create_registration_with_signer_plan(jsonb,jsonb) to authenticated,service_role;

-- KEU10 still validates the original mandatory BM/manager/finance/director
-- identities and amount threshold. Added approvals use the frozen plan instead.
do $patch$
declare v_definition text; v_anchor integer; v_name text;
begin
  v_definition := replace(pg_get_functiondef('public.assert_keu10_signer(uuid,uuid,uuid)'::regprocedure),E'\r\n',E'\n');
  if position('-- SUR38 extra eligibility' in v_definition)=0 then
    v_anchor := strpos(lower(v_definition),E'\nbegin\n');
    if v_anchor=0 then raise exception 'Unknown KEU10 signer assertion'; end if;
    execute overlay(v_definition placing E'\nbegin\n  -- SUR38 extra eligibility\n  if p_step_id is null then\n    if not exists(select 1 from public.surat_signatures signature join public.surat_registrasi surat on surat.id=signature.surat_id\n      join public.profiles profile on profile.id=signature.user_id\n      where surat.id=p_surat_id and signature.step_order=surat.current_step and signature.is_additional\n      and signature.user_id=p_user_id and profile.is_active and profile.deleted_at is null\n      and exists(select 1 from jsonb_array_elements(surat.policy_snapshot->''signer_plan'') item\n        where item->>''is_additional''=''true'' and item->>''user_id''=p_user_id::text\n        and (item->>''step_order'')::integer=signature.step_order)) then\n      raise exception ''Penandatangan tambahan tidak aktif atau tidak sesuai susunan.'' using errcode=''42501'';\n    end if;\n    return;\n  end if;\n'
      from v_anchor for length(E'\nbegin\n'));
  end if;
  v_definition := pg_get_functiondef('public.handle_approve_surat_v2(uuid,uuid,text,text)'::regprocedure);
  if position('signer_plan_internal.route_count' in v_definition)=0 then
    if position('v_count := jsonb_array_length(v_surat.policy_snapshot->''keu10_steps'');' in v_definition)=0 then
      raise exception 'Unknown KEU10 approval route count'; end if;
    v_definition := replace(v_definition,'v_count := jsonb_array_length(v_surat.policy_snapshot->''keu10_steps'');',
      'v_count := signer_plan_internal.route_count(v_surat.id);');
    v_definition := replace(v_definition,'signature.step_order=(step->>''step_order'')::integer',
      'signature.step_order=signer_plan_internal.effective_order(v_surat.id,(step->>''id'')::uuid,(step->>''step_order'')::integer)');
    execute v_definition;
  end if;
  v_definition := pg_get_functiondef('keu10_internal.accept_revision(uuid,text,jsonb,uuid)'::regprocedure);
  if position('-- SUR38 final mandatory' in v_definition)=0 then
    if position('where surat_id=v_surat.id order by step_order desc limit 1 for update' in v_definition)=0 then
      raise exception 'Unknown KEU10 final director selection'; end if;
    execute replace(v_definition,'where surat_id=v_surat.id order by step_order desc limit 1 for update',
      E'where surat_id=v_surat.id and not is_additional order by step_order desc limit 1 for update -- SUR38 final mandatory\n');
  end if;
  -- Locate the canonical PDF trigger by its body; deployments may retain its
  -- historical name. Refuse an unfamiliar body rather than replace unrelated SQL.
  for v_name in select proname from pg_proc join pg_namespace on pg_namespace.oid=pronamespace
    where nspname='public' and pronargs=0 and prorettype='trigger'::regtype
      and prosrc like '%KEU10 PDF requires the complete canonical route%' loop
    v_definition := replace(pg_get_functiondef(to_regprocedure('public.'||v_name||'()')),E'\r\n',E'\n');
    if position('-- SUR38 PDF plan' in v_definition)>0 then continue; end if;
    v_anchor := strpos(lower(v_definition),E'\nbegin\n');
    if v_anchor=0 then raise exception 'Unknown KEU10 PDF guard'; end if;
    v_definition := overlay(v_definition placing E'\nbegin\n  -- SUR38 PDF plan\n  if signer_plan_internal.initializing(case when tg_op=''DELETE'' then old.surat_id else new.surat_id end) then return coalesce(new,old); end if;\n'
      from v_anchor for length(E'\nbegin\n'));
    v_definition := replace(v_definition,'(select jsonb_array_length(policy_snapshot->''keu10_steps'') from public.surat_registrasi where id=new.surat_id)',
      'signer_plan_internal.route_count(new.surat_id)');
    execute v_definition;
  end loop;
end $patch$;

revoke all on all functions in schema signer_plan_internal from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
