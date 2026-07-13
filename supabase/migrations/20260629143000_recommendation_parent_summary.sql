create or replace function public.get_recommendation_parent_summary(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null then
    raise exception 'Sesi login tidak tersedia.';
  end if;

  select jsonb_build_object(
    'task_id', task.id,
    'parent_surat_id', parent.id,
    'no_surat', parent.no_surat,
    'judul_surat', parent.judul_surat,
    'requester_name', requester.full_name,
    'requester_job_title', requester.job_title,
    'department_name', department.name,
    'department_code', department.code,
    'office_name', office.name,
    'office_kedudukan', office.kedudukan,
    'project_name', project.name,
    'request_place', parent.request_place,
    'request_date', parent.request_date,
    'request_category', parent.form_input_data->>'request_category',
    'form_input_data', coalesce(parent.form_input_data, '{}'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'file_name', attachment.file_name,
          'file_type', attachment.file_type,
          'file_size', attachment.file_size,
          'requirement_label', attachment.requirement_label
        )
        order by attachment.created_at
      )
      from public.surat_attachments attachment
      where attachment.surat_id = parent.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.surat_recommendation_tasks task
  join public.surat_registrasi parent on parent.id = task.parent_surat_id
  left join public.profiles requester on requester.id = parent.created_by
  left join public.master_departments department on department.id = parent.dept_id
  left join public.master_offices office on office.id = parent.office_id
  left join public.master_projects project on project.id = parent.project_id
  where task.id = p_task_id
    and task.status in ('waiting', 'claimed')
    and (
      task.claimed_by = v_actor
      or public.is_recommendation_task_candidate(task.id, v_actor)
    );

  if v_result is null then
    raise exception 'Tugas rekomendasi tidak ditemukan atau tidak dapat Anda akses.';
  end if;

  return v_result;
end;
$$;

revoke all on function public.get_recommendation_parent_summary(uuid) from public, anon;
grant execute on function public.get_recommendation_parent_summary(uuid) to authenticated, service_role;

