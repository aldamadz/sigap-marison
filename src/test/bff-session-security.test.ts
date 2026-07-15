import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("SIGAP browser BFF session boundary", () => {
  it("keeps the browser facade free from Supabase SDK, keys, and Web Storage sessions", () => {
    const client = read("src/lib/supabase.ts");

    expect(client).not.toContain("@supabase/supabase-js");
    expect(client).not.toContain("VITE_SUPABASE");
    expect(client).not.toContain("storage.setItem");
    expect(client).toContain("clearLegacySupabaseSessions");
    expect(client).toContain("storage.removeItem(key)");
    expect(client).toContain("/api/auth/session");
    expect(client).toContain("/api/bff/query");
  });

  it("stores the real Supabase session in an encrypted HttpOnly same-site cookie", () => {
    const server = read("server.mjs");

    expect(server).toContain('createCipheriv("aes-256-gcm"');
    expect(server).toContain('createDecipheriv("aes-256-gcm"');
    expect(server).toContain('"HttpOnly"');
    expect(server).toContain('"SameSite=Lax"');
    expect(server).toContain('"__Host-sigap_session"');
    expect(server).toContain("createUserSupabaseClient(session.access_token)");
    expect(server).toContain("assertSameOrigin(req)");
  });
});
