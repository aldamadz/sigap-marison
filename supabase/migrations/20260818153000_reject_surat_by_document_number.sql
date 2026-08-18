create or replace function public.reject_surat_by_document_number(
  p_document_number text,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_document_number text := btrim(coalesce(p_document_number, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_combined_note text;
  v_match_count integer;
  v_surat public.surat_registrasi%rowtype;
  v_signature public.surat_signatures%rowtype;
  v_rejected_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.is_active = true and p.deleted_at is null
  ) then
    raise exception 'Akun tidak aktif' using errcode = '42501';
  end if;
  if v_document_number = '' or length(v_document_number) > 255 then
    raise exception 'Nomor dokumen wajib diisi dan maksimal 255 karakter.' using errcode = '22023';
  end if;
  if v_reason = '' or length(v_reason) > 1000 then
    raise exception 'Alasan penolakan wajib diisi dan maksimal 1000 karakter.' using errcode = '22023';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'Catatan penolakan maksimal 2000 karakter.' using errcode = '22023';
  end if;

  select count(*)::integer into v_match_count
  from public.surat_registrasi sr
  where btrim(sr.no_surat) = v_document_number;

  if v_match_count = 0 then
    raise exception 'Dokumen tidak ditemukan atau tidak tersedia untuk ditolak.' using errcode = 'P0002';
  end if;
  if v_match_count > 1 then
    raise exception 'Nomor dokumen tidak unik; penolakan dihentikan.' using errcode = '21000';
  end if;

  select sr.* into v_surat
  from public.surat_registrasi sr
  where btrim(sr.no_surat) = v_document_number
  for update;

  v_combined_note := v_reason || case when v_note is null then '' else E'\n\nCatatan: ' || v_note end;

  if v_surat.status = 'REJECTED' then
    select ss.* into v_signature
    from public.surat_signatures ss
    where ss.surat_id = v_surat.id
      and ss.user_id = v_actor
      and ss.status = 'REJECTED'
      and ss.is_signed = true
    order by ss.signed_at desc nulls last, ss.step_order desc
    limit 1;
    if not found then
      raise exception 'Dokumen tidak ditemukan atau tidak tersedia untuk ditolak.' using errcode = 'P0002';
    end if;
    if v_signature.catatan = v_combined_note then
      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'document_number', v_surat.no_surat,
        'status', 'REJECTED',
        'rejected_at', v_signature.signed_at
      );
    end if;
    raise exception 'Dokumen sudah ditolak dengan keputusan berbeda.' using errcode = '55000';
  end if;

  if v_surat.status <> 'PROSES' then
    raise exception 'Dokumen tidak ditemukan atau tidak tersedia untuk ditolak.' using errcode = 'P0002';
  end if;

  select ss.* into v_signature
  from public.surat_signatures ss
  where ss.surat_id = v_surat.id
    and ss.user_id = v_actor
    and ss.step_order = v_surat.current_step
    and ss.is_signed = false
  for update;

  if not found then
    raise exception 'Dokumen tidak ditemukan atau tidak tersedia untuk ditolak.' using errcode = 'P0002';
  end if;

  perform public.handle_reject_surat_v2(v_signature.id, v_surat.id, v_combined_note);
  select signed_at into v_rejected_at from public.surat_signatures where id = v_signature.id;

  if v_surat.created_by is not null then
    insert into public.notifications(user_id, type, title, message, data, link)
    values (
      v_surat.created_by,
      'error',
      'Surat Ditolak',
      'Surat "' || coalesce(v_surat.judul_surat, v_surat.no_surat) || '" ditolak. Alasan: ' || v_reason ||
        case when v_note is null then '' else ' Catatan: ' || v_note end,
      jsonb_build_object(
        'surat_id', v_surat.id,
        'no_surat', v_surat.no_surat,
        'event_type', 'document_rejected_by_number',
        'rejected_by', v_actor,
        'reason', v_reason,
        'note', v_note
      ),
      '/surat/monitoring'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'document_number', v_surat.no_surat,
    'status', 'REJECTED',
    'rejected_at', v_rejected_at
  );
end;
$$;

revoke all on function public.reject_surat_by_document_number(text, text, text) from public, anon;
grant execute on function public.reject_surat_by_document_number(text, text, text) to authenticated, service_role;
