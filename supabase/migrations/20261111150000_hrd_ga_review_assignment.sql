begin;

create schema if not exists hrd_ga_review_internal;
revoke all on schema hrd_ga_review_internal from public, anon, authenticated, service_role;

create or replace function hrd_ga_review_internal.item_group(p_items jsonb, p_fallback text default null)
returns text language plpgsql immutable set search_path = '' as $$
declare item jsonb; category text; selected text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Rincian kategori pemeriksaan HRD & GA wajib diisi.' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    category := coalesce(item->>'hrd_ga_category', p_fallback);
    if jsonb_typeof(item) is distinct from 'object' or category is null or category not in ('ga','hrd') then
      raise exception 'Pilih kategori pemeriksaan HRD & GA untuk setiap item.' using errcode='22023';
    end if;
    if selected is not null and selected <> category then
      raise exception 'Pisahkan ATK/rumah tangga dan BPJS/tenaga harian/dinas menjadi dua pengajuan.' using errcode='22023';
    end if;
    selected := category;
  end loop;
  if p_fallback is not null and selected <> p_fallback then
    raise exception 'Kategori pemeriksaan mengikuti pengajuan semula.' using errcode='22023';
  end if;
  return selected;
end $$;

create or replace function hrd_ga_review_internal.resolve_reviewer(p_step uuid, p_config jsonb, p_group text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare reviewer jsonb;
begin
  if p_config->>'version' is distinct from '1' or p_group not in ('ga','hrd')
    or p_config#>>'{reviewers,ga,user_id}' is not distinct from p_config#>>'{reviewers,hrd,user_id}' then
    raise exception 'Konfigurasi kategori HRD & GA tidak valid.' using errcode='22023';
  end if;
  select jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'job_title', p.job_title,
    'office_id', p.office_id, 'department_id', p.department_id) into reviewer
  from public.profiles p
  join public.master_offices o on o.id=p.office_id
  join public.master_departments d on d.id=p.department_id
  join public.form_usage_steps s on s.id=p_step and s.signer_department_id=d.id
  join public.form_usage_step_verifiers v on v.usage_step_id=s.id and v.user_id=p.id
  where p.id=(p_config->'reviewers'->p_group->>'user_id')::uuid
    and p.department_id=(p_config->>'department_id')::uuid
    and p.is_active is true and p.deleted_at is null
    and lower(o.kedudukan)='pusat' and coalesce(to_jsonb(d)->>'is_active','true') <> 'false'
    and s.action_type='approval' and s.verifier_scope='head_office';
  if reviewer is null then
    raise exception 'Tim pemeriksa kategori HRD & GA belum tersedia. Hubungi admin.' using errcode='22023';
  end if;
  return reviewer;
end $$;

create or replace function hrd_ga_review_internal.freeze_document()
returns trigger language plpgsql security definer set search_path = '' as $$
declare stage record; config jsonb; raw_config jsonb; frozen jsonb; reviewer jsonb; category text; steps jsonb := '[]'; item_data jsonb;
begin
  if tg_op='UPDATE' then
    frozen := old.policy_snapshot->'hrd_ga_review';
    if new.policy_snapshot->'hrd_ga_review' is distinct from frozen then
      raise exception 'Kebijakan pemeriksaan HRD & GA tidak dapat diubah.' using errcode='42501';
    end if;
    if frozen is null then return new; end if;
    if new.form_usage_id is distinct from old.form_usage_id then
      raise exception 'Kegunaan pengajuan tidak dapat diubah.' using errcode='42501';
    end if;
    if new.form_input_data->'items' is distinct from old.form_input_data->'items' then
      perform hrd_ga_review_internal.item_group(new.form_input_data->'items', frozen->>'group');
      select jsonb_agg(value || jsonb_build_object('hrd_ga_category',frozen->>'group') order by ordinality)
      into item_data from jsonb_array_elements(new.form_input_data->'items') with ordinality;
      new.form_input_data := jsonb_set(new.form_input_data,'{items}',item_data);
    end if;
    return new;
  end if;
  -- A caller-supplied snapshot can never choose the examiner or enable routing.
  new.policy_snapshot := coalesce(new.policy_snapshot,'{}') - 'hrd_ga_review';
  for stage in select s.* from public.form_usage_steps s
    where s.usage_id=new.form_usage_id and s.input_schema ? 'hrd_ga_review' order by s.step_order
  loop
    if category is null then category := hrd_ga_review_internal.item_group(new.form_input_data->'items'); end if;
    if raw_config is not null and raw_config is distinct from stage.input_schema->'hrd_ga_review' then
      raise exception 'Konfigurasi kategori HRD & GA tidak konsisten.' using errcode='22023';
    end if;
    raw_config := stage.input_schema->'hrd_ga_review';
    config := raw_config;
    reviewer := hrd_ga_review_internal.resolve_reviewer(stage.id,config,category);
    -- Canonical names are stored for display, never trusted from form input.
    config := jsonb_set(config,'{reviewers,ga}',
      hrd_ga_review_internal.resolve_reviewer(stage.id,config,'ga'));
    config := jsonb_set(config,'{reviewers,hrd}',
      hrd_ga_review_internal.resolve_reviewer(stage.id,config,'hrd'));
    steps := steps || to_jsonb(stage.id);
  end loop;
  if category is not null then
    new.policy_snapshot := new.policy_snapshot || jsonb_build_object('hrd_ga_review',jsonb_build_object(
      'config',config,'group',category,'reviewer',reviewer,'step_ids',steps));
  end if;
  return new;
end $$;

create or replace function hrd_ga_review_internal.stamp_signature()
returns trigger language plpgsql security definer set search_path = '' as $$
declare frozen jsonb; prior_routed boolean;
begin
  select policy_snapshot->'hrd_ga_review' into frozen from public.surat_registrasi where id=new.surat_id;
  if tg_op='UPDATE' then
    prior_routed := frozen->'step_ids' ? old.form_usage_step_id::text;
    if prior_routed and new.form_usage_step_id is distinct from old.form_usage_step_id then
      raise exception 'Tahap pemeriksaan HRD & GA tidak dapat dipindahkan.' using errcode='42501';
    end if;
  end if;
  if frozen->'step_ids' ? new.form_usage_step_id::text then
    new.verifier_snapshot := jsonb_build_array(frozen->'reviewer');
    new.verification_required := true;
    new.action_type := 'approval';
    new.requires_unit_allocation := false;
    new.input_schema_snapshot := jsonb_build_object('fields','[]'::jsonb,'hrd_ga_review',frozen->'config');
    if tg_op='INSERT' then
      new.verification_status := 'pending'; new.verified_by := null; new.verified_at := null; new.verification_note := null;
    elsif new.verification_status='not_required' then new.verification_status := 'pending';
    end if;
  elsif frozen is null and tg_op='UPDATE' and exists (
    select 1 from public.form_usage_steps where id=new.form_usage_step_id and input_schema ? 'hrd_ga_review'
  ) then
    -- Activation changes master config only; old documents keep their frozen team.
    new.verifier_snapshot := old.verifier_snapshot;
    new.verification_required := old.verification_required;
    new.action_type := old.action_type;
    new.input_schema_snapshot := old.input_schema_snapshot;
    new.requires_unit_allocation := old.requires_unit_allocation;
    if not coalesce(old.verification_required,false) then new.verification_status := 'not_required'; end if;
  end if;
  return new;
end $$;

drop trigger if exists zz_hrd_ga_freeze_document on public.surat_registrasi;
create trigger zz_hrd_ga_freeze_document before insert or update on public.surat_registrasi
for each row execute function hrd_ga_review_internal.freeze_document();
drop trigger if exists zz_hrd_ga_stamp_signature on public.surat_signatures;
create trigger zz_hrd_ga_stamp_signature before insert or update on public.surat_signatures
for each row execute function hrd_ga_review_internal.stamp_signature();

-- Operator-only activation, AFTER the new registration UI is live. No document backfill.
create or replace function hrd_ga_review_internal.configure(p_expected_count integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare dept uuid; ga uuid; hrd uuid; count_stages integer; stage record; config jsonb;
begin
  select id into strict dept from public.master_departments where lower(trim(name))='hrd & ga';
  select p.id into strict ga from public.profiles p join public.master_offices o on o.id=p.office_id
    where p.department_id=dept and p.full_name='Usman Huda' and p.is_active and p.deleted_at is null and lower(o.kedudukan)='pusat';
  select p.id into strict hrd from public.profiles p join public.master_offices o on o.id=p.office_id
    where p.department_id=dept and p.full_name='Tri Sulistyanto' and p.is_active and p.deleted_at is null and lower(o.kedudukan)='pusat';
  select count(*) into count_stages from public.form_usage_steps s join public.form_usages u on u.id=s.usage_id
    where u.status='active' and s.signer_department_id=dept and s.role_name='memeriksa'
      and lower(trim(s.label)) in ('mgr. hrd & ga','manager hrd & ga');
  if count_stages<>p_expected_count or count_stages=0 then raise exception 'Cakupan tahap HRD & GA berubah.'; end if;
  config := jsonb_build_object('version',1,'department_id',dept,'reviewers',jsonb_build_object(
    'ga',jsonb_build_object('user_id',ga,'full_name','Usman Huda'),
    'hrd',jsonb_build_object('user_id',hrd,'full_name','Tri Sulistyanto')));
  for stage in select s.* from public.form_usage_steps s join public.form_usages u on u.id=s.usage_id
    where u.status='active' and s.signer_department_id=dept and s.role_name='memeriksa'
      and lower(trim(s.label)) in ('mgr. hrd & ga','manager hrd & ga')
    order by s.id for update of s
  loop
    if stage.action_type not in ('approval','configured_input')
      or (jsonb_array_length(coalesce(stage.input_schema->'fields','[]'))>0
        and stage.input_schema->>'review_mode' is distinct from 'fund_item_checklist')
      or exists(select 1 from public.form_usage_attachment_requirements a
        where a.usage_step_id=stage.id and a.is_required) then
      raise exception 'Tahap HRD & GA memiliki kontrol khusus; audit konfigurasi diperlukan.';
    end if;
    update public.form_usage_steps set action_type='approval',verifier_department_id=dept,
      verifier_scope='head_office',input_schema=jsonb_build_object('fields','[]'::jsonb,'hrd_ga_review',config)
      where id=stage.id;
    delete from public.form_usage_step_verifiers where usage_step_id=stage.id;
    insert into public.form_usage_step_verifiers(usage_step_id,user_id) values(stage.id,ga),(stage.id,hrd);
  end loop;
  return count_stages;
end $$;

revoke all on all functions in schema hrd_ga_review_internal from public, anon, authenticated, service_role;
alter function hrd_ga_review_internal.item_group(jsonb,text) owner to postgres;
alter function hrd_ga_review_internal.resolve_reviewer(uuid,jsonb,text) owner to postgres;
alter function hrd_ga_review_internal.freeze_document() owner to postgres;
alter function hrd_ga_review_internal.stamp_signature() owner to postgres;
alter function hrd_ga_review_internal.configure(integer) owner to postgres;
commit;
