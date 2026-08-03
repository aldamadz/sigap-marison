import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyMarisonPostResponse,
  classifyMarisonPostError,
  extractMarisonExternalReference,
  readMarisonOutboundWorkerConfig,
} from "../../server/marison-outbound-worker.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migrationPath = "supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql";

describe("durable Marison outbound dispatch", () => {
  it("uses one stable business job per surat and environment", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("unique (surat_id, environment)");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("format('sigap:%s:%s:%s'");
    expect(migration).not.toContain("insert into public.marison_outbound_dispatches\n  select");
  });

  it("claims jobs concurrently with a fixed two-minute lease", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("lease_expires_at = clock_timestamp() + interval '2 minutes'");
    expect(migration).toContain("candidate.attempt_count < 3");
  });

  it("separates retryable pre-POST failures from ambiguous POST outcomes", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("fail_marison_outbound_before_post");
    expect(migration).toContain("mark_marison_outbound_post_started");
    expect(migration).toContain("complete_marison_outbound_after_post");
    expect(migration).toContain("worker_lease_expired_after_post");
    expect(migration).toContain("status = 'outcome_unknown'");
    expect(migration).toContain("15 * (2 ^ greatest");
  });

  it("rejects stale lease tokens on every state mutation", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("lease_token is distinct from p_lease_token");
    expect(migration).toContain("and d.lease_token = p_lease_token");
    expect(migration).toContain("Stale lease or POST was not started");
  });

  it("keeps outbox tables and RPCs service-role only", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.marison_outbound_dispatches from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.claim_marison_outbound_dispatch(text) to service_role");
    expect(migration).toContain("revoke execute on function public.reconcile_marison_outbound_dispatch");
  });

  it("enqueues only a future completion transition and skips recommendation children", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("after update of status on public.surat_registrasi");
    expect(migration).toContain("upper(coalesce(old.status::text, '')) not in ('SELESAI', 'DONE')");
    expect(migration).toContain("recommendation_child");
    expect(migration).toContain("unsupported_category");
  });

  it("requires admin audit and duplicate-risk confirmation for reconciliation", () => {
    const migration = read(migrationPath);
    const server = read("backend/src/domain-runtime.ts");
    expect(migration).toContain("create table public.marison_outbound_reconciliation_events");
    expect(migration).toContain("p_confirm_duplicate_risk is not true");
    expect(migration).toContain("before_state jsonb not null");
    expect(migration).toContain("reopen_terminal_pre_post");
    expect(migration).toContain("p.role::text = 'admin'");
    expect(server).toContain("confirmDuplicateRisk !== true");
    expect(server).toContain("assertSameOrigin(req)");
  });

  it("exposes staging recovery preflight separately from reconciliation", () => {
    const routes = read("backend/src/routes/domain.routes.ts");
    const server = read("backend/src/domain-runtime.ts");
    expect(routes).toContain('GET", url: "/api/integrations/marison/dispatches/:dispatchId/preflight');
    expect(server).toContain("preflightMarisonOutboundRecovery");
    expect(server).toContain("NOT_PRE_POST_FAILURE");
    expect(server).toContain("Job outbound tidak ditemukan.");
    expect(server).toContain("preflightMarisonOutboundRecovery(job, surat)");
  });

  it("protects the internal build route with a minimum-length constant-time token", () => {
    const server = read("backend/src/domain-runtime.ts");
    const routes = read("backend/src/routes/domain.routes.ts");
    expect(server).toContain("MARISON_OUTBOUND_INTERNAL_TOKEN minimal 32 karakter");
    expect(server).toContain("timingSafeEqual");
    expect(server).toContain('req.headers["x-internal-outbound-token"]');
    expect(routes).toContain('/api/internal/marison/outbound/:jobId/build');
    expect(server).not.toContain('req.headers["x-internal-call"]');
  });

  it("fails closed when the worker token is short", () => {
    expect(() => readMarisonOutboundWorkerConfig({
      MARISON_DEPLOYMENT_ENVIRONMENT: "staging",
      MARISON_SUBMISSION_DISPATCH_ENABLED: "true",
      MARISON_OUTBOUND_INTERNAL_TOKEN: "short",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      MARISON_STAGING_CLIENT_ID: "client",
      MARISON_STAGING_CLIENT_SECRET: "secret",
    })).toThrow("minimal 32 karakter");
  });

  it("classifies HTTP 5xx and invalid success responses as unknown", () => {
    expect(classifyMarisonPostResponse({ kind: "unit", status: 503, response: {}, responseValid: true })).toMatchObject({
      status: "outcome_unknown",
      errorCode: "marison_http_503",
    });
    expect(classifyMarisonPostResponse({ kind: "unit", status: 200, response: null, responseValid: false })).toMatchObject({
      status: "outcome_unknown",
      errorCode: "invalid_success_response",
    });
  });

  it("classifies timeout and connection loss after POST as unknown", () => {
    expect(classifyMarisonPostError(new DOMException("timed out", "TimeoutError"))).toMatchObject({
      status: "outcome_unknown",
      errorCode: "marison_post_timeout",
    });
    expect(classifyMarisonPostError(new TypeError("fetch failed"))).toMatchObject({
      status: "outcome_unknown",
      errorCode: "marison_post_connection_lost",
    });
  });

  it("classifies clear HTTP 4xx rejection as terminal", () => {
    expect(classifyMarisonPostResponse({ kind: "asset", status: 422, response: {}, responseValid: true })).toMatchObject({
      status: "failed_terminal",
      errorCode: "marison_http_422",
    });
  });

  it("extracts external references from every documented response shape", () => {
    expect(extractMarisonExternalReference("unit", { data: { submission_id: 42 } })).toBe("42");
    expect(extractMarisonExternalReference("non_unit", { data: { submission_id: "51" } })).toBe("51");
    expect(extractMarisonExternalReference("asset", { data: { asset_purchase_request_id: 9 } })).toBe("9");
    expect(extractMarisonExternalReference("asset", { data: { asset_purchase_request_ids: [9, 10] } })).toBe("9,10");
    expect(extractMarisonExternalReference("unit", { data: { submission_id: { unsafe: true } } })).toBeNull();
  });

  it("rejects redirects for every credentialed request", () => {
    const worker = read("server/marison-outbound-worker.mjs");
    expect(worker.match(/redirect: "error"/g)).toHaveLength(4);
    expect(read("backend/src/app.ts")).toContain("req.headers.x-internal-outbound-token");
  });

  it("packages the worker but keeps staging activation explicit", () => {
    const dockerfile = read("dockerfile");
    const compose = read("docker-compose.staging.yml");
    expect(dockerfile).toContain("server/marison-outbound-worker.mjs");
    expect(compose).toContain('profiles: ["marison-outbound"]');
    expect(compose).toContain("MARISON_OUTBOUND_TIMEOUT_MS");
  });
});
