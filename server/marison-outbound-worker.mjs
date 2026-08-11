import { createHash, createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const hmacSha512Hex = (secret, value) => createHmac("sha512", secret).update(value).digest("hex");

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
};

const normalizeExternalReference = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized && normalized.length <= 200 && /^[A-Za-z0-9._:/-]+$/.test(normalized) ? normalized : null;
};

export const extractMarisonExternalReference = (kind, response) => {
  const data = response?.data;
  if (kind === "unit" || kind === "non_unit") return normalizeExternalReference(data?.submission_id);
  if (kind === "asset") {
    const single = normalizeExternalReference(data?.asset_purchase_request_id);
    if (single) return single;
    const many = Array.isArray(data?.asset_purchase_request_ids)
      ? data.asset_purchase_request_ids.map(normalizeExternalReference).filter(Boolean)
      : [];
    return many.length > 0 ? many.join(",") : null;
  }
  return null;
};

export const classifyMarisonPostResponse = ({ kind, status, response, responseValid }) => {
  if (status >= 200 && status < 300) {
    const externalReference = responseValid ? extractMarisonExternalReference(kind, response) : null;
    if (!externalReference) {
      return {
        status: "outcome_unknown",
        errorCode: "invalid_success_response",
        errorMessage: "Marison mengembalikan respons sukses tanpa referensi eksternal yang valid.",
      };
    }
    return { status: "succeeded", externalReference };
  }

  if (status >= 400 && status < 500) {
    return {
      status: "failed_terminal",
      errorCode: `marison_http_${status}`,
      errorMessage: `Marison menolak request dengan HTTP ${status}.`,
    };
  }

  return {
    status: "outcome_unknown",
    errorCode: `marison_http_${status || "unknown"}`,
    errorMessage: "Marison tidak memberikan hasil POST yang dapat dipastikan.",
  };
};

export const classifyMarisonPostError = (error) => ({
  status: "outcome_unknown",
  errorCode: ["TimeoutError", "AbortError"].includes(String(error?.name || ""))
    ? "marison_post_timeout"
    : "marison_post_connection_lost",
  errorMessage: "Koneksi terputus setelah POST dimulai; hasil pengiriman belum dapat dipastikan.",
});

class PrePostError extends Error {
  constructor(message, { code = "pre_post_failure", retryable = true, details = null } = {}) {
    super(message);
    this.name = "PrePostError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

const requireRpc = async (promise, operation) => {
  const { data, error } = await promise;
  if (error) throw new Error(`${operation}: ${error.message}`);
  return data;
};

export const createMarisonOutboundWorker = ({ config, fetchImpl = fetch, logger = console }) => {
  const databaseFetch = (url, init = {}) => fetchImpl(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(config.databaseTimeoutMs),
  });
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: databaseFetch },
  });
  let cachedAccessToken = null;
  let stopped = false;

  const getAccessToken = async () => {
    if (cachedAccessToken?.expiresAt > Date.now() + 30_000) return cachedAccessToken.value;

    let response;
    try {
      response = await fetchImpl(`${config.marisonBaseUrl}/access-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: config.marisonClientId,
          client_secret: config.marisonClientSecret,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(config.tokenTimeoutMs),
      });
    } catch (error) {
      throw new PrePostError("Tidak dapat memperoleh token Marison.", {
        code: "marison_token_network_error",
        retryable: true,
        details: { cause: error instanceof Error ? error.name : "unknown" },
      });
    }

    const body = await response.json().catch(() => null);
    if (response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)) {
      throw new PrePostError(`Credential Marison ditolak dengan HTTP ${response.status}.`, {
        code: `marison_token_http_${response.status}`,
        retryable: false,
      });
    }
    if (!response.ok) {
      throw new PrePostError(`Layanan token Marison gagal dengan HTTP ${response.status}.`, {
        code: `marison_token_http_${response.status}`,
        retryable: true,
      });
    }

    const token = String(body?.data?.access_token || "");
    if (!token) {
      throw new PrePostError("Respons token Marison tidak valid.", {
        code: "marison_token_invalid_response",
        retryable: true,
      });
    }
    const expiresIn = boundedInteger(body?.data?.expires_in, 900, 60, 86_400);
    cachedAccessToken = { value: token, expiresAt: Date.now() + expiresIn * 1000 };
    return token;
  };

  const buildPayload = async (job, transport = false) => {
    let response;
    try {
      response = await fetchImpl(`${config.bffBaseUrl}/api/internal/marison/outbound/${job.job_id}/build`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Outbound-Token": config.internalToken,
        },
        body: JSON.stringify({ leaseToken: job.lease_token, transport }),
        redirect: "error",
        signal: AbortSignal.timeout(config.buildTimeoutMs),
      });
    } catch (error) {
      throw new PrePostError("BFF tidak dapat membangun payload outbound.", {
        code: "payload_build_network_error",
        retryable: true,
        details: { cause: error instanceof Error ? error.name : "unknown" },
      });
    }

    const body = await response.json().catch(() => null);
    if (response.ok && body?.skipped === true) return body;
    if (!response.ok) {
      throw new PrePostError(String(body?.error || "Payload outbound tidak dapat dibangun."), {
        code: String(body?.code || `payload_build_http_${response.status}`),
        retryable: response.status >= 500 || [408, 425, 429].includes(response.status),
      });
    }
    if (!body?.payloadBody || !body?.payloadHash || !body?.endpoint || !body?.kind) {
      throw new PrePostError("BFF mengembalikan payload outbound yang tidak lengkap.", {
        code: "payload_build_invalid_response",
        retryable: true,
      });
    }
    return body;
  };

  const failBeforePost = async (job, error) => {
    const prePostError = error instanceof PrePostError
      ? error
      : new PrePostError("Persiapan outbound gagal.", { code: "unexpected_pre_post_error", retryable: true });
    return requireRpc(
      supabase.rpc("fail_marison_outbound_before_post", {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
        p_retryable: prePostError.retryable,
        p_error_code: prePostError.code,
        p_error_message: prePostError.message,
        p_error_details: prePostError.details,
      }),
      "fail before POST"
    );
  };

  const completeAfterPost = async (job, outcome, response = null) => {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await requireRpc(
          supabase.rpc("complete_marison_outbound_after_post", {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
            p_status: outcome.status,
            p_response: response,
            p_error_code: outcome.errorCode || null,
            p_error_message: outcome.errorMessage || null,
            p_error_details: null,
            p_external_reference: outcome.externalReference || null,
          }),
          "complete after POST"
        );
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(attempt * 500);
      }
    }
    throw lastError;
  };

  const processJob = async (job) => {
    let postStarted = false;
    let prepared = job.payload_body ? {
      kind: job.kind,
      endpoint: job.endpoint,
      contractVersion: job.contract_version,
      payload: job.payload,
      payloadBody: job.payload_body,
      payloadHash: job.payload_hash,
    } : null;

    try {
      if (!prepared) prepared = await buildPayload(job);
      if (prepared?.skipped === true) return;
      const expectedEndpoint = {
        unit: "/unit-submissions",
        non_unit: "/non-unit-submissions",
        asset: "/asset-purchase-requests",
      }[prepared.kind];
      if (!expectedEndpoint || prepared.endpoint !== expectedEndpoint) {
        throw new PrePostError("Endpoint payload outbound tidak valid.", {
          code: "invalid_prepared_endpoint",
          retryable: false,
        });
      }
      const accessToken = await getAccessToken();
      prepared = await buildPayload(job, true);
      if (prepared?.skipped === true) return;
      const url = new URL(`${config.marisonBaseUrl}${prepared.endpoint}`);
      const timestamp = new Date().toISOString();
      const canonical = ["POST", url.pathname, accessToken, prepared.transportHash || prepared.payloadHash, timestamp].join(":");
      const postBoundary = await requireRpc(
        supabase.rpc("mark_marison_outbound_post_started", {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
        }),
        "mark POST started"
      );
      if (postBoundary?.skipped === true) return;
      if (postBoundary?.post_started !== true) {
        throw new PrePostError("Boundary POST outbound tidak valid.", {
          code: "invalid_post_boundary_response",
          retryable: true,
        });
      }
      postStarted = true;
      let response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            "X-Timestamp": timestamp,
            "X-Signature": hmacSha512Hex(accessToken, canonical),
          },
          body: prepared.payloadBody,
          redirect: "error",
          signal: AbortSignal.timeout(config.postTimeoutMs),
        });
      } catch (error) {
        await completeAfterPost(job, classifyMarisonPostError(error));
        return;
      }

      const responseText = await response.text().catch(() => null);
      let responseBody = null;
      let responseValid = false;
      if (responseText !== null) {
        try {
          responseBody = responseText ? JSON.parse(responseText) : {};
          responseValid = true;
        } catch {
          responseValid = false;
        }
      }
      const outcome = classifyMarisonPostResponse({
        kind: prepared.kind,
        status: response.status,
        response: responseBody,
        responseValid,
      });
      await completeAfterPost(job, outcome, responseValid ? responseBody : null);
    } catch (error) {
      if (postStarted || (prepared && error instanceof Error && error.message.startsWith("complete after POST"))) throw error;
      try {
        await failBeforePost(job, error);
      } catch (completionError) {
        logger.error("Gagal menyimpan kegagalan pre-POST", {
          jobId: job.job_id,
          message: completionError instanceof Error ? completionError.message : "unknown",
        });
      }
    }
  };

  const pollOnce = async () => {
    const jobs = await requireRpc(
      supabase.rpc("claim_marison_outbound_dispatch", { p_environment: config.environment }),
      "claim dispatch"
    );
    const job = Array.isArray(jobs) ? jobs[0] : null;
    if (!job) return false;
    logger.info("Memproses antrean outbound Marison", {
      jobId: job.job_id,
      kind: job.kind,
      attempt: job.attempt_count,
    });
    await processJob(job);
    return true;
  };

  const run = async () => {
    let emptyPolls = 0;
    while (!stopped) {
      try {
        if (await pollOnce()) {
          emptyPolls = 0;
          continue;
        }
        emptyPolls += 1;
      } catch (error) {
        emptyPolls += 1;
        logger.error("Polling outbound Marison gagal", {
          message: error instanceof Error ? error.message : "unknown",
        });
      }
      const delay = Math.min(config.pollIntervalMs * (2 ** Math.min(emptyPolls, 4)), config.maxIdleBackoffMs);
      await sleep(delay);
    }
  };

  return { pollOnce, processJob, run, stop: () => { stopped = true; } };
};

export const readMarisonOutboundWorkerConfig = (environment = process.env) => {
  const deploymentEnvironment = String(environment.MARISON_DEPLOYMENT_ENVIRONMENT || "").trim().toLowerCase();
  if (!['staging', 'production'].includes(deploymentEnvironment)) {
    throw new Error("MARISON_DEPLOYMENT_ENVIRONMENT must be staging or production.");
  }
  if (String(environment.MARISON_SUBMISSION_DISPATCH_ENABLED || "false").toLowerCase() !== "true") {
    return { enabled: false, environment: deploymentEnvironment };
  }

  const prefix = deploymentEnvironment === "staging" ? "MARISON_STAGING" : "MARISON_PRODUCTION";
  const internalToken = String(environment.MARISON_OUTBOUND_INTERNAL_TOKEN || "");
  const required = {
    supabaseUrl: environment.SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    marisonClientId: environment[`${prefix}_CLIENT_ID`],
    marisonClientSecret: environment[`${prefix}_CLIENT_SECRET`],
  };
  if (Object.values(required).some((value) => !value)) {
    throw new Error("Konfigurasi worker outbound Marison belum lengkap.");
  }
  if (internalToken.length < 32) {
    throw new Error("MARISON_OUTBOUND_INTERNAL_TOKEN minimal 32 karakter saat worker aktif.");
  }

  const defaultBaseUrl = deploymentEnvironment === "staging"
    ? "https://marison-external.digivasi.com/api"
    : "https://external.marisonregency.id/api";
  const supabaseUrl = new URL(String(required.supabaseUrl));
  const marisonBaseUrl = new URL(String(environment[`${prefix}_BASE_URL`] || defaultBaseUrl));
  if (supabaseUrl.protocol !== "https:" || marisonBaseUrl.protocol !== "https:") {
    throw new Error("Worker outbound Marison hanya menerima endpoint HTTPS.");
  }
  return {
    enabled: true,
    environment: deploymentEnvironment,
    ...required,
    internalToken,
    marisonBaseUrl: marisonBaseUrl.href.replace(/\/+$/, ""),
    bffBaseUrl: String(environment.MARISON_OUTBOUND_INTERNAL_URL || "http://agenda-flow-staging").replace(/\/+$/, ""),
    pollIntervalMs: boundedInteger(environment.MARISON_OUTBOUND_POLL_MS, 5_000, 500, 60_000),
    maxIdleBackoffMs: boundedInteger(environment.MARISON_OUTBOUND_MAX_BACKOFF_MS, 60_000, 5_000, 300_000),
    databaseTimeoutMs: boundedInteger(environment.MARISON_OUTBOUND_DATABASE_TIMEOUT_MS, 15_000, 1_000, 30_000),
    tokenTimeoutMs: boundedInteger(environment.MARISON_OUTBOUND_TOKEN_TIMEOUT_MS, 15_000, 1_000, 30_000),
    buildTimeoutMs: boundedInteger(environment.MARISON_OUTBOUND_BUILD_TIMEOUT_MS, 60_000, 5_000, 90_000),
    postTimeoutMs: boundedInteger(environment.MARISON_OUTBOUND_TIMEOUT_MS, 30_000, 1_000, 90_000),
  };
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const config = readMarisonOutboundWorkerConfig();
  if (!config.enabled) {
    console.info("Worker outbound Marison nonaktif.");
  } else {
    const worker = createMarisonOutboundWorker({ config });
    process.once("SIGINT", worker.stop);
    process.once("SIGTERM", worker.stop);
    console.info("Worker outbound Marison aktif", {
      environment: config.environment,
      timeoutMs: config.postTimeoutMs,
    });
    worker.run().catch((error) => {
      console.error("Worker outbound Marison berhenti", {
        message: error instanceof Error ? error.message : "unknown",
      });
      process.exitCode = 1;
    });
  }
}
