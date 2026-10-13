-- Parent signatures rotate their file pointer, not the recommendation's content.
-- Keep canonical PDF/source/storage/fingerprint checks; ignore only that pointer.
begin;

create or replace function public.recommendation_pdf_is_current(p_child_surat_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.surat_registrasi c
    join public.document_pdf_jobs j on j.surat_id = c.id and j.signature_id is null
    cross join lateral (
      select public.recommendation_pdf_render_payload(c.id, c.file_path) render_payload
    ) r
    where c.id = p_child_surat_id
      and upper(coalesce(c.status::text, '')) in ('DONE', 'SELESAI', 'COMPLETED')
      and nullif(btrim(coalesce(c.pdf_path, '')), '') is not null and j.status = 'done'
      and j.source_file_path = c.file_path and j.pdf_url = c.pdf_path
      and c.pdf_bucket is not null and c.pdf_object_path is not null and c.pdf_storage_origin is not null
      and j.pdf_bucket = c.pdf_bucket and j.pdf_object_path = c.pdf_object_path and j.pdf_storage_origin = c.pdf_storage_origin
      and (j.render_payload - 'parent_workbook_source') = (r.render_payload - 'parent_workbook_source')
      and j.recommendation_content_fingerprint = public.recommendation_content_fingerprint(j.render_payload)
  )
$$;

create or replace function public.guard_recommendation_child_final_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if upper(coalesce(old.status::text, '')) not in ('DONE', 'SELESAI', 'COMPLETED')
     and upper(coalesce(new.status::text, '')) in ('DONE', 'SELESAI', 'COMPLETED')
     and exists (select 1 from public.surat_linked_documents l
       where l.child_surat_id = new.id and l.link_type = 'recommendation' and l.status = 'active')
     and not exists (
       select 1 from public.document_pdf_jobs j
       cross join lateral (
         select public.recommendation_pdf_render_payload(new.id, new.file_path) render_payload
       ) r
       where j.surat_id = new.id and j.signature_id is null and j.status = 'done'
         and j.source_file_path = new.file_path and j.pdf_url = new.pdf_path
         and new.pdf_bucket is not null and new.pdf_object_path is not null and new.pdf_storage_origin is not null
         and j.pdf_bucket = new.pdf_bucket and j.pdf_object_path = new.pdf_object_path and j.pdf_storage_origin = new.pdf_storage_origin
         and (j.render_payload - 'parent_workbook_source') = (r.render_payload - 'parent_workbook_source')
         and j.recommendation_content_fingerprint = public.recommendation_content_fingerprint(j.render_payload)
     ) then
    raise exception 'Dokumen rekomendasi hanya dapat selesai melalui publikasi PDF canonical.' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- Preserve each environment's publisher and its lease/storage/status guards.
-- Fail closed if its reviewed content-comparison contract has drifted.
do $$
declare
  v_oid regprocedure := 'public.publish_document_pdf_job(uuid,text,text,text,uuid,text,text,text)'::regprocedure;
  v_definition text;
  v_before text := 'v_job.render_payload is distinct from v_payload or v_fingerprint is distinct from p_content_fingerprint';
  v_after text := '(v_job.render_payload - ''parent_workbook_source'') is distinct from (v_payload - ''parent_workbook_source'') or v_payload is null or public.recommendation_content_fingerprint(v_job.render_payload) is distinct from p_content_fingerprint';
begin
  select pg_get_functiondef(v_oid) into v_definition;
  if position(v_after in v_definition) > 0 then return; end if;
  if position(v_before in v_definition) = 0
     or position('v_job.lease_token is distinct from p_lease_token' in v_definition) = 0
     or position('v_surat.file_path is distinct from p_source_file_path' in v_definition) = 0 then
    raise exception 'Recommendation publisher differs from reviewed contract' using errcode = '55000';
  end if;
  execute replace(v_definition, v_before, v_after);
end;
$$;

commit;
