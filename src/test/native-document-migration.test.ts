import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(
  "supabase/migrations/20260818120000_native_document_pdf_cache_invalidation.sql",
), "utf8");

describe("native document cache invalidation migration", () => {
  it("accepts only logical native source versions", () => {
    expect(migration).toContain("p_file_path not like 'native://document/%'");
    expect(migration).not.toContain(".xlsx");
  });

  it("invalidates document and signature PDF caches in the approval transaction", () => {
    expect(migration).toContain("pdf_path_snap = null");
    expect(migration.match(/pdf_path = null/g)).toHaveLength(2);
  });

  it("preserves recommendation PDF_PENDING and normal DONE transitions", () => {
    expect(migration).toContain("when v_is_recommendation then 'PDF_PENDING' else 'DONE'");
    expect(migration).toContain("v_is_done := not v_is_recommendation");
  });

  it("keeps execution restricted to authenticated runtime roles", () => {
    expect(migration).toContain("revoke all on function public.handle_approve_surat_v2");
    expect(migration).toContain("to authenticated, service_role");
  });
});
