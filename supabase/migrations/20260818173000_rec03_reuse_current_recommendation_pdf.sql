-- Reuse an immutable current recommendation PDF unless an explicit refresh is requested.
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
      and j.recommendation_content_fingerprint = v_fingerprint
      and j.render_payload = v_payload
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

revoke all on function public.enqueue_recommendation_pdf_job(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.enqueue_recommendation_pdf_job(uuid, text, uuid, boolean) to service_role;
