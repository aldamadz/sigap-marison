create or replace function public.void_surat_registration_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_reservation_id uuid;
  v_reservation_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and coalesce(profile.is_active, true) = true
      and profile.role in ('admin', 'super_admin')
  )
  into v_is_admin;

  select draft.reservation_id
  into v_reservation_id
  from public.surat_registration_drafts draft
  where draft.id = p_draft_id
    and draft.status = 'DRAFT'
    and (draft.created_by = v_user_id or v_is_admin)
  for update;

  if v_reservation_id is null then
    raise exception 'Draft aktif tidak ditemukan atau Anda tidak berhak membatalkannya.';
  end if;

  update public.surat_reservations reservation
  set status = 'VOID'
  where reservation.id = v_reservation_id
    and reservation.status = 'PENDING'
    and (reservation.reserved_by = v_user_id or v_is_admin);

  get diagnostics v_reservation_updated = row_count;

  if v_reservation_updated = 0 then
    raise exception 'Reservasi nomor tidak aktif atau tidak bisa dibatalkan.';
  end if;

  update public.surat_registration_drafts draft
  set status = 'VOID',
      voided_at = now()
  where draft.id = p_draft_id
    and draft.status = 'DRAFT';
end;
$$;

revoke all on function public.void_surat_registration_draft(uuid) from public, anon;
grant execute on function public.void_surat_registration_draft(uuid) to authenticated, service_role;
