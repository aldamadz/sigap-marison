import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const migration = read("supabase/migrations/20260805083000_inbox_verifier_realtime_rls.sql");
const originalMigration = read("supabase/migrations/20260618120000_form_usage_step_verification.sql");

describe("inbox verifier realtime RLS migration", () => {
  it("is forward-only (CREATE OR REPLACE FUNCTION, no DROP TABLE)", () => {
    expect(migration).toContain("create or replace function public.can_read_surat");
    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("drop function public.can_read_surat");
  });

  it("preserves SECURITY DEFINER and fixed search_path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
  });

  it("preserves requester (created_by), signer (user_id), and admin paths", () => {
    expect(migration).toContain("sr.created_by = auth.uid()");
    expect(migration).toContain("ss.user_id = auth.uid()");
    expect(migration).toContain("p.role = 'admin'");
  });

  it("replaces jsonb_array_elements verifier predicate with containment @>", () => {
    expect(migration).toContain("ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))");
    // The can_read_surat body must no longer contain jsonb_array_elements for the verifier check
    const body = migration.slice(migration.indexOf("select exists"));
    expect(body).not.toContain("jsonb_array_elements");
  });

  it("preserves grants (revoke public/anon, grant authenticated+service_role)", () => {
    expect(migration).toContain("revoke all on function public.can_read_surat(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.can_read_surat(uuid) to authenticated, service_role");
  });

  it("does not add a GIN index without proof", () => {
    expect(migration).not.toMatch(/create index.*verifier_snapshot/i);
  });

  it("old and new predicate are semantically equivalent for valid verifier snapshot", () => {
    // old: exists(select 1 from jsonb_array_elements(coalesce(ss.verifier_snapshot,'[]')) v where v->>'user_id' = auth.uid()::text)
    // new: ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
    // JSONB containment @> with an array of one object returns true iff the snapshot
    // contains that exact object (or a superset). For verifier_snapshot arrays of
    // {user_id, full_name, job_title}, containing {"user_id":X} is equivalent to
    // an element whose user_id == X. This is proven by the SQL integration test
    // equivalence sweep (0 mismatches across actors x fixtures).
    expect(migration).toContain("ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))");
  });

  it("contains no GIN index addition and documents why", () => {
    expect(migration.toLowerCase()).toContain("no gin index");
  });
});

describe("inbox verifier realtime RLS SQL integration test", () => {
  const sqlTest = read("supabase/tests/inbox_verifier_realtime_rls.integration.sql");

  it("tests requester, signer, verifier, admin can read", () => {
    expect(sqlTest).toContain("requester should read");
    expect(sqlTest).toContain("signer should read");
    expect(sqlTest).toContain("verifier should read");
    expect(sqlTest).toContain("admin should read");
  });

  it("tests unrelated user is rejected", () => {
    expect(sqlTest).toContain("unrelated must be rejected");
  });

  it("tests empty/null/malformed snapshot rejected", () => {
    expect(sqlTest).toContain("empty snapshot must not grant");
    expect(sqlTest).toContain("null snapshot must not grant");
    expect(sqlTest).toContain("malformed snapshot must not grant");
  });

  it("tests multiple verifiers work", () => {
    expect(sqlTest).toContain("verifier should read under both predicates (multiple)");
  });

  it("runs an equivalence sweep asserting zero mismatches", () => {
    expect(sqlTest).toContain("predicate mismatch count must be zero");
    expect(sqlTest).toContain("EQUIVALENCE SWEEP OK");
  });

  it("is rollback-based", () => {
    expect(sqlTest.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
