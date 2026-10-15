begin;

create schema if not exists unit_allocation_internal;
revoke all on schema unit_allocation_internal from public,anon,authenticated,service_role;

-- Historical signature/user IDs are snapshots, not FKs: revised workflows may
-- rebuild signatures and employees may be removed without losing the evidence.
create table if not exists public.surat_unit_allocation_history (
  id uuid primary key default gen_random_uuid(),
  surat_id uuid not null references public.surat_registrasi(id) on delete restrict,
  signature_id uuid not null,
  actor_id uuid not null,
  actor_name text not null,
  verified_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  requested_count integer not null check(requested_count>0),
  allocated_count integer not null check(allocated_count>0 and allocated_count<=requested_count),
  remaining_count integer generated always as (requested_count-allocated_count) stored,
  note text,
  request_snapshot jsonb not null,
  allocation_snapshot jsonb not null,
  check(length(coalesce(note,''))<=2000),
  check(allocated_count=requested_count or length(trim(coalesce(note,'')))>=5)
);
create index if not exists surat_unit_allocation_history_document_idx
  on public.surat_unit_allocation_history(surat_id,created_at,id);
alter table public.surat_unit_allocation_history enable row level security;
revoke all on public.surat_unit_allocation_history from public,anon,authenticated,service_role;
grant select on public.surat_unit_allocation_history to authenticated,service_role;
drop policy if exists unit_allocation_history_participants_read on public.surat_unit_allocation_history;
create policy unit_allocation_history_participants_read on public.surat_unit_allocation_history
  for select to authenticated using(public.can_read_surat(surat_id));

create or replace function unit_allocation_internal.guard_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Riwayat pemeriksaan unit tidak dapat diubah atau dihapus.' using errcode='42501';
end $$;
drop trigger if exists unit_allocation_history_immutable on public.surat_unit_allocation_history;
create trigger unit_allocation_history_immutable before update or delete on public.surat_unit_allocation_history
  for each row execute function unit_allocation_internal.guard_history();

create or replace function unit_allocation_internal.has_valid_review(p_surat_id uuid,p_input jsonb)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.surat_unit_allocation_history h
    join public.surat_signatures s on s.id=h.signature_id and s.surat_id=h.surat_id
    where h.surat_id=p_surat_id and s.verification_status='verified'
      and s.verified_by=h.actor_id and s.verified_at=h.verified_at
      and nullif(trim(s.verification_note),'') is not distinct from h.note
      and h.requested_count::text=p_input->>'requested_unit_count'
      and h.allocated_count=jsonb_array_length(case when jsonb_typeof(p_input->'allocated_units')='array'
        then p_input->'allocated_units' else '[]'::jsonb end)
      and h.request_snapshot=jsonb_build_object('requested_project',p_input->'requested_project',
        'requested_unit_count',p_input->'requested_unit_count')
      and h.allocation_snapshot=jsonb_build_object('allocated_project',p_input->'allocated_project',
        'allocated_units',p_input->'allocated_units','allocated_by_signature_id',p_input->'allocated_by_signature_id'))
    or (p_input->>'requested_unit_count' = jsonb_array_length(case when jsonb_typeof(p_input->'allocated_units')='array'
        then p_input->'allocated_units' else '[]'::jsonb end)::text
      and not exists(select 1 from public.surat_unit_allocation_history where surat_id=p_surat_id))
$$;

create or replace function public.guard_unit_allocation_verification_count()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_doc public.surat_registrasi%rowtype; v_requested integer; v_allocated integer; v_actor uuid:=auth.uid();
begin
  if (new.requires_unit_allocation is true or new.action_type='unit_allocation')
    and old.verification_status='verified' and new.verification_status='verified'
    and (new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at
      or new.verification_note is distinct from old.verification_note) then
    raise exception 'Ulangi pemeriksaan untuk mengubah hasil atau catatan yang sudah disimpan.' using errcode='42501';
  end if;
  if new.verification_status='verified' and old.verification_status is distinct from 'verified'
    and (new.requires_unit_allocation is true or new.action_type='unit_allocation') then
    if v_actor is null or new.verified_by is distinct from v_actor or new.verified_at is null
      or not exists(select 1 from public.profiles p where p.id=v_actor and p.is_active is true
        and p.deleted_at is null and (p.role::text='admin'
          or new.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id',v_actor::text)))) then
      raise exception 'Tugas pemeriksaan tidak tersedia untuk user ini' using errcode='42501';
    end if;
    select * into strict v_doc from public.surat_registrasi where id=new.surat_id for share;
    if v_doc.status not in ('PROSES','MENUNGGU_PERBAIKAN') or v_doc.current_step<>new.step_order
      or new.is_signed is true or new.verification_required is not true then
      raise exception 'Tahap pemeriksaan unit sudah tidak aktif.' using errcode='42501'; end if;
    v_input:=v_doc.form_input_data;
    if coalesce(v_input->>'requested_unit_count','') !~ '^[0-9]{1,9}$'
      or jsonb_typeof(v_input->'allocated_units') is distinct from 'array' then
      raise exception 'Jumlah dan alokasi unit tidak valid.' using errcode='22023'; end if;
    v_requested:=(v_input->>'requested_unit_count')::integer;
    v_allocated:=jsonb_array_length(v_input->'allocated_units');
    if v_requested<1 or v_allocated<1 or v_allocated>v_requested then
      raise exception 'Pilih 1 sampai % unit sesuai permintaan.',v_requested using errcode='22023'; end if;
    if (select count(distinct nullif(coalesce(u->>'value',u->>'id',u#>>'{raw,id}'),''))
      from jsonb_array_elements(v_input->'allocated_units') u)<>v_allocated then
      raise exception 'Identitas unit kosong atau kavling dipilih lebih dari sekali.' using errcode='22023'; end if;
    if v_input->>'allocated_by_signature_id' is distinct from new.id::text then
      raise exception 'Alokasi unit tidak sesuai tahap pemeriksaan.' using errcode='22023'; end if;
    if v_allocated<v_requested and length(trim(coalesce(new.verification_note,'')))<5 then
      raise exception 'Catatan minimal 5 karakter wajib diisi untuk alokasi unit kurang dari permintaan.' using errcode='22023'; end if;
    if length(coalesce(new.verification_note,''))>2000 then
      raise exception 'Catatan pemeriksaan maksimal 2000 karakter.' using errcode='22023'; end if;
    new.verified_at:=clock_timestamp();
    new.verification_note:=nullif(trim(new.verification_note),'');
  end if;
  return new;
end $$;
drop trigger if exists guard_unit_allocation_verification_count_trg on public.surat_signatures;
create trigger guard_unit_allocation_verification_count_trg before update of verification_status,verified_at,verified_by,verification_note on public.surat_signatures
  for each row execute function public.guard_unit_allocation_verification_count();

create or replace function unit_allocation_internal.record_review()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_input jsonb; v_name text;
begin
  if new.verification_status='verified' and old.verification_status is distinct from 'verified'
    and (new.requires_unit_allocation is true or new.action_type='unit_allocation') then
    select form_input_data into strict v_input from public.surat_registrasi where id=new.surat_id;
    select coalesce(nullif(trim(full_name),''),'Pengguna tanpa nama') into strict v_name
      from public.profiles where id=new.verified_by;
    insert into public.surat_unit_allocation_history(surat_id,signature_id,actor_id,actor_name,verified_at,
      requested_count,allocated_count,note,request_snapshot,allocation_snapshot)
    values(new.surat_id,new.id,new.verified_by,v_name,new.verified_at,
      (v_input->>'requested_unit_count')::integer,jsonb_array_length(v_input->'allocated_units'),
      nullif(trim(new.verification_note),''),
      jsonb_build_object('requested_project',v_input->'requested_project','requested_unit_count',v_input->'requested_unit_count'),
      jsonb_build_object('allocated_project',v_input->'allocated_project','allocated_units',v_input->'allocated_units',
        'allocated_by_signature_id',v_input->'allocated_by_signature_id'));
  end if;
  return new;
end $$;
drop trigger if exists unit_allocation_record_review on public.surat_signatures;
create trigger unit_allocation_record_review after update of verification_status on public.surat_signatures
  for each row execute function unit_allocation_internal.record_review();

-- Existing SECURITY DEFINER routines are owned by postgres; self-hosted new
-- helpers can be owned by supabase_admin. Keep this call chain private but valid.
revoke all on all functions in schema unit_allocation_internal from public,anon,authenticated,service_role;
grant usage on schema unit_allocation_internal to postgres;
grant execute on function unit_allocation_internal.has_valid_review(uuid,jsonb) to postgres;

create or replace function public.guard_surat_finalization_completeness()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_requested integer; v_allocated integer;
begin
  if new.status in ('DONE','SELESAI') and old.status is distinct from new.status then
    if exists(select 1 from public.surat_signatures s where s.surat_id=new.id and coalesce(s.is_signed,false) is false) then
      raise exception 'Dokumen belum dapat diselesaikan karena tanda tangan belum lengkap'; end if;
    if lower(coalesce(new.form_input_data->>'request_mode',new.form_input_data->>'request_category',''))='unit' then
      if coalesce(new.form_input_data->>'requested_unit_count','') !~ '^[0-9]{1,9}$'
        or jsonb_typeof(new.form_input_data->'allocated_units') is distinct from 'array' then
        raise exception 'Jumlah dan alokasi unit tidak valid.' using errcode='22023'; end if;
      v_requested:=(new.form_input_data->>'requested_unit_count')::integer;
      v_allocated:=jsonb_array_length(new.form_input_data->'allocated_units');
      if v_requested<1 or v_allocated<1 or v_allocated>v_requested
        or not unit_allocation_internal.has_valid_review(new.id,new.form_input_data) then
        raise exception 'Alokasi parsial belum memiliki catatan pemeriksaan yang valid.' using errcode='22023'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_surat_finalization_completeness_trg on public.surat_registrasi;
create trigger guard_surat_finalization_completeness_trg before update of status on public.surat_registrasi
  for each row execute function public.guard_surat_finalization_completeness();

-- Legacy reallocation wrappers exist on staging, but not on all production
-- histories. Amend only their known equality gates; preserve other routing.
do $patch$
declare v_function regprocedure; v_source text; v_before text;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like 'accept_surat_process_revision%'
      or p.proname like 'resolve_surat_process_revision%') loop
    v_source:=pg_get_functiondef(v_function);
    v_before:=v_source;
    v_source:=replace(v_source,
      'if v_requested_count is null or v_requested_count < 1 or v_requested_count = v_allocated_count then',
      'if v_requested_count is null or v_requested_count < 1 or v_requested_count = v_allocated_count or unit_allocation_internal.has_valid_review(v_surat.id,v_surat.form_input_data) then');
    v_source:=replace(v_source,
      'if v_requested_count is null or v_requested_count < 1 or v_allocated_count <> v_requested_count then',
      'if v_requested_count is null or v_requested_count < 1 or (v_allocated_count <> v_requested_count and not unit_allocation_internal.has_valid_review(v_surat.id,v_surat.form_input_data)) then');
    if v_source<>v_before then execute v_source; end if;
  end loop;
end $patch$;

revoke all on function public.guard_unit_allocation_verification_count(),public.guard_surat_finalization_completeness()
  from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
