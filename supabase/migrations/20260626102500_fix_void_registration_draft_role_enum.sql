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
  v_draft_status text;
  v_reservation_status text;
begin
  if v_user_id is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    where profile.id = v_user_id
      and coalesce(profile.is_active, true) = true
      and coalesce(profile.role::text, '') in ('admin', 'super_admin')
  )
  into v_is_admin;

  select draft.reservation_id, draft.status::text
  into v_reservation_id, v_draft_status
  from public.surat_registration_drafts draft
  where draft.id = p_draft_id
    and (draft.created_by = v_user_id or v_is_admin)
  for update;

  if v_reservation_id is null then
    raise exception 'Draft tidak ditemukan atau Anda tidak berhak membatalkannya.';
  end if;

  if v_draft_status <> 'DRAFT' then
    raise exception 'Draft sudah tidak aktif (%).', v_draft_status;
  end if;

  select reservation.status::text
  into v_reservation_status
  from public.surat_reservations reservation
  where reservation.id = v_reservation_id
  for update;

  if v_reservation_status is null then
    raise exception 'Reservasi nomor tidak ditemukan.';
  end if;

  if v_reservation_status <> 'PENDING' then
    raise exception 'Reservasi nomor sudah tidak aktif (%).', v_reservation_status;
  end if;

  update public.surat_reservations reservation
  set status = 'VOID'
  where reservation.id = v_reservation_id;

  update public.surat_registration_drafts draft
  set status = 'VOID',
      voided_at = now()
  where draft.id = p_draft_id
    and draft.status = 'DRAFT';
end;
$$;

revoke all on function public.void_surat_registration_draft(uuid) from public, anon;
grant execute on function public.void_surat_registration_draft(uuid) to authenticated, service_role;
