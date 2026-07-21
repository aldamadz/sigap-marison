import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getUnitAllocationData } from "@/components/surat/unit-allocation-data";

describe("unit allocation verification persistence", () => {
  it("reads the latest saved verifier draft when the main snapshot has not been updated", () => {
    const olderUnit = { value: "A01" };
    const latestUnit = { value: "B01" };
    const result = getUnitAllocationData({
      form_input_data: { requested_unit_count: 1 },
      data_snapshot: {
        verification_drafts: {
          older: {
            saved_at: "2026-07-21T01:00:00Z",
            input: { allocated_units: [olderUnit] },
          },
          latest: {
            saved_at: "2026-07-21T02:00:00Z",
            input: {
              allocated_project: { code: "WSVJ9" },
              allocated_units: [latestUnit],
              allocated_unit_count: 1,
            },
          },
        },
      },
    });

    expect(result.units).toEqual([latestUnit]);
    expect(result.project).toEqual({ code: "WSVJ9" });
    expect(result.requestedCount).toBe(1);
  });

  it("uses the persisted draft as a finalization fallback and refreshes live inbox data", () => {
    const service = readFileSync(resolve("src/services/surat.service.ts"), "utf8");
    const inbox = readFileSync(resolve("src/pages/surat/InboxPage.tsx"), "utf8");

    expect(service).toContain("persistedVerificationDraft");
    expect(service).toContain("persistedVerificationDraft.allocated_units");
    expect(service).toContain('supabase.rpc("verify_surat_signature_v2"');
    expect(service).not.toContain('supabase.rpc("verify_surat_signature",');
    expect(inbox).toContain('invalidateQueries({ queryKey: ["surat-inbox"] })');
  });

  it("finalizes unit allocation in a security definer RPC and backfills verified drafts", () => {
    const migration = readFileSync(
      resolve("supabase/migrations/20260721121000_atomic_verify_surat_signature_input.sql"),
      "utf8"
    );

    expect(migration).toContain("security definer");
    expect(migration).toContain("verify_surat_signature_v2");
    expect(migration).toContain("v_actor = any(target_user_ids)");
    expect(migration).toContain("'allocated_units', v_allocated_units");
    expect(migration).toContain("verification_drafts");
    expect(migration).toContain("ss.verification_status = 'verified'");
  });
});
