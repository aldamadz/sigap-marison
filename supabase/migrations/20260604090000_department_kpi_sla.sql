alter table public.surat_signatures
  add column if not exists available_at timestamptz;

update public.surat_signatures ss
set available_at = coalesce(ss.available_at, sr.created_at)
from public.surat_registrasi sr
where ss.surat_id = sr.id
  and ss.step_order = 1
  and ss.available_at is null;

create table if not exists public.department_kpi_configs (
  dept_id uuid primary key references public.master_departments(id) on delete cascade,
  sla_minutes integer not null default 120 check (sla_minutes > 0),
  work_days integer[] not null default array[1,2,3,4,5],
  work_start time not null default time '08:00',
  work_end time not null default time '17:00',
  break_start time not null default time '12:00',
  break_end time not null default time '13:00',
  timezone text not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint department_kpi_configs_work_time_chk check (work_start < work_end),
  constraint department_kpi_configs_break_time_chk check (break_start < break_end)
);

alter table public.department_kpi_configs enable row level security;

drop policy if exists "department_kpi_configs_select_authenticated" on public.department_kpi_configs;
create policy "department_kpi_configs_select_authenticated"
on public.department_kpi_configs for select
to authenticated
using (true);

drop policy if exists "department_kpi_configs_admin_write" on public.department_kpi_configs;
create policy "department_kpi_configs_admin_write"
on public.department_kpi_configs for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create or replace function public.calculate_business_minutes(
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_work_days integer[] default array[1,2,3,4,5],
  p_work_start time default time '08:00',
  p_work_end time default time '17:00',
  p_break_start time default time '12:00',
  p_break_end time default time '13:00',
  p_timezone text default 'Asia/Jakarta'
)
returns integer
language plpgsql
stable
as $$
declare
  v_started timestamp := least(p_started_at, p_finished_at) at time zone p_timezone;
  v_finished timestamp := greatest(p_started_at, p_finished_at) at time zone p_timezone;
  v_day date;
  v_day_start timestamp;
  v_day_end timestamp;
  v_break_start timestamp;
  v_break_end timestamp;
  v_segment_start timestamp;
  v_segment_end timestamp;
  v_minutes numeric := 0;
begin
  if p_started_at is null or p_finished_at is null then
    return 0;
  end if;

  v_day := v_started::date;
  while v_day <= v_finished::date loop
    if extract(isodow from v_day)::integer = any(p_work_days) then
      v_day_start := v_day + p_work_start;
      v_day_end := v_day + p_work_end;
      v_break_start := v_day + p_break_start;
      v_break_end := v_day + p_break_end;

      v_segment_start := greatest(v_started, v_day_start);
      v_segment_end := least(v_finished, v_day_end);

      if v_segment_end > v_segment_start then
        v_minutes := v_minutes + extract(epoch from (v_segment_end - v_segment_start)) / 60;

        if v_break_end > v_segment_start and v_break_start < v_segment_end then
          v_minutes := v_minutes - extract(epoch from (least(v_segment_end, v_break_end) - greatest(v_segment_start, v_break_start))) / 60;
        end if;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return greatest(floor(v_minutes), 0)::integer;
end;
$$;

create or replace function public.get_department_kpi_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_dept_id uuid default null,
  p_letter_type_id uuid default null,
  p_form_id uuid default null,
  p_status text default null
)
returns table (
  dept_id uuid,
  dept_name text,
  dept_code text,
  total_count integer,
  completed_count integer,
  pending_count integer,
  rejected_count integer,
  on_time_count integer,
  late_count integer,
  avg_minutes numeric,
  sla_minutes integer,
  worst_pending_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select id, role, department_id
    from public.profiles
    where id = auth.uid()
  ),
  signature_scope as (
    select
      ss.id,
      ss.surat_id,
      ss.user_id,
      ss.status,
      ss.is_signed,
      ss.signed_at,
      ss.step_order,
      coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) as started_at,
      sr.created_at as surat_created_at,
      sr.letter_type_id,
      sr.penggunaan_id,
      sr.dept_id as surat_dept_id,
      mf.id as form_id,
      coalesce(
        case
          when (ss.signer_snapshot->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (ss.signer_snapshot->>'department_id')::uuid
          else null
        end,
        signer_profile.department_id,
        sr.dept_id
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
       or exists (
         select 1 from public.master_dept_pics mdp
         where mdp.user_id = cp.id
           and mdp.dept_id = s.responsible_dept_id
       )
  ),
  measured as (
    select
      s.*,
      d.name as dept_name,
      d.code as dept_code,
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
      end as kpi_status
    from authorized_scope s
    left join public.master_departments d on d.id = s.responsible_dept_id
    left join public.department_kpi_configs k on k.dept_id = s.responsible_dept_id and k.is_active = true
    where s.responsible_dept_id is not null
      and (p_dept_id is null or s.responsible_dept_id = p_dept_id)
  ),
  filtered as (
    select *
    from measured
    where p_status is null
       or p_status = 'all'
       or (p_status = 'pending' and kpi_status = 'pending')
       or (p_status = 'completed' and kpi_status = 'completed')
       or (p_status = 'rejected' and kpi_status = 'rejected')
       or (p_status = 'late' and elapsed_minutes > sla_minutes)
       or (p_status = 'on_time' and elapsed_minutes <= sla_minutes)
  )
  select
    responsible_dept_id as dept_id,
    coalesce(dept_name, 'Tanpa Departemen') as dept_name,
    dept_code,
    count(*)::integer as total_count,
    count(*) filter (where kpi_status = 'completed')::integer as completed_count,
    count(*) filter (where kpi_status = 'pending')::integer as pending_count,
    count(*) filter (where kpi_status = 'rejected')::integer as rejected_count,
    count(*) filter (where elapsed_minutes <= sla_minutes)::integer as on_time_count,
    count(*) filter (where elapsed_minutes > sla_minutes)::integer as late_count,
    round(avg(elapsed_minutes), 1) as avg_minutes,
    max(sla_minutes)::integer as sla_minutes,
    coalesce(max(elapsed_minutes) filter (where kpi_status = 'pending'), 0)::integer as worst_pending_minutes
  from filtered
  group by responsible_dept_id, dept_name, dept_code
  order by
    case when count(*) = 0 then 0 else (count(*) filter (where elapsed_minutes <= sla_minutes)::numeric / count(*)) end desc,
    late_count asc,
    dept_name asc;
$$;

grant execute on function public.calculate_business_minutes(timestamptz, timestamptz, integer[], time, time, time, time, text) to authenticated;
grant execute on function public.get_department_kpi_summary(timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;
