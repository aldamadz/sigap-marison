create table if not exists public.job_title_display_overrides (
  id uuid primary key default gen_random_uuid(),
  source_job_title text not null,
  display_label text not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint job_title_display_overrides_source_not_empty check (length(trim(source_job_title)) > 0),
  constraint job_title_display_overrides_label_not_empty check (length(trim(display_label)) > 0)
);

create unique index if not exists job_title_display_overrides_source_unique
  on public.job_title_display_overrides (lower(trim(source_job_title)));

create index if not exists job_title_display_overrides_active_idx
  on public.job_title_display_overrides (is_active);

alter table public.job_title_display_overrides enable row level security;

revoke all on table public.job_title_display_overrides from authenticated;
grant select, insert, update, delete on table public.job_title_display_overrides to authenticated;
grant all on table public.job_title_display_overrides to service_role;

drop policy if exists job_title_display_overrides_read_authenticated on public.job_title_display_overrides;
create policy job_title_display_overrides_read_authenticated
on public.job_title_display_overrides for select to authenticated
using (true);

drop policy if exists job_title_display_overrides_admin_insert on public.job_title_display_overrides;
create policy job_title_display_overrides_admin_insert
on public.job_title_display_overrides for insert to authenticated
with check (public.is_current_user_admin());

drop policy if exists job_title_display_overrides_admin_update on public.job_title_display_overrides;
create policy job_title_display_overrides_admin_update
on public.job_title_display_overrides for update to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists job_title_display_overrides_admin_delete on public.job_title_display_overrides;
create policy job_title_display_overrides_admin_delete
on public.job_title_display_overrides for delete to authenticated
using (public.is_current_user_admin());

create or replace function public.set_job_title_display_override_audit_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_job_title_display_override_audit_fields on public.job_title_display_overrides;
create trigger tr_job_title_display_override_audit_fields
before insert or update on public.job_title_display_overrides
for each row
execute function public.set_job_title_display_override_audit_fields();

revoke all on function public.set_job_title_display_override_audit_fields() from public, anon, authenticated;
