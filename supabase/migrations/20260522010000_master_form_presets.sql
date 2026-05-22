create table if not exists public.master_form_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  input_schema jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_master_form_presets_created_at
  on public.master_form_presets(created_at desc);

alter table public.master_form_presets enable row level security;

drop policy if exists "Admins can view form presets" on public.master_form_presets;
drop policy if exists "Admins can insert form presets" on public.master_form_presets;
drop policy if exists "Admins can update form presets" on public.master_form_presets;
drop policy if exists "Admins can delete form presets" on public.master_form_presets;

create policy "Admins can view form presets"
  on public.master_form_presets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

create policy "Admins can insert form presets"
  on public.master_form_presets
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

create policy "Admins can update form presets"
  on public.master_form_presets
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

create policy "Admins can delete form presets"
  on public.master_form_presets
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );
