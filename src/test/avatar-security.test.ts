import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("private avatar delivery", () => {
  it("keeps avatar files behind authenticated SIGAP proxy without owner-only blocking", () => {
    const server = read("backend/src/domain-runtime.ts");
    const routeStart = server.indexOf('url.pathname === "/api/profile/avatar/file"');
    const routeEnd = server.indexOf("const match = url.pathname.match", routeStart);
    const route = server.slice(routeStart, routeEnd);

    expect(routeStart).toBeGreaterThan(-1);
    expect(route).toContain("await requireSupabaseUser(token)");
    expect(route).toContain('"Cache-Control": "private, max-age=31536000, immutable"');
    expect(route).not.toContain('"Cache-Control": "public');
    expect(route).not.toContain("Akses foto profil ditolak");
    expect(route).not.toContain("ownerId");
  });

  it("loads private avatars with an authenticated request and a temporary object URL", () => {
    const avatarComponent = read("src/components/ui/avatar.tsx");

    expect(avatarComponent).toContain("supabase.auth.getSession()");
    expect(avatarComponent).toContain("Authorization: `Bearer ${session.access_token}`");
    expect(avatarComponent).toContain("URL.createObjectURL");
    expect(avatarComponent).toContain("URL.revokeObjectURL");
    expect(avatarComponent).toContain("src={resolvedSrc}");
  });
});
