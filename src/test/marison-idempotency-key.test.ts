import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const migration = read("supabase/migrations/20260805090000_fix_generation_aware_idempotency_key.sql");
const original = read("supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql");
const sqlTest = read("supabase/tests/marison_idempotency_key.integration.sql");
const nodeRunner = read("scripts/test-idempotency-key-sql.mjs");

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
  it("uses canonical fixtures, not _test_ tables", () => {
    expect(sqlTest).not.toContain("_test_profiles");
    expect(sqlTest).not.toContain("_test_surat");
    expect(sqlTest).toContain("insert into public.profiles");
    expect(sqlTest).toContain("insert into public.surat_registrasi");
  });

  it("creates at least two surat fixtures with test UUIDs", () => {
    expect(sqlTest).toContain("IKY-SURAT-001");
    expect(sqlTest).toContain("IKY-SURAT-002");
    expect(sqlTest).toContain("000000000010");
    expect(sqlTest).toContain("000000000011");
  });

  it("does NOT \\ir the migration (applied on disposable DB before transaction)", () => {
    expect(sqlTest).not.toContain("\\ir ../migrations");
    expect(sqlTest).not.toContain("create or replace function public.prepare_marison_outbound_dispatch");
  });

  it("tests generation 1 exact key (legacy)", () => {
    expect(sqlTest).toContain("generation 1 exact key");
  });

  it("tests generation 2 exact key (:g2)", () => {
    expect(sqlTest).toContain("generation 2 exact key");
  });

  it("tests generation 3 exact key (:g3)", () => {
    expect(sqlTest).toContain("generation 3 exact key");
  });

  it("tests malformed key rejected with 55000", () => {
    expect(sqlTest).toContain("malformed key rejected");
    expect(sqlTest).toContain("payload must remain null after rejection");
    expect(sqlTest).toContain("key must be unchanged after rejection");
  });

  it("tests unique constraint via GET STACKED DIAGNOSTICS constraint_name", () => {
    expect(sqlTest).toContain("get stacked diagnostics v_constraint_name = constraint_name");
    expect(sqlTest).toContain("marison_outbound_dispatches_idempotency_key_key");
  });

  it("tests unique constraint in isolation on surat 2 (same key, different surat)", () => {
    expect(sqlTest).toContain("IKY-SURAT-002");
    expect(sqlTest).toContain("v_surat2_id");
  });

  it("tests repeat prepare is idempotent", () => {
    expect(sqlTest).toContain("repeat prepare idempotent");
  });

  it("is rollback-based", () => {
    expect(sqlTest.trimEnd().endsWith("rollback;")).toBe(true);
  });
});

describe("disposable SQL runner wired into quality gate", () => {
  it("single cross-platform node runner exists (no ps1/sh duplicates)", () => {
    expect(nodeRunner).toContain("20260805090000_fix_generation_aware_idempotency_key.sql");
    expect(nodeRunner).toContain("20260729103000_durable_marison_outbound_dispatch.sql");
    expect(nodeRunner).toContain("20260803120000_marison_outbound_replacement_jobs.sql");
    expect(nodeRunner).toContain('spawnSync("docker"');
    expect(nodeRunner).toContain('["run", "-d"');
    expect(nodeRunner).toContain("ON_ERROR_STOP=1");
    expect(nodeRunner).toContain("finally");
    expect(nodeRunner).toContain('run(["rm", "-f", id])');
    // runner must NOT duplicate the integration assertions
    expect(nodeRunner).not.toContain("sigap:staging:unit:f0000000");
    expect(nodeRunner).not.toContain("IKY-SURAT-001");
  });

  it("node runner reads and executes the integration SQL file as single source of truth", () => {
    expect(nodeRunner).toContain("marison_idempotency_key.integration.sql");
    expect(nodeRunner).toContain("integrationTest");
    expect(nodeRunner).toContain("fixtureSql + baseMigration + replacementMigration + fixMigration + integrationTest");
  });

  it("package.json quality includes only test:idempotency-key-sql (not outbound-replacement)", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["test:idempotency-key-sql"]).toContain("test-idempotency-key-sql.mjs");
    expect(pkg.scripts.quality).toContain("test:idempotency-key-sql");
    expect(pkg.scripts.quality).not.toContain("test:outbound-replacement-sql");
  });
});
