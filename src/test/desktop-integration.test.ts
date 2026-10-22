import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { desktopChallenge, desktopCursor, desktopEnabled, desktopHash, desktopSecret, pairingInput, safeDesktopPath } from "../../backend/src/lib/desktop-integration";

describe("desktop notification trust boundaries", () => {
  it("is restricted to the explicit staging deployment", () => {
    expect(desktopEnabled("staging")).toBe(true);
    for (const env of ["production", "test", "", "STAGING"]) expect(desktopEnabled(env)).toBe(false);
  });
  it("uses random 256-bit opaque secrets and S256 rather than desktop credentials", () => {
    const token = desktopSecret();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(desktopSecret()).not.toBe(token);
    expect(desktopHash(token)).toHaveLength(64);
    expect(desktopChallenge("a".repeat(43))).toBe(createHash("sha256").update("a".repeat(43)).digest("base64url"));
  });
  const input = { client_id: "sigap-desktop-staging", installation_id: "99999999-9999-4999-8999-999999999999", device_name: "PC Finance", platform: "windows", code_challenge: "a".repeat(43), code_challenge_method: "S256" };
  it("accepts device names only as bounded metadata", () => {
    expect(pairingInput.parse(input)).toEqual(input);
    for (const device_name of ["", "x".repeat(101), "bad\nname"]) expect(pairingInput.safeParse({ ...input, device_name }).success).toBe(false);
  });
  it("rejects other clients, redirect URLs, passwords and privilege requests", () => {
    for (const extra of [{ client_id: "production" }, { redirect_uri: "https://evil.test" }, { password: "secret" }, { user_id: input.installation_id }, { role: "admin" }, { platform: "linux" }, { code_challenge_method: "plain" }]) {
      expect(pairingInput.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/admin/users", "/api/files/token", "/surat\n/inbox", "/%2f%2fevil.test", "javascript:alert(1)"])("does not forward unsafe notification links: %s", (url) => {
    expect(safeDesktopPath(url)).toBe(null);
  });
  it("only returns application navigation paths, never raw notification data", () => {
    expect(safeDesktopPath("/surat/inbox?id=123#ignored")).toBe("/surat/inbox?id=123");
    expect(safeDesktopPath("/calendar?date=2026-10-22")).toBe("/calendar?date=2026-10-22");
  });
  it("validates cursor components before PostgREST filter construction", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(desktopCursor.parse(encode({ at: "2026-10-22T00:00:00.123456+00:00", id: input.installation_id }))).toEqual({ at: "2026-10-22T00:00:00.123456+00:00", id: input.installation_id });
    for (const bad of ["not-json", encode({ at: "x),user_id.neq.x", id: input.installation_id }), encode({ at: "2026-10-22T00:00:00Z", id: "x),or(x" })]) expect(desktopCursor.safeParse(bad).success).toBe(false);
  });
});
