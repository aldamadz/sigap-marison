-- SUR-13: organization-scoped monitoring and deterministic yearly numbering.
-- Requester auto-approval intentionally remains in the application service so it
-- uses the canonical approval path (document stamp, audit, PDF, and notification).

create or replace function public.can_monitor_surat_scope(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.surat_registrasi surat
    join public.master_offices surat_office on surat_office.id = surat.office_id
    join public.profiles actor_profile on actor_profile.id = auth.uid()
    join public.master_offices actor_office on actor_office.id = actor_profile.office_id
    where surat.id = p_surat_id
      and coalesce(actor_profile.is_active, true) = true
      and actor_profile.deleted_at is null
      and (
        lower(coalesce(actor_profile.role::text, '')) in ('admin', 'super_admin')
        or public.can_read_surat(surat.id)
        or (
          actor_office.kedudukan = 'Pusat'
          and surat_office.kedudukan = 'Pusat'
          and actor_profile.department_id is not null
          and coalesce(surat.represented_department_id, surat.dept_id) = actor_profile.department_id
        )
        or (
          actor_office.kedudukan <> 'Pusat'
          and surat_office.kedudukan <> 'Pusat'
          and surat.office_id = actor_profile.office_id
        )
      )
  );
$$;

revoke all on function public.can_monitor_surat_scope(uuid) from public, anon;
grant execute on function public.can_monitor_surat_scope(uuid) to authenticated, service_role;

create or replace function public.get_surat_monitoring_page(
  p_limit integer default 24,
  p_offset integer default 0,
  p_search text default null,
  p_status text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select surat.*
    from public.surat_registrasi surat
    where public.can_monitor_surat_scope(surat.id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or surat.judul_surat ilike '%' || btrim(p_search) || '%'
        or surat.no_surat ilike '%' || btrim(p_search) || '%'
      )
      and (
        nullif(btrim(coalesce(p_status, '')), '') is null
        or lower(p_status) = 'all'
        or (upper(p_status) = 'SELESAI' and surat.status in ('SELESAI', 'DONE'))
        or (upper(p_status) in ('DITOLAK', 'REJECTED') and surat.status in ('DITOLAK', 'REJECTED'))
        or (upper(p_status) = 'PROSES' and surat.status in ('PROSES', 'PENDING', 'IN_PROGRESS'))
        or surat.status = p_status
      )
      and (p_date_from is null or surat.created_at >= p_date_from)
      and (p_date_to is null or surat.created_at < p_date_to)
  ),
  page as (
    select surat.*
    from filtered surat
    order by surat.created_at desc, surat.id desc
    limit least(greatest(coalesce(p_limit, 24), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', surat.id,
          'no_surat', surat.no_surat,
          'judul_surat', surat.judul_surat,
          'status', surat.status,
          'current_step', surat.current_step,
          'created_at', surat.created_at,
          'updated_at', surat.updated_at,
          'created_by', surat.created_by,
          'can_read_document', public.can_read_surat(surat.id),
          'file_path', case when public.can_read_surat(surat.id) then surat.file_path else null end,
          'lampiran_path', case when public.can_read_surat(surat.id) then surat.lampiran_path else null end,
          'surat_signatures', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', signature.id,
                'step_order', signature.step_order,
                'is_signed', signature.is_signed,
                'status', signature.status,
                'role_name', signature.role_name,
                'label_jabatan', signature.label_jabatan,
                'signed_at', signature.signed_at,
                'catatan', signature.catatan,
                'profiles', jsonb_build_object(
                  'full_name', signer.full_name,
                  'job_title', signer.job_title
                )
              ) order by signature.step_order, signature.id
            )
            from public.surat_signatures signature
            left join public.profiles signer on signer.id = signature.user_id
            where signature.surat_id = surat.id
          ), '[]'::jsonb)
        ) order by surat.created_at desc, surat.id desc
      )
      from page surat
    ), '[]'::jsonb),
    'count', (select count(*) from filtered)
  );
$$;

revoke all on function public.get_surat_monitoring_page(integer, integer, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_surat_monitoring_page(integer, integer, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.get_surat_monitoring_detail(p_surat_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
      when public.can_read_surat(surat.id) then to_jsonb(surat)
      else jsonb_build_object(
        'id', surat.id,
        'no_surat', surat.no_surat,
        'judul_surat', surat.judul_surat,
        'status', surat.status,
        'current_step', surat.current_step,
        'created_at', surat.created_at,
        'updated_at', surat.updated_at,
        'created_by', surat.created_by
      )
    end
    || jsonb_build_object(
      'can_read_document', public.can_read_surat(surat.id),
      'surat_signatures', coalesce((
        select jsonb_agg(
          to_jsonb(signature)
          || jsonb_build_object(
            'profiles', jsonb_build_object(
              'id', signer.id,
              'full_name', signer.full_name,
              'job_title', signer.job_title,
              'avatar_url', signer.avatar_url
            )
          ) order by signature.step_order, signature.id
        )
        from public.surat_signatures signature
        left join public.profiles signer on signer.id = signature.user_id
        where signature.surat_id = surat.id
      ), '[]'::jsonb),
      'surat_attachments', case
        when public.can_read_surat(surat.id) then coalesce((
          select jsonb_agg(to_jsonb(attachment) order by attachment.created_at, attachment.id)
          from public.surat_attachments attachment
          where attachment.surat_id = surat.id
        ), '[]'::jsonb)
        else '[]'::jsonb
      end
    )
  from public.surat_registrasi surat
  where surat.id = p_surat_id
    and public.can_monitor_surat_scope(surat.id);
$$;

revoke all on function public.get_surat_monitoring_detail(uuid) from public, anon;
grant execute on function public.get_surat_monitoring_detail(uuid) to authenticated;

create or replace function public.get_my_surat_monitoring_stats(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table(total bigint, selesai bigint, proses bigint, ditolak bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with classified as (
    select case
      when surat.status in ('REJECTED', 'DITOLAK')
        or exists (
          select 1 from public.surat_signatures signature
          where signature.surat_id = surat.id and signature.status = 'REJECTED'
        ) then 'ditolak'
      when surat.status in ('DONE', 'SELESAI')
        or (
          exists (select 1 from public.surat_signatures signature where signature.surat_id = surat.id)
          and not exists (
            select 1 from public.surat_signatures signature
            where signature.surat_id = surat.id and not coalesce(signature.is_signed, false)
          )
        ) then 'selesai'
      else 'proses'
    end as bucket
    from public.surat_registrasi surat
    where public.can_monitor_surat_scope(surat.id)
      and (p_date_from is null or surat.created_at >= p_date_from)
      and (p_date_to is null or surat.created_at < p_date_to)
  )
  select count(*)::bigint,
    count(*) filter (where bucket = 'selesai')::bigint,
    count(*) filter (where bucket = 'proses')::bigint,
    count(*) filter (where bucket = 'ditolak')::bigint
  from classified;
$$;

revoke all on function public.get_my_surat_monitoring_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_my_surat_monitoring_stats(timestamptz, timestamptz) to authenticated;

create or replace function public.enforce_surat_reservation_number_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan
  from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penomoran tidak ditemukan.' using errcode = '23503'; end if;

  if v_kedudukan = 'Pusat' then
    if new.dept_id is null or new.project_id is not null then
      raise exception 'Penomoran kantor pusat wajib per departemen tanpa scope proyek.' using errcode = '22023';
    end if;
  else
    if new.project_id is null or new.dept_id is not null then
      raise exception 'Penomoran kantor cabang wajib per proyek tanpa scope departemen.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.master_projects project
      where project.id = new.project_id and project.office_id = new.office_id
    ) then
      raise exception 'Proyek penomoran tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_reservation_number_scope on public.surat_reservations;
create trigger trg_enforce_surat_reservation_number_scope
before insert or update of office_id, project_id, dept_id, year
on public.surat_reservations
for each row execute function public.enforce_surat_reservation_number_scope();

create or replace function public.enforce_surat_registration_branch_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kedudukan text;
begin
  select office.kedudukan into v_kedudukan
  from public.master_offices office where office.id = new.office_id;
  if not found then raise exception 'Kantor penerbit tidak ditemukan.' using errcode = '23503'; end if;
  if v_kedudukan <> 'Pusat' then
    if new.project_id is null then
      raise exception 'Proyek wajib dipilih untuk pengajuan kantor cabang.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.master_projects project
      where project.id = new.project_id and project.office_id = new.office_id
    ) then
      raise exception 'Proyek pengajuan tidak berada pada kantor cabang yang dipilih.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_surat_registration_branch_project on public.surat_registrasi;
create trigger trg_enforce_surat_registration_branch_project
before insert or update of office_id, project_id
on public.surat_registrasi
for each row execute function public.enforce_surat_registration_branch_project();

create index if not exists idx_surat_registrasi_office_created_at
  on public.surat_registrasi(office_id, created_at desc);
create index if not exists idx_surat_registrasi_department_created_at
  on public.surat_registrasi(dept_id, created_at desc);
