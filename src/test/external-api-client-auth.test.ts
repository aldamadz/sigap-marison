import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRequestSignatureCanonical,
  createRequestSignature,
  sha256Hex,
  verifyRequestSignature,
} from "../../external-api/auth.mjs";

describe("external API client credential request signing", () => {
  const accessToken = "sigap_at_test_access_token_with_at_least_32_chars";
  const timestamp = "2026-08-21T10:00:00+07:00";
  const rawBody = Buffer.from('{"event_id":"b03a2bcd-83ea-4ff8-8bb9-02829192ed85"}');

  it("signs the exact raw request body", () => {
    const canonical = buildRequestSignatureCanonical({
      method: "post",
      pathWithQuery: "/api/v1/submission-decisions",
      accessToken,
      rawBody,
      timestamp,
    });

    expect(canonical).toBe(
      `POST:/api/v1/submission-decisions:${accessToken}:${sha256Hex(rawBody)}:${timestamp}`,
    );
  });

  it("rejects a signature when whitespace or payload content changes", () => {
    const input = {
      method: "POST",
      pathWithQuery: "/api/v1/submission-decisions",
      rawBody,
      timestamp,
    };
    const signature = createRequestSignature(accessToken, input);

    expect(verifyRequestSignature(signature, accessToken, input)).toBe(true);
    expect(verifyRequestSignature(signature, accessToken, { ...input, rawBody: Buffer.from(` ${rawBody}`) })).toBe(false);
    expect(verifyRequestSignature(signature, accessToken, { ...input, timestamp: "2026-08-21T10:00:01+07:00" })).toBe(false);
  });

  it("protects the decision facade with short-lived auth and keeps the static token internal", () => {
    const server = readFileSync(join(process.cwd(), "external-api", "server.mjs"), "utf8");

    expect(server).toContain('const submissionDecisionsApiToken = String(process.env.SUBMISSION_DECISIONS_API_TOKEN || "")');
    expect(server).toContain('authorization: `Bearer ${submissionDecisionsApiToken}`');
    expect(server).toContain("preValidation: authenticateSubmissionDecisionRequest");
    expect(server).toContain('request.externalClient.scopes.includes("submission:decide")');
    expect(server).not.toContain('authorization: String(request.headers.authorization || "")');
  });

  it("stores generated client credentials in a protected file instead of stdout", () => {
    const script = readFileSync(join(process.cwd(), "scripts", "create-external-api-client.mjs"), "utf8");
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260821140000_external_api_client_scopes.sql"),
      "utf8",
    );

    expect(script).toContain('openSync(outputPath, "wx", 0o600)');
    expect(script).toContain("rmSync(outputPath, { force: true })");
    expect(script).toContain('const DEFAULT_SCOPE = "submission:decide"');
    expect(script).toContain("if (!options.scopes.length) options.scopes.push(DEFAULT_SCOPE)");
    expect(script).toContain("process.exitCode = 1");
    expect(script).not.toContain("process.exit(1)");
    expect(script).toContain("scopes,");
    expect(script).not.toContain("console.log(JSON.stringify({\n  client: data,\n  client_id: clientId,\n  client_secret: clientSecret");
    expect(migration).toContain("add column if not exists scopes text[] not null");
    expect(migration).toContain("submission:decide");
  });

  it("only activates external clients with credentials and an explicit scope", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260821143000_external_api_enable_scoped_clients.sql"),
      "utf8",
    );

    expect(migration).toContain("drop constraint if exists external_api_clients_inactive_check");
    expect(migration).toContain("external_api_clients_active_credentials_check");
    expect(migration).toContain("nullif(btrim(client_id), '') is not null");
    expect(migration).toContain("nullif(btrim(client_secret_hash), '') is not null");
    expect(migration).toContain("cardinality(scopes) > 0");
  });

  it("allows short-lived tokens to start active while enforcing their lifecycle", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260821144500_external_api_enable_short_lived_tokens.sql"),
      "utf8",
    );

    expect(migration).toContain("drop constraint if exists external_api_access_tokens_revoked_check");
    expect(migration).toContain("external_api_access_tokens_lifecycle_check");
    expect(migration).toContain("expires_at > created_at");
    expect(migration).toContain("revoked_at is null or revoked_at >= created_at");
  });
});
