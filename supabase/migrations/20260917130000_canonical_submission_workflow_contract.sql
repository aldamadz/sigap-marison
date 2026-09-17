begin;

alter table public.form_usage_steps
  add column if not exists assignee_mode text not null default 'select',
  add column if not exists input_schema jsonb not null default '{}'::jsonb,
  add column if not exists verifier_department_id uuid references public.master_departments(id),
  add column if not exists verifier_scope text not null default 'request_office';

alter table public.surat_signatures
  add column if not exists input_schema_snapshot jsonb not null default '{}'::jsonb;

alter table public.form_usages
  add column if not exists is_system_template boolean not null default false;

create or replace function public.can_read_form_usage(p_usage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_current_user_admin()
    or exists (
      select 1
      from public.form_usages usage
      join public.form_usage_departments permission on permission.usage_id = usage.id
      join public.profiles profile on profile.id = auth.uid()
      where usage.id = p_usage_id
        and usage.status = 'active'
        and permission.department_id = profile.department_id
        and profile.is_active is true and profile.deleted_at is null
    )
    or exists (
      select 1
      from public.surat_registrasi registration
      join public.profiles profile on profile.id = auth.uid()
      where registration.form_usage_id = p_usage_id
        and profile.is_active is true and profile.deleted_at is null
        and public.can_read_surat(registration.id)
    );
$$;

revoke all on function public.can_read_form_usage(uuid) from public, anon;
grant execute on function public.can_read_form_usage(uuid) to authenticated, service_role;

alter table public.form_usage_steps drop constraint if exists form_usage_steps_action_type_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_action_type_check
  check (action_type in ('approval', 'unit_allocation', 'configured_input'));

alter table public.approval_route_steps drop constraint if exists approval_route_steps_action_type_check;
alter table public.approval_route_steps
  add constraint approval_route_steps_action_type_check
  check (action_type in ('approval', 'unit_allocation', 'configured_input'));

alter table public.surat_signatures drop constraint if exists surat_signatures_action_type_check;
alter table public.surat_signatures
  add constraint surat_signatures_action_type_check
  check (action_type in ('approval', 'unit_allocation', 'configured_input'));

alter table public.form_usage_steps drop constraint if exists form_usage_steps_assignee_mode_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_assignee_mode_check
  check (assignee_mode in ('select', 'requester'));

alter table public.form_usage_steps drop constraint if exists form_usage_steps_verifier_scope_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_verifier_scope_check
  check (verifier_scope in ('request_office', 'head_office', 'all_offices'));

create or replace function public.is_valid_checker_input_schema(p_schema jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_field jsonb;
  v_keys text[] := array[]::text[];
  v_key text;
begin
  if jsonb_typeof(coalesce(p_schema, '{}'::jsonb)) <> 'object' then
    return false;
  end if;
  if not (p_schema ? 'fields') then
    return true;
  end if;
  if jsonb_typeof(p_schema->'fields') <> 'array' then
    return false;
  end if;
  for v_field in select value from jsonb_array_elements(p_schema->'fields')
  loop
    if jsonb_typeof(v_field) <> 'object' then return false; end if;
    v_key := trim(coalesce(v_field->>'key', ''));
    if v_key !~ '^[a-z][a-z0-9_]{0,62}$'
       or trim(coalesce(v_field->>'label', '')) = ''
       or coalesce(v_field->>'type', '') not in ('text', 'textarea', 'money', 'number')
       or (v_field ? 'required' and jsonb_typeof(v_field->'required') <> 'boolean')
       or (v_field ? 'min' and jsonb_typeof(v_field->'min') <> 'number')
       or v_key = any(v_keys) then
      return false;
    end if;
    v_keys := array_append(v_keys, v_key);
  end loop;
  return true;
end;
$$;

alter table public.form_usage_steps drop constraint if exists form_usage_steps_input_schema_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_input_schema_check
  check (
    public.is_valid_checker_input_schema(input_schema)
  );

create or replace function public.require_configured_checker_input_schema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step public.form_usage_steps%rowtype;
begin
  select * into v_step from public.form_usage_steps where id = new.id;
  if found and v_step.action_type = 'configured_input'
     and (
       not public.is_valid_checker_input_schema(v_step.input_schema)
       or jsonb_array_length(coalesce(v_step.input_schema->'fields', '[]'::jsonb)) = 0
     ) then
    raise exception 'Schema input pemeriksa tidak valid.' using errcode = '22023';
  end if;
  return null;
end;
$$;

drop trigger if exists require_configured_checker_input_schema_on_write on public.form_usage_steps;
create constraint trigger require_configured_checker_input_schema_on_write
after insert or update of action_type, input_schema on public.form_usage_steps
deferrable initially deferred
for each row execute function public.require_configured_checker_input_schema();

create or replace function public.save_form_usage_config(
  p_usage_id uuid,
  p_payload jsonb,
  p_department_ids uuid[],
  p_steps jsonb,
  p_attachments jsonb,
  p_verifiers jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
  v_policy jsonb := coalesce(
    p_payload->'external_revision_policy',
    '{"recipient_type":"requester","recipient_step_order":null,"approval_restart_step":1}'::jsonb
  );
  v_recipient_step integer;
  v_restart_step integer;
  v_step jsonb;
begin
  if not public.is_valid_external_revision_policy(v_policy) then
    raise exception 'Konfigurasi keputusan sistem departemen tidak valid.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) attachment
    group by
      coalesce(nullif(attachment->>'stage_order', '')::integer, 0),
      lower(trim(coalesce(attachment->>'requirement_key', '')))
    having count(*) > 1
  ) then
    raise exception 'Kunci lampiran tidak boleh duplikat pada tahap yang sama.' using errcode = '22023';
  end if;

  for v_step in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    if coalesce(v_step->>'assignee_mode', 'select') not in ('select', 'requester') then
      raise exception 'Mode penetapan signer tidak valid.' using errcode = '22023';
    end if;
    if coalesce(v_step->>'verifier_scope', 'request_office') not in ('request_office', 'head_office', 'all_offices') then
      raise exception 'Cakupan operator pemeriksa tidak valid.' using errcode = '22023';
    end if;
    if coalesce(v_step->>'action_type', 'approval') = 'configured_input'
       and (
         not public.is_valid_checker_input_schema(coalesce(v_step->'input_schema', '{}'::jsonb))
         or jsonb_array_length(coalesce(v_step->'input_schema'->'fields', '[]'::jsonb)) = 0
       ) then
      raise exception 'Schema input pemeriksa tidak valid.' using errcode = '22023';
    end if;
  end loop;

  v_recipient_step := nullif(v_policy->>'recipient_step_order', '')::integer;
  v_restart_step := (v_policy->>'approval_restart_step')::integer;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) step
    where (step->>'step_order')::integer = v_restart_step
  ) then
    raise exception 'Tahap awal tanda tangan ulang tidak tersedia pada kegunaan ini.' using errcode = '22023';
  end if;
  if v_policy->>'recipient_type' = 'signer' and not exists (
    select 1 from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb)) step
    where (step->>'step_order')::integer = v_recipient_step
  ) then
    raise exception 'Signer penerima perbaikan tidak tersedia pada kegunaan ini.' using errcode = '22023';
  end if;

  v_usage_id := public.save_form_usage_config_pre_external_revision_policy(
    p_usage_id, p_payload, p_department_ids, p_steps, p_attachments, p_verifiers
  );

  for v_step in select value from jsonb_array_elements(coalesce(p_steps, '[]'::jsonb))
  loop
    update public.form_usage_steps
    set assignee_mode = coalesce(nullif(v_step->>'assignee_mode', ''), 'select'),
        input_schema = coalesce(v_step->'input_schema', '{}'::jsonb),
        verifier_department_id = nullif(v_step->>'verifier_department_id', '')::uuid,
        verifier_scope = coalesce(nullif(v_step->>'verifier_scope', ''), 'request_office')
    where usage_id = v_usage_id
      and step_order = (v_step->>'step_order')::integer;
  end loop;

  update public.form_usages
  set external_revision_policy = v_policy,
      updated_at = clock_timestamp()
  where id = v_usage_id;
  return v_usage_id;
end;
$$;

create or replace function public.validate_form_usage_signature()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_usage_scope text := 'all';
  v_registration_office_id uuid;
  v_registration_office_kedudukan text;
  v_registration_dept_id uuid;
  v_registration_creator uuid;
  v_step public.form_usage_steps;
  v_verifiers jsonb := '[]'::jsonb;
begin
  select
    registration.form_usage_id,
    registration.office_id,
    lower(coalesce(registration_office.kedudukan, '')),
    coalesce(registration.represented_department_id, registration.dept_id),
    registration.created_by,
    coalesce(usage.scope_type, 'all')
  into v_usage_id, v_registration_office_id, v_registration_office_kedudukan,
       v_registration_dept_id, v_registration_creator, v_usage_scope
  from public.surat_registrasi as registration
  left join public.form_usages usage on usage.id = registration.form_usage_id
  left join public.master_offices registration_office on registration_office.id = registration.office_id
  where registration.id = new.surat_id;

  if v_usage_id is null then return new; end if;
  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select * into v_step
  from public.form_usage_steps
  where id = new.form_usage_step_id and usage_id = v_usage_id;
  if not found then raise exception 'Tahap signer tidak sesuai kegunaan form.'; end if;

  if not (
    (v_step.assignee_mode = 'requester' and new.user_id = v_registration_creator)
    or (
      v_step.assignee_mode = 'select'
      and exists (
        select 1
        from public.form_usage_step_users as candidate
        join public.profiles profile on profile.id = candidate.user_id
        left join public.master_offices office on office.id = profile.office_id
        where candidate.usage_step_id = v_step.id
          and candidate.user_id = new.user_id
          and profile.is_active is true
          and profile.deleted_at is null
          and (
            coalesce(v_step.candidate_scope, 'manual') in ('manual', 'all_offices')
            or (v_step.candidate_scope = 'request_office' and profile.office_id = v_registration_office_id)
            or (v_step.candidate_scope = 'request_department' and profile.department_id = v_registration_dept_id)
            or (
              v_step.candidate_scope = 'branch_office_or_request_department'
              and (
                (v_registration_office_kedudukan = 'pusat' and profile.department_id = v_registration_dept_id and lower(coalesce(office.kedudukan, '')) = 'pusat')
                or (v_registration_office_kedudukan <> 'pusat' and profile.office_id = v_registration_office_id)
              )
            )
            or (v_step.candidate_scope = 'head_office' and lower(coalesce(office.kedudukan, '')) = 'pusat')
          )
      )
    )
  ) then
    raise exception 'User bukan kandidat signer pada tahap ini.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', verifier.user_id,
    'full_name', profile.full_name,
    'job_title', profile.job_title,
    'office_id', profile.office_id
  ) order by profile.full_name), '[]'::jsonb)
  into v_verifiers
  from public.form_usage_step_verifiers verifier
  join public.profiles profile on profile.id = verifier.user_id
  left join public.master_offices verifier_office on verifier_office.id = profile.office_id
  where verifier.usage_step_id = v_step.id
    and profile.is_active is true
    and profile.deleted_at is null
    and (v_step.verifier_department_id is null or profile.department_id = v_step.verifier_department_id)
    and (
      v_usage_scope <> 'cabang'
      or v_step.verifier_scope = 'all_offices'
      or (v_step.verifier_scope = 'head_office' and lower(coalesce(verifier_office.kedudukan, '')) = 'pusat')
      or (v_step.verifier_scope = 'request_office' and profile.office_id = v_registration_office_id)
    );

  if v_step.action_type in ('unit_allocation', 'configured_input') and jsonb_array_length(v_verifiers) = 0 then
    raise exception 'Tahap input pemeriksa belum memiliki operator aktif.';
  end if;

  new.step_order := v_step.step_order;
  new.role_name := v_step.role_name;
  new.label_jabatan := v_step.label;
  new.action_type := v_step.action_type;
  new.input_schema_snapshot := v_step.input_schema;
  new.requires_unit_allocation := v_step.action_type = 'unit_allocation';
  new.verifier_snapshot := v_verifiers;
  new.verification_required := jsonb_array_length(v_verifiers) > 0;
  if new.verification_required then
    new.verification_status := coalesce(nullif(new.verification_status, 'not_required'), 'pending');
    if new.verification_status = 'not_required' then new.verification_status := 'pending'; end if;
  else
    new.verification_status := 'not_required';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
  end if;
  return new;
end;
$$;

revoke all on function public.is_valid_checker_input_schema(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_checker_input_schema(jsonb) to service_role;
revoke all on function public.require_configured_checker_input_schema() from public, anon, authenticated;
grant execute on function public.require_configured_checker_input_schema() to service_role;
revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;

commit;
