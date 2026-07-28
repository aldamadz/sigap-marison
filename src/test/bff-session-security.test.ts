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
    expect(client).toContain("sessionLoadError = normalizeError(error, 'Gagal memeriksa sesi login')");
    expect(client).toContain("return { data: { session }, error: sessionLoadError }");
  });

  it("stores the real Supabase session in an encrypted HttpOnly same-site cookie", () => {
    const server = read("backend/src/domain-runtime.ts");
    const cookieWriterStart = server.indexOf("const setSessionCookie");
    const cookieWriterEnd = server.indexOf("const publicSession", cookieWriterStart);
    const cookieWriter = server.slice(cookieWriterStart, cookieWriterEnd);

    expect(server).toContain('createCipheriv("aes-256-gcm"');
    expect(server).toContain('createDecipheriv("aes-256-gcm"');
    expect(server).toContain('"HttpOnly"');
    expect(server).toContain('"SameSite=Lax"');
    expect(server).toContain('"__Host-sigap_session"');
    expect(server).toContain("createUserSupabaseClient(session.access_token)");
    expect(server).toContain("accessToken: async () => accessToken");
    expect(server).not.toContain('supabase.rpc("create_surat_registrasi_for_actor"');
    expect(server).toContain("assertSameOrigin(req)");
    expect(cookieWriterStart).toBeGreaterThan(-1);
    expect(cookieWriterEnd).toBeGreaterThan(cookieWriterStart);
    expect(cookieWriter).toContain("user: compactSessionUser(session.user)");
    expect(cookieWriter).toContain('Buffer.byteLength(cookie, "utf8") > 3800');
    expect(cookieWriter).not.toContain("user: session.user");
  });

  it("does not expose arbitrary private storage through the generic BFF facade", () => {
    const server = read("backend/src/domain-runtime.ts");
    const handlerStart = server.indexOf("const handleBffStorageFile");
    const handlerEnd = server.indexOf("const openBffRealtimeStream", handlerStart);
    const handler = server.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('bucket !== "avatars"');
    expect(handler).toContain("Akses file harus melalui endpoint dokumen yang terotorisasi.");
    expect(handler).toContain("removeStoragePathPrefix(path, storagePathPrefix)");
    expect(handler).toContain("relativePath.startsWith(`${session.user.id}/`)");
  });
});
