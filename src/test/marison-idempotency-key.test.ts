import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const migration = read("supabase/migrations/20260805090000_fix_generation_aware_idempotency_key.sql");
const original = read("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql");

describe("generation-aware idempotency key migration", () => {
  it("is forward-only (CREATE OR REPLACE FUNCTION)", () => {
    expect(migration).toContain("create or replace function public.prepare_marison_outbound_dispatch");
    expect(migration).toContain("security definer");
    expect(migration).not.toContain("drop table");
  });

  it("preserves grants (service_role only)", () => {
    expect(migration).toContain("revoke all on function public.prepare_marison_outbound_dispatch");
    expect(migration).toContain("grant execute on function public.prepare_marison_outbound_dispatch");
    expect(migration).toContain("to service_role");
  });

  it("computes expected_key deterministically before any mutation", () => {
    const body = migration.slice(migration.indexOf("v_expected_key"));
    expect(body).toContain("v_expected_key");
    expect(body).toContain("v_job.generation = 1");
    expect(body).toContain("format('sigap:%s:%s:%s'");
    expect(body).toContain("format('sigap:%s:%s:%s:g%s'");
  });

  it("uses equality (=) not LIKE for key comparison", () => {
    const body = migration.slice(migration.indexOf("v_expected_key"));
    expect(body).toContain("v_job.idempotency_key <> v_expected_key");
    expect(body).not.toContain("like '%:g'");
    expect(body).not.toContain("case");
    expect(body).not.toContain("when d.generation");
  });

  it("fail-closed with SQLSTATE 55000 before payload mutation", () => {
    expect(migration).toContain("v_job.idempotency_key is not null and v_job.idempotency_key <> v_expected_key");
    expect(migration).toContain("using errcode = '55000'");
  });

  it("does not use ON CONFLICT DO NOTHING", () => {
    expect(migration).not.toContain("on conflict");
  });

  it("preserves payload immutability check", () => {
    expect(migration).toContain("Prepared payload is immutable");
  });

  it("preserves lease validation", () => {
    expect(migration).toContain("Stale or invalid dispatch lease");
  });

  it("documents staging audit in migration header", () => {
    expect(migration).toContain("56041f33");
    expect(migration).toContain("22916bdb");
    expect(migration).toContain(":g2");
    expect(migration).toContain("Tidak perlu data repair");
  });
});

describe("generation-aware idempotency key SQL integration test", () => {
  const sqlTest = read("supabase/tests/marison_idempotency_key.integration.sql");

  it("does NOT \\ir the migration (run on disposable DB)", () => {
    expect(sqlTest).not.toContain("\\ir ../migrations");
    expect(sqlTest).not.toContain("create or replace function public.prepare_marison_outbound_dispatch");
  });

  it("tests generation 1 exact key (legacy)", () => {
    expect(sqlTest).toContain("gen1 exact key mismatch");
  });

  it("tests generation 2 exact key (:g2)", () => {
    expect(sqlTest).toContain("gen2 exact key mismatch");
  });

  it("tests generation 3 exact key (:g3)", () => {
    expect(sqlTest).toContain("gen3 exact key mismatch");
  });

  it("tests malformed key rejected with 55000", () => {
    expect(sqlTest).toContain("malformed key rejected");
    expect(sqlTest).toContain("payload must remain null after rejection");
    expect(sqlTest).toContain("key must be unchanged after rejection");
  });

  it("tests repeat prepare is idempotent", () => {
    expect(sqlTest).toContain("repeat prepare idempotent");
  });

  it("tests unique constraint still enforced", () => {
    expect(sqlTest).toContain("unique constraint active");
  });

  it("is rollback-based", () => {
    expect(sqlTest.trimEnd().endsWith("rollback;")).toBe(true);
  });
});
