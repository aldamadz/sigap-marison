import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sourceFiles = (directory: string): string[] => readdirSync(join(root, directory), { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  })
  .filter((path) => [".ts", ".tsx", ".js", ".jsx", ".md"].includes(extname(path)));

describe("security hardening guardrails", () => {
  it("keeps removed legacy toast and orphan UI wrappers out of the source tree", () => {
    const removedPaths = [
      "src/components/ui/toast.tsx",
      "src/components/ui/toaster.tsx",
      "src/components/ui/use-toast.ts",
      "src/hooks/use-toast.ts",
      "src/components/ui/aspect-ratio.tsx",
      "src/components/ui/carousel.tsx",
      "src/components/ui/chart.tsx",
      "src/components/ui/collapsible.tsx",
      "src/components/ui/context-menu.tsx",
      "src/components/ui/drawer.tsx",
      "src/components/ui/form.tsx",
      "src/components/ui/hover-card.tsx",
      "src/components/ui/input-otp.tsx",
      "src/components/ui/menubar.tsx",
      "src/components/ui/navigation-menu.tsx",
      "src/components/ui/pagination.tsx",
      "src/components/ui/radio-group.tsx",
      "src/components/ui/resizable.tsx",
      "src/components/ui/sidebar.tsx",
      "src/components/ui/slider.tsx",
      "src/components/ui/toggle.tsx",
      "src/components/ui/toggle-group.tsx",
    ];

    removedPaths.forEach((path) => expect(existsSync(join(root, path)), path).toBe(false));

    sourceFiles("src").forEach((path) => {
      const contents = read(path);
      expect(contents, relative(root, path)).not.toMatch(/(?:@\/hooks\/use-toast|@\/components\/ui\/(?:use-toast|toast|toaster))/);
    });
  });

  it("does not retain the retired elevated role in active source, server, or docs", () => {
    const activeFiles = [
      ...sourceFiles("src"),
      "server.mjs",
      ...sourceFiles("docs").filter((path) => !path.endsWith("CLEANUP_HARDENING_INSTRUCTIONS.md")),
    ];

    activeFiles.forEach((path) => {
      expect(read(path), path).not.toMatch(/super[ _-]?admin/i);
    });
  });
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
