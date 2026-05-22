alter table public.surat_signatures
  add column if not exists pdf_path_snap text;

create table if not exists public.surat_attachments (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete cascade,
  file_url text not null,
  file_name text,
  file_type text,
  file_size bigint,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default now()
);

alter table public.surat_attachments enable row level security;

create index if not exists idx_surat_attachments_surat_id on public.surat_attachments(surat_id);
create index if not exists idx_surat_attachments_created_by on public.surat_attachments(created_by);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'surat_attachments'
      and policyname = 'Users can view readable surat attachments'
  ) then
    create policy "Users can view readable surat attachments" on public.surat_attachments
    for select to authenticated
    using (
      exists (
        select 1
        from public.surat_registrasi sr
        where sr.id = surat_attachments.surat_id
          and (
            sr.created_by = auth.uid()
            or sr.pic_id = auth.uid()
            or exists (
              select 1 from public.surat_signatures ss
              where ss.surat_id = sr.id and ss.user_id = auth.uid()
            )
            or exists (
              select 1 from public.profiles p
              where p.id = auth.uid() and p.role = 'admin'
            )
          )
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'surat_attachments'
      and policyname = 'Creators can insert own surat attachments'
  ) then
    create policy "Creators can insert own surat attachments" on public.surat_attachments
    for insert to authenticated
    with check (created_by = auth.uid());
  end if;
end $$;

comment on column public.surat_signatures.pdf_path_snap is 'PDF snapshot generated from the stamped Excel at this approval step.';
comment on table public.surat_attachments is 'Multiple required attachments for surat registration.';
