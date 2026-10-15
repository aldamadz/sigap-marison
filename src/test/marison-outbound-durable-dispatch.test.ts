import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyMarisonPostResponse,
  classifyMarisonPostError,
  extractMarisonExternalReference,
  readMarisonOutboundWorkerConfig,
  createMarisonOutboundWorker,
} from "../../server/marison-outbound-worker.mjs";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migrationPath = "supabase/migrations/20260729103000_durable_marison_outbound_dispatch.sql";

describe("durable Marison outbound dispatch", () => {
  it("skips token and business POST when builder reports all rejected", async () => {
    const timeout = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: () => new AbortController().signal });
    const urls: string[] = [];
    const worker = createMarisonOutboundWorker({
      config: {
        supabaseUrl: "https://database.example.test",
        serviceRoleKey: "service-role",
        marisonBaseUrl: "https://vendor.example.test",
        bffBaseUrl: "https://bff.example.test",
        internalToken: "i".repeat(32),
        databaseTimeoutMs: 1_000,
        buildTimeoutMs: 1_000,
      },
      fetchImpl: async (input) => {
        urls.push(String(input));
        return new Response(JSON.stringify({ skipped: true, code: "all_recommendations_rejected", no_dispatch: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    try {
      await worker.processJob({ job_id: "job-1", lease_token: "lease-1" });
      expect(urls).toEqual(["https://bff.example.test/api/internal/marison/outbound/job-1/build"]);
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: timeout });
    }
  });

  it("fetches token before final DB marker and does not business-fetch when boundary skips", async () => {
    const timeout = AbortSignal.timeout;
    Object.defineProperty(AbortSignal, "timeout", {
      configurable: true,
      value: () => new AbortController().signal,
    });
    const urls: string[] = [];
    const worker = createMarisonOutboundWorker({
      config: {
        supabaseUrl: "https://database.example.test",
        serviceRoleKey: "service-role",
        marisonBaseUrl: "https://vendor.example.test",
        bffBaseUrl: "https://bff.example.test",
        internalToken: "i".repeat(32),
        databaseTimeoutMs: 1_000,
        tokenTimeoutMs: 1_000,
        buildTimeoutMs: 1_000,
      },
      fetchImpl: async (input) => {
        urls.push(String(input));
        const url = String(input);
        const body = url === "https://vendor.example.test/access-token"
          ? { data: { access_token: "vendor-token", expires_in: 900 } }
          : url.includes("bff.example.test")
            ? { kind: "asset", endpoint: "/asset-purchase-requests", contractVersion: "v1", payloadBody: "{}", payloadHash: "a".repeat(64) }
            : { post_started: false, skipped: true, code: "all_recommendations_rejected" };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    try {
      await worker.processJob({
        job_id: "70000000-0000-4000-8000-000000000001",
        lease_token: "71000000-0000-4000-8000-000000000001",
        kind: "asset",
        endpoint: "/asset-purchase-requests",
        contract_version: "v1",
        payload: {},
        payload_body: "{}",
        payload_hash: "a".repeat(64),
      });
      expect(urls).toHaveLength(4);
      expect(urls[0]).toContain("/rest/v1/rpc/cleanup_stale_recommendation_file_view_tokens");
      expect(urls[1]).toBe("https://vendor.example.test/access-token");
      expect(urls[2]).toContain("/api/internal/marison/outbound/");
      expect(urls[3]).toContain("/rest/v1/rpc/mark_marison_outbound_post_started");
      expect(urls).not.toContain("https://vendor.example.test/asset-purchase-requests");
    } finally {
      Object.defineProperty(AbortSignal, "timeout", { configurable: true, value: timeout });
    }
  });
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

  it("exposes read-only recovery preflight separately from reconciliation", () => {
    const routes = read("backend/src/routes/domain.routes.ts");
    const server = read("backend/src/domain-runtime.ts");
    const identityImports = [...server.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\.\/\.\.\/server\/marison-payload-identity\.mjs["'];/g)]
      .flatMap((match) => match[1].split(",").map((name) => name.trim()));
    expect(routes).toContain('GET", url: "/api/integrations/marison/dispatches/:dispatchId/preflight');
    expect(identityImports).toContain("isPrePostRecoveryEligible");
    expect(server).toContain("preflightMarisonOutboundRecovery");
    expect(server).toContain("NOT_PRE_POST_FAILURE");
    expect(server).toContain("Job outbound tidak ditemukan.");
    expect(server).toContain("preflightMarisonOutboundRecovery(job, surat)");
    expect(server).toMatch(/return sendJson\(res, 200, \{\r?\n\s+eligible: preflight\.eligible/);
    expect(server).toContain('return sendJson(res, 404, { eligible: false, reasonCode: "NOT_PRE_POST_FAILURE", reason: "Surat tidak ditemukan." });');
  });

  it("guards production recovery at the API and atomically at the database transition", () => {
    const server = read("backend/src/domain-runtime.ts");
    const migration = read("supabase/migrations/20260924170000_guard_pre_post_outbound_recovery.sql");
    expect(server).toContain("isOutboundRecoveryConfirmed(action, marisonDeploymentEnvironment, payload?.confirmProductionSend)");
    expect(server).toContain("preflightMarisonOutboundRecovery(job, surat)");
    expect(migration).toContain("before update of status on public.marison_outbound_dispatches");
    expect(migration).toContain("old.post_started_at is not null");
    expect(migration).toContain("old.response is not null");
    expect(migration).toContain("old.external_reference is not null");
  });

  it("keeps HTTP 422 replacements generation-aware, deterministic, and single-child", () => {
    const migration = read("supabase/migrations/20260803120000_marison_outbound_replacement_jobs.sql");
    const server = read("backend/src/domain-runtime.ts");
    const routes = read("backend/src/routes/domain.routes.ts");
    expect(migration).toContain("replacement_of_dispatch_id");
    expect(migration).toContain("generation integer not null default 1");
    expect(migration).toContain("marison_outbound_dispatch_generation_idx");
    expect(migration).toContain("marison_outbound_single_replacement_idx");
    expect(migration).toContain("marison_outbound_one_active_job_idx");
    expect(migration).toContain("marison_outbound_replacement_events");
    expect(migration).toContain("Only confirmed staging HTTP 422 dispatches can be replaced");
    expect(migration).toContain("Replacement already exists");
    expect(migration).toContain("v_old.post_started_at is null");
    expect(migration).toContain("format('sigap:staging:%s:%s:g%s'");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).not.toContain("gen_random_uuid()), 'pending'");
    expect(server).toContain("createMarisonOutboundReplacement");
    expect(server).toContain('"create_verified_unit_outbound_replacement"');
    expect(server).toContain('"PRODUCTION_REPLACEMENT_UNSUPPORTED"');
    expect(server).toContain('.order("generation", { ascending: false })');
    expect(routes).toContain('GET", url: "/api/integrations/marison/dispatches/:dispatchId/replacement-preflight');
    expect(routes).toContain('POST", url: "/api/integrations/marison/dispatches/:dispatchId/replacement');
  });

  it("loads the complete surat source before rebuilding a replacement payload", () => {
    const server = read("backend/src/domain-runtime.ts");
    const start = server.indexOf("const preflightMarisonOutboundReplacement");
    const end = server.indexOf("const getAuthorizedSurat", start);
    const preflight = server.slice(start, end);
    const suratSelect = preflight.match(/\.from\("surat_registrasi"\)\s*\.select\((["`])([\s\S]*?)\1\)/)?.[2] || "";

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(suratSelect).toContain("no_surat");
    expect(suratSelect).toContain("created_at");
    expect(suratSelect).toContain("office_id");
    expect(suratSelect).toContain("project_id");
    expect(suratSelect).toContain("surat_signatures");
    expect(suratSelect).toContain("surat_attachments");
    expect(suratSelect).toMatch(/surat_signatures\s*\([^)]*\bpdf_path_snap\b/);
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
    expect(extractMarisonExternalReference("fund", { data: { fund_submission_id: 77 } })).toBe("77");
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
