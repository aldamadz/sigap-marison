begin;

alter table public.form_usage_steps
  add column if not exists skip_if_no_candidate boolean not null default false,
  add column if not exists candidate_fallback_mode text;

alter table public.form_usage_steps
  drop constraint if exists form_usage_steps_candidate_fallback_mode_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_candidate_fallback_mode_check
  check (candidate_fallback_mode is null or candidate_fallback_mode = 'request_office_all');

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
    if nullif(v_step->>'candidate_fallback_mode', '') is not null
       and (
         v_step->>'candidate_fallback_mode' <> 'request_office_all'
         or coalesce(v_step->>'candidate_scope', 'manual') <> 'request_office'
         or coalesce(v_step->>'assignee_mode', 'select') <> 'select'
       ) then
      raise exception 'Fallback kandidat hanya valid untuk signer pilihan pada kantor pemohon.' using errcode = '22023';
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
        verifier_scope = coalesce(nullif(v_step->>'verifier_scope', ''), 'request_office'),
        skip_if_no_candidate = coalesce((v_step->>'skip_if_no_candidate')::boolean, false),
        candidate_fallback_mode = nullif(v_step->>'candidate_fallback_mode', '')
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
  v_is_candidate boolean := false;
  v_job_title text;
  v_next_step_order integer;
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

  if v_step.assignee_mode = 'requester' then
    v_is_candidate := new.user_id = v_registration_creator;
  elsif v_step.assignee_mode = 'select' then
    select exists (
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
    ) into v_is_candidate;

    if not v_is_candidate and v_step.candidate_fallback_mode = 'request_office_all'
       and v_registration_office_kedudukan <> 'pusat' then
      select exists (
        select 1
        from public.profiles profile
        where profile.id = new.user_id
          and profile.office_id = v_registration_office_id
          and profile.is_active is true
          and profile.deleted_at is null
          and not exists (
            select 1
            from public.form_usage_step_users candidate
            join public.profiles configured on configured.id = candidate.user_id
            where candidate.usage_step_id = v_step.id
              and configured.office_id = v_registration_office_id
              and configured.is_active is true
              and configured.deleted_at is null
          )
      ) into v_is_candidate;
    end if;
  end if;

  if not v_is_candidate then
    raise exception 'User bukan kandidat signer pada tahap ini.';
  end if;

  select profile.job_title
  into v_job_title
  from public.profiles profile
  where profile.id = new.user_id;

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

  if tg_op = 'INSERT' then
    select coalesce(max(signature.step_order), 0) + 1
    into v_next_step_order
    from public.surat_signatures signature
    where signature.surat_id = new.surat_id;
    new.step_order := v_next_step_order;
  else
    new.step_order := old.step_order;
  end if;
  new.role_name := v_step.role_name;
  new.label_jabatan := case
    when v_step.candidate_fallback_mode = 'request_office_all' then coalesce(v_job_title, v_step.label)
    else v_step.label
  end;
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

revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;

commit;
