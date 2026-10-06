begin;

alter table public.form_usages add column if not exists keu10_config jsonb;

create function public.is_valid_keu10_config(p_config jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_purpose jsonb; v_codes text[] := '{}'; v_code text;
begin
  if p_config is null then return true; end if;
  if jsonb_typeof(p_config) <> 'object' or p_config->>'version' is distinct from '1'
     or coalesce(p_config->>'disposition', '') not in ('legal_land','tactical_land','village_equipment')
     or jsonb_typeof(p_config->'purposes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_config->'purposes') not between 1 and 50
     or (p_config - array['version','disposition','purposes','approval_threshold']) <> '{}'::jsonb then return false; end if;
  if p_config->>'disposition' = 'tactical_land' then
    if p_config->'approval_threshold' is distinct from '2000000'::jsonb then return false; end if;
  elsif p_config->'approval_threshold' is distinct from 'null'::jsonb then return false;
  end if;
  for v_purpose in select value from jsonb_array_elements(p_config->'purposes') loop
    v_code := v_purpose->>'code';
    if jsonb_typeof(v_purpose) <> 'object' or (v_purpose - array['code','label']) <> '{}'::jsonb
       or coalesce(v_code, '') !~ '^[a-z][a-z0-9_]{0,63}$' or v_code = any(v_codes)
       or jsonb_typeof(v_purpose->'label') is distinct from 'string'
       or length(btrim(v_purpose->>'label')) not between 1 and 240 then return false; end if;
    v_codes := array_append(v_codes, v_code);
  end loop;
  return true;
end $$;
alter table public.form_usages add constraint form_usages_keu10_config_check
  check (public.is_valid_keu10_config(keu10_config));
alter table public.form_usage_steps drop constraint if exists form_usage_steps_role_name_check;
alter table public.form_usage_steps add constraint form_usage_steps_role_name_check
  check (role_name in ('membuat','memeriksa','menyetujui','verifikator'));
alter table public.approval_route_steps drop constraint if exists approval_route_steps_role_name_check;
alter table public.approval_route_steps add constraint approval_route_steps_role_name_check
  check (role_name in ('membuat','memeriksa','menyetujui','verifikator'));
-- Some installations have a signature role check outside the current migration lineage.
do $$ declare v_constraint record; v_definition text;
begin
  for v_constraint in select conname,pg_get_constraintdef(oid) definition from pg_constraint
    where conrelid = 'public.surat_signatures'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%role_name%'
  loop
    v_definition := replace(v_constraint.definition,'''menyetujui''::text','''menyetujui''::text, ''verifikator''::text');
    if v_definition=v_constraint.definition then raise exception 'Unknown signature role constraint'; end if;
    execute format('alter table public.surat_signatures drop constraint %I', v_constraint.conname);
    execute format('alter table public.surat_signatures add constraint %I %s',v_constraint.conname,v_definition);
  end loop;
end $$;

create function public.normalize_keu10_input(p_input jsonb, p_config jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_row jsonb; v_items jsonb := '[]'; v_qty numeric; v_price numeric;
  v_total numeric := 0; v_line numeric; v_id text; v_ids text[] := '{}';
begin
  if not public.is_valid_keu10_config(p_config) or p_config is null
     or jsonb_typeof(p_input) is distinct from 'object'
     or not exists (select 1 from jsonb_array_elements(p_config->'purposes') purpose
       where purpose->>'code' = p_input->>'keu10_purpose_code') then
    raise exception 'KEU10 purpose/configuration is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input->'fund_type') is distinct from 'string'
     or p_input->>'fund_type' not in ('operational','production_cost','marketing_cost') then
    raise exception 'KEU10 fund type must be explicitly selected' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input->'items') is distinct from 'array' then
    raise exception 'KEU10 items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_input->'items') not between 1 and 100 then
    raise exception 'KEU10 requires 1 to 100 items' using errcode = '22023';
  end if;
  for v_row in select value from jsonb_array_elements(p_input->'items') loop
    if jsonb_typeof(v_row) <> 'object'
       or jsonb_typeof(v_row->'keterangan') is distinct from 'string'
       or length(btrim(v_row->>'keterangan')) not between 1 and 240
       or jsonb_typeof(v_row->'satuan') is distinct from 'string'
       or length(btrim(v_row->>'satuan')) not between 1 and 80
       or coalesce(v_row->>'jumlah','') !~ '^[0-9]{1,16}$'
       or coalesce(v_row->>'estimasi_harga_satuan','') !~ '^[0-9]{1,16}$' then
      raise exception 'KEU10 item description/unit/quantity/price is invalid' using errcode = '22023';
    end if;
    v_qty := (v_row->>'jumlah')::numeric;
    v_price := (v_row->>'estimasi_harga_satuan')::numeric;
    v_line := v_qty * v_price; v_total := v_total + v_line;
    if v_qty < 1 or v_qty > 9007199254740991 or v_price > 9007199254740991
       or v_line > 9007199254740991 or v_total > 9007199254740991 then
      raise exception 'KEU10 amount exceeds safe integer bounds' using errcode = '22023';
    end if;
    v_id := nullif(btrim(v_row->>'id'), '');
    if v_id is not null and (length(v_id) > 100 or v_id = any(v_ids)) then
      raise exception 'KEU10 item IDs must be unique and bounded' using errcode = '22023';
    end if;
    if v_id is not null then v_ids := array_append(v_ids, v_id); end if;
    v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id',v_id,'keterangan',btrim(v_row->>'keterangan'),'jumlah',v_qty,
      'satuan',btrim(v_row->>'satuan'),'estimasi_harga_satuan',v_price,'total',v_line)));
  end loop;
  if v_total <= 0 then
    raise exception 'KEU10 Grand Total must be positive' using errcode='22023';
  end if;
  return (p_input - array['free_cash','free_cash_previous_month','keu1_free_cash',
    'keu1_free_cash_previous_month','fund_needed','kebutuhan_dana','fund_without_project',
    'status','item_status','grand_total','fund_amount'])
    || jsonb_build_object('items',v_items,'fund_amount',v_total,'grand_total',v_total);
end $$;

create function public.keu10_director_code(p_title text,p_display text default null)
returns text language sql immutable set search_path = '' as $$
  select case lower(btrim(coalesce(nullif(btrim(p_display),''),p_title)))
    when 'direktur i' then 'DI' when 'direktur utama' then 'DU' end
$$;

create function public.assert_keu10_route(p_config jsonb, p_steps jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare v_expected text[]; v_step jsonb; v_order integer := 0;
begin
  v_expected := case p_config->>'disposition'
    when 'tactical_land' then array['membuat','memeriksa','verifikator','menyetujui']
    else array['membuat','memeriksa','memeriksa','verifikator','menyetujui'] end;
  if not public.is_valid_keu10_config(p_config) or p_config is null
     or jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'Invalid KEU10 route' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) <> cardinality(v_expected) then
    raise exception 'KEU10 mandatory route steps are missing' using errcode = '22023';
  end if;
  for v_step in select value from jsonb_array_elements(p_steps) loop
    v_order := v_order + 1;
    if (v_step->>'step_order')::integer <> v_order
       or v_step->>'role_name' is distinct from v_expected[v_order]
       or v_step->>'action_type' is distinct from 'approval'
       or v_step->>'assignee_mode' is distinct from 'select'
       or coalesce((v_step->>'skip_if_no_candidate')::boolean,false) then
      raise exception 'Invalid KEU10 mandatory step contract' using errcode = '22023';
    end if;
    if v_order = 1 and (v_step->>'candidate_fallback_mode' is distinct from 'related_branch_manager'
       or v_step->>'candidate_scope' is distinct from 'request_office') then
      raise exception 'KEU10 first signer must be the related Branch Manager' using errcode = '22023';
    end if;
  end loop;
end $$;

create function public.guard_keu10_usage_config()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.keu10_config is not null and not exists (select 1 from public.master_forms form
    where form.id = new.form_id and upper(btrim(form.nomor_form)) in ('FM-UAI.KEU-10-00','FM-MBN.KEU-10-00')) then
    raise exception 'KEU10 configuration requires a KEU10 master form' using errcode = '22023';
  end if;
  if new.keu10_config is not null and new.first_maker_policy <> 'configured' then
    raise exception 'KEU10 requires configured first maker policy' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.keu10_config is not null and (new.keu10_config is null
     or new.keu10_config->>'disposition' is distinct from old.keu10_config->>'disposition'
     or new.form_id is distinct from old.form_id) then
    raise exception 'KEU10 usage identity cannot be removed or changed' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger guard_keu10_usage_config before insert or update on public.form_usages
for each row execute function public.guard_keu10_usage_config();

alter function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)
  rename to save_form_usage_config_pre_keu10;
revoke all on function public.save_form_usage_config_pre_keu10(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)
  from public,anon,authenticated;
create function public.save_form_usage_config(p_usage_id uuid,p_payload jsonb,p_department_ids uuid[],
  p_steps jsonb,p_attachments jsonb,p_verifiers jsonb default '[]')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_config jsonb; v_payload jsonb := p_payload;
begin
  if not public.is_current_user_admin() then raise exception 'Active administrator required' using errcode = '42501'; end if;
  select keu10_config into v_config from public.form_usages where id = p_usage_id for update;
  if p_payload ? 'keu10_config' then v_config := nullif(p_payload->'keu10_config','null'::jsonb); end if;
  if not public.is_valid_keu10_config(v_config) then raise exception 'Invalid KEU10 config' using errcode = '22023'; end if;
  if v_config is not null then
    perform public.assert_keu10_route(v_config,p_steps);
    v_payload := v_payload || '{"first_maker_policy":"configured"}'::jsonb;
  end if;
  v_id := public.save_form_usage_config_pre_keu10(p_usage_id,v_payload,p_department_ids,p_steps,p_attachments,p_verifiers);
  update public.form_usages set keu10_config = v_config,
    first_maker_policy = case when v_config is not null then 'configured' else first_maker_policy end where id = v_id;
  return v_id;
end $$;
grant execute on function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb) to authenticated,service_role;
revoke all on function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb) from public,anon;
-- The historical five-argument overload must not bypass KEU10 validation.
create or replace function public.save_form_usage_config(p_usage_id uuid,p_payload jsonb,p_department_ids uuid[],
  p_steps jsonb,p_attachments jsonb)
returns uuid language sql security definer set search_path='' as $$
  select public.save_form_usage_config(p_usage_id,p_payload,p_department_ids,p_steps,p_attachments,'[]'::jsonb)
$$;
revoke all on function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb) from public,anon;
grant execute on function public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb) to authenticated,service_role;

-- Private transaction permits cannot be forged with set_config or a browser RPC.
create schema if not exists keu10_internal;
revoke all on schema keu10_internal from public,anon,authenticated,service_role;
create table keu10_internal.mutation_permits (
  transaction_id bigint not null, surat_id uuid not null, operation text not null,
  primary key(transaction_id,surat_id)
);
revoke all on keu10_internal.mutation_permits from public,anon,authenticated,service_role;
create table keu10_internal.registration_permits (
  transaction_id bigint primary key, actor_id uuid not null, usage_id uuid not null
);
revoke all on keu10_internal.registration_permits from public,anon,authenticated,service_role;

create function public.is_keu10_surat(p_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.surat_registrasi surat
    where surat.id = p_surat_id and surat.policy_snapshot->'keu10_config' is not null)
$$;

create function public.stamp_keu10_registration()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_config jsonb; v_steps jsonb; v_office public.master_offices%rowtype;
  v_form jsonb; v_requester jsonb; v_project jsonb; v_department jsonb;
begin
  select usage.keu10_config into v_config from public.form_usages usage where usage.id = new.form_usage_id;
  if v_config is null then
    if exists(select 1 from public.form_usages usage join public.master_forms form on form.id=usage.form_id
      where usage.id=new.form_usage_id and upper(btrim(form.nomor_form)) in ('FM-UAI.KEU-10-00','FM-MBN.KEU-10-00')) then
      raise exception 'KEU10 usage configuration is missing' using errcode='22023';
    end if;
    new.policy_snapshot := coalesce(new.policy_snapshot,'{}') - array['keu10_config','keu10_steps'];
    new.data_snapshot := coalesce(new.data_snapshot,'{}') - 'keu10_generation';
    return new;
  end if;
  if auth.uid() is null or new.created_by is distinct from auth.uid() or not exists
    (select 1 from public.profiles profile where profile.id=auth.uid() and profile.is_active is true and profile.deleted_at is null
      and (profile.office_id=new.office_id or public.is_current_user_admin())) then
    raise exception 'KEU10 requester/office is not authorized' using errcode='42501';
  end if;
  if not exists(select 1 from keu10_internal.registration_permits where transaction_id=txid_current()
    and actor_id=auth.uid() and usage_id=new.form_usage_id) then
    raise exception 'KEU10 requires atomic create_keu10_registration' using errcode='42501'; end if;
  select * into v_office from public.master_offices where id=new.office_id;
  perform public.validate_form_usage_for_actor(new.form_usage_id,new.dept_id);
  if lower(btrim(v_office.kedudukan)) not in ('kc','kcp') or new.project_id is null or not exists (
    with recursive descendants as (
      select office.id,array[office.id] path from public.master_offices office where office.id=new.office_id
      union all select office.id,descendants.path||office.id from public.master_offices office
        join descendants on office.parent_id=descendants.id where not office.id=any(descendants.path)
    ) select 1 from public.master_projects project join descendants on descendants.id=project.office_id where project.id=new.project_id
  ) then raise exception 'KEU10 project must belong to the request branch or its descendants' using errcode='22023'; end if;
  select jsonb_agg(to_jsonb(step)||jsonb_build_object('candidate_user_ids',coalesce((
    select jsonb_agg(candidate.user_id order by candidate.user_id) from public.form_usage_step_users candidate
      where candidate.usage_step_id=step.id),'[]')) order by step.step_order)
    into v_steps from public.form_usage_steps step where step.usage_id=new.form_usage_id;
  perform public.assert_keu10_route(v_config,v_steps);
  new.form_input_data := public.normalize_keu10_input(new.form_input_data,v_config);
  select jsonb_build_object('id',form.id,'nama_form',form.nama_form,'nomor_form',form.nomor_form)
    into v_form from public.master_forms form join public.form_usages usage on usage.form_id=form.id
    where usage.id=new.form_usage_id;
  select jsonb_build_object('id',profile.id,'full_name',profile.full_name,'nik',profile.nik,
    'job_title',coalesce(nullif(to_jsonb(profile)->>'job_title_display',''),profile.job_title),
    'office_id',profile.office_id,'department_id',profile.department_id) into v_requester
    from public.profiles profile where profile.id=auth.uid();
  select jsonb_build_object('id',project.id,'name',project.name,'code',to_jsonb(project)->>'code',
    'office_id',project.office_id) into v_project from public.master_projects project where project.id=new.project_id;
  select jsonb_build_object('id',id,'name',name,'code',code) into v_department
    from public.master_departments where id=new.dept_id;
  new.requester_snapshot := v_requester;
  new.location_snapshot := coalesce(new.location_snapshot,'{}') || jsonb_build_object('form',v_form,
    'office',jsonb_build_object('id',v_office.id,'name',v_office.name,'kedudukan',v_office.kedudukan),
    'project',v_project,'department',v_department);
  new.policy_snapshot := coalesce(new.policy_snapshot,'{}') || jsonb_build_object(
    'form',v_form,'steps',v_steps,'keu10_config',v_config,'keu10_steps',v_steps,'first_maker_policy','configured',
    'external_revision_policy','{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb);
  new.data_snapshot := coalesce(new.data_snapshot,'{}') || jsonb_build_object(
    'form',v_form,'input',new.form_input_data,'keu10_generation',1);
  new.current_step := 1; new.status := 'PROSES'; new.pdf_path := null;
  new.file_path := 'native://document/'||new.id::text||'/generation/1';
  return new;
end $$;
create trigger zz_stamp_keu10_registration before insert on public.surat_registrasi
for each row execute function public.stamp_keu10_registration();

create function public.assert_keu10_signer(p_surat_id uuid,p_step_id uuid,p_user_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_surat public.surat_registrasi%rowtype; v_step jsonb; v_count integer; v_code text;
begin
  select * into v_surat from public.surat_registrasi where id=p_surat_id;
  select value into v_step from jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') where value->>'id'=p_step_id::text;
  if v_step is null or not exists(select 1 from public.profiles profile where profile.id=p_user_id
    and profile.is_active is true and profile.deleted_at is null) then
    raise exception 'KEU10 signer must be an active configured candidate' using errcode='42501';
  end if;
  if (v_step->>'step_order')::integer=1 then
    if not public.is_related_branch_manager(p_user_id,v_surat.office_id) then
      raise exception 'KEU10 requires the related Branch Manager' using errcode='42501'; end if;
    return;
  end if;
  if not (v_step->'candidate_user_ids' @> jsonb_build_array(p_user_id::text)) or not exists (
    select 1 from public.profiles profile join public.master_offices office on office.id=profile.office_id
    where profile.id=p_user_id and lower(btrim(office.kedudukan))='pusat'
      and (nullif(v_step->>'signer_department_id','') is null or profile.department_id=(v_step->>'signer_department_id')::uuid)
  ) then raise exception 'KEU10 signer is outside frozen eligibility' using errcode='42501'; end if;
  v_count := jsonb_array_length(v_surat.policy_snapshot->'keu10_steps');
  if (v_step->>'step_order')::integer=v_count then
    v_code := case when v_surat.policy_snapshot#>>'{keu10_config,disposition}'='tactical_land'
      and (public.normalize_keu10_input(v_surat.form_input_data,v_surat.policy_snapshot->'keu10_config')->>'fund_amount')::numeric<=2000000
      then 'DI' else 'DU' end;
    if not exists(select 1 from public.profiles profile where id=p_user_id
      and public.keu10_director_code(job_title,to_jsonb(profile)->>'job_title_display')=v_code) then
      raise exception 'KEU10 final director does not match the server total' using errcode='42501'; end if;
  elsif (v_step->>'step_order')::integer=3 and v_count=5 then
    if not exists(select 1 from public.profiles profile where id=p_user_id
      and public.keu10_director_code(job_title,to_jsonb(profile)->>'job_title_display')='DI') then
      raise exception 'KEU10 prior examiner must be Direktur I' using errcode='42501'; end if;
  elsif not exists(select 1 from public.profiles profile join public.master_departments department on department.id=profile.department_id
    where profile.id=p_user_id and (
      lower(btrim(profile.job_title)) ~ '^(mgr[.]?|manager)([[:space:]]|$)'
      or lower(btrim(to_jsonb(profile)->>'job_title_display')) ~ '^(mgr[.]?|manager)([[:space:]]|$)')
    and lower(btrim(department.name))=case when v_step->>'role_name'='verifikator' then 'keuangan & akuntansi'
      when v_surat.policy_snapshot#>>'{keu10_config,disposition}'='legal_land' then 'legal lahan'
      else 'pengembangan bisnis' end) then
    raise exception 'KEU10 examiner/verifier must be a manager' using errcode='42501';
  end if;
end $$;

create function public.guard_keu10_document_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_permit boolean;
begin
  if old.policy_snapshot->'keu10_config' is null then
    if tg_op='UPDATE' and new.policy_snapshot->'keu10_config' is not null then
      raise exception 'KEU10 identity requires canonical registration' using errcode='42501'; end if;
    return coalesce(new,old);
  end if;
  select exists(select 1 from keu10_internal.mutation_permits
    where transaction_id=txid_current() and surat_id=old.id) into v_permit;
  if tg_op='DELETE' then raise exception 'KEU10 history cannot be deleted' using errcode='42501'; end if;
  if not v_permit and (
    new.form_input_data is distinct from old.form_input_data or new.policy_snapshot is distinct from old.policy_snapshot
    or new.form_usage_id is distinct from old.form_usage_id or new.office_id is distinct from old.office_id
    or new.project_id is distinct from old.project_id or new.entity_id is distinct from old.entity_id
    or new.dept_id is distinct from old.dept_id or new.created_by is distinct from old.created_by
    or new.no_surat is distinct from old.no_surat or new.letter_type_id is distinct from old.letter_type_id
    or new.current_step is distinct from old.current_step or new.status is distinct from old.status
    or new.file_path is distinct from old.file_path or new.pdf_path is distinct from old.pdf_path
    or new.judul_surat is distinct from old.judul_surat
    or new.request_date is distinct from old.request_date or new.request_place is distinct from old.request_place
    or new.requester_snapshot is distinct from old.requester_snapshot or new.location_snapshot is distinct from old.location_snapshot
    or new.data_snapshot->'keu10_generation' is distinct from old.data_snapshot->'keu10_generation'
    or new.data_snapshot->'revision' is distinct from old.data_snapshot->'revision'
    or new.data_snapshot->'applied_revision' is distinct from old.data_snapshot->'applied_revision'
  ) then raise exception 'KEU10 mutation requires a canonical action' using errcode='42501'; end if;
  if not v_permit then new.data_snapshot := new.data_snapshot || jsonb_build_object(
    'input',old.form_input_data,'keu10_generation',old.data_snapshot->'keu10_generation'); end if;
  return new;
end $$;
create trigger zz_guard_keu10_document_mutation before update or delete on public.surat_registrasi
for each row execute function public.guard_keu10_document_mutation();

create function public.guard_keu10_signature_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_surat public.surat_registrasi%rowtype; v_step jsonb;
begin
  if tg_op='UPDATE' and new.surat_id is distinct from old.surat_id
    and (public.is_keu10_surat(new.surat_id) or public.is_keu10_surat(old.surat_id)) then
    raise exception 'KEU10 signature identity is immutable' using errcode='42501'; end if;
  select * into v_surat from public.surat_registrasi where id=case when tg_op='DELETE' then old.surat_id else new.surat_id end for update;
  if v_surat.policy_snapshot->'keu10_config' is null then return coalesce(new,old); end if;
  if exists(select 1 from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id) then return coalesce(new,old); end if;
  if tg_op<>'INSERT' then raise exception 'KEU10 signature mutation requires canonical action' using errcode='42501'; end if;
  if auth.uid() is distinct from v_surat.created_by or v_surat.current_step<>1
    or v_surat.status<>'PROSES' or exists(select 1 from public.surat_signatures where surat_id=v_surat.id and is_signed) then
    raise exception 'KEU10 signature initialization is not authorized' using errcode='42501'; end if;
  perform public.assert_keu10_signer(v_surat.id,new.form_usage_step_id,new.user_id);
  select value into v_step from jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') where value->>'id'=new.form_usage_step_id::text;
  if exists(select 1 from public.surat_signatures where surat_id=v_surat.id and form_usage_step_id=new.form_usage_step_id)
    or new.step_order<>(v_step->>'step_order')::integer or new.role_name is distinct from v_step->>'role_name'
    or new.action_type is distinct from 'approval' or new.is_signed is distinct from false
    or new.status is distinct from 'PENDING' or coalesce(new.verification_required,false)
    or new.signed_at is not null or new.file_path_snap is not null or new.pdf_path_snap is not null then
    raise exception 'KEU10 signature initialization is invalid' using errcode='22023'; end if;
  new.signer_snapshot := (select jsonb_build_object('id',id,'full_name',full_name,
    'job_title',coalesce(nullif(to_jsonb(profile)->>'job_title_display',''),job_title),'nik',nik)
    from public.profiles profile where id=new.user_id);
  if new.step_order=jsonb_array_length(v_surat.policy_snapshot->'keu10_steps') then
    new.label_jabatan := case public.keu10_director_code(new.signer_snapshot->>'job_title')
      when 'DI' then 'Direktur I' when 'DU' then 'Direktur Utama' end;
  end if;
  return new;
end $$;
create trigger zz_guard_keu10_signature_mutation before insert or update or delete on public.surat_signatures
for each row execute function public.guard_keu10_signature_mutation();

-- KEU10 uses its frozen route and canonical action guard, not live editable usage
-- candidates. Preserve the original trigger implementation for every other form.
do $patch$
declare v_definition text := pg_get_functiondef('public.validate_form_usage_signature()'::regprocedure);
  v_anchor integer;
begin
  v_anchor := strpos(lower(v_definition), E'\nbegin\n');
  if v_anchor=0 then raise exception 'Unknown signature validation body'; end if;
  execute overlay(v_definition placing E'\nbegin\n  if public.is_keu10_surat(new.surat_id) then return new; end if;\n'
    from v_anchor for length(E'\nbegin\n'));
end;
$patch$;

create function public.create_keu10_registration(p_payload jsonb,p_signers jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_step jsonb; v_signer jsonb; v_usage uuid;
  v_existing_id uuid; v_created boolean;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Active KEU10 requester required' using errcode='42501'; end if;
  v_usage := nullif(p_payload->>'form_usage_id','')::uuid;
  if not exists(select 1 from public.form_usages where id=v_usage and keu10_config is not null and status='active')
    or jsonb_typeof(p_signers) is distinct from 'array' then
    raise exception 'KEU10 configured usage and signers required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10-registration:'||auth.uid()::text||':'||coalesce(p_payload->>'no_surat',''),0));
  select id into v_existing_id from public.surat_registrasi
    where no_surat=p_payload->>'no_surat' for update;
  v_created := v_existing_id is null;
  insert into keu10_internal.registration_permits values(txid_current(),auth.uid(),v_usage);
  v_surat := public.create_surat_registrasi(p_payload);
  if v_surat.created_by is distinct from auth.uid() or v_surat.form_usage_id is distinct from v_usage
    or v_surat.policy_snapshot->'keu10_config' is null
    or jsonb_array_length(p_signers)<>jsonb_array_length(v_surat.policy_snapshot->'keu10_steps') then
    raise exception 'KEU10 mandatory signer count/registration identity is invalid' using errcode='22023'; end if;
  if (select count(distinct value->>'form_usage_step_id') from jsonb_array_elements(p_signers))<>jsonb_array_length(p_signers) then
    raise exception 'KEU10 signer steps must be unique' using errcode='22023'; end if;
  for v_step in select value from jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') order by (value->>'step_order')::integer loop
    select value into v_signer from jsonb_array_elements(p_signers) where value->>'form_usage_step_id'=v_step->>'id';
    if v_signer is null or nullif(v_signer->>'user_id','') is null then
      raise exception 'KEU10 mandatory signer is missing' using errcode='22023'; end if;
    perform public.assert_keu10_signer(v_surat.id,(v_step->>'id')::uuid,(v_signer->>'user_id')::uuid);
    if exists(select 1 from public.surat_signatures where surat_id=v_surat.id and form_usage_step_id=(v_step->>'id')::uuid) then
      if not exists(select 1 from public.surat_signatures where surat_id=v_surat.id and form_usage_step_id=(v_step->>'id')::uuid
        and user_id=(v_signer->>'user_id')::uuid) then raise exception 'KEU10 registration retry cannot replace signers' using errcode='40001'; end if;
    else
      insert into public.surat_signatures(surat_id,user_id,form_usage_step_id,step_order,role_name,label_jabatan,action_type,is_signed,status,available_at)
        values(v_surat.id,(v_signer->>'user_id')::uuid,(v_step->>'id')::uuid,(v_step->>'step_order')::integer,
          v_step->>'role_name',v_step->>'label','approval',false,'PENDING',case when (v_step->>'step_order')::integer=1 then clock_timestamp() end);
    end if;
  end loop;
  if (select count(*) from public.surat_signatures where surat_id=v_surat.id)<>jsonb_array_length(p_signers) then
    raise exception 'KEU10 registration has unexpected signatures' using errcode='40001'; end if;
  if not exists(select 1 from public.document_pdf_jobs where surat_id=v_surat.id and signature_id is null and source_file_path=v_surat.file_path) then
    insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
      values(v_surat.id,null,v_surat.file_path,auth.uid(),false);
  end if;
  delete from keu10_internal.registration_permits where transaction_id=txid_current();
  return jsonb_build_object('surat',to_jsonb(v_surat),'created',v_created);
end $$;
revoke all on function public.create_keu10_registration(jsonb,jsonb) from public,anon;
grant execute on function public.create_keu10_registration(jsonb,jsonb) to authenticated,service_role;

alter function public.handle_approve_surat_v2(uuid,uuid,text,text) rename to handle_approve_surat_v2_pre_keu10;
revoke all on function public.handle_approve_surat_v2_pre_keu10(uuid,uuid,text,text) from public,anon,authenticated;
create function public.handle_approve_surat_v2(p_sig_id uuid,p_surat_id uuid,p_note text,p_file_path text)
returns json language plpgsql security definer set search_path = '' as $$
declare v_surat public.surat_registrasi%rowtype; v_sig public.surat_signatures%rowtype;
  v_result json; v_count integer; v_input jsonb;
begin
  if not public.is_keu10_surat(p_surat_id) then return public.handle_approve_surat_v2_pre_keu10(p_sig_id,p_surat_id,p_note,p_file_path); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||p_surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=p_surat_id for update;
  select * into v_sig from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id for update;
  if v_sig.id is null or v_sig.user_id is distinct from auth.uid() or v_sig.is_signed
     or v_sig.step_order<>v_surat.current_step or v_surat.status<>'PROSES'
     or exists(select 1 from public.surat_revision_events where surat_id=p_surat_id and status in ('open','awaiting_requester')) then
    raise exception 'KEU10 signature is not active' using errcode='42501'; end if;
  v_input := public.normalize_keu10_input(v_surat.form_input_data,v_surat.policy_snapshot->'keu10_config');
  if v_input is distinct from v_surat.form_input_data then raise exception 'KEU10 canonical total is stale' using errcode='40001'; end if;
  v_count := jsonb_array_length(v_surat.policy_snapshot->'keu10_steps');
  if (select count(*) from public.surat_signatures where surat_id=p_surat_id)<>v_count or exists (
    select 1 from jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') step
    where not exists(select 1 from public.surat_signatures signature where signature.surat_id=p_surat_id
      and signature.form_usage_step_id=(step->>'id')::uuid and signature.step_order=(step->>'step_order')::integer
      and signature.role_name=step->>'role_name' and signature.action_type='approval'
      and (signature.step_order>=v_surat.current_step or signature.is_signed))
  ) then raise exception 'KEU10 complete mandatory route and prior approvals required' using errcode='42501'; end if;
  perform public.assert_keu10_signer(p_surat_id,v_sig.form_usage_step_id,v_sig.user_id);
  insert into keu10_internal.mutation_permits values(txid_current(),p_surat_id,'approval');
  v_result := public.handle_approve_surat_v2_pre_keu10(p_sig_id,p_surat_id,p_note,
    'native://document/'||p_surat_id::text||'/generation/'||(v_surat.data_snapshot->>'keu10_generation')||'/approval/'||p_sig_id::text);
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=p_surat_id;
  return v_result;
end $$;
revoke all on function public.handle_approve_surat_v2(uuid,uuid,text,text) from public,anon;
grant execute on function public.handle_approve_surat_v2(uuid,uuid,text,text) to authenticated,service_role;

alter function public.handle_reject_surat_v2(uuid,uuid,text) rename to handle_reject_surat_v2_pre_keu10;
revoke all on function public.handle_reject_surat_v2_pre_keu10(uuid,uuid,text) from public,anon,authenticated;
create function public.handle_reject_surat_v2(p_sig_id uuid,p_surat_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_sig public.surat_signatures%rowtype; v_result boolean;
begin
  if not public.is_keu10_surat(p_surat_id) then return public.handle_reject_surat_v2_pre_keu10(p_sig_id,p_surat_id,p_note); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||p_surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=p_surat_id for update;
  select * into v_sig from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id for update;
  if v_sig.id is null or v_sig.user_id is distinct from auth.uid() or v_sig.is_signed is distinct from false
    or v_sig.step_order is distinct from v_surat.current_step or v_surat.status is distinct from 'PROSES'
    or exists(select 1 from public.surat_revision_events where surat_id=p_surat_id and status in ('open','awaiting_requester')) then
    raise exception 'KEU10 rejection requires the active unsigned signer' using errcode='42501'; end if;
  perform public.assert_keu10_signer(p_surat_id,v_sig.form_usage_step_id,auth.uid());
  insert into keu10_internal.mutation_permits values(txid_current(),p_surat_id,'rejection');
  v_result := public.handle_reject_surat_v2_pre_keu10(p_sig_id,p_surat_id,p_note);
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=p_surat_id;
  return v_result;
end $$;
revoke all on function public.handle_reject_surat_v2(uuid,uuid,text) from public,anon;
grant execute on function public.handle_reject_surat_v2(uuid,uuid,text) to authenticated,service_role;

-- Reuse the existing immutable-history store; internal origin is a canonical revision event.
alter table public.surat_external_revision_history alter column decision_event_id drop not null;
alter table public.surat_external_revision_history add column revision_event_id uuid references public.surat_revision_events(id) on delete restrict;
alter table public.surat_external_revision_history add constraint surat_revision_history_one_origin
  check ((decision_event_id is not null)::integer+(revision_event_id is not null)::integer=1);
create unique index surat_revision_history_internal_event_key on public.surat_external_revision_history(revision_event_id) where revision_event_id is not null;
create function public.guard_keu10_history_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.revision_event_id is not null and not exists(select 1 from keu10_internal.mutation_permits
      where transaction_id=txid_current() and surat_id=new.surat_id and operation='accept_revision') then
      raise exception 'KEU10 history requires confirmed canonical revision' using errcode='42501'; end if;
    if new.decision_event_id is not null and public.is_keu10_surat(new.surat_id)
      and not exists(select 1 from keu10_internal.mutation_permits
        where transaction_id=txid_current() and surat_id=new.surat_id and operation='external_decision') then
      raise exception 'KEU10 external history requires canonical decision' using errcode='42501'; end if;
    return new;
  end if;
  if old.revision_event_id is not null or public.is_keu10_surat(old.surat_id) then
    raise exception 'KEU10 revision snapshots are append-only' using errcode='42501'; end if;
  return coalesce(new,old);
end $$;
create trigger guard_keu10_history_mutation before insert or update or delete on public.surat_external_revision_history
for each row execute function public.guard_keu10_history_mutation();

alter function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb) rename to request_surat_process_revision_pre_keu10;
revoke all on function public.request_surat_process_revision_pre_keu10(uuid,uuid,text,integer,text,jsonb) from public,anon,authenticated;
create function public.request_surat_process_revision(p_surat_id uuid,p_sig_id uuid,p_target_type text,
  p_target_step integer,p_reason text,p_changes jsonb default '{}')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_surat public.surat_registrasi%rowtype; v_sig public.surat_signatures%rowtype;
  v_changes jsonb := coalesce(p_changes,'{}'); v_input jsonb; v_id uuid; v_base jsonb;
begin
  if not public.is_keu10_surat(p_surat_id) then
    return public.request_surat_process_revision_pre_keu10(p_surat_id,p_sig_id,p_target_type,p_target_step,p_reason,p_changes);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||p_surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=p_surat_id for update;
  select * into v_sig from public.surat_signatures where id=p_sig_id and surat_id=p_surat_id for update;
  if v_sig.id is null or v_sig.user_id is distinct from auth.uid() or v_sig.is_signed
     or v_sig.step_order<>v_surat.current_step or v_surat.status<>'PROSES' then
    raise exception 'KEU10 revision requires the active unsigned signer' using errcode='42501'; end if;
  perform public.assert_keu10_signer(p_surat_id,v_sig.form_usage_step_id,auth.uid());
  if exists(select 1 from public.surat_revision_events where surat_id=p_surat_id and status in ('open','awaiting_requester')) then
    raise exception 'KEU10 revision already pending' using errcode='55000'; end if;
  if v_changes ? 'keu10_proposed_input' then
    if v_sig.role_name<>'verifikator' or p_target_type is distinct from 'requester' or auth.uid()=v_surat.created_by then
      raise exception 'Only the active Finance Verifikator may propose KEU10 items to requester' using errcode='42501'; end if;
    if jsonb_typeof(v_changes->'keu10_proposed_input') is distinct from 'object'
       or ((v_changes->'keu10_proposed_input') - 'items') <> '{}'::jsonb then
      raise exception 'KEU10 proposal may contain only items' using errcode='22023'; end if;
    v_input := public.normalize_keu10_input(v_surat.form_input_data || jsonb_build_object(
      'items',v_changes#>'{keu10_proposed_input,items}'),v_surat.policy_snapshot->'keu10_config');
    v_changes := jsonb_build_object('keu10_proposed_input',jsonb_build_object('items',v_input->'items'),
      'keu10_finance_proposal',true,'requires_resign',true,'restart_step',1);
  else
    if v_changes ? 'item_revisions' or v_changes ? 'external_submission_revision'
      or v_changes ? 'keu10_finance_proposal' or v_changes ? 'keu10_external_confirmed_input' then
      raise exception 'KEU10 corrections require the explicit Finance proposal contract' using errcode='22023'; end if;
  end if;
  if jsonb_typeof(v_changes) is distinct from 'object' or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then
    raise exception 'KEU10 revision reason must contain 5 to 1000 characters' using errcode='22023'; end if;
  -- These fields are server-authored even for an ordinary approver return.
  v_changes := v_changes - array['keu10_base','keu10_base_generation'];
  v_base := jsonb_build_object('document_snapshot',to_jsonb(v_surat),
    'signatures_snapshot',coalesce((select jsonb_agg(to_jsonb(signature) order by step_order) from public.surat_signatures signature where surat_id=p_surat_id),'[]'),
    'attachments_snapshot',coalesce((select jsonb_agg(to_jsonb(attachment) order by created_at,id) from public.surat_attachments attachment where surat_id=p_surat_id),'[]'));
  v_changes := v_changes || jsonb_build_object('keu10_base',v_base,'keu10_base_generation',v_surat.data_snapshot->'keu10_generation');
  insert into keu10_internal.mutation_permits values(txid_current(),p_surat_id,'request_revision');
  v_id := public.request_surat_process_revision_pre_keu10(p_surat_id,p_sig_id,p_target_type,p_target_step,p_reason,v_changes);
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=p_surat_id;
  return v_id;
end $$;
revoke all on function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb) from public,anon;
grant execute on function public.request_surat_process_revision(uuid,uuid,text,integer,text,jsonb) to authenticated,service_role;

alter function public.accept_surat_process_revision(uuid,text) rename to accept_surat_process_revision_pre_keu10;
revoke all on function public.accept_surat_process_revision_pre_keu10(uuid,text) from public,anon,authenticated;
create function keu10_internal.accept_revision(p_event_id uuid,p_note text,p_items jsonb,p_final_signer_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype;
  v_input jsonb; v_generation integer; v_sig public.surat_signatures%rowtype; v_director uuid; v_directors uuid[];
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not public.is_keu10_surat(v_event.surat_id) then return public.accept_surat_process_revision_pre_keu10(p_event_id,p_note); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_event_id for update;
  if auth.uid() is distinct from v_surat.created_by or not exists(select 1 from public.profiles
    where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'Only the actual active requester can confirm KEU10 revision' using errcode='42501'; end if;
  if v_event.status not in ('open','awaiting_requester') or v_event.target_type<>'requester'
    or v_surat.status<>'MENUNGGU_PERBAIKAN' or v_surat.data_snapshot#>>'{revision,event_id}' is distinct from p_event_id::text
    or v_event.changes->'keu10_base_generation' is distinct from v_surat.data_snapshot->'keu10_generation'
    or v_event.changes#>'{keu10_base,document_snapshot,form_input_data}' is distinct from v_surat.form_input_data then
    raise exception 'KEU10 revision is stale or not awaiting requester' using errcode='40001'; end if;
  v_input := v_surat.form_input_data;
  if v_event.changes ? 'keu10_external_confirmed_input' then
    if v_event.changes->>'external_submission_revision' is distinct from 'true' then
      raise exception 'KEU10 external revision identity is invalid' using errcode='42501'; end if;
    v_input := v_event.changes->'keu10_external_confirmed_input';
  end if;
  if v_event.changes->>'keu10_finance_proposal'='true' then
    if p_items is not null then raise exception 'Finance proposal must be confirmed without replacement items' using errcode='22023'; end if;
    if v_event.actor_id=v_surat.created_by then raise exception 'KEU10 Finance proposal requires a second person' using errcode='42501'; end if;
    v_input := v_input || jsonb_build_object('items',v_event.changes#>'{keu10_proposed_input,items}');
  end if;
  if p_items is not null then
    if length(btrim(coalesce(p_note,''))) not between 5 and 1000 then
      raise exception 'KEU10 requester correction requires a 5 to 1000 character note' using errcode='22023'; end if;
    v_input := v_input || jsonb_build_object('items',p_items);
  end if;
  v_input := public.normalize_keu10_input(v_input,v_surat.policy_snapshot->'keu10_config');
  select coalesce(max(generation),0)+1 into v_generation from public.surat_external_revision_history where surat_id=v_surat.id;
  insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'accept_revision');
  if v_event.changes->>'external_submission_revision' is distinct from 'true' then
  insert into public.surat_external_revision_history(surat_id,revision_event_id,generation,document_snapshot,signatures_snapshot,attachments_snapshot)
    values(v_surat.id,v_event.id,v_generation,v_event.changes#>'{keu10_base,document_snapshot}',
      v_event.changes#>'{keu10_base,signatures_snapshot}',v_event.changes#>'{keu10_base,attachments_snapshot}');
  end if;
  update public.surat_registrasi set form_input_data=v_input where id=v_surat.id;
  -- Select the new final director using frozen candidates, never a caller's user ID.
  select * into v_sig from public.surat_signatures where surat_id=v_surat.id order by step_order desc limit 1 for update;
  select array_agg(profile.id order by profile.id) into v_directors from public.profiles profile
    join public.master_offices office on office.id=profile.office_id
    where profile.is_active is true and profile.deleted_at is null and lower(btrim(office.kedudukan))='pusat' and exists(
      select 1 from jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') step
      where step->>'id'=v_sig.form_usage_step_id::text and step->'candidate_user_ids' @> jsonb_build_array(profile.id::text)
        and (nullif(step->>'signer_department_id','') is null or profile.department_id=(step->>'signer_department_id')::uuid))
      and public.keu10_director_code(profile.job_title,to_jsonb(profile)->>'job_title_display')=case when v_surat.policy_snapshot#>>'{keu10_config,disposition}'='tactical_land'
        and (v_input->>'fund_amount')::numeric<=2000000 then 'DI' else 'DU' end;
  if p_final_signer_id is not null then
    if not coalesce(p_final_signer_id=any(v_directors),false) then
      raise exception 'KEU10 selected replacement director is not eligible' using errcode='42501'; end if;
    v_director := p_final_signer_id;
  elsif v_sig.user_id=any(v_directors) then v_director := v_sig.user_id;
  elsif cardinality(v_directors)=1 then v_director := v_directors[1];
  else raise exception 'KEU10 replacement director is unavailable or ambiguous' using errcode='42501'; end if;
  perform public.assert_keu10_signer(v_surat.id,v_sig.form_usage_step_id,v_director);
  update public.surat_signatures set user_id=v_director,
    label_jabatan=case public.keu10_director_code((select job_title from public.profiles where id=v_director),
      (select to_jsonb(profile)->>'job_title_display' from public.profiles profile where id=v_director))
      when 'DI' then 'Direktur I' when 'DU' then 'Direktur Utama' end,
    signer_snapshot=(select jsonb_build_object('id',id,'full_name',full_name,'job_title',coalesce(nullif(to_jsonb(profile)->>'job_title_display',''),job_title),'nik',nik) from public.profiles profile where id=v_director)
    where id=v_sig.id;
  update public.surat_signatures set is_signed=false,signed_at=null,catatan=null,status='PENDING',
    file_path_snap=null,pdf_path_snap=null,available_at=case when step_order=1 then clock_timestamp() end,
    verification_status=case when verification_required then 'pending' else 'not_required' end,
    verified_at=null,verified_by=null,verification_note=null where surat_id=v_surat.id;
  update public.surat_revision_events set status='resolved',resolved_at=clock_timestamp(),resolved_by=auth.uid(),
    changes=changes||jsonb_build_object('requester_acceptance_note',nullif(btrim(p_note),''),'accepted_at',clock_timestamp(),
      'restart_step',1,'keu10_history_generation',v_generation,
      'requester_corrected_items',p_items is not null,'confirmed_input',v_input,
      'confirmed_final_signer_id',v_director) where id=v_event.id;
  update public.surat_registrasi set status='PROSES',current_step=1,pdf_path=null,
    file_path='native://document/'||id::text||'/generation/'||((data_snapshot->>'keu10_generation')::integer+1)::text,
    data_snapshot=(data_snapshot-'revision'-'verification_inputs'-'verification_drafts')||jsonb_build_object(
      'input',v_input,'keu10_generation',(data_snapshot->>'keu10_generation')::integer+1,
      'applied_revision',jsonb_build_object('event_id',v_event.id,'reason',v_event.reason,'accepted_by',auth.uid(),
        'accepted_at',clock_timestamp(),'restart_step',1,'history_generation',v_generation)),updated_at=clock_timestamp()
    where id=v_surat.id;
  insert into public.document_pdf_jobs(surat_id,signature_id,source_file_path,requested_by,refresh)
    select id,null,file_path,auth.uid(),false from public.surat_registrasi where id=v_surat.id;
  insert into public.notifications(user_id,type,title,message,data,link)
    select distinct user_id,'info','KEU10 approval restarted','Requester confirmed revision: '||v_event.reason,
      jsonb_build_object('surat_id',v_surat.id,'revision_event_id',v_event.id,'restart_step',1),'/surat/inbox'
      from public.surat_signatures where surat_id=v_surat.id;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  return true;
end $$;
revoke all on function keu10_internal.accept_revision(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function public.accept_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  return keu10_internal.accept_revision(p_event_id,p_note,null,null);
end $$;
revoke all on function public.accept_surat_process_revision(uuid,text) from public,anon;
grant execute on function public.accept_surat_process_revision(uuid,text) to authenticated,service_role;

-- Requester-only editor/explicit candidate selection without overloading the
-- established two-argument RPC (PostgREST must resolve calls unambiguously).
create function public.accept_keu10_requester_revision(p_event_id uuid,p_items jsonb,p_note text,p_final_signer_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.surat_revision_events event
    where event.id=p_event_id and public.is_keu10_surat(event.surat_id)) then
    raise exception 'A KEU10 revision is required' using errcode='22023'; end if;
  return keu10_internal.accept_revision(p_event_id,p_note,p_items,p_final_signer_id);
end $$;
revoke all on function public.accept_keu10_requester_revision(uuid,jsonb,text,uuid) from public,anon;
grant execute on function public.accept_keu10_requester_revision(uuid,jsonb,text,uuid) to authenticated,service_role;

create function public.guard_keu10_revision_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid := case when tg_op='INSERT' then new.surat_id else old.surat_id end;
begin
  if tg_op='UPDATE' and new.surat_id is distinct from old.surat_id
    and (public.is_keu10_surat(new.surat_id) or public.is_keu10_surat(old.surat_id)) then
    raise exception 'KEU10 revision event identity is immutable' using errcode='42501'; end if;
  if public.is_keu10_surat(v_id) and not exists(select 1 from keu10_internal.mutation_permits
    where transaction_id=txid_current() and surat_id=v_id) then
    raise exception 'KEU10 revision events require canonical action' using errcode='42501'; end if;
  return coalesce(new,old);
end $$;
create trigger guard_keu10_revision_event before insert or update or delete on public.surat_revision_events
for each row execute function public.guard_keu10_revision_event();

alter function public.resolve_surat_process_revision(uuid,text) rename to resolve_surat_process_revision_pre_keu10;
revoke all on function public.resolve_surat_process_revision_pre_keu10(uuid,text) from public,anon,authenticated;
create function public.resolve_surat_process_revision(p_event_id uuid,p_note text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not public.is_keu10_surat(v_event.surat_id) then return public.resolve_surat_process_revision_pre_keu10(p_event_id,p_note); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  perform 1 from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_event_id for update;
  if v_event.changes ? 'keu10_proposed_input' or v_event.target_type='requester' then
    raise exception 'KEU10 requester confirmation cannot be bypassed by resolve' using errcode='42501'; end if;
  if v_event.status<>'open' or not (auth.uid()=any(v_event.target_user_ids)) or not exists(select 1 from public.profiles
    where id=auth.uid() and is_active is true and deleted_at is null) then
    raise exception 'KEU10 revision target is not active' using errcode='42501'; end if;
  insert into keu10_internal.mutation_permits values(txid_current(),v_event.surat_id,'resolve_return');
  v_result := public.resolve_surat_process_revision_pre_keu10(p_event_id,p_note);
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;
revoke all on function public.resolve_surat_process_revision(uuid,text) from public,anon;
grant execute on function public.resolve_surat_process_revision(uuid,text) to authenticated,service_role;

alter function public.cancel_surat_after_revision(uuid,text) rename to cancel_surat_after_revision_pre_keu10;
revoke all on function public.cancel_surat_after_revision_pre_keu10(uuid,text) from public,anon,authenticated;
create function public.cancel_surat_after_revision(p_event_id uuid,p_note text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_result boolean;
begin
  select * into v_event from public.surat_revision_events where id=p_event_id;
  if not public.is_keu10_surat(v_event.surat_id) then return public.cancel_surat_after_revision_pre_keu10(p_event_id,p_note); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  perform 1 from public.surat_registrasi where id=v_event.surat_id for update;
  if not exists(select 1 from public.surat_registrasi surat join public.profiles profile on profile.id=surat.created_by
    where surat.id=v_event.surat_id and surat.created_by=auth.uid() and profile.is_active is true and profile.deleted_at is null
      and surat.data_snapshot#>>'{revision,event_id}'=p_event_id::text and surat.status='MENUNGGU_PERBAIKAN') then
    raise exception 'Only actual requester may cancel KEU10 revision' using errcode='42501'; end if;
  insert into keu10_internal.mutation_permits values(txid_current(),v_event.surat_id,'cancel_return');
  v_result := public.cancel_surat_after_revision_pre_keu10(p_event_id,p_note);
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_event.surat_id;
  return v_result;
end $$;
revoke all on function public.cancel_surat_after_revision(uuid,text) from public,anon;
grant execute on function public.cancel_surat_after_revision(uuid,text) to authenticated,service_role;

create function public.keu10_pdf_render_payload(p_surat_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('kind','keu10','document_type','keu10','generation',surat.data_snapshot->'keu10_generation',
    'document',jsonb_build_object('id',surat.id,'no_surat',surat.no_surat,'judul_surat',surat.judul_surat,
      'form_input_data',surat.form_input_data,'policy_snapshot',surat.policy_snapshot,
      'location_snapshot',surat.location_snapshot,'requester_snapshot',surat.requester_snapshot,
      'request_place',surat.request_place,'request_date',surat.request_date),
    'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',signature.id,'user_id',signature.user_id,
      'step_order',signature.step_order,'role_name',signature.role_name,'label_jabatan',signature.label_jabatan,
      'is_signed',signature.is_signed,'signed_at',signature.signed_at,'catatan',signature.catatan,
      'signer_snapshot',signature.signer_snapshot) order by signature.step_order)
      from public.surat_signatures signature where signature.surat_id=surat.id),'[]'))
  from public.surat_registrasi surat where surat.id=p_surat_id and surat.policy_snapshot->'keu10_config' is not null
$$;
create function public.freeze_keu10_pdf_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_payload jsonb; v_source text;
begin
  if tg_op='DELETE' then
    if public.is_keu10_surat(old.surat_id) then raise exception 'KEU10 PDF snapshots cannot be deleted' using errcode='42501'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and new.surat_id is distinct from old.surat_id
    and (public.is_keu10_surat(new.surat_id) or public.is_keu10_surat(old.surat_id)) then
    raise exception 'KEU10 PDF job identity is immutable' using errcode='42501'; end if;
  if not public.is_keu10_surat(new.surat_id) then return new; end if;
  if tg_op='UPDATE' then
    if new.render_payload is distinct from old.render_payload or new.source_file_path is distinct from old.source_file_path
      or new.surat_id is distinct from old.surat_id or new.signature_id is distinct from old.signature_id then
      raise exception 'KEU10 PDF source snapshot is immutable' using errcode='42501'; end if;
    return new;
  end if;
  if (select count(*) from public.surat_signatures where surat_id=new.surat_id) <>
    (select jsonb_array_length(policy_snapshot->'keu10_steps') from public.surat_registrasi where id=new.surat_id) then
    -- The existing AFTER INSERT registration trigger runs before atomic signer insertion.
    if exists(select 1 from keu10_internal.registration_permits where transaction_id=txid_current()) then return null; end if;
    raise exception 'KEU10 PDF requires the complete canonical route' using errcode='42501';
  end if;
  if new.signature_id is null then
    select file_path into v_source from public.surat_registrasi where id=new.surat_id;
  else
    select file_path_snap into v_source from public.surat_signatures
      where id=new.signature_id and surat_id=new.surat_id and is_signed;
  end if;
  if v_source is null or new.source_file_path is distinct from v_source then
    raise exception 'KEU10 PDF source must match its document/signature' using errcode='40001'; end if;
  v_payload := public.keu10_pdf_render_payload(new.surat_id);
  if new.signature_id is not null then
    -- Regenerate an earlier signature without later approvals leaking into it.
    select jsonb_set(v_payload,'{signatures}',coalesce(jsonb_agg(
      case when nullif(signature->>'signed_at','')::timestamptz > requested.signed_at then
        signature || '{"is_signed":false,"signed_at":null,"catatan":null}'::jsonb
      else signature end order by (signature->>'step_order')::integer),'[]')) into v_payload
      from public.surat_signatures requested,
        jsonb_array_elements(v_payload->'signatures') signature
      where requested.id=new.signature_id;
  end if;
  new.render_payload := v_payload || jsonb_build_object('content_hash',encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'));
  return new;
end $$;
create trigger freeze_keu10_pdf_job before insert or update or delete on public.document_pdf_jobs
for each row execute function public.freeze_keu10_pdf_job();

alter function public.complete_document_pdf_job(uuid,text,uuid) rename to complete_document_pdf_job_pre_keu10;
revoke all on function public.complete_document_pdf_job_pre_keu10(uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.complete_document_pdf_job(p_job_id uuid,p_pdf_url text,p_lease_token uuid)
returns public.document_pdf_jobs language plpgsql security definer set search_path='' as $$
declare v_job public.document_pdf_jobs%rowtype; v_surat public.surat_registrasi%rowtype; v_source text;
begin
  select * into v_job from public.document_pdf_jobs where id=p_job_id;
  if not public.is_keu10_surat(v_job.surat_id) then return public.complete_document_pdf_job_pre_keu10(p_job_id,p_pdf_url,p_lease_token); end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_job.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_job.surat_id for update;
  select * into v_job from public.document_pdf_jobs where id=p_job_id for update;
  if v_job.status='done' and v_job.lease_token=p_lease_token and v_job.pdf_url=p_pdf_url then return v_job; end if;
  if v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token or p_lease_token is null
    or v_job.lease_expires_at<=clock_timestamp() or v_job.lease_expires_at is null or nullif(btrim(p_pdf_url),'') is null then
    raise exception 'KEU10 PDF requires an active lease and URL' using errcode='42501'; end if;
  if v_job.render_payload->'generation' is distinct from v_surat.data_snapshot->'keu10_generation'
    or v_job.render_payload#>'{document,form_input_data}' is distinct from v_surat.form_input_data
    or v_job.render_payload#>'{document,policy_snapshot}' is distinct from v_surat.policy_snapshot then
    raise exception 'Stale KEU10 PDF generation' using errcode='40001'; end if;
  if v_job.signature_id is null then v_source := v_surat.file_path;
  else
    select file_path_snap into v_source from public.surat_signatures
      where id=v_job.signature_id and surat_id=v_surat.id and is_signed for update;
  end if;
  if v_source is distinct from v_job.source_file_path then raise exception 'Stale KEU10 PDF source' using errcode='40001'; end if;
  insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'publish_pdf');
  if v_job.signature_id is null then update public.surat_registrasi set pdf_path=p_pdf_url where id=v_surat.id;
  else
    update public.surat_signatures set pdf_path_snap=p_pdf_url where id=v_job.signature_id;
    if v_surat.file_path=v_job.source_file_path then
      update public.surat_registrasi set pdf_path=p_pdf_url,updated_at=clock_timestamp() where id=v_surat.id;
    end if;
  end if;
  update public.document_pdf_jobs set status='done',pdf_url=p_pdf_url,error_message=null,locked_by=null,locked_at=null,
    updated_at=clock_timestamp(),finished_at=clock_timestamp() where id=p_job_id returning * into v_job;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  return v_job;
end $$;
revoke all on function public.complete_document_pdf_job(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.complete_document_pdf_job(uuid,text,uuid) to service_role;

-- Keep one history generation sequence across internal and vendor revisions.
-- Patch the preserved vendor implementation, with an exact-anchor drift gate.
do $patch$
declare v_body text := pg_get_functiondef('public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)'::regprocedure);
  v_old text := E'select coalesce(max(event.revision_generation), 0) + 1 into v_generation\n  from public.external_submission_decision_events event\n  where event.surat_id = v_surat.id and event.decision = ''revision_required'';';
begin
  v_body := replace(v_body,E'\r\n',E'\n');
  if strpos(v_body,v_old)=0 then raise exception 'Unknown vendor revision generation implementation'; end if;
  execute replace(v_body,v_old,E'select coalesce(max(generation),0)+1 into v_generation\n  from public.surat_external_revision_history where surat_id=v_surat.id;');
end;
$patch$;
alter function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text)
  rename to apply_external_submission_decision_pre_keu10;
revoke all on function public.apply_external_submission_decision_pre_keu10(uuid,text,text,text,timestamptz,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.apply_external_submission_decision_pre_configurable_routing(uuid,text,text,text,timestamptz,text,text)
  from public,anon,authenticated,service_role;
create function public.apply_external_submission_decision(p_event_id uuid,p_document_number text,p_decision text,
  p_reason text,p_decided_at timestamptz,p_payload_hash text,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_surat public.surat_registrasi%rowtype; v_base jsonb; v_result jsonb; v_event uuid;
begin
  select * into v_surat from public.surat_registrasi where btrim(no_surat)=btrim(p_document_number);
  if not public.is_keu10_surat(v_surat.id) then
    return public.apply_external_submission_decision_pre_keu10(p_event_id,p_document_number,p_decision,p_reason,p_decided_at,p_payload_hash,p_environment);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_surat.id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_surat.id for update;
  v_base := jsonb_build_object('document_snapshot',to_jsonb(v_surat),
    'signatures_snapshot',coalesce((select jsonb_agg(to_jsonb(signature) order by step_order) from public.surat_signatures signature where surat_id=v_surat.id),'[]'),
    'attachments_snapshot',coalesce((select jsonb_agg(to_jsonb(attachment) order by created_at,id) from public.surat_attachments attachment where surat_id=v_surat.id),'[]'));
  insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'external_decision');
  v_result := public.apply_external_submission_decision_pre_keu10(p_event_id,p_document_number,p_decision,p_reason,p_decided_at,p_payload_hash,p_environment);
  if p_decision='revision_required' and coalesce((v_result->>'idempotent')::boolean,false) is false then
    v_event := (v_result->>'revision_event_id')::uuid;
    update public.surat_revision_events set target_type='requester',target_user_ids=array[v_surat.created_by],target_step=1,
      changes=changes||jsonb_build_object('keu10_base',v_base,'keu10_base_generation',v_surat.data_snapshot->'keu10_generation',
        'restart_step',1,'configured_recipient_type','requester') where id=v_event;
    update public.surat_registrasi set data_snapshot=jsonb_set(data_snapshot,'{revision}',
      (data_snapshot->'revision')||jsonb_build_object('target_type','requester','target_user_ids',array[v_surat.created_by],
        'target_step',1,'changes',(select changes from public.surat_revision_events where id=v_event))) where id=v_surat.id;
  end if;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  return v_result;
end $$;
revoke all on function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.apply_external_submission_decision(uuid,text,text,text,timestamptz,text,text) to service_role;

alter function public.submit_external_submission_revision(uuid,uuid,jsonb,text) rename to submit_external_submission_revision_pre_keu10;
revoke all on function public.submit_external_submission_revision_pre_keu10(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
create function public.submit_external_submission_revision(p_revision_event_id uuid,p_draft_id uuid,
  p_form_data jsonb,p_requester_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.surat_revision_events%rowtype; v_surat public.surat_registrasi%rowtype;
  v_draft public.surat_registration_drafts%rowtype; v_input jsonb; v_final uuid;
begin
  select * into v_event from public.surat_revision_events where id=p_revision_event_id;
  if not public.is_keu10_surat(v_event.surat_id) then
    return public.submit_external_submission_revision_pre_keu10(p_revision_event_id,p_draft_id,p_form_data,p_requester_note);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('keu10:'||v_event.surat_id::text,0));
  select * into v_surat from public.surat_registrasi where id=v_event.surat_id for update;
  select * into v_event from public.surat_revision_events where id=p_revision_event_id for update;
  select * into v_draft from public.surat_registration_drafts where id=p_draft_id for update;
  if auth.uid() is distinct from v_surat.created_by or v_draft.created_by is distinct from auth.uid()
    or v_draft.revision_event_id is distinct from p_revision_event_id or v_draft.status is distinct from 'DRAFT'
    or v_event.changes->>'external_submission_revision' is distinct from 'true' then
    raise exception 'KEU10 external revision draft is not authorized' using errcode='42501'; end if;
  if jsonb_typeof(p_form_data) is distinct from 'object'
    or nullif(p_form_data->>'entity_id','')::uuid is distinct from v_surat.entity_id
    or nullif(p_form_data->>'office_id','')::uuid is distinct from v_surat.office_id
    or nullif(p_form_data->>'project_id','')::uuid is distinct from v_surat.project_id
    or nullif(p_form_data->>'dept_id','')::uuid is distinct from v_surat.dept_id
    or nullif(p_form_data->>'letter_type_id','')::uuid is distinct from v_surat.letter_type_id
    or nullif(p_form_data->>'form_usage_id','')::uuid is distinct from v_surat.form_usage_id then
    raise exception 'KEU10 external revision identity is immutable' using errcode='22023'; end if;
  v_input := public.normalize_keu10_input(v_surat.form_input_data || jsonb_build_object(
    'items',p_form_data#>'{form_input_data,items}','fund_type',p_form_data#>'{form_input_data,fund_type}',
    'keu10_purpose_code',p_form_data#>'{form_input_data,keu10_purpose_code}'),v_surat.policy_snapshot->'keu10_config');
  select nullif(signer->>'user_id','')::uuid into v_final
    from jsonb_array_elements(v_draft.signer_assignments) signer
    join jsonb_array_elements(v_surat.policy_snapshot->'keu10_steps') step
      on step->>'id'=signer->>'form_usage_step_id'
    where step->>'role_name'='menyetujui';
  insert into keu10_internal.mutation_permits values(txid_current(),v_surat.id,'vendor_revision_input');
  update public.surat_revision_events set changes=changes||jsonb_build_object('keu10_external_confirmed_input',v_input) where id=v_event.id;
  delete from keu10_internal.mutation_permits where transaction_id=txid_current() and surat_id=v_surat.id;
  perform keu10_internal.accept_revision(v_event.id,p_requester_note,null,v_final);
  -- Existing external history already froze the old attachments at decision time.
  delete from public.surat_attachments attachment where surat_id=v_surat.id and stage='initial'
    and not exists(select 1 from public.surat_registration_draft_files file where draft_id=v_draft.id and file_url=attachment.file_url);
  insert into public.surat_attachments(surat_id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,stage)
    select v_surat.id,file_url,file_name,file_type,file_size,requirement_key,requirement_label,'initial'
    from public.surat_registration_draft_files file where draft_id=v_draft.id and not exists(
      select 1 from public.surat_attachments attachment where surat_id=v_surat.id and file_url=file.file_url
        and coalesce(requirement_key,'')=coalesce(file.requirement_key,''));
  update public.surat_registration_drafts set status='SUBMITTED',submitted_at=clock_timestamp() where id=v_draft.id;
  update public.surat_registrasi set data_snapshot=data_snapshot||jsonb_build_object('external_revision_current',
    jsonb_build_object('generation',v_event.changes->'revision_generation','revision_event_id',v_event.id,
      'submitted_at',clock_timestamp(),'requester_note',p_requester_note)) where id=v_surat.id;
  return jsonb_build_object('success',true,'next_step','approval','surat_id',v_surat.id,'revision_event_id',v_event.id);
end $$;
revoke all on function public.submit_external_submission_revision(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.submit_external_submission_revision(uuid,uuid,jsonb,text) to authenticated,service_role;

-- Internal helpers must not become a second browser mutation surface.
revoke all on function public.is_keu10_surat(uuid),public.assert_keu10_signer(uuid,uuid,uuid),
  public.stamp_keu10_registration(),public.guard_keu10_document_mutation(),public.guard_keu10_signature_mutation(),
  public.guard_keu10_history_mutation(),public.guard_keu10_revision_event(),public.guard_keu10_usage_config()
  from public,anon,authenticated,service_role;
revoke all on function public.keu10_pdf_render_payload(uuid),public.freeze_keu10_pdf_job() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
