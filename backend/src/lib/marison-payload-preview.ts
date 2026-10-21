import { createHash } from "node:crypto";

type StoredDispatch = {
  id: string;
  environment: string;
  generation: number;
  kind: string | null;
  endpoint: string | null;
  payload: unknown;
  payload_body: string | null;
  payload_hash: string | null;
  post_started_at: string | null;
};

const endpoints: Record<string, string> = {
  asset: "/asset-purchase-requests", unit: "/unit-submissions",
  non_unit: "/non-unit-submissions", fund: "/fund-submissions",
};
const privateKey = /^(authorization|proxy_authorization|cookie|set_cookie|client_secret|access_token|refresh_token|password|secret|api_key|service_role_key|signature|x_signature|lease_token)$/i;

export function previewStoredMarisonPayload(job: StoredDispatch) {
  const base = {
    dispatchId: job.id, environment: job.environment, generation: job.generation,
    method: "POST" as const, endpoint: endpoints[job.kind || ""] === job.endpoint ? job.endpoint : null,
    postStartedAt: job.post_started_at, payloadHash: job.payload_hash,
  };
  const source = job.payload_body ? "frozen" : job.payload != null ? "snapshot" : "unavailable";
  if (source === "unavailable") return { ...base, source, payload: null, redacted: false };
  let payload: unknown;
  try {
    const raw = source === "frozen" ? job.payload_body! : JSON.stringify(job.payload);
    if (Buffer.byteLength(raw, "utf8") > 2_000_000) throw new Error("size");
    if (source === "frozen" && job.payload_hash && createHash("sha256").update(raw).digest("hex") !== job.payload_hash) {
      throw new Error("hash");
    }
    payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("object");
  } catch {
    throw Object.assign(new Error("Payload tersimpan tidak valid atau hash tidak cocok. Hubungi operator untuk pemeriksaan."), { status: 409 });
  }
  let redacted = false;
  const clean = (value: unknown, depth = 0): unknown => {
    if (depth > 32) throw Object.assign(new Error("Struktur payload terlalu dalam."), { status: 409 });
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (privateKey.test(key.replace(/-/g, "_"))) {
        redacted = true;
        return [key, "[DISEMBUNYIKAN]"];
      }
      return [key, clean(item, depth + 1)];
    }));
    return value;
  };
  const safePayload = clean(payload);
  return { ...base, source, payload: safePayload, redacted };
}
