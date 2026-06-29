alter table public.form_usage_steps
  drop constraint if exists form_usage_steps_candidate_scope_check;

alter table public.form_usage_steps
  add constraint form_usage_steps_candidate_scope_check
  check (candidate_scope in ('manual', 'request_office', 'request_department', 'head_office', 'all_offices'));

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
  v_registration_dept_id uuid;
  v_step public.form_usage_steps;
  v_verifiers jsonb := '[]'::jsonb;
begin
  select
    registration.form_usage_id,
    registration.office_id,
    coalesce(registration.represented_department_id, registration.dept_id),
    coalesce(usage.scope_type, 'all')
  into v_usage_id, v_registration_office_id, v_registration_dept_id, v_usage_scope
  from public.surat_registrasi as registration
  left join public.form_usages usage on usage.id = registration.form_usage_id
  where registration.id = new.surat_id;

  if v_usage_id is null then
    return new;
  end if;

  if new.form_usage_step_id is null then
    raise exception 'Tahap kegunaan form wajib disimpan pada signer.';
  end if;

  select *
  into v_step
  from public.form_usage_steps
  where id = new.form_usage_step_id
    and usage_id = v_usage_id;

  if not found then
    raise exception 'Tahap signer tidak sesuai kegunaan form.';
  end if;

  if not exists (
    select 1
    from public.form_usage_step_users as candidate
    join public.profiles profile on profile.id = candidate.user_id
    left join public.master_offices office on office.id = profile.office_id
    where candidate.usage_step_id = v_step.id
      and candidate.user_id = new.user_id
      and (
        coalesce(v_step.candidate_scope, 'manual') in ('manual', 'all_offices')
        or (v_step.candidate_scope = 'request_office' and profile.office_id = v_registration_office_id)
        or (v_step.candidate_scope = 'request_department' and profile.department_id = v_registration_dept_id)
        or (v_step.candidate_scope = 'head_office' and lower(coalesce(office.kedudukan, '')) = 'pusat')
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
  left join public.profiles profile on profile.id = verifier.user_id
  where verifier.usage_step_id = v_step.id
    and (
      v_usage_scope <> 'cabang'
      or profile.office_id = v_registration_office_id
    );

  new.step_order := v_step.step_order;
  new.role_name := v_step.role_name;
  new.label_jabatan := v_step.label;
  new.action_type := v_step.action_type;
  new.requires_unit_allocation := v_step.action_type = 'unit_allocation';
  new.verifier_snapshot := v_verifiers;
  new.verification_required := jsonb_array_length(v_verifiers) > 0;
  if new.verification_required then
    new.verification_status := coalesce(nullif(new.verification_status, 'not_required'), 'pending');
    if new.verification_status = 'not_required' then
      new.verification_status := 'pending';
    end if;
  else
    new.verification_status := 'not_required';
    new.verified_at := null;
    new.verified_by := null;
    new.verification_note := null;
  end if;

  return new;
end;
$$;

update public.form_usage_steps step
set candidate_scope = 'request_department',
    signer_department_id = null
from public.form_usages usage
where usage.id = step.usage_id
  and usage.name in (
    'Permohonan Aset (Pusat)',
    'Permohonan Non Aset (Pusat)',
    'Entertain Pusat ( perintis, dinas, perbankan, relasi, pemangku wilayah, dll.)'
  )
  and step.label in ('Pimpinan Departemen', 'Mgr. Departemen Terkait');

revoke all on function public.validate_form_usage_signature() from public, anon, authenticated;
grant execute on function public.validate_form_usage_signature() to service_role;
