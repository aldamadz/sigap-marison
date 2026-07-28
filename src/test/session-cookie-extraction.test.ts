import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("session-cookie extraction", () => {
  it("moves the AES-GCM session encryption into a typed helper module", () => {
    const module = read("backend/src/domain/session-cookie.ts");
    expect(module).toContain("createSessionCookieHelpers");
    expect(module).toContain("createCipheriv");
    expect(module).toContain("aes-256-gcm");
    expect(module).toContain("setSessionCookie");
    expect(module).toContain("clearSessionCookie");
    expect(module).toContain("readCookieSession");
    expect(module).toContain("publicSession");
    expect(module).toContain("CookieSession");
    expect(module).toContain("FastifyRequest");
  });

  it("no longer carries the verbatim @ts-nocheck escape hatch in the helper", () => {
    const module = read("backend/src/domain/session-cookie.ts");
    expect(module).not.toContain("@ts-nocheck");
  });

  it("removes inline session helpers from domain-runtime.ts and delegates to the helper module", () => {
    const runtime = read("backend/src/domain-runtime.ts");
    expect(runtime).not.toContain("const parseCookies = (req)");
    expect(runtime).not.toContain("const encryptSession = (session)");
    expect(runtime).not.toContain("const decryptSession = (value)");
    expect(runtime).not.toContain("const compactSessionUser = (user)");
    expect(runtime).toContain("createSessionCookieHelpers");
    expect(runtime).toContain("SESSION_COOKIE_HELPERS");
  });
});
