drop policy if exists surat_registration_draft_files_delete_own
  on public.surat_registration_draft_files;

create policy surat_registration_draft_files_delete_own
  on public.surat_registration_draft_files for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.surat_registration_drafts d
      where d.id = draft_id and d.created_by = auth.uid() and d.status = 'DRAFT'
    )
  );
