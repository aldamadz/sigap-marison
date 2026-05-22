alter table public.surat_registrasi
  add column if not exists data_snapshot jsonb not null default '{}'::jsonb;

alter table public.surat_signatures
  add column if not exists label_jabatan text,
  add column if not exists signer_snapshot jsonb not null default '{}'::jsonb;

create index if not exists idx_surat_data_snapshot on public.surat_registrasi using gin(data_snapshot);
create index if not exists idx_surat_signatures_signer_snapshot on public.surat_signatures using gin(signer_snapshot);

create or replace view public.surat_external_export as
select
  sr.id,
  sr.no_surat,
  sr.judul_surat,
  sr.status,
  sr.pic_review_status,
  sr.current_step,
  sr.created_at,
  sr.updated_at,
  sr.request_place,
  sr.request_date,
  concat_ws(', ', nullif(sr.request_place, ''), to_char(sr.request_date, 'FMDD TMMonth YYYY')) as request_place_date,
  sr.requester_nik,
  sr.requester_snapshot ->> 'full_name' as requester_name,
  sr.requester_snapshot ->> 'job_title' as requester_job_title,
  sr.requester_snapshot ->> 'email' as requester_email,
  sr.location_snapshot -> 'entity' ->> 'code' as entity_code,
  sr.location_snapshot -> 'entity' ->> 'name' as entity_name,
  sr.location_snapshot -> 'office' ->> 'code' as office_code,
  sr.location_snapshot -> 'office' ->> 'name' as office_name,
  sr.location_snapshot -> 'office' ->> 'kedudukan' as office_kedudukan,
  sr.location_snapshot -> 'project' ->> 'code' as project_code,
  sr.location_snapshot -> 'project' ->> 'name' as project_name,
  sr.location_snapshot -> 'department' ->> 'code' as department_code,
  sr.location_snapshot -> 'department' ->> 'name' as department_name,
  sr.location_snapshot -> 'form' ->> 'nama_form' as form_name,
  sr.location_snapshot -> 'form' ->> 'nomor_form' as form_number,
  sr.form_input_data,
  sr.form_input_data -> 'items' as detail_barang,
  sr.form_input_data ->> 'catatan' as catatan,
  sr.file_path,
  sr.pdf_path,
  sr.pic_attachment,
  sr.data_snapshot,
  coalesce(sig.signatures, '[]'::jsonb) as signatures,
  coalesce(att.attachments, '[]'::jsonb) as attachments,
  coalesce(fin.finance_reviews, '[]'::jsonb) as finance_reviews
from public.surat_registrasi sr
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', ss.id,
      'user_id', ss.user_id,
      'name', coalesce(ss.signer_snapshot ->> 'full_name', p.full_name),
      'nik', coalesce(ss.signer_snapshot ->> 'nik', p.nik),
      'job_title', coalesce(ss.signer_snapshot ->> 'job_title', p.job_title),
      'role_name', ss.role_name,
      'label_jabatan', ss.label_jabatan,
      'step_order', ss.step_order,
      'status', ss.status,
      'is_signed', ss.is_signed,
      'signed_at', ss.signed_at,
      'catatan', ss.catatan,
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
      'created_at', sa.created_at
    )
    order by sa.created_at
  ) as attachments
  from public.surat_attachments sa
  where sa.surat_id = sr.id
) att on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'id', fr.id,
      'status', fr.status,
      'note', fr.note,
      'payment_file_path', fr.payment_file_path,
      'action_at', fr.action_at
    )
    order by fr.created_at
  ) as finance_reviews
  from public.finance_reviews fr
  where fr.surat_id = sr.id
) fin on true;

comment on column public.surat_registrasi.data_snapshot is 'Complete structured snapshot of the surat payload for downstream systems.';
comment on column public.surat_signatures.signer_snapshot is 'Signer profile snapshot captured when the surat is registered.';
comment on column public.surat_signatures.label_jabatan is 'Display job/approval label from workflow configuration.';
comment on view public.surat_external_export is 'Read model for external systems containing surat metadata, requester, location, items, signers, attachments, and finance data.';
