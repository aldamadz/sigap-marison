drop policy if exists "Allow All Signatures" on public.surat_signatures;
drop policy if exists "Users can view their own signatures" on public.surat_signatures;
drop policy if exists "Allow authenticated insert" on public.surat_registrasi;
drop policy if exists "Allow update by signer or creator" on public.surat_registrasi;

create policy "Participants and admins can view signatures"
on public.surat_signatures
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = surat_signatures.surat_id
      and sr.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create policy "Creators can insert surat signatures"
on public.surat_signatures
for insert
to authenticated
with check (
  exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = surat_signatures.surat_id
      and sr.created_by = auth.uid()
  )
);

create policy "Users can create own surat"
on public.surat_registrasi
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Creators current signers and admins can update surat"
on public.surat_registrasi
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.surat_signatures ss
    where ss.surat_id = surat_registrasi.id
      and ss.user_id = auth.uid()
      and ss.step_order = surat_registrasi.current_step
      and ss.is_signed = false
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.surat_signatures ss
    where ss.surat_id = surat_registrasi.id
      and ss.user_id = auth.uid()
      and ss.step_order = surat_registrasi.current_step
      and ss.is_signed = false
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

create or replace function public.handle_approve_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text,
  p_file_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_step integer;
  v_signature_step integer;
  v_total_steps integer;
  v_created_by uuid;
  v_no_surat text;
  v_judul_surat text;
  v_is_done boolean := false;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select sr.current_step, sr.created_by, sr.no_surat, sr.judul_surat
  into v_current_step, v_created_by, v_no_surat, v_judul_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id
    and sr.status = 'PROSES'
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  select ss.step_order
  into v_signature_step
  from public.surat_signatures ss
  where ss.id = p_sig_id
    and ss.surat_id = p_surat_id
    and ss.user_id = v_actor
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Tanda tangan tidak tersedia untuk user ini';
  end if;

  if v_signature_step <> v_current_step then
    raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';
  end if;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      file_path_snap = p_file_path,
      status = 'APPROVED'
  where id = p_sig_id;

  select count(*)
  into v_total_steps
  from public.surat_signatures
  where surat_id = p_surat_id;

  if v_current_step >= v_total_steps then
    update public.surat_registrasi
    set file_path = p_file_path,
        status = 'DONE',
        updated_at = now()
    where id = p_surat_id;
    v_is_done := true;
  else
    update public.surat_registrasi
    set file_path = p_file_path,
        current_step = v_current_step + 1,
        updated_at = now()
    where id = p_surat_id;

    update public.surat_signatures
    set available_at = coalesce(available_at, now())
    where surat_id = p_surat_id
      and step_order = v_current_step + 1
      and is_signed = false;
  end if;

  if v_is_done and v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data, link)
    values (
      v_created_by,
      'success',
      'Dokumen Selesai Disetujui',
      'Dokumen "' || coalesce(v_judul_surat, '') || '" (' || coalesce(v_no_surat, '') || ') telah menyelesaikan seluruh tahap persetujuan.',
      jsonb_build_object(
        'surat_id', p_surat_id,
        'no_surat', v_no_surat,
        'judul', v_judul_surat,
        'file_path', p_file_path
      ),
      '/surat/monitoring'
    );
  end if;

  return json_build_object('success', true, 'isDone', v_is_done);
end;
$$;

create or replace function public.handle_reject_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current_step integer;
  v_signature_step integer;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if nullif(trim(p_note), '') is null then
    raise exception 'Catatan penolakan wajib diisi';
  end if;

  select sr.current_step
  into v_current_step
  from public.surat_registrasi sr
  where sr.id = p_surat_id
    and sr.status = 'PROSES'
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  select ss.step_order
  into v_signature_step
  from public.surat_signatures ss
  where ss.id = p_sig_id
    and ss.surat_id = p_surat_id
    and ss.user_id = v_actor
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Tanda tangan tidak tersedia untuk user ini';
  end if;

  if v_signature_step <> v_current_step then
    raise exception 'Tahap tanda tangan belum aktif atau sudah diproses';
  end if;

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      status = 'REJECTED'
  where id = p_sig_id;

  update public.surat_registrasi
  set status = 'REJECTED',
      updated_at = now()
  where id = p_surat_id;

  return true;
end;
$$;

revoke all on function public.handle_approve_surat(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.handle_approve_surat_v2(uuid, uuid, text, text) from public, anon;
revoke all on function public.handle_reject_surat_v2(uuid, uuid, text) from public, anon;

grant execute on function public.handle_approve_surat_v2(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.handle_reject_surat_v2(uuid, uuid, text) to authenticated, service_role;
