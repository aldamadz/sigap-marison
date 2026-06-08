create table if not exists public.letter_number_counter_configs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('pusat', 'cabang')),
  entity_id uuid not null references public.master_entities(id) on delete cascade,
  dept_id uuid references public.master_departments(id) on delete cascade,
  project_id uuid references public.master_projects(id) on delete cascade,
  year integer not null,
  start_from integer not null default 1 check (start_from >= 1),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint letter_number_counter_scope_check check (
    (scope_type = 'pusat' and dept_id is not null and project_id is null)
    or
    (scope_type = 'cabang' and project_id is not null and dept_id is null)
  )
);

create unique index if not exists letter_number_counter_pusat_unique
on public.letter_number_counter_configs(entity_id, year, dept_id)
where scope_type = 'pusat' and is_active = true;

create unique index if not exists letter_number_counter_cabang_unique
on public.letter_number_counter_configs(entity_id, year, project_id)
where scope_type = 'cabang' and is_active = true;

create index if not exists idx_letter_number_counter_configs_year
on public.letter_number_counter_configs(year, scope_type, is_active);

create or replace function public.touch_letter_number_counter_configs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  if tg_op = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_letter_number_counter_configs on public.letter_number_counter_configs;
create trigger trg_touch_letter_number_counter_configs
before insert or update on public.letter_number_counter_configs
for each row execute function public.touch_letter_number_counter_configs();

alter table public.letter_number_counter_configs enable row level security;

drop policy if exists "Admins can manage letter number counters" on public.letter_number_counter_configs;
create policy "Admins can manage letter number counters"
on public.letter_number_counter_configs
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
);

create or replace function public.generate_new_letter_number(
  p_entity_id uuid,
  p_type_id uuid,
  p_office_id uuid,
  p_project_id uuid,
  p_user_id uuid,
  p_dept_id uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_next_val integer;
  v_year integer := extract(year from now());
  v_is_pusat boolean;
  v_start_from integer := 1;
begin
  select (kedudukan = 'Pusat') into v_is_pusat
  from public.master_offices
  where id = p_office_id;

  if v_is_pusat then
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'pusat'
      and is_active = true
      and entity_id = p_entity_id
      and dept_id = p_dept_id
      and project_id is null
      and year = v_year;

    select no_urut into v_next_val
    from public.surat_reservations
    where entity_id = p_entity_id
      and dept_id = p_dept_id
      and project_id is null
      and year = v_year
      and no_urut >= v_start_from
      and status = 'CANCELLED'
    order by no_urut asc
    limit 1;
  else
    select coalesce(max(start_from), 1) into v_start_from
    from public.letter_number_counter_configs
    where scope_type = 'cabang'
      and is_active = true
      and entity_id = p_entity_id
      and project_id = p_project_id
      and dept_id is null
      and year = v_year;

    select no_urut into v_next_val
    from public.surat_reservations
    where entity_id = p_entity_id
      and project_id = p_project_id
      and dept_id is null
      and year = v_year
      and no_urut >= v_start_from
      and status = 'CANCELLED'
    order by no_urut asc
    limit 1;
  end if;

  if v_next_val is not null then
    update public.surat_reservations
    set status = 'PENDING',
        type_id = p_type_id,
        office_id = p_office_id,
        project_id = p_project_id,
        dept_id = case when v_is_pusat then p_dept_id else null end,
        reserved_by = p_user_id,
        created_at = now(),
        expires_at = (now() + '00:30:00'::interval)
    where entity_id = p_entity_id
      and year = v_year
      and no_urut = v_next_val
      and (
        (v_is_pusat and dept_id = p_dept_id and project_id is null)
        or
        (not v_is_pusat and project_id = p_project_id and dept_id is null)
      );
  else
    if v_is_pusat then
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
      from public.surat_reservations
      where entity_id = p_entity_id
        and dept_id = p_dept_id
        and project_id is null
        and year = v_year;
    else
      select greatest(coalesce(max(no_urut), 0) + 1, v_start_from) into v_next_val
      from public.surat_reservations
      where entity_id = p_entity_id
        and project_id = p_project_id
        and dept_id is null
        and year = v_year;
    end if;

    insert into public.surat_reservations (
      entity_id,
      type_id,
      office_id,
      project_id,
      dept_id,
      year,
      no_urut,
      status,
      reserved_by
    ) values (
      p_entity_id,
      p_type_id,
      p_office_id,
      case when v_is_pusat then null else p_project_id end,
      case when v_is_pusat then p_dept_id else null end,
      v_year,
      v_next_val,
      'PENDING',
      p_user_id
    );
  end if;

  return v_next_val;
end;
$function$;

grant execute on function public.generate_new_letter_number(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
