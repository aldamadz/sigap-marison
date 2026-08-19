-- Parent approval rotates surat_registrasi.file_path on every signature. That
-- transport/source pointer is not recommendation content and must not stale an
-- already published recommendation PDF.
create or replace function public.recommendation_pdf_render_payload(
  p_surat_id uuid,
  p_source_file_path text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', 1,
    'workbook_source', jsonb_build_object('bucket', 'dokumen_surat', 'path', p_source_file_path),
    'child_input', jsonb_strip_nulls(jsonb_build_object(
      'recommendation_multi_detail', c.form_input_data->'recommendation_multi_detail',
      'recommendation_items', c.form_input_data->'recommendation_items',
      'recommendation', c.form_input_data->'recommendation',
      'items', c.form_input_data->'items'
    )),
    'child_snapshot_input', jsonb_strip_nulls(jsonb_build_object(
      'recommendation_multi_detail', c.data_snapshot#>'{input,recommendation_multi_detail}',
      'recommendation_items', c.data_snapshot#>'{input,recommendation_items}',
      'recommendation', c.data_snapshot#>'{input,recommendation}',
      'items', c.data_snapshot#>'{input,items}'
    )),
    'parent_input', coalesce(p.form_input_data, '{}'::jsonb),
    'attachment_refs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'file_url', a.file_url,
        'file_size', a.file_size,
        'file_type', a.file_type
      ) order by a.id)
      from public.surat_attachments a
      where a.surat_id = c.id
    ), '[]'::jsonb)
  )
  from public.surat_registrasi c
  join public.surat_linked_documents l
    on l.child_surat_id = c.id
   and l.link_type = 'recommendation'
   and l.status = 'active'
  join public.surat_registrasi p on p.id = l.parent_surat_id
  where c.id = p_surat_id
    and c.file_path = p_source_file_path
$$;

create or replace function public.recommendation_pdf_is_current(p_child_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.surat_registrasi c
    join public.document_pdf_jobs j
      on j.surat_id = c.id
     and j.signature_id is null
    cross join lateral (
      select public.recommendation_pdf_render_payload(c.id, c.file_path) as render_payload
    ) current_render
    where c.id = p_child_surat_id
      and upper(coalesce(c.status::text, '')) in ('DONE', 'SELESAI', 'COMPLETED')
      and nullif(btrim(coalesce(c.pdf_path, '')), '') is not null
      and j.status = 'done'
      and j.source_file_path = c.file_path
      and j.pdf_url = c.pdf_path
      and c.pdf_bucket is not null
      and c.pdf_object_path is not null
      and c.pdf_storage_origin is not null
      and j.pdf_bucket = c.pdf_bucket
      and j.pdf_object_path = c.pdf_object_path
      and j.pdf_storage_origin = c.pdf_storage_origin
      and (j.render_payload - 'parent_workbook_source')
        = (current_render.render_payload - 'parent_workbook_source')
      and j.recommendation_content_fingerprint
        = public.recommendation_content_fingerprint(j.render_payload)
  )
$$;

create or replace function public.guard_recommendation_child_final_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(coalesce(old.status::text, '')) not in ('DONE', 'SELESAI', 'COMPLETED')
     and upper(coalesce(new.status::text, '')) in ('DONE', 'SELESAI', 'COMPLETED')
     and exists (
       select 1
       from public.surat_linked_documents l
       where l.child_surat_id = new.id
         and l.link_type = 'recommendation'
         and l.status = 'active'
     )
     and not exists (
       select 1
       from public.document_pdf_jobs j
       cross join lateral (
         select public.recommendation_pdf_render_payload(new.id, new.file_path) as render_payload
       ) current_render
       where j.surat_id = new.id
         and j.signature_id is null
         and j.status = 'done'
         and j.source_file_path = new.file_path
         and j.pdf_url = new.pdf_path
         and new.pdf_bucket is not null
         and new.pdf_object_path is not null
         and new.pdf_storage_origin is not null
         and j.pdf_bucket = new.pdf_bucket
         and j.pdf_object_path = new.pdf_object_path
         and j.pdf_storage_origin = new.pdf_storage_origin
         and (j.render_payload - 'parent_workbook_source')
           = (current_render.render_payload - 'parent_workbook_source')
         and j.recommendation_content_fingerprint
           = public.recommendation_content_fingerprint(j.render_payload)
     ) then
    raise exception 'Dokumen rekomendasi hanya dapat selesai melalui publikasi PDF canonical.' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.enqueue_recommendation_pdf_job(
  p_surat_id uuid,
  p_source_file_path text,
  p_requested_by uuid,
  p_refresh boolean default false
)
returns public.document_pdf_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.document_pdf_jobs;
  v_fingerprint text;
  v_payload jsonb;
begin
  if not exists (
    select 1
    from public.surat_registrasi c
    where c.id = p_surat_id
      and c.file_path = p_source_file_path
      and upper(coalesce(c.status::text, '')) in ('PDF_PENDING', 'DONE', 'SELESAI', 'COMPLETED')
      and exists (
        select 1
        from public.surat_linked_documents l
        where l.child_surat_id = c.id
          and l.link_type = 'recommendation'
          and l.status = 'active'
      )
  ) then
    raise exception 'Surat rekomendasi belum final, tidak tertaut, atau source sudah berubah.' using errcode = '55000';
  end if;

  v_payload := public.recommendation_pdf_render_payload(p_surat_id, p_source_file_path);
  if v_payload is null then
    raise exception 'Snapshot render rekomendasi tidak ditemukan.' using errcode = 'P0002';
  end if;
  v_fingerprint := public.recommendation_content_fingerprint(v_payload);

  if not p_refresh then
    select j.*
    into v_job
    from public.document_pdf_jobs j
    join public.surat_registrasi c on c.id = j.surat_id
    where j.surat_id = p_surat_id
      and j.signature_id is null
      and j.source_file_path = p_source_file_path
      and (j.render_payload - 'parent_workbook_source')
        = (v_payload - 'parent_workbook_source')
      and j.recommendation_content_fingerprint
        = public.recommendation_content_fingerprint(j.render_payload)
      and j.status = 'done'
      and nullif(btrim(coalesce(j.pdf_url, '')), '') is not null
      and j.pdf_url = c.pdf_path
      and j.pdf_bucket = c.pdf_bucket
      and j.pdf_object_path = c.pdf_object_path
      and j.pdf_storage_origin = c.pdf_storage_origin
      and c.pdf_bucket is not null
      and c.pdf_object_path is not null
      and c.pdf_storage_origin is not null
    order by j.finished_at desc nulls last, j.created_at desc, j.id desc
    limit 1;
    if found then
      return v_job;
    end if;
  end if;

  select *
  into v_job
  from public.document_pdf_jobs
  where surat_id = p_surat_id
    and signature_id is null
    and source_file_path = p_source_file_path
    and recommendation_content_fingerprint = v_fingerprint
    and status in ('queued', 'processing')
  order by created_at desc, id desc
  limit 1
  for update;
  if found then
    return v_job;
  end if;

  insert into public.document_pdf_jobs (
    surat_id,
    signature_id,
    source_file_path,
    status,
    requested_by,
    refresh,
    recommendation_content_fingerprint,
    render_payload
  ) values (
    p_surat_id,
    null,
    p_source_file_path,
    'queued',
    p_requested_by,
    p_refresh,
    v_fingerprint,
    v_payload
  )
  returning * into v_job;
  return v_job;
exception
  when unique_violation then
    select *
    into v_job
    from public.document_pdf_jobs
    where surat_id = p_surat_id
      and signature_id is null
      and source_file_path = p_source_file_path
      and recommendation_content_fingerprint = v_fingerprint
      and status in ('queued', 'processing')
    order by created_at desc, id desc
    limit 1;
    if not found then
      raise;
    end if;
    return v_job;
end;
$$;

revoke all on function public.recommendation_pdf_render_payload(uuid, text) from public, anon, authenticated;
grant execute on function public.recommendation_pdf_render_payload(uuid, text) to service_role;
revoke all on function public.recommendation_pdf_is_current(uuid) from public, anon, authenticated;
grant execute on function public.recommendation_pdf_is_current(uuid) to service_role;
revoke all on function public.enqueue_recommendation_pdf_job(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.enqueue_recommendation_pdf_job(uuid, text, uuid, boolean) to service_role;
