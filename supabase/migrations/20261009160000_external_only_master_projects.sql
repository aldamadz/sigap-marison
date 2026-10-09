-- Local records remain as historical FK targets, never as active project sources.
begin;

alter table public.master_projects add column if not exists local_retired_at timestamptz;
update public.master_projects set local_retired_at=now()
where local_retired_at is null and (marison_project_id is null or marison_project_id<=0 or marison_synced_at is null);

create or replace function public.is_external_master_project(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.master_projects where id=p_id
    and marison_project_id>0 and marison_synced_at is not null and local_retired_at is null);
$$;
revoke all on function public.is_external_master_project(uuid) from public,anon;
grant execute on function public.is_external_master_project(uuid) to authenticated,service_role;

create or replace function public.branch_has_registered_projects(p_office_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.master_projects where office_id=p_office_id
    and marison_project_id>0 and marison_synced_at is not null and local_retired_at is null);
$$;

-- Only the trusted API sync can write project identity. Admin may assign the
-- SIGAP accounting entity, which is not supplied by the project API.
create or replace function public.guard_external_master_project_write()
returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or auth.role()='service_role' then
    if tg_op<>'DELETE' then
      if new.marison_project_id>0 and new.marison_synced_at is not null then
        new.local_retired_at:=null;
      else
        new.local_retired_at:=coalesce(new.local_retired_at,now());
      end if;
      return new;
    end if;
    return old;
  end if;
  if tg_op<>'UPDATE' then
    raise exception 'Proyek hanya dapat berasal dari sinkronisasi API external.' using errcode='42501';
  end if;
  if not public.is_external_master_project(old.id) or
    (to_jsonb(new)-array['entity_id','updated_at','marison_review_required','marison_review_reasons'])
      is distinct from (to_jsonb(old)-array['entity_id','updated_at','marison_review_required','marison_review_reasons']) then
    raise exception 'Identitas proyek dikelola oleh API external.' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_external_project_write on public.master_projects;
create trigger guard_external_project_write before insert or update or delete on public.master_projects
for each row execute function public.guard_external_master_project_write();
revoke insert,update,delete on public.master_projects from authenticated,anon;
grant update(entity_id) on public.master_projects to authenticated;

create or replace function public.guard_active_external_project_selection()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.project_id is not distinct from old.project_id then
    -- Old document updates retain history. Reclaim is a new reservation claim.
    if tg_table_name<>'surat_reservations' then return new; end if;
    if not (old.status='VOID' and new.status='PENDING') then return new; end if;
  end if;
  if new.project_id is not null and not public.is_external_master_project(new.project_id) then
    raise exception 'Proyek lama hanya tersedia untuk riwayat. Pilih proyek dari API external.' using errcode='22023';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_active_external_project on public.surat_reservations;
create trigger guard_active_external_project before insert or update of project_id,status on public.surat_reservations
for each row execute function public.guard_active_external_project_selection();
drop trigger if exists guard_active_external_project on public.surat_registrasi;
create trigger guard_active_external_project before insert or update of project_id on public.surat_registrasi
for each row execute function public.guard_active_external_project_selection();
drop trigger if exists guard_active_external_project on public.letter_number_counter_configs;
create trigger guard_active_external_project before insert or update of project_id on public.letter_number_counter_configs
for each row execute function public.guard_active_external_project_selection();
revoke all on function public.guard_active_external_project_selection() from public,anon,authenticated;
revoke all on function public.guard_external_master_project_write() from public,anon,authenticated;

create index if not exists master_projects_active_external_office_idx on public.master_projects(office_id)
where marison_project_id>0 and marison_synced_at is not null and local_retired_at is null;
comment on column public.master_projects.local_retired_at is
  'Retired local-only identity. Retained for historical document/reservation/counter references; never offered for new submissions.';
notify pgrst,'reload schema';
commit;
