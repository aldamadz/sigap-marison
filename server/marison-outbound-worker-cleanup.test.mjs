import assert from "node:assert/strict";
import test from "node:test";
import { createMarisonOutboundWorker } from "./marison-outbound-worker.mjs";

const job = { job_id: "job-1", kind: "asset", endpoint: "/asset-purchase-requests", lease_token: "lease-1" };
const prepared = {
  kind: "asset", endpoint: "/asset-purchase-requests", payloadBody: "{}", payloadHash: "hash", transportHash: "transport",
  materializationAttemptId: "attempt-1", mintedTokens: [{ tokenId: "token-1", attemptId: "attempt-1" }],
};

const runCase = async (marker, failTransportBuild = false) => {
  const rpcCalls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/rest/v1/rpc/cleanup_stale_recommendation_file_view_tokens")) { rpcCalls.push({ url, body: JSON.parse(init.body) }); return new Response("0", { status: 200 }); }
    if (url.endsWith("/access-token")) return new Response(JSON.stringify({ data: { access_token: "access", expires_in: 900 } }), { status: 200 });
    if (url.includes("/build")) {
      if (failTransportBuild && JSON.parse(init.body).transport === true) return new Response(JSON.stringify({ error: "build failed" }), { status: 500 });
      return new Response(JSON.stringify(prepared), { status: 200 });
    }
    if (url.includes("/rest/v1/rpc/mark_marison_outbound_post_started")) { rpcCalls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(marker), { status: marker.error ? 500 : 200 }); }
    if (url.includes("/rest/v1/rpc/cleanup_recommendation_file_view_tokens")) { rpcCalls.push({ url, body: JSON.parse(init.body) }); return new Response("1", { status: 200 }); }
    if (url.includes("/rest/v1/rpc/fail_marison_outbound_before_post")) return new Response("{}", { status: 200 });
    throw new Error(`Business fetch attempted: ${url}`);
  };
  const worker = createMarisonOutboundWorker({ config: {
    supabaseUrl: "https://database.test", serviceRoleKey: "service", bffBaseUrl: "https://sigap.test",
    marisonBaseUrl: "https://vendor.test", marisonClientId: "id", marisonClientSecret: "secret", internalToken: "internal",
    databaseTimeoutMs: 1000, tokenTimeoutMs: 1000, buildTimeoutMs: 1000, postTimeoutMs: 1000,
  }, fetchImpl, logger: { info() {}, error() {} } });
  await worker.processJob(job);
  return rpcCalls;
};

test("marker skipped revokes exactly attempt-minted links without business POST", async () => {
  const calls = await runCase({ skipped: true, post_started: false });
  assert.deepEqual(calls.map(({ body }) => body), [{ p_stale_after: "15 minutes" }, { p_job_id: "job-1", p_lease_token: "lease-1", p_materialization_attempt_id: "attempt-1" }, { p_attempt_id: "attempt-1", p_reason: "post_marker_skipped" }]);
});

test("marker failure revokes attempt-minted links without business POST", async () => {
  const calls = await runCase({ error: true });
  assert.deepEqual(calls.map(({ body }) => body), [{ p_stale_after: "15 minutes" }, { p_job_id: "job-1", p_lease_token: "lease-1", p_materialization_attempt_id: "attempt-1" }, { p_attempt_id: "attempt-1", p_reason: "post_marker_failed" }]);
});

test("transport build failure cleans worker-owned attempt without business POST", async () => {
  const calls = await runCase({ post_started: true }, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, { p_stale_after: "15 minutes" });
  assert.equal(calls[1].body.p_reason, "transport_build_failed");
  assert.match(calls[1].body.p_attempt_id, /^[0-9a-f-]{36}$/);
});
