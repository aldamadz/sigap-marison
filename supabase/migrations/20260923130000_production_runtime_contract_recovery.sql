-- Production recovery for source contracts that were promoted without their
-- historical migrations. This is deliberately additive: it does not seed,
-- archive, or otherwise alter configured form usages.
begin;

alter table public.form_usages
  add column if not exists external_revision_policy jsonb not null default '{
    "recipient_type": "requester",
    "recipient_step_order": null,
    "approval_restart_step": 1
  }'::jsonb,
  add column if not exists is_system_template boolean not null default false;

alter table public.form_usage_steps
  add column if not exists assignee_mode text not null default 'select',
  add column if not exists input_schema jsonb not null default '{}'::jsonb,
  add column if not exists verifier_department_id uuid references public.master_departments(id),
  add column if not exists verifier_scope text not null default 'request_office',
  add column if not exists skip_if_no_candidate boolean not null default false,
  add column if not exists candidate_fallback_mode text;

alter table public.surat_signatures
  add column if not exists input_schema_snapshot jsonb not null default '{}'::jsonb;

alter table public.form_usage_steps drop constraint if exists form_usage_steps_action_type_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_action_type_check
  check (action_type in ('approval', 'unit_allocation', 'configured_input'));

alter table public.form_usage_steps drop constraint if exists form_usage_steps_assignee_mode_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_assignee_mode_check
  check (assignee_mode in ('select', 'requester'));

alter table public.form_usage_steps drop constraint if exists form_usage_steps_verifier_scope_check;
alter table public.form_usage_steps
  add constraint form_usage_steps_verifier_scope_check
  check (verifier_scope in ('request_office', 'head_office', 'all_offices'));

create or replace function public.is_valid_external_revision_policy(p_policy jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_policy) = 'object'
    and coalesce(p_policy->>'recipient_type', '') in ('requester', 'signer')
    and (
      (p_policy->>'recipient_type' = 'requester' and nullif(p_policy->>'recipient_step_order', '') is null)
      or (p_policy->>'recipient_type' = 'signer'
        and coalesce(p_policy->>'recipient_step_order', '') ~ '^[1-8]$')
    )
    and coalesce(p_policy->>'approval_restart_step', '') ~ '^[1-8]$';
$$;

alter table public.form_usages drop constraint if exists form_usages_external_revision_policy_check;
alter table public.form_usages
  add constraint form_usages_external_revision_policy_check
  check (public.is_valid_external_revision_policy(external_revision_policy));

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
  if jsonb_typeof(coalesce(p_schema, '{}'::jsonb)) <> 'object' then return false; end if;
  if not (p_schema ? 'fields') then return true; end if;
  if jsonb_typeof(p_schema->'fields') <> 'array' then return false; end if;
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
  check (public.is_valid_checker_input_schema(input_schema));

-- Preserve the existing writer as the compatibility layer, then add the
-- fields that the current configuration screen reads and writes.
do $$
begin
  if to_regprocedure('public.save_form_usage_config_pre_external_revision_policy(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)') is null then
    if to_regprocedure('public.save_form_usage_config(uuid,jsonb,uuid[],jsonb,jsonb,jsonb)') is null then
      raise exception 'Kontrak save_form_usage_config tidak ditemukan.';
    end if;
    execute 'alter function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) rename to save_form_usage_config_pre_external_revision_policy';
  end if;
end;
$$;

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
        verifier_scope = coalesce(nullif(v_step->>'verifier_scope', ''), 'request_office'),
        skip_if_no_candidate = coalesce((v_step->>'skip_if_no_candidate')::boolean, false),
        candidate_fallback_mode = nullif(v_step->>'candidate_fallback_mode', '')
    where usage_id = v_usage_id and step_order = (v_step->>'step_order')::integer;
  end loop;

  update public.form_usages
  set external_revision_policy = v_policy,
      is_system_template = coalesce((p_payload->>'is_system_template')::boolean, is_system_template),
      updated_at = clock_timestamp()
  where id = v_usage_id;
  return v_usage_id;
end;
$$;

create or replace function public.can_monitor_surat_scope(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.surat_registrasi surat
    join public.master_offices surat_office on surat_office.id = surat.office_id
    join public.profiles actor_profile on actor_profile.id = auth.uid()
    join public.master_offices actor_office on actor_office.id = actor_profile.office_id
    where surat.id = p_surat_id
      and coalesce(actor_profile.is_active, true) = true
      and actor_profile.deleted_at is null
      and (
        lower(coalesce(actor_profile.role::text, '')) in ('admin', 'super_admin')
        or public.can_read_surat(surat.id)
        or (actor_office.kedudukan = 'Pusat' and surat_office.kedudukan = 'Pusat'
          and actor_profile.department_id is not null
          and coalesce(surat.represented_department_id, surat.dept_id) = actor_profile.department_id)
        or (actor_office.kedudukan <> 'Pusat' and surat_office.kedudukan <> 'Pusat'
          and surat.office_id = actor_profile.office_id)
      )
  );
$$;

create or replace function public.get_surat_monitoring_page(
  p_limit integer default 24,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select surat.*
    from public.surat_registrasi surat
    where public.can_monitor_surat_scope(surat.id)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
        or surat.judul_surat ilike '%' || btrim(p_search) || '%'
        or surat.no_surat ilike '%' || btrim(p_search) || '%')
      and (nullif(btrim(coalesce(p_status, '')), '') is null or lower(p_status) = 'all'
        or (upper(p_status) = 'SELESAI' and surat.status in ('SELESAI', 'DONE'))
        or (upper(p_status) in ('DITOLAK', 'REJECTED') and surat.status in ('DITOLAK', 'REJECTED'))
        or (upper(p_status) = 'PROSES' and surat.status in ('PROSES', 'PENDING', 'IN_PROGRESS'))
        or surat.status = p_status)
      and (p_date_from is null or surat.created_at >= p_date_from)
      and (p_date_to is null or surat.created_at < p_date_to)
  ), page as (
    select surat.* from filtered surat
    order by surat.created_at desc, surat.id desc
    limit least(greatest(coalesce(p_limit, 24), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', surat.id, 'no_surat', surat.no_surat, 'judul_surat', surat.judul_surat,
        'status', surat.status, 'current_step', surat.current_step, 'created_at', surat.created_at,
        'updated_at', surat.updated_at, 'created_by', surat.created_by,
        'can_read_document', public.can_read_surat(surat.id),
        'file_path', case when public.can_read_surat(surat.id) then surat.file_path else null end,
        'lampiran_path', case when public.can_read_surat(surat.id) then surat.lampiran_path else null end,
        'surat_signatures', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', signature.id, 'step_order', signature.step_order, 'is_signed', signature.is_signed,
            'status', signature.status, 'role_name', signature.role_name,
            'label_jabatan', signature.label_jabatan, 'signed_at', signature.signed_at,
            'catatan', signature.catatan,
            'profiles', jsonb_build_object('full_name', signer.full_name, 'job_title', signer.job_title)
          ) order by signature.step_order, signature.id)
          from public.surat_signatures signature
          left join public.profiles signer on signer.id = signature.user_id
          where signature.surat_id = surat.id
        ), '[]'::jsonb)
      ) order by surat.created_at desc, surat.id desc) from page surat
    ), '[]'::jsonb),
    'count', (select count(*) from filtered)
  );
$$;

create or replace function public.get_surat_monitoring_detail(p_surat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.can_read_surat(surat.id) then to_jsonb(surat)
    else jsonb_build_object('id', surat.id, 'no_surat', surat.no_surat, 'judul_surat', surat.judul_surat,
      'status', surat.status, 'current_step', surat.current_step, 'created_at', surat.created_at,
      'updated_at', surat.updated_at, 'created_by', surat.created_by) end
    || jsonb_build_object(
      'can_read_document', public.can_read_surat(surat.id),
      'surat_signatures', coalesce((
        select jsonb_agg(to_jsonb(signature) || jsonb_build_object('profiles', jsonb_build_object(
          'id', signer.id, 'full_name', signer.full_name, 'job_title', signer.job_title, 'avatar_url', signer.avatar_url
        )) order by signature.step_order, signature.id)
        from public.surat_signatures signature left join public.profiles signer on signer.id = signature.user_id
        where signature.surat_id = surat.id
      ), '[]'::jsonb),
      'surat_attachments', case when public.can_read_surat(surat.id) then coalesce((
        select jsonb_agg(to_jsonb(attachment) order by attachment.created_at, attachment.id)
        from public.surat_attachments attachment where attachment.surat_id = surat.id
      ), '[]'::jsonb) else '[]'::jsonb end
    )
  from public.surat_registrasi surat
  where surat.id = p_surat_id and public.can_monitor_surat_scope(surat.id);
$$;

create or replace function public.get_compact_inbox_count(
  p_user_id uuid,
  p_search text default null,
  p_request_category text default null,
  p_task_type text default null
)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  with revision_tasks as (
    select surat_id, target_type, target_step from surat_revision_events
    where status in ('open', 'awaiting_requester') and p_user_id = any(target_user_ids)
      and target_type is distinct from 'requester'
  ), signer_rows as (
    select ss.id, sr.judul_surat, sr.no_surat, (sr.requester_snapshot->>'full_name') as requester_name,
      (sr.location_snapshot->'department'->>'name') as requester_department,
      coalesce(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') as request_category
    from surat_signatures ss join surat_registrasi sr on sr.id = ss.surat_id
    where ss.user_id = p_user_id and not coalesce(ss.is_signed, false)
      and (p_task_type is null or p_task_type = 'approval')
      and ((sr.status = 'PROSES' and ss.step_order = sr.current_step)
        or (sr.status = 'MENUNGGU_PERBAIKAN' and exists (
          select 1 from revision_tasks rt where rt.surat_id = sr.id and rt.target_type = 'signer' and rt.target_step = ss.step_order
        )))
  ), verifier_rows as (
    select ss.id, sr.judul_surat, sr.no_surat, (sr.requester_snapshot->>'full_name') as requester_name,
      (sr.location_snapshot->'department'->>'name') as requester_department,
      coalesce(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') as request_category
    from surat_signatures ss join surat_registrasi sr on sr.id = ss.surat_id
    where not coalesce(ss.is_signed, false) and ss.verification_required = true
      and ss.verification_status = 'pending'
      and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      and (p_task_type is null or p_task_type = 'verification')
      and ((sr.status = 'PROSES' and ss.step_order = sr.current_step)
        or (sr.status = 'MENUNGGU_PERBAIKAN' and exists (
          select 1 from revision_tasks rt where rt.surat_id = sr.id and rt.target_type = 'checker' and rt.target_step = ss.step_order
        )))
  ), combined as (
    select * from signer_rows union all select * from verifier_rows
  )
  select count(*)::integer from combined
  where (p_request_category is null or p_request_category = '' or request_category = p_request_category)
    and (p_search is null or p_search = '' or (judul_surat ilike '%' || p_search || '%'
      or no_surat ilike '%' || p_search || '%' or requester_name ilike '%' || p_search || '%'
      or requester_department ilike '%' || p_search || '%'));
$$;

create or replace function public.get_user_active_sla_breach_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with active_signatures as (
    select coalesce(greatest(signature.available_at,
        nullif(surat.data_snapshot->'applied_revision'->>'accepted_at', '')::timestamptz),
        signature.available_at, previous_signature.signed_at, surat.created_at) as started_at,
      coalesce(case when (signature.signer_snapshot->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (signature.signer_snapshot->>'department_id')::uuid else null end,
        signer_profile.department_id) as responsible_dept_id
    from public.surat_signatures signature
    join public.surat_registrasi surat on surat.id = signature.surat_id
    left join lateral (
      select max(previous.signed_at) as signed_at from public.surat_signatures previous
      where previous.surat_id = signature.surat_id and previous.step_order = signature.step_order - 1 and previous.is_signed = true
    ) previous_signature on true
    left join public.profiles signer_profile on signer_profile.id = signature.user_id
    where p_user_id is not null and signature.user_id = p_user_id and signature.is_signed = false
      and coalesce(signature.status, 'PENDING') <> 'REJECTED' and surat.status = 'PROSES'
      and signature.step_order = surat.current_step
  )
  select count(*)::bigint from active_signatures active
  left join public.department_kpi_configs config on config.dept_id = active.responsible_dept_id and config.is_active = true
  where active.started_at is not null and active.responsible_dept_id is not null
    and public.calculate_business_minutes(active.started_at, now(), coalesce(config.work_days, array[1,2,3,4,5]),
      coalesce(config.work_start, time '08:00'), coalesce(config.work_end, time '17:00'),
      coalesce(config.break_start, time '12:00'), coalesce(config.break_end, time '13:00'),
      coalesce(config.timezone, 'Asia/Jakarta')) > coalesce(config.sla_minutes, 120);
$$;

revoke all on function public.is_valid_external_revision_policy(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_external_revision_policy(jsonb) to service_role;
revoke all on function public.is_valid_checker_input_schema(jsonb) from public, anon, authenticated;
grant execute on function public.is_valid_checker_input_schema(jsonb) to service_role;
revoke all on function public.save_form_usage_config_pre_external_revision_policy(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_form_usage_config(uuid, jsonb, uuid[], jsonb, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.can_monitor_surat_scope(uuid) from public, anon;
grant execute on function public.can_monitor_surat_scope(uuid) to authenticated, service_role;
revoke all on function public.get_surat_monitoring_page(integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_surat_monitoring_page(integer, integer, text, text, timestamptz, timestamptz) to authenticated;
revoke all on function public.get_surat_monitoring_detail(uuid) from public, anon;
grant execute on function public.get_surat_monitoring_detail(uuid) to authenticated;
revoke all on function public.get_compact_inbox_count(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.get_compact_inbox_count(uuid, text, text, text) to service_role;
revoke all on function public.get_user_active_sla_breach_count(uuid) from public, anon, authenticated;
grant execute on function public.get_user_active_sla_breach_count(uuid) to service_role;

commit;
