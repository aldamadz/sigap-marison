-- Public object URLs can still serve files from public buckets;
-- broad SELECT policies are not required and allow listing.

drop policy if exists "Avatar Public Access" on storage.objects;
drop policy if exists "User Can Update Own Avatar" on storage.objects;
drop policy if exists "User Can Upload Avatar" on storage.objects;

drop policy if exists "Allow Authenticated upload & Download 1qynn7p_0" on storage.objects;
drop policy if exists "Allow Authenticated upload & Download 1qynn7p_1" on storage.objects;
drop policy if exists "Allow authenticated download" on storage.objects;
drop policy if exists "Allow authenticated update" on storage.objects;
drop policy if exists "Allow authenticated upload" on storage.objects;

drop policy if exists "Allow Authenticated upload & Download 3fxlv6_0" on storage.objects;
drop policy if exists "Allow Authenticated upload & Download 3fxlv6_1" on storage.objects;

drop policy if exists "Allow Delete" on storage.objects;
drop policy if exists "Allow Update and Delete" on storage.objects;
drop policy if exists "Allow Uploads" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder wrvard_0" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder wrvard_1" on storage.objects;
drop policy if exists "Give anon users access to JPG images in folder wrvard_2" on storage.objects;
drop policy if exists "Public Access" on storage.objects;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy dokumen_surat_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dokumen_surat');

create policy dokumen_surat_update_authenticated on storage.objects
  for update to authenticated
  using (bucket_id = 'dokumen_surat')
  with check (bucket_id = 'dokumen_surat');

create policy lampiran_surat_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lampiran_surat');

create policy templates_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'templates' and public.is_current_user_admin())
  with check (bucket_id = 'templates' and public.is_current_user_admin());
