create or replace function public.get_department_kpi_details(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_dept_id uuid default null,
  p_letter_type_id uuid default null,
  p_form_id uuid default null,
  p_status text default null
)
returns table (
  signature_id uuid,
  surat_id uuid,
  no_surat text,
  judul_surat text,
  signer_name text,
  role_name text,
  step_order integer,
  dept_id uuid,
  dept_name text,
  letter_type_name text,
  form_name text,
  started_at timestamptz,
  finished_at timestamptz,
  kpi_status text,
  elapsed_minutes integer,
  sla_minutes integer,
  is_late boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select id, role
    from public.profiles
    where id = auth.uid()
  ),
  signature_scope as (
    select
      ss.id as signature_id,
      ss.surat_id,
      ss.user_id,
      ss.status,
      ss.is_signed,
      ss.signed_at,
      ss.step_order,
      ss.role_name,
      coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) as started_at,
      sr.no_surat,
      sr.judul_surat,
      sr.letter_type_id,
      mlt.name as letter_type_name,
      mf.id as form_id,
      mf.nama_form as form_name,
      coalesce(
        nullif(ss.signer_snapshot->>'full_name', ''),
        signer_profile.full_name,
        'Pengguna'
      ) as signer_name,
      coalesce(
        case
          when (ss.signer_snapshot->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (ss.signer_snapshot->>'department_id')::uuid
          else null
        end,
        signer_profile.department_id
      ) as responsible_dept_id
    from public.surat_signatures ss
    join public.surat_registrasi sr on sr.id = ss.surat_id
    left join lateral (
      select max(signed_at) as signed_at
      from public.surat_signatures previous
      where previous.surat_id = ss.surat_id
        and previous.step_order = ss.step_order - 1
        and previous.is_signed = true
    ) prev_sig on true
    left join public.profiles signer_profile on signer_profile.id = ss.user_id
    left join public.master_letter_types mlt on mlt.id = sr.letter_type_id
    left join public.master_penggunaan_detail mpd on mpd.id = sr.penggunaan_id
    left join public.master_forms mf on mf.id = mpd.form_id
    where (p_from is null or coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) >= p_from)
      and (p_to is null or coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) < p_to)
      and (p_letter_type_id is null or sr.letter_type_id = p_letter_type_id)
      and (p_form_id is null or mf.id = p_form_id)
  ),
  authorized_scope as (
    select s.*
    from signature_scope s
    cross join current_profile cp
    where cp.role = 'admin'
       or s.user_id = cp.id
  ),
  measured as (
    select
      s.*,
      d.name as dept_name,
      coalesce(k.sla_minutes, 120) as sla_minutes,
      public.calculate_business_minutes(
        s.started_at,
        coalesce(s.signed_at, now()),
        coalesce(k.work_days, array[1,2,3,4,5]),
        coalesce(k.work_start, time '08:00'),
        coalesce(k.work_end, time '17:00'),
        coalesce(k.break_start, time '12:00'),
        coalesce(k.break_end, time '13:00'),
        coalesce(k.timezone, 'Asia/Jakarta')
      ) as elapsed_minutes,
      case
        when s.is_signed = true and coalesce(s.status, '') = 'REJECTED' then 'rejected'
        when s.is_signed = true then 'completed'
        else 'pending'
      end as measured_status
    from authorized_scope s
    left join public.master_departments d on d.id = s.responsible_dept_id
    left join public.department_kpi_configs k
      on k.dept_id = s.responsible_dept_id
     and k.is_active = true
    where s.responsible_dept_id is not null
      and (p_dept_id is null or s.responsible_dept_id = p_dept_id)
  )
  select
    m.signature_id,
    m.surat_id,
    m.no_surat,
    m.judul_surat,
    m.signer_name,
    m.role_name,
    m.step_order,
    m.responsible_dept_id as dept_id,
    m.dept_name,
    m.letter_type_name,
    m.form_name,
    m.started_at,
    m.signed_at as finished_at,
    m.measured_status as kpi_status,
    m.elapsed_minutes,
    m.sla_minutes,
    (m.elapsed_minutes > m.sla_minutes) as is_late
  from measured m
  where p_status is null
     or p_status = 'all'
     or (p_status = 'pending' and m.measured_status = 'pending')
     or (p_status = 'completed' and m.measured_status = 'completed')
     or (p_status = 'rejected' and m.measured_status = 'rejected')
     or (p_status = 'late' and m.elapsed_minutes > m.sla_minutes)
     or (p_status = 'on_time' and m.elapsed_minutes <= m.sla_minutes)
  order by m.elapsed_minutes desc, m.started_at desc;
$$;

revoke all on function public.get_department_kpi_details(timestamptz, timestamptz, uuid, uuid, uuid, text) from public;
grant execute on function public.get_department_kpi_details(timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;
