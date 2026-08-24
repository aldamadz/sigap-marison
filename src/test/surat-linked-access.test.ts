import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeRecommendationParentIds,
  hasDirectSuratAccess,
} from "../../server/surat-linked-access.mjs";

describe("linked recommendation document access", () => {
  const surat = {
    created_by: "creator",
    surat_signatures: [
      { user_id: "signer", verifier_snapshot: [{ user_id: "verifier" }] },
    ],
  };

  it.each(["creator", "signer", "verifier"])("keeps direct %s access", (actor) => {
    expect(hasDirectSuratAccess(surat, actor)).toBe(true);
  });

  it("does not grant unrelated or empty actors direct access", () => {
    expect(hasDirectSuratAccess(surat, "unrelated")).toBe(false);
    expect(hasDirectSuratAccess(surat, "")).toBe(false);
    expect(hasDirectSuratAccess(null, "creator")).toBe(false);
  });

  it("inherits only unique active recommendation parent links", () => {
    expect(activeRecommendationParentIds([
      { parent_surat_id: "parent-a", link_type: "recommendation", status: "active" },
      { parent_surat_id: "parent-a", link_type: "recommendation", status: "active" },
      { parent_surat_id: "parent-b", link_type: "recommendation", status: "cancelled" },
      { parent_surat_id: "parent-c", link_type: "attachment", status: "active" },
      { parent_surat_id: null, link_type: "recommendation", status: "active" },
    ])).toEqual(["parent-a"]);
  });

  it("wires inherited access only through an active recommendation relation", () => {
    const runtime = readFileSync(join(process.cwd(), "backend/src/domain-runtime.ts"), "utf8");
    expect(runtime).toContain('.eq("child_surat_id", childSuratId)');
    expect(runtime).toContain('.eq("link_type", "recommendation")');
    expect(runtime).toContain('.eq("status", "active")');
    expect(runtime).toContain("await canReadActiveRecommendationViaParent(surat.id, userRes.user.id)");
    expect(runtime).not.toContain("await getAuthorizedSurat(parent");
  });
});
