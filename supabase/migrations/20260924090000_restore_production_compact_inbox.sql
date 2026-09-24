-- Restore the compact inbox contract omitted from the selective production release.
-- Keep get_compact_inbox_count intact: production has its newer implementation.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'compact_inbox_item'
  ) then
    create type public.compact_inbox_item as (
      id uuid,
      surat_id uuid,
      task_type text,
      no_surat text,
      judul_surat text,
      request_category text,
      requester_name text,
      requester_department text,
      requester_office text,
      current_step integer,
      step_order integer,
      role_name text,
      label_jabatan text,
      action_type text,
      requires_unit_allocation boolean,
      has_attachment_requirements boolean,
      verification_required boolean,
      verification_status text,
      surat_status text,
      available_at timestamptz,
      created_at timestamptz,
      request_date date,
      has_attachments boolean,
      has_linked_documents boolean,
      is_revision_task boolean
    );
  end if;
end;
$$;

create or replace function public.is_inbox_task_active(p_user_id uuid, p_signature_id uuid)
returns boolean
language sql stable security invoker
set search_path = public
as $$
  with sig as (
    select ss.id, ss.user_id, ss.step_order, ss.is_signed,
           ss.verification_required, ss.verification_status,
           ss.verifier_snapshot, sr.status as surat_status, sr.current_step
    from surat_signatures ss
    join surat_registrasi sr on sr.id = ss.surat_id
    where ss.id = p_signature_id
  ),
  revision_tasks as (
    select sre.surat_id, sre.target_type, sre.target_step
    from surat_revision_events sre
    join surat_signatures ss2 on ss2.surat_id = sre.surat_id
    where ss2.id = p_signature_id
      and sre.status in ('open', 'awaiting_requester')
      and p_user_id = any(sre.target_user_ids)
      and sre.target_type is distinct from 'requester'
  )
  select exists (
    select 1 from sig
    where not coalesce(sig.is_signed, false)
      and (
        (sig.user_id = p_user_id and sig.surat_status = 'PROSES' and sig.step_order = sig.current_step)
        or (sig.verification_required = true and sig.verification_status = 'pending'
            and sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
            and sig.surat_status = 'PROSES' and sig.step_order = sig.current_step)
        or (sig.user_id = p_user_id and sig.surat_status = 'MENUNGGU_PERBAIKAN'
            and exists (select 1 from revision_tasks rt where rt.target_type = 'signer' and rt.target_step = sig.step_order))
        or (sig.verification_required = true and sig.surat_status = 'MENUNGGU_PERBAIKAN'
            and sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
            and exists (select 1 from revision_tasks rt where rt.target_type = 'checker' and rt.target_step = sig.step_order))
      )
  );
$$;

create or replace function public.get_compact_inbox(
  p_user_id uuid,
  p_limit integer default 20,
  p_cursor_at timestamptz default null,
  p_cursor_task_type text default null,
  p_cursor_id uuid default null,
  p_search text default null,
  p_request_category text default null,
  p_task_type text default null
)
returns setof public.compact_inbox_item
language sql stable security invoker
set search_path = public
as $$
  with revision_tasks as (
    select sre.surat_id, sre.target_type, sre.target_step
    from surat_revision_events sre
    where sre.status in ('open', 'awaiting_requester')
      and p_user_id = any(sre.target_user_ids)
      and sre.target_type is distinct from 'requester'
  ),
  signer_rows as (
    select
      ss.id, sr.id as surat_id, 'approval'::text as task_type,
      sr.no_surat, sr.judul_surat,
      coalesce(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') as request_category,
      (sr.requester_snapshot->>'full_name') as requester_name,
      (sr.location_snapshot->'department'->>'name') as requester_department,
      (sr.location_snapshot->'office'->>'name') as requester_office,
      sr.current_step, ss.step_order, ss.role_name, ss.label_jabatan, ss.action_type,
      coalesce(ss.requires_unit_allocation, false) as requires_unit_allocation,
      (jsonb_array_length(coalesce(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0) as has_attachment_requirements,
      ss.verification_required, ss.verification_status, sr.status as surat_status,
      coalesce(ss.available_at, sr.created_at) as available_at, sr.created_at, sr.request_date,
      exists (select 1 from surat_attachments sa where sa.surat_id = sr.id limit 1) as has_attachments,
      exists (select 1 from surat_linked_documents sld where sld.parent_surat_id = sr.id limit 1) as has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') as is_revision_task
    from surat_signatures ss
    join surat_registrasi sr on sr.id = ss.surat_id
    where ss.user_id = p_user_id
      and not coalesce(ss.is_signed, false)
      and (p_task_type is null or p_task_type = 'approval')
      and (
        (sr.status = 'PROSES' and ss.step_order = sr.current_step)
        or (sr.status = 'MENUNGGU_PERBAIKAN' and exists (
          select 1 from revision_tasks rt
          where rt.surat_id = sr.id and rt.target_type = 'signer' and rt.target_step = ss.step_order
        ))
      )
  ),
  verifier_rows as (
    select
      ss.id, sr.id as surat_id, 'verification'::text as task_type,
      sr.no_surat, sr.judul_surat,
      coalesce(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') as request_category,
      (sr.requester_snapshot->>'full_name') as requester_name,
      (sr.location_snapshot->'department'->>'name') as requester_department,
      (sr.location_snapshot->'office'->>'name') as requester_office,
      sr.current_step, ss.step_order, ss.role_name, ss.label_jabatan, ss.action_type,
      coalesce(ss.requires_unit_allocation, false) as requires_unit_allocation,
      (jsonb_array_length(coalesce(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0) as has_attachment_requirements,
      ss.verification_required, ss.verification_status, sr.status as surat_status,
      coalesce(ss.available_at, sr.created_at) as available_at, sr.created_at, sr.request_date,
      exists (select 1 from surat_attachments sa where sa.surat_id = sr.id limit 1) as has_attachments,
      exists (select 1 from surat_linked_documents sld where sld.parent_surat_id = sr.id limit 1) as has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') as is_revision_task
    from surat_signatures ss
    join surat_registrasi sr on sr.id = ss.surat_id
    where not coalesce(ss.is_signed, false)
      and ss.verification_required = true
      and ss.verification_status = 'pending'
      and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      and (p_task_type is null or p_task_type = 'verification')
      and (
        (sr.status = 'PROSES' and ss.step_order = sr.current_step)
        or (sr.status = 'MENUNGGU_PERBAIKAN' and exists (
          select 1 from revision_tasks rt
          where rt.surat_id = sr.id and rt.target_type = 'checker' and rt.target_step = ss.step_order
        ))
      )
  ),
  combined as (
    select * from signer_rows
    union all
    select * from verifier_rows
  ),
  filtered as (
    select * from combined
    where (p_request_category is null or p_request_category = '' or request_category = p_request_category)
      and (p_search is null or p_search = '' or (
        judul_surat ilike '%' || p_search || '%'
        or no_surat ilike '%' || p_search || '%'
        or requester_name ilike '%' || p_search || '%'
        or requester_department ilike '%' || p_search || '%'
      ))
  ),
  paginated as (
    select * from filtered
    where (p_cursor_at is null or (available_at, task_type, id) > (p_cursor_at, p_cursor_task_type, p_cursor_id))
    order by available_at asc, task_type asc, id asc
    limit p_limit + 1
  )
  select * from paginated;
$$;

revoke execute on function public.is_inbox_task_active(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.is_inbox_task_active(uuid, uuid) to service_role;
grant execute on function public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) to service_role;
