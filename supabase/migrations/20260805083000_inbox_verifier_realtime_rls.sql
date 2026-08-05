-- Migration: 20260805083000_inbox_verifier_realtime_rls.sql
-- Purpose: Make verifier access through RLS can_read_surat compatible with
--          Supabase Realtime delivery.
--
-- Root cause (proven on staging via matrix A-D):
--   Realtime postgres_changes events for surat_signatures are delivered to a
--   subscriber JWT only when the row is visible through an RLS path that
--   Realtime can evaluate. Creator (created_by), signer (user_id) and admin
--   paths all receive events. The verifier path, expressed with
--   jsonb_array_elements(verifier_snapshot) inside can_read_surat, does NOT
--   receive Realtime events even though PostgREST SELECT succeeds.
--
-- Fix:
--   Rewrite ONLY the verifier predicate in public.can_read_surat from
--   jsonb_array_elements(...) to JSONB containment ( @> ). This preserves the
--   security posture (same set of users can read) while making the predicate
--   evaluable for Realtime delivery.
--
-- Safety:
--   - SECURITY DEFINER, search_path, and grants are preserved.
--   - requester/signer/admin paths are unchanged.
--   - No GIN index added (no EXPLAIN proof of need; see inline note).
--   - Forward-only; safe to re-run (CREATE OR REPLACE FUNCTION).
--
-- Rollback: not supported (forward-only). To restore the old predicate, apply
-- the previous definition from 20260618120000_form_usage_step_verification.sql.

create or replace function public.can_read_surat(p_surat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = p_surat_id
      and (
        sr.created_by = auth.uid()
        or exists (
          select 1
          from public.surat_signatures ss
          where ss.surat_id = sr.id
            and (
              ss.user_id = auth.uid()
              or ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
            )
        )
        or exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and p.role = 'admin'
        )
      )
  );
$$;

revoke all on function public.can_read_surat(uuid) from public, anon;
grant execute on function public.can_read_surat(uuid) to authenticated, service_role;

-- NOTE on indexing:
-- No GIN index is added by this migration. The verifier_snapshot @> predicate
-- may benefit from a GIN index on surat_signatures(verifier_snapshot) on large
-- datasets, but adding it without EXPLAIN ANALYZE proof on a staging-sized
-- fixture would be premature. Re-evaluate after the predicate is exercised in
-- production-like load.
