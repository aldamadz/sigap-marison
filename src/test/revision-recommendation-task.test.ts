import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261104090000_revision_recommendation_task.sql", "utf8");
const selector = readFileSync("scripts/test-changed.mjs", "utf8");

describe("revision recommendation task release contract", () => {
  it("does not create tasks when archived documents are updated", () => {
    const followup=readFileSync("supabase/migrations/20261104100000_revision_recommendation_task_active_only.sql", "utf8");
    expect(followup).toContain("not in ('PROSES','MENUNGGU_PERBAIKAN') then return new");
  });
  it("creates the canonical task on input updates without a client-side second request", () => {
    expect(migration).toContain("after update of form_input_data on public.surat_registrasi");
    expect(migration).toContain("perform public.create_recommendation_task_for_parent(new.id)");
    expect(migration).not.toContain("insert into public.surat_recommendation_tasks");
  });
  it("retains active actor ownership, factory capabilities and task idempotency", () => {
    for (const guard of ["actor.is_active is true", "actor.deleted_at is null", "new.created_by=actor.id", "new.represented_by_admin=actor.id", "task.status<>'cancelled'", "recommendation_numbering_internal.reservation_authorizations"])
      expect(migration).toContain(guard);
    expect(migration).toContain("revoke all on function public.create_missing_revision_recommendation_task()");
  });
  it("bounds step restoration to the transaction permit and exact resolved requester event", () => {
    for (const guard of ["permit.transaction_id=pg_catalog.txid_current()", "permit.operation='submit'", "event.status='resolved'", "event.target_type='requester'", "event.changes->>'requester_edit_required'='true'", "event.changes->>'resume_step'=new.current_step::text", "new.status::text='PROSES'"])
      expect(migration).toContain(guard);
    expect(migration).not.toContain("create or replace function public.guard_parent_signature_for_recommendation");
    expect(migration).not.toContain("disable trigger");
  });
  it("selects real PostgreSQL regression gates without forcing unrelated full tests", () => {
    expect(selector).toContain("gates.add('revision-recommendation-sql')");
    expect(selector).toContain("'--revision-update', '--production-shape'");
    expect(selector).toContain("'--requester-edit', '--recommendation-enable'");
  });
});
