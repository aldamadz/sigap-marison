create table if not exists public.surat_registration_draft_files (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.surat_registration_drafts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  file_url text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  requirement_key text,
  requirement_label text,
  created_at timestamptz not null default now()
);

create index if not exists surat_registration_draft_files_draft_idx
  on public.surat_registration_draft_files(draft_id, created_at);

alter table public.surat_registration_draft_files enable row level security;

create policy surat_registration_draft_files_select_own
  on public.surat_registration_draft_files for select to authenticated
  using (created_by = auth.uid());

create policy surat_registration_draft_files_insert_own
  on public.surat_registration_draft_files for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.surat_registration_drafts d
      where d.id = draft_id and d.created_by = auth.uid() and d.status = 'DRAFT'
    )
  );

create policy surat_registration_draft_files_delete_own
  on public.surat_registration_draft_files for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.surat_registration_drafts d
      where d.id = draft_id and d.created_by = auth.uid() and d.status = 'DRAFT'
    )
  );

comment on table public.surat_registration_draft_files is
  'Files uploaded while a registration draft is active, reused on final submission.';
