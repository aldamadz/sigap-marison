import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(join(process.cwd(), "server.mjs"), "utf8");

describe("server security hardening", () => {
  it("never trusts an unverified JWT payload for authenticated endpoints", () => {
    expect(server).not.toContain("decodeJwtUserForLightEndpoint");
    expect(server).not.toContain("decodeBase64UrlJson");
    expect(server).toContain("const user = await requireSupabaseUser(token)");
    expect(server).toContain("await requireSupabaseUser(token);");
  });

  it("rate limits login failures and password reset requests", () => {
    expect(server).toContain("LOGIN_MAX_FAILURES_PER_IDENTITY");
    expect(server).toContain("LOGIN_MAX_FAILURES_PER_IP");
    expect(server).toContain("PASSWORD_RESET_MAX_PER_WINDOW");
    expect(server).toContain('res.setHeader("Retry-After"');
  });

  it("only serves static application files over GET and HEAD", () => {
    expect(server).toContain('if (!["GET", "HEAD"].includes(req.method || ""))');
    expect(server).toContain("res.writeHead(405");
    expect(server).toContain('"Allow": "GET, HEAD"');
  });

  it("signs Marison API requests with the access token and full URL path", () => {
    expect(server).toContain("const canonical = [method, url.pathname, token, bodyHash, timestamp]");
    expect(server).toContain('hmacSha512Hex(token, canonical)');
    expect(server).not.toContain("configuredSigningSecret");
  });
});
