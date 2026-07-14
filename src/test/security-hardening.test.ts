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

  it("keeps letter number generation bound to the active actor and authorized scope", () => {
    const migration = read("supabase/migrations/20260714152000_close_remaining_security_blockers.sql");
    const functionStart = migration.indexOf("create or replace function public.generate_new_letter_number(");
    const functionEnd = migration.indexOf("revoke all on function public.generate_new_letter_number", functionStart);
    const generator = migration.slice(functionStart, functionEnd);

    expect(functionStart).toBeGreaterThan(-1);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(generator).toContain("v_actor uuid := auth.uid()");
    expect(generator).toContain("p_user_id is distinct from v_actor");
    expect(generator).toContain("select profile.office_id, profile.department_id, profile.role::text");
    expect(generator).toContain("from public.profiles as profile");
    expect(generator).toContain("profile.id = v_actor");
    expect(generator).toContain("coalesce(profile.is_active, true) = true");
    expect(generator).toContain("profile.deleted_at is null");
    expect(generator).toContain("v_is_admin := coalesce(v_actor_role = 'admin', false)");
    expect(generator).toContain("not v_is_admin and p_office_id is distinct from v_actor_office_id");
    expect(generator).toMatch(/if not v_is_admin\s+and v_is_pusat\s+and p_dept_id is distinct from v_actor_department_id/);
    expect(generator).toContain("pg_advisory_xact_lock");
    expect(generator).toMatch(/reserved_by,[\s\S]*?'PENDING',\s*v_actor,/);
    expect(migration).toContain("create unique index if not exists surat_reservations_cabang_no_project_unique");
  });

  it("protects private avatar downloads with authentication and owner-or-admin authorization", () => {
    const server = read("server.mjs");
    const routeStart = server.indexOf('url.pathname === "/api/profile/avatar/file"');
    const routeEnd = server.indexOf("const match = url.pathname.match", routeStart);
    const route = server.slice(routeStart, routeEnd);
    const avatarComponent = read("src/components/ui/avatar.tsx");

    expect(routeStart).toBeGreaterThan(-1);
    expect(route).toContain("await requireSupabaseUser(token)");
    expect(route).toContain("ownerId");
    expect(route).toContain("isAdmin");
    expect(route).toContain('"Cache-Control": "private, no-store"');
    expect(route).not.toContain('"Cache-Control": "public');
    expect(avatarComponent).toContain("Authorization: `Bearer ${session.access_token}`");
    expect(avatarComponent).toContain("URL.revokeObjectURL");
  });
});
