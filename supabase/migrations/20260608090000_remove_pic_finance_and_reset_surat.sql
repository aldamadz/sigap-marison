-- SIGAP is an approval-only system. Downstream SPK/payment processing belongs
-- to department systems and is intentionally removed from this database.

drop view if exists public.surat_external_export;

drop policy if exists "PIC can view dept surat" on public.surat_registrasi;
drop policy if exists "Allow authenticated select" on public.surat_registrasi;
drop policy if exists "Users can view related registration" on public.surat_registrasi;
drop policy if exists "Users can view readable surat attachments" on public.surat_attachments;
drop policy if exists "Users can view readable PDF jobs" on public.document_pdf_jobs;

create policy "Participants and admins can view surat"
on public.surat_registrasi
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.surat_signatures ss
    where ss.surat_id = surat_registrasi.id
      and ss.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

-- Remove all transaction history while preserving users, agenda, templates,
-- forms, presets, workflow matrices, departments, offices, and projects.
truncate table
  public.file_view_tokens,
  public.document_pdf_jobs,
  public.surat_attachments,
  public.surat_signatures,
  public.surat_chats,
  public.finance_reviews,
  public.surat_registrasi,
  public.surat_reservations
restart identity cascade;

delete from public.notifications;
delete from public.activity_logs
where table_name in (
  'surat_registrasi',
  'surat_signatures',
  'surat_attachments',
  'surat_chats',
  'finance_reviews',
  'master_dept_pics'
);

drop table if exists public.surat_chats cascade;
drop table if exists public.finance_reviews cascade;
drop table if exists public.master_dept_pics cascade;

drop function if exists public.finance_take_action(uuid, text, text, text);
drop function if exists public.is_surat_department_pic(uuid, uuid) cascade;
drop function if exists public.mark_pic_chats_read_bulk(uuid[]);
drop function if exists public.pic_close_chat(uuid, uuid);
drop function if exists public.pic_open_chat(uuid, uuid);
drop function if exists public.pic_take_action(uuid, uuid, text, text);
drop function if exists public.pic_to_finance(uuid, uuid, text);
drop function if exists public.check_chat_before_insert();
drop function if exists public.fn_chat_force_unread();

alter table public.surat_registrasi
  drop column if exists pic_id,
  drop column if exists pic_attachment,
  drop column if exists pic_action_at,
  drop column if exists pic_action_by,
  drop column if exists pic_review_status,
  drop column if exists pic_note,
  drop column if exists chat_status,
  drop column if exists chat_opened_at,
  drop column if exists chat_closed_at;

create policy "Participants and admins can view surat attachments"
on public.surat_attachments
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = surat_attachments.surat_id
      and (
        sr.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures ss
          where ss.surat_id = sr.id
            and ss.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  )
);

create policy "Participants and admins can view PDF jobs"
on public.document_pdf_jobs
for select
to authenticated
using (
  requested_by = auth.uid()
  or exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = document_pdf_jobs.surat_id
      and (
        sr.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures ss
          where ss.surat_id = sr.id
            and ss.user_id = auth.uid()
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  )
);

create or replace function public.handle_approve_surat_v2(
  p_sig_id uuid,
  p_surat_id uuid,
  p_note text,
  p_file_path text
)
returns json
language plpgsql
security definer
set search_path = public
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
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  select sr.current_step, sr.created_by, sr.no_surat, sr.judul_surat
  into v_current_step, v_created_by, v_no_surat, v_judul_surat
  from public.surat_registrasi sr
  where sr.id = p_surat_id
  for update;

  if not found then
    raise exception 'Surat tidak ditemukan';
  end if;

  select ss.step_order
  into v_signature_step
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

  update public.surat_signatures
  set is_signed = true,
      signed_at = now(),
      catatan = p_note,
      file_path_snap = p_file_path,
      status = 'APPROVED'
  where id = p_sig_id;

  select count(*)
  into v_total_steps
  from public.surat_signatures
  where surat_id = p_surat_id;

  if v_current_step >= v_total_steps then
    update public.surat_registrasi
    set file_path = p_file_path,
        status = 'DONE',
        updated_at = now()
    where id = p_surat_id;
    v_is_done := true;
  else
    update public.surat_registrasi
    set file_path = p_file_path,
        current_step = v_current_step + 1,
        updated_at = now()
    where id = p_surat_id;
  end if;

  if v_is_done and v_created_by is not null then
    insert into public.notifications (user_id, type, title, message, data, link)
    values (
      v_created_by,
      'success',
      'Dokumen Selesai Disetujui',
      'Dokumen "' || coalesce(v_judul_surat, '') || '" (' || coalesce(v_no_surat, '') || ') telah menyelesaikan seluruh tahap persetujuan.',
      jsonb_build_object(
        'surat_id', p_surat_id,
        'no_surat', v_no_surat,
        'judul', v_judul_surat,
        'file_path', p_file_path
      ),
      '/surat/monitoring'
    );
  end if;

  return json_build_object('success', true, 'isDone', v_is_done);
end;
$$;

revoke all on function public.handle_approve_surat_v2(uuid, uuid, text, text) from public;
grant execute on function public.handle_approve_surat_v2(uuid, uuid, text, text) to authenticated;
grant execute on function public.handle_approve_surat_v2(uuid, uuid, text, text) to service_role;

create or replace function public.get_department_kpi_summary(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_dept_id uuid default null,
  p_letter_type_id uuid default null,
  p_form_id uuid default null,
  p_status text default null
)
returns table (
  dept_id uuid,
  dept_name text,
  dept_code text,
  total_count integer,
  completed_count integer,
  pending_count integer,
  rejected_count integer,
  on_time_count integer,
  late_count integer,
  avg_minutes numeric,
  sla_minutes integer,
  worst_pending_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_profile as (
    select id, role
    from public.profiles
    where id = auth.uid()
  ),
  signature_scope as (
    select
      ss.id,
      ss.surat_id,
      ss.user_id,
      ss.status,
      ss.is_signed,
      ss.signed_at,
      ss.step_order,
      coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) as started_at,
      sr.letter_type_id,
      mf.id as form_id,
      coalesce(
        case
          when (ss.signer_snapshot->>'department_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (ss.signer_snapshot->>'department_id')::uuid
          else null
        end,
        signer_profile.department_id
      ) as responsible_dept_id
    from public.surat_signatures ss
    join public.surat_registrasi sr on sr.id = ss.surat_id
    left join lateral (
      select max(signed_at) as signed_at
      from public.surat_signatures previous
      where previous.surat_id = ss.surat_id
        and previous.step_order = ss.step_order - 1
        and previous.is_signed = true
    ) prev_sig on true
    left join public.profiles signer_profile on signer_profile.id = ss.user_id
    left join public.master_penggunaan_detail mpd on mpd.id = sr.penggunaan_id
    left join public.master_forms mf on mf.id = mpd.form_id
    where (p_from is null or coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) >= p_from)
      and (p_to is null or coalesce(ss.available_at, prev_sig.signed_at, sr.created_at) < p_to)
      and (p_letter_type_id is null or sr.letter_type_id = p_letter_type_id)
      and (p_form_id is null or mf.id = p_form_id)
  ),
  authorized_scope as (
    select s.*
    from signature_scope s
    cross join current_profile cp
    where cp.role = 'admin'
       or s.user_id = cp.id
  ),
  measured as (
    select
      s.*,
      d.name as dept_name,
      d.code as dept_code,
      coalesce(k.sla_minutes, 120) as sla_minutes,
      public.calculate_business_minutes(
        s.started_at,
        coalesce(s.signed_at, now()),
        coalesce(k.work_days, array[1,2,3,4,5]),
        coalesce(k.work_start, time '08:00'),
        coalesce(k.work_end, time '17:00'),
        coalesce(k.break_start, time '12:00'),
        coalesce(k.break_end, time '13:00'),
        coalesce(k.timezone, 'Asia/Jakarta')
      ) as elapsed_minutes,
      case
        when s.is_signed = true and coalesce(s.status, '') = 'REJECTED' then 'rejected'
        when s.is_signed = true then 'completed'
        else 'pending'
      end as kpi_status
    from authorized_scope s
    left join public.master_departments d on d.id = s.responsible_dept_id
    left join public.department_kpi_configs k on k.dept_id = s.responsible_dept_id and k.is_active = true
    where s.responsible_dept_id is not null
      and (p_dept_id is null or s.responsible_dept_id = p_dept_id)
  ),
  filtered as (
    select *
    from measured
    where p_status is null
       or p_status = 'all'
       or (p_status = 'pending' and kpi_status = 'pending')
       or (p_status = 'completed' and kpi_status = 'completed')
       or (p_status = 'rejected' and kpi_status = 'rejected')
       or (p_status = 'late' and elapsed_minutes > sla_minutes)
       or (p_status = 'on_time' and elapsed_minutes <= sla_minutes)
  )
  select
    responsible_dept_id as dept_id,
    dept_name,
    dept_code,
    count(*)::integer as total_count,
    count(*) filter (where kpi_status = 'completed')::integer as completed_count,
    count(*) filter (where kpi_status = 'pending')::integer as pending_count,
    count(*) filter (where kpi_status = 'rejected')::integer as rejected_count,
    count(*) filter (where elapsed_minutes <= sla_minutes)::integer as on_time_count,
    count(*) filter (where elapsed_minutes > sla_minutes)::integer as late_count,
    round(avg(elapsed_minutes), 1) as avg_minutes,
    max(sla_minutes)::integer as sla_minutes,
    coalesce(max(elapsed_minutes) filter (where kpi_status = 'pending'), 0)::integer as worst_pending_minutes
  from filtered
  group by responsible_dept_id, dept_name, dept_code
  order by
    case when count(*) = 0 then 0 else (count(*) filter (where elapsed_minutes <= sla_minutes)::numeric / count(*)) end desc,
    late_count asc,
    dept_name asc;
$$;

grant execute on function public.get_department_kpi_summary(timestamptz, timestamptz, uuid, uuid, uuid, text) to authenticated;

create view public.surat_external_export
with (security_invoker = true)
as
select
  sr.id,
  sr.no_surat,
  sr.judul_surat,
  sr.status,
  sr.current_step,
  sr.created_at,
  sr.updated_at,
  sr.request_place,
  sr.request_date,
  concat_ws(', ', nullif(sr.request_place, ''), to_char(sr.request_date::timestamptz, 'FMDD TMMonth YYYY')) as request_place_date,
  sr.requester_nik,
  sr.requester_snapshot->>'full_name' as requester_name,
  sr.requester_snapshot->>'job_title' as requester_job_title,
  sr.requester_snapshot->>'email' as requester_email,
  sr.location_snapshot->'entity'->>'code' as entity_code,
  sr.location_snapshot->'entity'->>'name' as entity_name,
  sr.location_snapshot->'office'->>'code' as office_code,
  sr.location_snapshot->'office'->>'name' as office_name,
  sr.location_snapshot->'office'->>'kedudukan' as office_kedudukan,
  sr.location_snapshot->'project'->>'code' as project_code,
  sr.location_snapshot->'project'->>'name' as project_name,
  sr.location_snapshot->'department'->>'code' as department_code,
  sr.location_snapshot->'department'->>'name' as department_name,
  sr.location_snapshot->'form'->>'nama_form' as form_name,
  sr.location_snapshot->'form'->>'nomor_form' as form_number,
  sr.form_input_data,
  sr.form_input_data->'items' as detail_barang,
  sr.form_input_data->'requested_project' as requested_project,
  sr.form_input_data->>'requested_unit_count' as requested_unit_count,
  sr.form_input_data->'allocated_units' as allocated_units,
  sr.form_input_data->>'allocated_unit_count' as allocated_unit_count,
  sr.form_input_data->>'catatan' as catatan,
  sr.file_path,
  sr.pdf_path,
  sr.data_snapshot,
  coalesce(sig.signatures, '[]'::jsonb) as signatures,
  coalesce(att.attachments, '[]'::jsonb) as attachments
from public.surat_registrasi sr
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', ss.id,
      'user_id', ss.user_id,
      'name', coalesce(ss.signer_snapshot->>'full_name', p.full_name),
      'nik', coalesce(ss.signer_snapshot->>'nik', p.nik),
      'job_title', coalesce(ss.signer_snapshot->>'job_title', p.job_title),
      'role_name', ss.role_name,
      'label_jabatan', ss.label_jabatan,
      'step_order', ss.step_order,
      'status', ss.status,
      'is_signed', ss.is_signed,
      'signed_at', ss.signed_at,
      'catatan', ss.catatan,
      'requires_unit_allocation', ss.requires_unit_allocation,
      'pdf_path_snap', ss.pdf_path_snap
    )
    order by ss.step_order
  ) as signatures
  from public.surat_signatures ss
  left join public.profiles p on p.id = ss.user_id
  where ss.surat_id = sr.id
) sig on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', sa.id,
      'file_url', sa.file_url,
      'file_name', sa.file_name,
      'file_type', sa.file_type,
      'file_size', sa.file_size,
      'stage', sa.stage,
      'requirement_key', sa.requirement_key,
      'requirement_label', sa.requirement_label,
      'signature_id', sa.signature_id,
      'created_at', sa.created_at
    )
    order by sa.created_at
  ) as attachments
  from public.surat_attachments sa
  where sa.surat_id = sr.id
) att on true;

revoke all on public.surat_external_export from anon, authenticated;
grant select on public.surat_external_export to service_role;
