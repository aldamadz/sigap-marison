-- Migration: 20260928031002_surat_revision_events_verifier_realtime_rls.sql
-- Purpose: make the verifier path of public.surat_revision_events SELECT policy
--          evaluable by Supabase Realtime delivery.
--
-- Root cause (same class as migration 20260805083000 for can_read_surat):
--   The verifier predicate expressed membership with
--   jsonb_array_elements(coalesce(ss.verifier_snapshot, '[]'::jsonb)) inside the
--   RLS policy. PostgREST SELECT succeeds, but Realtime event delivery could not
--   evaluate that set-returning expression for the subscriber JWT, so verifiers
--   never received revision events even though they could read the rows.
--
-- Fix:
--   Rewrite ONLY the verifier predicate from jsonb_array_elements(...) to JSONB
--   containment (@>). The reachable user set is unchanged.
--
-- Safety:
--   - Policy is SELECT-only; insert/update/delete policies untouched.
--   - actor, target_user_ids, creator (created_by), signer (user_id), and admin
--     paths are preserved verbatim.
--   - SECURITY DEFINER is not used by this policy; it is a plain table policy.
--   - Forward-only; safe to re-run (DROP IF EXISTS + CREATE).
--
-- Rollback: restore the previous definition from
-- 20260706100000_surat_revision_flow.sql. Forward-only policy: the old form is
-- not recommended because it breaks Realtime delivery.

drop policy if exists surat_revision_events_participants_select on public.surat_revision_events;

create policy surat_revision_events_participants_select
on public.surat_revision_events
for select
to authenticated
using (
  actor_id = auth.uid()
  or auth.uid() = any(target_user_ids)
  or exists (
    select 1
    from public.surat_registrasi sr
    where sr.id = surat_revision_events.surat_id
      and sr.created_by = auth.uid()
  )
  or exists (
    select 1
    from public.surat_signatures ss
    where ss.surat_id = surat_revision_events.surat_id
      and (
        ss.user_id = auth.uid()
        or (
          auth.uid() is not null
          and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
        )
      )
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('admin', 'super_admin')
  )
);
