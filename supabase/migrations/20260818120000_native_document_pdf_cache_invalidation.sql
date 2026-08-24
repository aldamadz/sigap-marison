-- DOC-09: document state is canonical in PostgreSQL. A signature changes the
-- logical source version, so any previously rendered PDF must be invalidated
-- atomically before the next approval step or outbound dispatch can observe it.
create or replace function public.handle_approve_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text,
  p_file_path text
)
returns json
language plpgsql
security definer
set search_path = ''
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
  v_verification_required boolean := false;
  v_verification_status text := 'not_required';
  v_surat public.surat_registrasi%rowtype;
  v_is_recommendation boolean := false;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi' using errcode = '28000';
  end if;
  if nullif(btrim(coalesce(p_file_path, '')), '') is null
     or p_file_path not like 'native://document/%' then
    raise exception 'Versi sumber dokumen native tidak valid' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.is_active is true
  ) then
    raise exception 'Profil aktif tidak tersedia.' using errcode = '42501';
  end if;

  select sr.* into v_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id and sr.status = 'PROSES'
  for update;
  if not found then
    raise exception 'Surat tidak ditemukan atau sudah selesai';
  end if;

  v_current_step := v_surat.current_step;
  v_created_by := v_surat.created_by;
  v_no_surat := v_surat.no_surat;
  v_judul_surat := v_surat.judul_surat;

  select ss.step_order, ss.verification_required, ss.verification_status
  into v_signature_step, v_verification_required, v_verification_status
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
  if v_verification_required and v_verification_status <> 'verified' then
    raise exception 'Data pengajuan belum diperiksa tim pemeriksa';
  end if;

  select count(*) into v_total_steps
  from public.surat_signatures
  where surat_id = p_surat_id;
  v_is_recommendation := v_current_step >= v_total_steps and exists (
    select 1 from public.surat_linked_documents l
    where l.child_surat_id = p_surat_id
      and l.link_type = 'recommendation'
      and l.status = 'active'
  );

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      file_path_snap = p_file_path,
      pdf_path_snap = null,
      status = 'APPROVED'
  where id = p_sig_id;

  if v_current_step >= v_total_steps then
    update public.surat_registrasi
    set file_path = p_file_path,
        pdf_path = null,
        status = case when v_is_recommendation then 'PDF_PENDING' else 'DONE' end,
        updated_at = now()
    where id = p_surat_id;
    v_is_done := not v_is_recommendation;
  else
    update public.surat_registrasi
    set file_path = p_file_path,
        pdf_path = null,
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
    insert into public.notifications(user_id, type, title, message, data, link)
    values (
      v_created_by,
      'success',
      'Dokumen Selesai Disetujui',
      'Dokumen "' || coalesce(v_judul_surat, '') || '" (' || coalesce(v_no_surat, '') || ') telah menyelesaikan seluruh tahap persetujuan.',
      jsonb_build_object('surat_id', p_surat_id, 'no_surat', v_no_surat, 'judul', v_judul_surat, 'file_path', p_file_path),
      '/surat/monitoring'
    );
  end if;

  return json_build_object('success', true, 'isDone', v_is_done, 'pdfPending', v_is_recommendation);
end;
$$;

revoke all on function public.handle_approve_surat_v2(uuid, uuid, text, text)
from public, anon;
grant execute on function public.handle_approve_surat_v2(uuid, uuid, text, text)
to authenticated, service_role;
