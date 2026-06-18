alter table public.surat_signatures
  drop constraint if exists surat_signatures_verification_status_check;

alter table public.surat_signatures
  add constraint surat_signatures_verification_status_check
  check (verification_status in ('not_required', 'pending', 'verified'));

create or replace function public.request_surat_signature_verification_revision(
  p_sig_id uuid,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'Catatan revisi wajib diisi';
  end if;

  update public.surat_signatures ss
  set verification_status = 'pending',
      verified_at = null,
      verified_by = null,
      verification_note = nullif(trim(p_note), '')
  from public.surat_registrasi sr
  where ss.id = p_sig_id
    and sr.id = ss.surat_id
    and sr.status = 'PROSES'
    and sr.current_step = ss.step_order
    and ss.is_signed = false
    and ss.user_id = v_actor
    and ss.verification_required = true
    and ss.verification_status = 'verified';

  if not found then
    raise exception 'Tugas tidak dapat dikembalikan ke tim pengecek';
  end if;

  return true;
end;
$$;

revoke all on function public.request_surat_signature_verification_revision(uuid, text) from public, anon;
grant execute on function public.request_surat_signature_verification_revision(uuid, text) to authenticated, service_role;
