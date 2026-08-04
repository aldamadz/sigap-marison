-- Migration: 20260804081000_compact_inbox_rpc.sql
-- Purpose: Canonical compact inbox RPC with server-side filter, keyset cursor,
--          and total count using the same predicate as attention badge.
-- Safety:  SECURITY INVOKER (no privilege escalation); actor verified from
--          session inside BFF before calling this RPC via service_role client.
--          fixed search_path to prevent search_path injection.
-- Rollback: DROP FUNCTION IF EXISTS public.is_inbox_task_active(...),
--           DROP FUNCTION IF EXISTS public.get_compact_inbox(...),
--           DROP FUNCTION IF EXISTS public.get_compact_inbox_count(...),
--           DROP TYPE IF EXISTS public.compact_inbox_item;

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
-- Canonical predicate helper
-- ============================================================
-- Returns true if the given signature is an active inbox task for the user.
-- Used by: get_compact_inbox, get_compact_inbox_count, detail auth (BFF).
-- This ensures the same predicate governs all three surfaces.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_inbox_task_active(
  p_user_id      uuid,
  p_signature_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH sig AS (
    SELECT ss.id, ss.user_id, ss.step_order, ss.is_signed,
           ss.verification_required, ss.verification_status,
           ss.verifier_snapshot, sr.status AS surat_status, sr.current_step
    FROM surat_signatures ss
    JOIN surat_registrasi sr ON sr.id = ss.surat_id
    WHERE ss.id = p_signature_id
  ),
  revision_tasks AS (
    SELECT sre.surat_id, sre.target_type, sre.target_step
    FROM surat_revision_events sre
    JOIN surat_signatures ss2 ON ss2.surat_id = sre.surat_id
    WHERE ss2.id = p_signature_id
      AND sre.status IN ('open', 'awaiting_requester')
      AND p_user_id = ANY(sre.target_user_ids)
      AND sre.target_type IS DISTINCT FROM 'requester'
  )
  SELECT EXISTS (
    SELECT 1 FROM sig
    WHERE NOT COALESCE(sig.is_signed, false)
      AND (
        -- Signer active step
        (sig.user_id = p_user_id
         AND sig.surat_status = 'PROSES'
         AND sig.step_order = sig.current_step)
        OR
        -- Verifier active step
        (sig.verification_required = true
         AND sig.verification_status = 'pending'
         AND sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
         AND sig.surat_status = 'PROSES'
         AND sig.step_order = sig.current_step)
        OR
        -- Revision signer
        (sig.user_id = p_user_id
         AND sig.surat_status = 'MENUNGGU_PERBAIKAN'
         AND EXISTS (SELECT 1 FROM revision_tasks rt WHERE rt.target_type = 'signer' AND rt.target_step = sig.step_order))
        OR
        -- Revision checker
        (sig.verification_required = true
         AND sig.surat_status = 'MENUNGGU_PERBAIKAN'
         AND sig.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', p_user_id::text))
         AND EXISTS (SELECT 1 FROM revision_tasks rt WHERE rt.target_type = 'checker' AND rt.target_step = sig.step_order))
      )
  );
$$;

-- ============================================================
-- get_compact_inbox
-- ============================================================
-- Parameters:
--   p_user_id          — verified by BFF from session, never from client
--   p_limit            — 1..50, caller validates before calling
--   p_cursor_at        — keyset part 1 (timestamptz)
--   p_cursor_task_type — keyset part 2 ('approval'|'verification')
--   p_cursor_id        — keyset part 3 (signature uuid)
--   p_search           — optional ILIKE on judul_surat, no_surat, requester_name
--   p_request_category — optional exact match on request_category
--   p_task_type        — optional 'approval'|'verification' filter
--
-- Returns LIMIT p_limit + 1 rows for hasMore detection.
-- Keyset cursor: (available_at, task_type, id) — stable, deterministic.
-- ============================================================

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
    SELECT vr.* FROM verifier_rows vr
    WHERE NOT EXISTS (SELECT 1 FROM signer_rows sr2 WHERE sr2.id = vr.id)
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

-- ============================================================
-- get_compact_inbox_count(p_user_id, p_search, p_request_category, p_task_type)
-- Same predicate as get_compact_inbox including filters.
-- Used for: pagination total, badge consistency, first-page count.
-- ============================================================

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
  signer_ids AS (
    SELECT ss.id, sr.judul_surat, sr.no_surat,
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
  verifier_ids AS (
    SELECT ss.id, sr.judul_surat, sr.no_surat,
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
    SELECT id, judul_surat, no_surat, requester_name, requester_department, request_category FROM signer_ids
    UNION
    SELECT id, judul_surat, no_surat, requester_name, requester_department, request_category FROM verifier_ids
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

-- ============================================================
-- Grants: service_role only, revoke from public/anon/authenticated
-- ============================================================

GRANT EXECUTE ON FUNCTION public.is_inbox_task_active(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_inbox_task_active(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_compact_inbox(uuid, integer, timestamptz, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_compact_inbox_count(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Indexes: only add after EXPLAIN ANALYZE on fixture proves need.
-- The following indexes already exist:
--   idx_surat_signatures_user_pending (user_id, surat_id, step_order) WHERE NOT is_signed
--   idx_signatures_user (user_id)
--   idx_signatures_surat (surat_id)
-- Monitor verifier_snapshot GIN scan performance before adding:
--   CREATE INDEX IF NOT EXISTS idx_signatures_verifier_snapshot
--     ON surat_signatures USING gin (verifier_snapshot);
-- This migration does NOT add the GIN index — it requires EXPLAIN ANALYZE
-- proof on a staging-sized fixture first.
-- ============================================================
