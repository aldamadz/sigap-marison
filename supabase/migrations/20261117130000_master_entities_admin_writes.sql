begin;

alter table public.master_entities enable row level security;

-- Resolve authorization from the caller's current profile, never JWT metadata.
-- Keep existing read policies and other master-data authorization unchanged.
drop policy if exists master_entities_admin_insert on public.master_entities;
create policy master_entities_admin_insert on public.master_entities
for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
));

drop policy if exists master_entities_admin_update on public.master_entities;
create policy master_entities_admin_update on public.master_entities
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
));

drop policy if exists master_entities_admin_delete on public.master_entities;
create policy master_entities_admin_delete on public.master_entities
for delete to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid())
    and p.role::text = 'admin'
    and p.is_active is true
    and p.deleted_at is null
));

commit;
