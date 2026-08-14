-- Keep recommendation PDF readiness independent from approval-stage attachments on the parent letter.
create or replace function public.recommendation_pdf_render_payload(p_surat_id uuid,p_source_file_path text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version',1,
    'workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p_source_file_path),
    'parent_workbook_source',jsonb_build_object('bucket','dokumen_surat','path',p.file_path),
    'child_input',jsonb_strip_nulls(jsonb_build_object(
      'recommendation_multi_detail',c.form_input_data->'recommendation_multi_detail',
      'recommendation_items',c.form_input_data->'recommendation_items',
      'recommendation',c.form_input_data->'recommendation',
      'items',c.form_input_data->'items'
    )),
    'child_snapshot_input',jsonb_strip_nulls(jsonb_build_object(
      'recommendation_multi_detail',c.data_snapshot#>'{input,recommendation_multi_detail}',
      'recommendation_items',c.data_snapshot#>'{input,recommendation_items}',
      'recommendation',c.data_snapshot#>'{input,recommendation}',
      'items',c.data_snapshot#>'{input,items}'
    )),
    'parent_input',coalesce(p.form_input_data,'{}'::jsonb),
    'attachment_refs',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'file_url',a.file_url,'file_size',a.file_size,'file_type',a.file_type
    ) order by a.id) from public.surat_attachments a where a.surat_id=c.id),'[]'::jsonb)
  )
  from public.surat_registrasi c
  join public.surat_linked_documents l on l.child_surat_id=c.id and l.link_type='recommendation' and l.status='active'
  join public.surat_registrasi p on p.id=l.parent_surat_id
  where c.id=p_surat_id and c.file_path=p_source_file_path
$$;

-- Existing final recommendations receive a fresh immutable PDF for the corrected fingerprint.
insert into public.document_pdf_jobs(
  surat_id,signature_id,source_file_path,status,requested_by,refresh,
  recommendation_content_fingerprint,render_payload
)
select c.id,null,c.file_path,'queued',c.created_by,true,
  public.recommendation_content_fingerprint(render.render_payload),render.render_payload
from public.surat_registrasi c
join public.surat_linked_documents l
  on l.child_surat_id=c.id and l.link_type='recommendation' and l.status='active'
cross join lateral (
  select public.recommendation_pdf_render_payload(c.id,c.file_path) render_payload
) render
where upper(coalesce(c.status::text,'')) in ('DONE','SELESAI','COMPLETED')
  and nullif(btrim(coalesce(c.file_path,'')),'') is not null
  and render.render_payload is not null
  and not public.recommendation_pdf_is_current(c.id)
  and not exists (
    select 1 from public.document_pdf_jobs j
    where j.surat_id=c.id and j.signature_id is null and j.source_file_path=c.file_path
      and j.recommendation_content_fingerprint=public.recommendation_content_fingerprint(render.render_payload)
      and j.status in ('queued','processing')
  );

revoke all on function public.recommendation_pdf_render_payload(uuid,text) from public,anon,authenticated;
grant execute on function public.recommendation_pdf_render_payload(uuid,text) to service_role;
