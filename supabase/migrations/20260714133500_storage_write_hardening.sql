-- Browser clients must not write document or letter attachments directly.
-- Application uploads use server-side service credentials and build paths there.

drop policy if exists dokumen_surat_insert_authenticated on storage.objects;
drop policy if exists dokumen_surat_update_authenticated on storage.objects;
drop policy if exists lampiran_surat_insert_authenticated on storage.objects;
drop policy if exists lampiran_surat_update_authenticated on storage.objects;

-- Keep avatar self-service constrained by user-id folder.
drop policy if exists avatars_insert_own on storage.objects;
drop policy if exists avatars_update_own on storage.objects;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
