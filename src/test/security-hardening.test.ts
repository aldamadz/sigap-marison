import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("security hardening guardrails", () => {
  it("does not ship unauthenticated Next.js service-role example routes", () => {
    const unsafeRoutes = [
      "api/nextjs-app-router/surat-registrations/route.ts",
      "api/nextjs-app-router/surat-reservations/route.ts",
      "api/nextjs-app-router/surat-signatures/route.ts",
    ];

    unsafeRoutes.forEach((routePath) => {
      expect(existsSync(join(root, routePath))).toBe(false);
    });
  });

  it("verifies JWTs through Supabase Auth instead of decoding payload locally", () => {
    const server = read("server.mjs");
    expect(server).not.toContain("decodeJwtUserForLightEndpoint");
    expect(server).not.toContain("decodeBase64UrlJson");
    expect(server).toContain("supabase.auth.getUser(token)");
  });

  it("replaces approval attachments by deleting only old metadata rows", () => {
    const server = read("server.mjs");
    const replacementStart = server.indexOf("const replaceSignatureAttachmentFiles");
    const replacementEnd = server.indexOf("const generateAvatarThumbnail", replacementStart);
    const replacement = server.slice(replacementStart, replacementEnd);
    const deleteStart = replacement.indexOf(".from(\"surat_attachments\")", replacement.indexOf("oldRowIds"));
    const deleteEnd = replacement.indexOf("if (deleteError)", deleteStart);
    const deleteBlock = replacement.slice(deleteStart, deleteEnd);

    expect(replacement).toContain("oldRowIds");
    expect(replacement).toContain(".in(\"id\", oldRowIds)");
    expect(deleteBlock).not.toContain(".eq(\"surat_id\", suratId)");
    expect(deleteBlock).not.toContain(".eq(\"signature_id\", signatureId)");
    expect(deleteBlock).not.toContain(".in(\"requirement_key\", requirementKeys)");
  });

  it("keeps letter number generation bound to auth.uid and an advisory transaction lock", () => {
    const migration = read("supabase/migrations/20260714152000_close_remaining_security_blockers.sql");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("reserved_by");
    expect(migration).toContain("v_actor");
  });
});
