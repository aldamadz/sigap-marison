begin;

alter table public.surat_signatures add column if not exists verification_claimed_by uuid references public.profiles(id);
alter table public.surat_signatures add column if not exists verification_claimed_at timestamptz;

create table if not exists hrd_ga_review_internal.claims (
  signature_id uuid primary key references public.surat_signatures(id),
  actor_id uuid not null references public.profiles(id),
  claimed_at timestamptz not null default clock_timestamp()
);
create table if not exists hrd_ga_review_internal.claim_events (
  id bigint generated always as identity primary key,
  signature_id uuid not null references public.surat_signatures(id),
  actor_id uuid not null references public.profiles(id),
  occurred_at timestamptz not null default clock_timestamp()
);
alter table hrd_ga_review_internal.claims enable row level security;
alter table hrd_ga_review_internal.claim_events enable row level security;
revoke all on all tables in schema hrd_ga_review_internal from public,anon,authenticated,service_role;
revoke all on all sequences in schema hrd_ga_review_internal from public,anon,authenticated,service_role;

create or replace function hrd_ga_review_internal.freeze_document()
returns trigger language plpgsql security definer set search_path='' as $$
declare stage record; config jsonb; raw_config jsonb; frozen jsonb; reviewer jsonb;
  category text; steps jsonb:='[]'; item_data jsonb;
begin
  if tg_op='UPDATE' then
    frozen:=old.policy_snapshot->'hrd_ga_review';
    if new.policy_snapshot->'hrd_ga_review' is distinct from frozen then
      raise exception 'Kebijakan pemeriksaan HRD & GA tidak dapat diubah.' using errcode='42501'; end if;
    if frozen is null then return new; end if;
    if new.form_usage_id is distinct from old.form_usage_id then
      raise exception 'Kegunaan pengajuan tidak dapat diubah.' using errcode='42501'; end if;
    if frozen#>>'{config,mode}' is distinct from 'claim'
      and new.form_input_data->'items' is distinct from old.form_input_data->'items' then
      perform hrd_ga_review_internal.item_group(new.form_input_data->'items',frozen->>'group');
      select jsonb_agg(value||jsonb_build_object('hrd_ga_category',frozen->>'group') order by ordinality)
        into item_data from jsonb_array_elements(new.form_input_data->'items') with ordinality;
      new.form_input_data:=jsonb_set(new.form_input_data,'{items}',item_data);
    end if;
    return new;
  end if;
  new.policy_snapshot:=coalesce(new.policy_snapshot,'{}')-'hrd_ga_review';
  for stage in select s.* from public.form_usage_steps s
    where s.usage_id=new.form_usage_id and s.input_schema ? 'hrd_ga_review' order by s.step_order
  loop
    if raw_config is not null and raw_config is distinct from stage.input_schema->'hrd_ga_review' then
      raise exception 'Konfigurasi pemeriksaan HRD & GA tidak konsisten.' using errcode='22023'; end if;
    raw_config:=stage.input_schema->'hrd_ga_review'; config:=raw_config;
    if config->>'mode' is not null and config->>'mode'<>'claim' then
      raise exception 'Mode pemeriksaan HRD & GA tidak valid.' using errcode='22023'; end if;
    if config->>'mode' is distinct from 'claim' then
      if category is null then category:=hrd_ga_review_internal.item_group(new.form_input_data->'items'); end if;
      reviewer:=hrd_ga_review_internal.resolve_reviewer(stage.id,config,category);
    end if;
    config:=jsonb_set(config,'{reviewers,ga}',hrd_ga_review_internal.resolve_reviewer(stage.id,config,'ga'));
    config:=jsonb_set(config,'{reviewers,hrd}',hrd_ga_review_internal.resolve_reviewer(stage.id,config,'hrd'));
    steps:=steps||to_jsonb(stage.id);
  end loop;
  if config is not null then
    new.policy_snapshot:=new.policy_snapshot||jsonb_build_object('hrd_ga_review',
      jsonb_build_object('config',config,'group',category,'reviewer',reviewer,'step_ids',steps));
  end if;
  return new;
end $$;

create or replace function hrd_ga_review_internal.stamp_signature()
returns trigger language plpgsql security definer set search_path='' as $$
declare frozen jsonb; claim hrd_ga_review_internal.claims;
begin
  select policy_snapshot->'hrd_ga_review' into frozen from public.surat_registrasi where id=new.surat_id;
  if tg_op='UPDATE' and frozen->'step_ids' ? old.form_usage_step_id::text
    and new.form_usage_step_id is distinct from old.form_usage_step_id then
    raise exception 'Tahap pemeriksaan HRD & GA tidak dapat dipindahkan.' using errcode='42501'; end if;
  if frozen->'step_ids' ? new.form_usage_step_id::text then
    new.verifier_snapshot:=case when frozen#>>'{config,mode}'='claim' then
      jsonb_build_array(frozen#>'{config,reviewers,ga}',frozen#>'{config,reviewers,hrd}')
      else jsonb_build_array(frozen->'reviewer') end;
    new.verification_required:=true; new.action_type:='approval'; new.requires_unit_allocation:=false;
    new.input_schema_snapshot:=jsonb_build_object('fields','[]'::jsonb,'hrd_ga_review',frozen->'config');
    if tg_op='INSERT' then
      new.verification_status:='pending'; new.verified_by:=null; new.verified_at:=null; new.verification_note:=null;
    elsif new.verification_status='not_required' then new.verification_status:='pending'; end if;
  elsif frozen is null and tg_op='UPDATE' and exists (
    select 1 from public.form_usage_steps where id=new.form_usage_step_id and input_schema ? 'hrd_ga_review'
  ) then
    new.verifier_snapshot:=old.verifier_snapshot; new.verification_required:=old.verification_required;
    new.action_type:=old.action_type; new.input_schema_snapshot:=old.input_schema_snapshot;
    new.requires_unit_allocation:=old.requires_unit_allocation;
    if not coalesce(old.verification_required,false) then new.verification_status:='not_required'; end if;
  end if;
  -- Public columns are display projections, never caller-controlled claim authority.
  select * into claim from hrd_ga_review_internal.claims where signature_id=new.id;
  new.verification_claimed_by:=claim.actor_id; new.verification_claimed_at:=claim.claimed_at;
  if tg_op='UPDATE' and frozen#>>'{config,mode}'='claim'
    and new.verification_status='verified' and old.verification_status is distinct from 'verified'
    and (claim.actor_id is null or new.verified_by is distinct from claim.actor_id or auth.uid() is distinct from claim.actor_id) then
    raise exception 'Pemeriksaan hanya dapat diselesaikan oleh pemeriksa yang mengambil tugas.' using errcode='42501'; end if;
  return new;
end $$;

create or replace function hrd_ga_review_internal.lock_signature(p_signature uuid)
returns public.surat_signatures language plpgsql security definer set search_path='' as $$
declare sig public.surat_signatures;
begin
  select * into sig from public.surat_signatures where id=p_signature;
  if sig.input_schema_snapshot#>>'{hrd_ga_review,mode}' is distinct from 'claim' then return sig; end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||sig.surat_id::text,0));
  perform 1 from public.surat_registrasi where id=sig.surat_id for update;
  select * into sig from public.surat_signatures where id=p_signature for update;
  return sig;
end $$;

create or replace function hrd_ga_review_internal.assert_owner(p_signature uuid)
returns void language plpgsql security definer set search_path='' as $$
declare sig public.surat_signatures; doc public.surat_registrasi; claim hrd_ga_review_internal.claims;
begin
  select * into sig from public.surat_signatures where id=p_signature;
  if sig.input_schema_snapshot#>>'{hrd_ga_review,mode}' is distinct from 'claim' then return; end if;
  select * into doc from public.surat_registrasi where id=sig.surat_id;
  select * into claim from hrd_ga_review_internal.claims where signature_id=sig.id;
  if auth.uid() is null or claim.actor_id is distinct from auth.uid()
    or sig.is_signed or sig.verification_status is distinct from 'pending'
    or doc.status::text<>'PROSES' or doc.current_step is distinct from sig.step_order
    or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.deleted_at is null)
    or not coalesce(sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)),false) then
    raise exception 'Ambil pemeriksaan terlebih dahulu. Tugas mungkin sudah diambil pemeriksa lain.' using errcode='42501';
  end if;
end $$;

create or replace function public.claim_hrd_ga_examination(p_signature_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sig public.surat_signatures; doc public.surat_registrasi; claim hrd_ga_review_internal.claims;
begin
  sig:=hrd_ga_review_internal.lock_signature(p_signature_id);
  select * into doc from public.surat_registrasi where id=sig.surat_id;
  if auth.uid() is null or sig.id is null or sig.input_schema_snapshot#>>'{hrd_ga_review,mode}' is distinct from 'claim'
    or sig.is_signed or sig.verification_status is distinct from 'pending'
    or doc.status::text<>'PROSES' or doc.current_step is distinct from sig.step_order
    or not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.deleted_at is null)
    or not coalesce(sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',auth.uid()::text)),false) then
    raise exception 'Tugas pemeriksaan tidak tersedia untuk akun ini.' using errcode='42501'; end if;
  select * into claim from hrd_ga_review_internal.claims where signature_id=sig.id;
  if claim.signature_id is not null then
    if claim.actor_id<>auth.uid() then raise exception 'Pemeriksaan sudah diambil pemeriksa lain.' using errcode='40001'; end if;
    return to_jsonb(claim);
  end if;
  insert into hrd_ga_review_internal.claims(signature_id,actor_id) values(sig.id,auth.uid()) returning * into claim;
  insert into hrd_ga_review_internal.claim_events(signature_id,actor_id) values(sig.id,auth.uid());
  update public.surat_signatures set verification_claimed_by=claim.actor_id,verification_claimed_at=claim.claimed_at where id=sig.id;
  return to_jsonb(claim);
end $$;
revoke all on function public.claim_hrd_ga_examination(uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_hrd_ga_examination(uuid) to authenticated;

-- Guard the canonical mutation entry points, retaining their existing logic/ACLs.
do $wrappers$
declare item record; old_name text; definition text; guard text;
begin
  for item in select * from (values
    ('verify_surat_signature_v2','uuid,text,jsonb','p_sig_id uuid,p_note text default null,p_payload jsonb default ''{}''','boolean','p_sig_id,p_note,p_payload'),
    ('verify_surat_signature','uuid,text','p_sig_id uuid,p_note text default null','boolean','p_sig_id,p_note'),
    ('save_surat_verification_draft','uuid,jsonb,text','p_sig_id uuid,p_payload jsonb default ''{}'',p_note text default null','jsonb','p_sig_id,p_payload,p_note'),
    ('request_surat_process_revision','uuid,uuid,text,integer,text,jsonb',
      'p_surat_id uuid,p_sig_id uuid,p_target_type text,p_target_step integer,p_reason text,p_changes jsonb default ''{}''',
      'uuid','p_surat_id,p_sig_id,p_target_type,p_target_step,p_reason,p_changes')
  ) as spec(name,types,args,result,call_args)
  loop
    old_name:=item.name||'_pre_hrd_ga_claim';
    if to_regprocedure('public.'||old_name||'('||item.types||')') is null then
      if to_regprocedure('public.'||item.name||'('||item.types||')') is null then
        raise exception 'Missing canonical examination routine: %',item.name; end if;
      execute format('alter function public.%I(%s) rename to %I',item.name,item.types,old_name);
    end if;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',old_name,item.types);
    guard:=case when item.name='request_surat_process_revision' then
      'if exists(select 1 from public.surat_signatures where id=p_sig_id and verification_status=''pending'') then perform hrd_ga_review_internal.lock_signature(p_sig_id); perform hrd_ga_review_internal.assert_owner(p_sig_id); end if;'
      else 'perform hrd_ga_review_internal.lock_signature(p_sig_id); perform hrd_ga_review_internal.assert_owner(p_sig_id);' end;
    definition:=format('create or replace function public.%I(%s) returns %s language plpgsql security definer set search_path='''' as $body$ begin %s return public.%I(%s); end $body$;',
      item.name,item.args,item.result,guard,old_name,item.call_args);
    execute definition;
    execute format('revoke all on function public.%I(%s) from public,anon',item.name,item.types);
    execute format('grant execute on function public.%I(%s) to authenticated,service_role',item.name,item.types);
  end loop;
end $wrappers$;

do $proposal$
declare identity regprocedure:=to_regprocedure('requester_revision_internal.propose_full_form(uuid,uuid,text,jsonb)'); definition text;
  anchor text:='sig.user_id is distinct from auth.uid() or sig.is_signed';
begin
  if identity is null then return; end if;
  definition:=pg_get_functiondef(identity);
  if position('verification_claimed_by' in definition)>0 then return; end if;
  if position(anchor in definition)=0 then raise exception 'Unknown full-form revision authorization'; end if;
  definition:=replace(definition,anchor,
    '(sig.user_id is distinct from auth.uid() and not coalesce((sig.input_schema_snapshot#>>''{hrd_ga_review,mode}''=''claim'' and sig.verification_status=''pending'' and sig.verification_claimed_by=auth.uid()),false)) or sig.is_signed');
  execute definition;
end $proposal$;

create or replace function hrd_ga_review_internal.guard_revision_event()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.signature_id is not null and exists(select 1 from public.surat_signatures s
    where s.id=new.signature_id and s.input_schema_snapshot#>>'{hrd_ga_review,mode}'='claim'
      and s.verification_status='pending') then
    perform hrd_ga_review_internal.assert_owner(new.signature_id);
    if new.actor_id is distinct from auth.uid() then raise exception 'Pelaku pemeriksaan tidak valid.' using errcode='42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists hrd_ga_claim_revision_guard on public.surat_revision_events;
create trigger hrd_ga_claim_revision_guard before insert on public.surat_revision_events
  for each row execute function hrd_ga_review_internal.guard_revision_event();

create or replace function hrd_ga_review_internal.guard_draft()
returns trigger language plpgsql security definer set search_path='' as $$
declare sig record;
begin
  if old.status::text='PROSES' and new.data_snapshot->'verification_drafts' is distinct from old.data_snapshot->'verification_drafts' then
    for sig in select s.id from public.surat_signatures s where s.surat_id=old.id
      and s.input_schema_snapshot#>>'{hrd_ga_review,mode}'='claim' and s.verification_status='pending'
      and new.data_snapshot#>array['verification_drafts',s.id::text] is distinct from old.data_snapshot#>array['verification_drafts',s.id::text]
    loop perform hrd_ga_review_internal.assert_owner(sig.id); end loop;
  end if;
  return new;
end $$;
drop trigger if exists hrd_ga_claim_draft_guard on public.surat_registrasi;
create trigger hrd_ga_claim_draft_guard before update on public.surat_registrasi
  for each row execute function hrd_ga_review_internal.guard_draft();

create or replace function hrd_ga_review_internal.guard_attachment()
returns trigger language plpgsql security definer set search_path='' as $$
declare signature uuid;
begin
  signature:=case when tg_op='DELETE' then old.signature_id else new.signature_id end;
  if signature is not null and exists(select 1 from public.surat_signatures s
    where s.id=signature and s.input_schema_snapshot#>>'{hrd_ga_review,mode}'='claim'
      and s.verification_status='pending') then
    perform hrd_ga_review_internal.assert_owner(signature);
  end if;
  if tg_op='UPDATE' and old.signature_id is distinct from new.signature_id and old.signature_id is not null then
    perform hrd_ga_review_internal.assert_owner(old.signature_id);
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists hrd_ga_claim_attachment_guard on public.surat_attachments;
create trigger hrd_ga_claim_attachment_guard before insert or update or delete on public.surat_attachments
  for each row execute function hrd_ga_review_internal.guard_attachment();

create or replace function hrd_ga_review_internal.configure_claim(p_expected_count integer)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  n:=hrd_ga_review_internal.configure(p_expected_count);
  update public.form_usage_steps s set input_schema=jsonb_set(s.input_schema,'{hrd_ga_review,mode}','"claim"')
    from public.form_usages u where u.id=s.usage_id and u.status='active'
    and s.input_schema ? 'hrd_ga_review';
  return n;
end $$;
revoke all on all functions in schema hrd_ga_review_internal from public,anon,authenticated,service_role;
alter schema hrd_ga_review_internal owner to postgres;
alter table hrd_ga_review_internal.claims owner to postgres;
alter table hrd_ga_review_internal.claim_events owner to postgres;
alter function public.claim_hrd_ga_examination(uuid) owner to postgres;
do $owners$
declare item record;
begin
  for item in select oid from pg_proc where pronamespace='hrd_ga_review_internal'::regnamespace loop
    execute format('alter function %s owner to postgres',item.oid::regprocedure);
  end loop;
  for item in select oid from pg_proc where pronamespace='public'::regnamespace and proname in
    ('verify_surat_signature_v2','verify_surat_signature','save_surat_verification_draft','request_surat_process_revision') loop
    execute format('alter function %s owner to postgres',item.oid::regprocedure);
  end loop;
end $owners$;
notify pgrst,'reload schema';
commit;
