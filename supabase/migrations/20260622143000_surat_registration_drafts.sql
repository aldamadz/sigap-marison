create table if not exists public.surat_registration_drafts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.surat_reservations(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  no_surat text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'VOID', 'EXPIRED')),
  payload jsonb not null default '{}'::jsonb,
  signer_assignments jsonb not null default '[]'::jsonb,
  current_section text not null default 'details',
  expires_at timestamptz not null default (now() + interval '7 days'),
  submitted_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surat_registration_drafts_owner_status_idx
  on public.surat_registration_drafts(created_by, status, updated_at desc);

alter table public.surat_registration_drafts enable row level security;

drop policy if exists surat_registration_drafts_select_own on public.surat_registration_drafts;
create policy surat_registration_drafts_select_own
  on public.surat_registration_drafts
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists surat_registration_drafts_insert_own on public.surat_registration_drafts;
create policy surat_registration_drafts_insert_own
  on public.surat_registration_drafts
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists surat_registration_drafts_update_own on public.surat_registration_drafts;
create policy surat_registration_drafts_update_own
  on public.surat_registration_drafts
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create or replace function public.touch_surat_registration_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_surat_registration_draft on public.surat_registration_drafts;
create trigger trg_touch_surat_registration_draft
before update on public.surat_registration_drafts
for each row execute function public.touch_surat_registration_draft();

create or replace function public.extend_pending_surat_reservation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'PENDING' then
    new.expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_extend_pending_surat_reservation on public.surat_reservations;
create trigger trg_extend_pending_surat_reservation
before insert or update of status on public.surat_reservations
for each row execute function public.extend_pending_surat_reservation();

create or replace function public.create_surat_registration_draft(
  p_no_urut integer,
  p_no_surat text,
  p_payload jsonb default '{}'::jsonb,
  p_signer_assignments jsonb default '[]'::jsonb
)
returns public.surat_registration_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation_id uuid;
  v_draft public.surat_registration_drafts;
begin
  if v_user_id is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select r.id
  into v_reservation_id
  from public.surat_reservations r
  where r.no_urut = p_no_urut
    and r.year = extract(year from now())::integer
    and r.reserved_by = v_user_id
    and r.status = 'PENDING'
  order by r.created_at desc
  limit 1;

  if v_reservation_id is null then
    raise exception 'Reservation nomor tidak ditemukan.';
  end if;

  insert into public.surat_registration_drafts (
    reservation_id, created_by, no_surat, payload, signer_assignments
  ) values (
    v_reservation_id, v_user_id, p_no_surat, coalesce(p_payload, '{}'::jsonb),
    coalesce(p_signer_assignments, '[]'::jsonb)
  )
  on conflict (reservation_id) do update
  set no_surat = excluded.no_surat,
      payload = excluded.payload,
      signer_assignments = excluded.signer_assignments,
      status = 'DRAFT',
      expires_at = now() + interval '7 days',
      voided_at = null
  returning * into v_draft;

  return v_draft;
end;
$$;

revoke all on function public.create_surat_registration_draft(integer, text, jsonb, jsonb) from public;
grant execute on function public.create_surat_registration_draft(integer, text, jsonb, jsonb) to authenticated;

create or replace function public.void_surat_registration_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation_id uuid;
begin
  update public.surat_registration_drafts
  set status = 'VOID', voided_at = now()
  where id = p_draft_id
    and created_by = v_user_id
    and status = 'DRAFT'
  returning reservation_id into v_reservation_id;

  if v_reservation_id is null then
    raise exception 'Draft aktif tidak ditemukan.';
  end if;

  update public.surat_reservations
  set status = 'VOID'
  where id = v_reservation_id
    and reserved_by = v_user_id
    and status = 'PENDING';
end;
$$;

revoke all on function public.void_surat_registration_draft(uuid) from public;
grant execute on function public.void_surat_registration_draft(uuid) to authenticated;

alter table public.surat_reservations
  alter column expires_at set default (now() + interval '7 days');

alter table public.surat_reservations
  drop constraint if exists surat_reservations_status_check;
alter table public.surat_reservations
  add constraint surat_reservations_status_check
  check (status in ('PENDING', 'USED', 'CANCELLED', 'VOID'));

update public.surat_reservations
set status = 'VOID'
where status = 'CANCELLED';

comment on table public.surat_registration_drafts is
  'Autosaved registration state created after a letter number is reserved.';
