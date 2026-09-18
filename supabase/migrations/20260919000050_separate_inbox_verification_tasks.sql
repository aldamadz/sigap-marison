-- A signer who is also assigned as a checker needs two independent inbox tasks.
-- Keep their shared signature ID for the approval APIs; task_type differentiates
-- the two queue records and remains part of the existing keyset cursor.

CREATE OR REPLACE FUNCTION public.get_compact_inbox(
  p_user_id          uuid,
  p_limit            integer DEFAULT 20,
  p_cursor_at        timestamptz DEFAULT NULL,
  p_cursor_task_type text        DEFAULT NULL,
  p_cursor_id        uuid        DEFAULT NULL,
  p_search           text        DEFAULT NULL,
  p_request_category text        DEFAULT NULL,
  p_task_type        text        DEFAULT NULL
)
RETURNS SETOF public.compact_inbox_item
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH revision_tasks AS (
    SELECT sre.surat_id, sre.target_type, sre.target_step
    FROM surat_revision_events sre
    WHERE sre.status IN ('open', 'awaiting_requester')
      AND p_user_id = ANY(sre.target_user_ids)
      AND sre.target_type IS DISTINCT FROM 'requester'
  ),
  signer_rows AS (
    SELECT
      ss.id, sr.id AS surat_id, 'approval'::text AS task_type,
      sr.no_surat, sr.judul_surat,
      COALESCE(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') AS request_category,
      (sr.requester_snapshot->>'full_name') AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      (sr.location_snapshot->'office'->>'name') AS requester_office,
      sr.current_step, ss.step_order, ss.role_name, ss.label_jabatan, ss.action_type,
      COALESCE(ss.requires_unit_allocation, false) AS requires_unit_allocation,
      (jsonb_array_length(COALESCE(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0) AS has_attachment_requirements,
      ss.verification_required, ss.verification_status, sr.status AS surat_status,
      COALESCE(ss.available_at, sr.created_at) AS available_at, sr.created_at, sr.request_date,
      EXISTS (SELECT 1 FROM surat_attachments sa WHERE sa.surat_id = sr.id LIMIT 1) AS has_attachments,
      EXISTS (SELECT 1 FROM surat_linked_documents sld WHERE sld.parent_surat_id = sr.id LIMIT 1) AS has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') AS is_revision_task
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE ss.user_id = p_user_id
      AND NOT COALESCE(ss.is_signed, false)
      AND (p_task_type IS NULL OR p_task_type = 'approval')
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'signer' AND rt.target_step = ss.step_order
        ))
      )
  ),
  verifier_rows AS (
    SELECT
      ss.id, sr.id AS surat_id, 'verification'::text AS task_type,
      sr.no_surat, sr.judul_surat,
      COALESCE(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') AS request_category,
      (sr.requester_snapshot->>'full_name') AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      (sr.location_snapshot->'office'->>'name') AS requester_office,
      sr.current_step, ss.step_order, ss.role_name, ss.label_jabatan, ss.action_type,
      COALESCE(ss.requires_unit_allocation, false) AS requires_unit_allocation,
      (jsonb_array_length(COALESCE(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0) AS has_attachment_requirements,
      ss.verification_required, ss.verification_status, sr.status AS surat_status,
      COALESCE(ss.available_at, sr.created_at) AS available_at, sr.created_at, sr.request_date,
      EXISTS (SELECT 1 FROM surat_attachments sa WHERE sa.surat_id = sr.id LIMIT 1) AS has_attachments,
      EXISTS (SELECT 1 FROM surat_linked_documents sld WHERE sld.parent_surat_id = sr.id LIMIT 1) AS has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') AS is_revision_task
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE NOT COALESCE(ss.is_signed, false)
      AND ss.verification_required = true
      AND ss.verification_status = 'pending'
      AND ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      AND (p_task_type IS NULL OR p_task_type = 'verification')
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'checker' AND rt.target_step = ss.step_order
        ))
      )
  ),
  combined AS (
    SELECT * FROM signer_rows
    UNION ALL
    SELECT * FROM verifier_rows
  ),
  filtered AS (
    SELECT * FROM combined
    WHERE (p_request_category IS NULL OR p_request_category = '' OR request_category = p_request_category)
      AND (p_search IS NULL OR p_search = '' OR (
        judul_surat ILIKE '%' || p_search || '%'
        OR no_surat ILIKE '%' || p_search || '%'
        OR requester_name ILIKE '%' || p_search || '%'
        OR requester_department ILIKE '%' || p_search || '%'
      ))
  ),
  paginated AS (
    SELECT * FROM filtered
    WHERE (p_cursor_at IS NULL OR (available_at, task_type, id) > (p_cursor_at, p_cursor_task_type, p_cursor_id))
    ORDER BY available_at ASC, task_type ASC, id ASC
    LIMIT p_limit + 1
  )
  SELECT * FROM paginated;
$$;

CREATE OR REPLACE FUNCTION public.get_compact_inbox_count(
  p_user_id          uuid,
  p_search           text DEFAULT NULL,
  p_request_category text DEFAULT NULL,
  p_task_type        text DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH revision_tasks AS (
    SELECT surat_id, target_type, target_step
    FROM surat_revision_events
    WHERE status IN ('open', 'awaiting_requester')
      AND p_user_id = ANY(target_user_ids)
      AND target_type IS DISTINCT FROM 'requester'
  ),
  signer_rows AS (
    SELECT ss.id, 'approval'::text AS task_type, sr.judul_surat, sr.no_surat,
      (sr.requester_snapshot->>'full_name') AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      COALESCE(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') AS request_category
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE ss.user_id = p_user_id
      AND NOT COALESCE(ss.is_signed, false)
      AND (p_task_type IS NULL OR p_task_type = 'approval')
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'signer' AND rt.target_step = ss.step_order
        ))
      )
  ),
  verifier_rows AS (
    SELECT ss.id, 'verification'::text AS task_type, sr.judul_surat, sr.no_surat,
      (sr.requester_snapshot->>'full_name') AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      COALESCE(sr.form_input_data->>'request_category', sr.data_snapshot->>'request_category') AS request_category
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE NOT COALESCE(ss.is_signed, false)
      AND ss.verification_required = true
      AND ss.verification_status = 'pending'
      AND ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      AND (p_task_type IS NULL OR p_task_type = 'verification')
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'checker' AND rt.target_step = ss.step_order
        ))
      )
  ),
  combined AS (
    SELECT * FROM signer_rows
    UNION ALL
    SELECT * FROM verifier_rows
  )
  SELECT COUNT(*)::integer FROM combined
  WHERE (p_request_category IS NULL OR p_request_category = '' OR request_category = p_request_category)
    AND (p_search IS NULL OR p_search = '' OR (
      judul_surat ILIKE '%' || p_search || '%'
      OR no_surat ILIKE '%' || p_search || '%'
      OR requester_name ILIKE '%' || p_search || '%'
      OR requester_department ILIKE '%' || p_search || '%'
    ));
$$;

GRANT EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
