begin;

create schema if not exists registration_draft_lifecycle_internal;
revoke all on schema registration_draft_lifecycle_internal from public, anon, authenticated;

-- A persisted ordinary draft and its number share one server-controlled lease.
-- Revision drafts use an existing document number and retain their own guards.
create or replace function registration_draft_lifecycle_internal.guard_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revision_event_id is not null or new.status <> 'DRAFT' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'DRAFT' or old.expires_at is null or old.expires_at <= clock_timestamp() then
      raise exception 'Draft sudah tidak aktif. Buat pengajuan baru.' using errcode = '55000';
    end if;
    if new.reservation_id is distinct from old.reservation_id
      or new.created_by is distinct from old.created_by then
      raise exception 'Identitas draft tidak dapat diubah.' using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.surat_reservations r
    where r.id = new.reservation_id and r.reserved_by = new.created_by and r.status = 'PENDING') then
    raise exception 'Reservasi nomor sudah tidak aktif. Buat pengajuan baru.' using errcode = '55000';
  end if;
  new.expires_at := clock_timestamp() + interval '7 days';
  return new;
end $$;

create or replace function registration_draft_lifecycle_internal.renew_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revision_event_id is not null or new.status <> 'DRAFT' then return new; end if;
  -- Lock order remains draft -> reservation, matching owner cancellation.
  update public.surat_reservations r set expires_at = new.expires_at
    where r.id = new.reservation_id and r.reserved_by = new.created_by and r.status = 'PENDING';
  if not found then
    raise exception 'Reservasi nomor sudah tidak aktif. Buat pengajuan baru.' using errcode = '55000';
  end if;
  return new;
end $$;

create or replace function registration_draft_lifecycle_internal.protect_active_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_expiry timestamptz;
begin
  if old.status = 'PENDING' and new.status = 'CANCELLED' then
    select d.expires_at into v_expiry from public.surat_registration_drafts d
      where d.reservation_id = old.id and d.created_by = new.reserved_by
        and d.revision_event_id is null and d.status = 'DRAFT'
        and d.expires_at > clock_timestamp();
    if found then
      new.status := 'PENDING';
      new.expires_at := greatest(new.expires_at, v_expiry);
    end if;
  end if;
  return new;
end $$;

create or replace function registration_draft_lifecycle_internal.expire_cancelled_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'PENDING' and new.status = 'CANCELLED' then
    -- Never wait behind owner cancellation (which locks draft -> reservation).
    -- Skipped expired rows are already excluded from the active draft reader.
    update public.surat_registration_drafts d set status = 'EXPIRED'
      where d.id in (select candidate.id from public.surat_registration_drafts candidate
        where candidate.reservation_id = new.id and candidate.created_by = new.reserved_by
          and candidate.revision_event_id is null and candidate.status = 'DRAFT'
          and candidate.expires_at <= clock_timestamp() for update skip locked);
  end if;
  return new;
end $$;

revoke all on function registration_draft_lifecycle_internal.guard_draft(),
  registration_draft_lifecycle_internal.renew_reservation(),
  registration_draft_lifecycle_internal.protect_active_reservation(),
  registration_draft_lifecycle_internal.expire_cancelled_draft()
  from public, anon, authenticated, service_role;

drop trigger if exists registration_draft_lease_guard on public.surat_registration_drafts;
create trigger registration_draft_lease_guard before insert or update on public.surat_registration_drafts
  for each row execute function registration_draft_lifecycle_internal.guard_draft();
drop trigger if exists registration_draft_lease_renewal on public.surat_registration_drafts;
create trigger registration_draft_lease_renewal after insert or update of expires_at, payload on public.surat_registration_drafts
  for each row execute function registration_draft_lifecycle_internal.renew_reservation();
drop trigger if exists reservation_protect_active_draft on public.surat_reservations;
create trigger reservation_protect_active_draft before update of status on public.surat_reservations
  for each row execute function registration_draft_lifecycle_internal.protect_active_reservation();
drop trigger if exists reservation_expire_cancelled_draft on public.surat_reservations;
create trigger reservation_expire_cancelled_draft after update of status on public.surat_reservations
  for each row execute function registration_draft_lifecycle_internal.expire_cancelled_draft();

create or replace function public.void_surat_registration_draft(p_draft_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_draft public.surat_registration_drafts%rowtype;
  v_reservation public.surat_reservations%rowtype;
  v_window interval;
begin
  if v_actor is null then raise exception 'Sesi login tidak tersedia.' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles p where p.id = v_actor
    and p.is_active is true and p.deleted_at is null) then
    raise exception 'Akun tidak aktif.' using errcode = '42501';
  end if;
  select * into v_draft from public.surat_registration_drafts d where d.id = p_draft_id
    and (d.created_by = v_actor or exists(select 1 from public.profiles p
      where p.id = v_actor and p.is_active is true and p.deleted_at is null
        and p.role::text in ('admin','super_admin'))) for update;
  if not found then raise exception 'Draft tidak ditemukan atau Anda tidak berhak membatalkannya.' using errcode = '42501'; end if;
  if v_draft.revision_event_id is not null then
    raise exception 'Perbaikan pengajuan harus dikelola melalui Tindak Lanjut.' using errcode = '55000';
  end if;
  if v_draft.status = 'VOID' then return; end if;
  if v_draft.status not in ('DRAFT','EXPIRED') then
    raise exception 'Draft sudah tidak aktif (%).', v_draft.status using errcode = '55000';
  end if;
  if v_draft.reservation_id is not null then
    select * into v_reservation from public.surat_reservations r where r.id = v_draft.reservation_id for update;
    if not found then raise exception 'Reservasi nomor tidak ditemukan.' using errcode = '55000'; end if;
    if v_reservation.status = 'USED' then
      raise exception 'Nomor sudah digunakan pengajuan terdaftar.' using errcode = '55000';
    end if;
    if v_reservation.reserved_by is distinct from v_draft.created_by then
      raise exception 'Reservasi nomor bukan milik draft ini.' using errcode = '42501';
    end if;
    if v_reservation.status = 'PENDING' then
      v_window := coalesce(public.get_letter_number_reuse_window(), interval '0');
      update public.surat_reservations set status = 'VOID', voided_at = clock_timestamp(),
        voided_by = v_actor, reuse_until = clock_timestamp() + v_window where id = v_reservation.id;
      perform public.log_letter_number_reservation_event(v_reservation.id,'void',v_actor,v_window,'Draft dibatalkan oleh pemohon/admin.');
    elsif v_reservation.status not in ('CANCELLED','VOID') then
      raise exception 'Reservasi nomor sudah tidak aktif (%).', v_reservation.status using errcode = '55000';
    end if;
    -- Stale cleanup does not reopen a number or start a new reuse window.
  end if;
  update public.surat_registration_drafts set status = 'VOID', voided_at = clock_timestamp()
    where id = v_draft.id;
end $$;
revoke all on function public.void_surat_registration_draft(uuid) from public, anon;
grant execute on function public.void_surat_registration_draft(uuid) to authenticated, service_role;

-- Close only already-inconsistent ordinary draft records. Retain their payload,
-- files and reservation metadata; never restore historical cancelled numbers.
update public.surat_registration_drafts d set status = 'EXPIRED'
  from public.surat_reservations r where r.id = d.reservation_id
    and r.status = 'CANCELLED' and d.status = 'DRAFT' and d.revision_event_id is null;

notify pgrst, 'reload schema';
commit;
