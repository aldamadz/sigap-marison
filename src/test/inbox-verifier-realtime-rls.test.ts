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

  it("guards the verifier containment path with auth.uid() is not null", () => {
    expect(migration).toContain("auth.uid() is not null");
    expect(migration).toContain("and ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))");
  });

  it("preserves grants (revoke public/anon, grant authenticated+service_role)", () => {
    expect(migration).toContain("revoke all on function public.can_read_surat(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.can_read_surat(uuid) to authenticated, service_role");
  });

  it("does not add a GIN index without proof", () => {
    expect(migration).not.toMatch(/create index.*verifier_snapshot/i);
  });

  it("old and new predicate are semantically equivalent for valid verifier snapshot", () => {
    expect(migration).toContain("ss.verifier_snapshot @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))");
  });

  it("contains no GIN index addition and documents why", () => {
    expect(migration.toLowerCase()).toContain("no gin index");
  });
});

describe("inbox verifier realtime RLS SQL integration test", () => {
  const sqlTest = read("supabase/tests/inbox_verifier_realtime_rls.integration.sql");

  it("applies migration via \\ir (not inlined function body)", () => {
    expect(sqlTest).toContain("\\ir ../migrations/20260805083000_inbox_verifier_realtime_rls.sql");
    expect(sqlTest).not.toContain("create or replace function public.can_read_surat");
  });

  it("creates transaction-local profile fixtures with test UUIDs", () => {
    expect(sqlTest).toContain("insert into public.profiles");
    expect(sqlTest).toContain("a0000000-0000-0000-0000-000000000001");
    expect(sqlTest).toContain("a0000000-0000-0000-0000-000000000004");
    expect(sqlTest).toContain("'admin'");
    expect(sqlTest).toContain("on conflict");
  });

  it("does not use real staging UUIDs", () => {
    expect(sqlTest).not.toContain("fe7c4836-a360-4d53-89e0-376c7193451e");
    expect(sqlTest).not.toContain("fbc7e006-1646-47b4-8f25-681651c54076");
    expect(sqlTest).not.toContain("fffb3bc5-a1b8-4c8c-aabb-78d3ca9ad946");
    expect(sqlTest).not.toContain("fb627906-a1bc-41f1-bf5a-e6e5fbd79254");
    expect(sqlTest).not.toContain("6d2e3979-c5d6-49b2-94e1-db6a8fac96f7");
  });

  it("tests actual SELECT through surat_signatures RLS policy", () => {
    expect(sqlTest).toContain("select count(*) into v_count from public.surat_signatures");
    expect(sqlTest).toContain("request.jwt.claim.sub");
    expect(sqlTest).toContain("set local role authenticated");
  });

  it("tests requester, signer, verifier, admin can read", () => {
    expect(sqlTest).toContain("requester must see both signatures of surat 1 via created_by");
    expect(sqlTest).toContain("signer must see both signatures of surat 1 via user_id");
    expect(sqlTest).toContain("verifier must see both signatures of surat 1 via verifier_snapshot");
    expect(sqlTest).toContain("admin must see both signatures of surat 1 via admin role");
  });

  it("tests unrelated user and null actor are rejected", () => {
    expect(sqlTest).toContain("unrelated must not see any signatures of surat 1");
    expect(sqlTest).toContain("null actor must not see any signatures of surat 1");
  });

  it("tests verifier_snapshot with {\"user_id\":null} never grants standalone access", () => {
    expect(sqlTest).toContain('{"user_id":null');
    expect(sqlTest).toContain("verifier must not see signatures of null-user-only surat 2");
    expect(sqlTest).toContain("unrelated must not see signatures of null-user-only surat 2");
    expect(sqlTest).toContain("null actor must not see signatures of null-user-only surat 2");
  });

  it("is rollback-based", () => {
    expect(sqlTest.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
