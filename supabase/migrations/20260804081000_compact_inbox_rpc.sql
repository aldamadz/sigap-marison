-- Migration: 20260804081000_compact_inbox_rpc.sql
-- Purpose: Canonical compact inbox RPC with server-side filter, keyset cursor,
--          and total count using the same predicate as attention badge.
-- Safety:  SECURITY INVOKER (no privilege escalation); actor verified from
--          session inside BFF before calling this RPC via service_role client.
--          fixed search_path to prevent search_path injection.
-- Rollback: DROP FUNCTION IF EXISTS public.get_compact_inbox(...) and
--           DROP FUNCTION IF EXISTS public.get_compact_inbox_count(...)

-- ============================================================
-- Helper type (returned by the RPC)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'compact_inbox_item'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE public.compact_inbox_item AS (
      id              uuid,
      surat_id        uuid,
      task_type       text,
      no_surat        text,
      judul_surat     text,
      request_category text,
      requester_name  text,
      requester_department text,
      requester_office text,
      current_step    integer,
      step_order      integer,
      role_name       text,
      label_jabatan   text,
      action_type     text,
      requires_unit_allocation boolean,
      has_attachment_requirements boolean,
      verification_required boolean,
      verification_status text,
      surat_status    text,
      available_at    timestamptz,
      created_at      timestamptz,
      request_date    date,
      has_attachments boolean,
      has_linked_documents boolean,
      is_revision_task boolean
    );
  END IF;
END $$;

-- ============================================================
-- get_compact_inbox(p_user_id, p_limit, p_cursor_at, p_cursor_task_type, p_cursor_id)
-- ============================================================
-- Returns up to p_limit + 1 rows (caller uses the +1 to detect hasMore).
-- Keyset cursor: (available_at, task_type, id) — stable, deterministic order.
-- p_user_id MUST be verified by the BFF before this call — never accept raw
-- user input as p_user_id.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_compact_inbox(
  p_user_id          uuid,
  p_limit            integer DEFAULT 20,
  p_cursor_at        timestamptz DEFAULT NULL,
  p_cursor_task_type text        DEFAULT NULL,
  p_cursor_id        uuid        DEFAULT NULL
)
RETURNS SETOF public.compact_inbox_item
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH revision_tasks AS (
    -- Open revision events targeting this user (non-requester)
    SELECT
      sre.surat_id,
      sre.target_type,
      sre.target_step,
      sre.target_user_ids
    FROM surat_revision_events sre
    WHERE sre.status IN ('open', 'awaiting_requester')
      AND p_user_id = ANY(sre.target_user_ids)
      AND sre.target_type IS DISTINCT FROM 'requester'
  ),
  signer_rows AS (
    SELECT
      ss.id,
      sr.id                         AS surat_id,
      'approval'::text              AS task_type,
      sr.no_surat,
      sr.judul_surat,
      COALESCE(
        sr.form_input_data->>'request_category',
        sr.data_snapshot->>'request_category'
      )                             AS request_category,
      (sr.requester_snapshot->>'full_name')       AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      (sr.location_snapshot->'office'->>'name')     AS requester_office,
      sr.current_step,
      ss.step_order,
      ss.role_name,
      ss.label_jabatan,
      ss.action_type,
      COALESCE(ss.requires_unit_allocation, false) AS requires_unit_allocation,
      (jsonb_array_length(COALESCE(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0)
                                    AS has_attachment_requirements,
      ss.verification_required,
      ss.verification_status,
      sr.status                     AS surat_status,
      COALESCE(ss.available_at, sr.created_at) AS available_at,
      sr.created_at,
      sr.request_date,
      EXISTS (SELECT 1 FROM surat_attachments sa WHERE sa.surat_id = sr.id LIMIT 1)
                                    AS has_attachments,
      EXISTS (SELECT 1 FROM surat_linked_documents sld WHERE sld.parent_surat_id = sr.id LIMIT 1)
                                    AS has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') AS is_revision_task
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE ss.user_id = p_user_id
      AND NOT COALESCE(ss.is_signed, false)
      AND (
        -- Normal active step
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR
        -- Revision targeting this signer
        (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id
            AND rt.target_type = 'signer'
            AND rt.target_step = ss.step_order
        ))
      )
  ),
  verifier_rows AS (
    SELECT
      ss.id,
      sr.id                         AS surat_id,
      'verification'::text          AS task_type,
      sr.no_surat,
      sr.judul_surat,
      COALESCE(
        sr.form_input_data->>'request_category',
        sr.data_snapshot->>'request_category'
      )                             AS request_category,
      (sr.requester_snapshot->>'full_name')       AS requester_name,
      (sr.location_snapshot->'department'->>'name') AS requester_department,
      (sr.location_snapshot->'office'->>'name')     AS requester_office,
      sr.current_step,
      ss.step_order,
      ss.role_name,
      ss.label_jabatan,
      ss.action_type,
      COALESCE(ss.requires_unit_allocation, false) AS requires_unit_allocation,
      (jsonb_array_length(COALESCE(ss.attachment_requirements_snapshot, '[]'::jsonb)) > 0)
                                    AS has_attachment_requirements,
      ss.verification_required,
      ss.verification_status,
      sr.status                     AS surat_status,
      COALESCE(ss.available_at, sr.created_at) AS available_at,
      sr.created_at,
      sr.request_date,
      EXISTS (SELECT 1 FROM surat_attachments sa WHERE sa.surat_id = sr.id LIMIT 1)
                                    AS has_attachments,
      EXISTS (SELECT 1 FROM surat_linked_documents sld WHERE sld.parent_surat_id = sr.id LIMIT 1)
                                    AS has_linked_documents,
      (sr.status = 'MENUNGGU_PERBAIKAN') AS is_revision_task
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE NOT COALESCE(ss.is_signed, false)
      AND ss.verification_required = true
      AND ss.verification_status = 'pending'
      AND ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      AND (
        -- Normal active step
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR
        -- Revision targeting this verifier/checker
        (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id
            AND rt.target_type = 'checker'
            AND rt.target_step = ss.step_order
        ))
      )
  ),
  combined AS (
    SELECT * FROM signer_rows
    UNION ALL
    -- Exclude verifier rows that duplicate a signer row for the same signature
    SELECT vr.* FROM verifier_rows vr
    WHERE NOT EXISTS (
      SELECT 1 FROM signer_rows sr2 WHERE sr2.id = vr.id
    )
  ),
  paginated AS (
    SELECT * FROM combined
    WHERE (
      p_cursor_at IS NULL
      OR (available_at, task_type, id) > (p_cursor_at, p_cursor_task_type, p_cursor_id)
    )
    ORDER BY available_at ASC, task_type ASC, id ASC
    LIMIT p_limit + 1
  )
  SELECT * FROM paginated;
$$;

-- ============================================================
-- get_compact_inbox_count(p_user_id)
-- Canonical total count — same predicate as get_compact_inbox and
-- attention badge. Used for pagination metadata and badge consistency test.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_compact_inbox_count(
  p_user_id uuid
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
  signer_ids AS (
    SELECT ss.id FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE ss.user_id = p_user_id
      AND NOT COALESCE(ss.is_signed, false)
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'signer' AND rt.target_step = ss.step_order
        ))
      )
  ),
  verifier_ids AS (
    SELECT ss.id FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE NOT COALESCE(ss.is_signed, false)
      AND ss.verification_required = true
      AND ss.verification_status = 'pending'
      AND ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
      AND (
        (sr.status = 'PROSES' AND ss.step_order = sr.current_step)
        OR (sr.status = 'MENUNGGU_PERBAIKAN' AND EXISTS (
          SELECT 1 FROM revision_tasks rt
          WHERE rt.surat_id = sr.id AND rt.target_type = 'checker' AND rt.target_step = ss.step_order
        ))
      )
  )
  SELECT COUNT(DISTINCT id)::integer
  FROM (
    SELECT id FROM signer_ids
    UNION
    SELECT id FROM verifier_ids
  ) combined;
$$;

-- Grant to service_role only (BFF uses service_role client)
GRANT EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid) FROM PUBLIC, anon, authenticated;
