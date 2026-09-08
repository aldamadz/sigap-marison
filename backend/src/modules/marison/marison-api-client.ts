import { createHash, createHmac } from "node:crypto";

type MarisonEnvironment = "staging" | "production";
type MarisonError = Error & { status?: number };
type JsonResponse = { ok: boolean; status: number; json(): Promise<unknown> };
type FetchLike = (input: URL | string, init?: RequestInit) => Promise<JsonResponse>;

export type MarisonApiClientDependencies = {
  deploymentEnvironment: string;
  readEnv(name: string): string | undefined;
  fetchImpl: FetchLike;
  nowMs(): number;
  nowIso(): string;
  timeoutSignal(milliseconds: number): AbortSignal;
};

const environments = new Set<MarisonEnvironment>(["staging", "production"]);
const sha256Hex = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const hmacSha512Hex = (secret: string, value: string) => createHmac("sha512", secret).update(value).digest("hex");
const errorWithStatus = (message: string, status: number): MarisonError => Object.assign(new Error(message), { status });
const objectValue = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === "object" ? value as Record<string, unknown> : {}
);
const responseJson = async (response: JsonResponse): Promise<Record<string, unknown>> => {
  try { return objectValue(await response.json()); } catch { return {}; }
};

export const createMarisonApiClient = (dependencies: MarisonApiClientDependencies) => {
  const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

  const normalizeMarisonEnvironment = (value: unknown): MarisonEnvironment => {
    const environment = String(value || "").trim().toLowerCase();
    if (!environments.has(environment as MarisonEnvironment)) throw errorWithStatus("Environment Marison tidak valid.", 400);
    return environment as MarisonEnvironment;
  };

  const lockedEnvironment = normalizeMarisonEnvironment(dependencies.deploymentEnvironment);

  const getMarisonEnvironmentState = async () => ({
    environment: lockedEnvironment,
    updatedAt: null,
    updatedBy: null,
    locked: true,
  });

  const getMarisonApiConfig = (environment: unknown) => {
    const normalized = normalizeMarisonEnvironment(environment);
    const prefix = normalized === "staging" ? "MARISON_STAGING" : "MARISON_PRODUCTION";
    const defaultBaseUrl = normalized === "staging"
      ? "https://marison-external.digivasi.com/api"
      : "https://external.marisonregency.id/api";
    return {
      environment: normalized,
      baseUrl: String(dependencies.readEnv(`${prefix}_BASE_URL`) || defaultBaseUrl).replace(/\/+$/, ""),
      clientId: dependencies.readEnv(`${prefix}_CLIENT_ID`) || "",
      clientSecret: dependencies.readEnv(`${prefix}_CLIENT_SECRET`) || "",
    };
  };

  const getMarisonAccessToken = async (source: { source_key?: unknown }, environment: unknown) => {
    const config = getMarisonApiConfig(environment);
    const { baseUrl, clientId, clientSecret } = config;
    if (!clientId || !clientSecret) throw errorWithStatus(`Credential API Marison ${config.environment} belum dikonfigurasi di server.`, 500);
    const cacheKey = `${baseUrl}:${source.source_key}:${clientId}`;
    const cached = accessTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > dependencies.nowMs() + 30_000) return cached.token;
    const response = await dependencies.fetchImpl(`${baseUrl}/access-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    const payload = await responseJson(response);
    if (!response.ok) throw errorWithStatus(String(payload.message || "Gagal membuat access token API eksternal Marison."), response.status);
    const data = objectValue(payload.data);
    const token = typeof data.access_token === "string" ? data.access_token : "";
    if (!token) throw errorWithStatus("Response access token API eksternal Marison tidak valid.", 502);
    const expiresInSeconds = Number.parseInt(String(data.expires_in ?? "900"), 10);
    accessTokenCache.set(cacheKey, { token, expiresAt: dependencies.nowMs() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 900) * 1000 });
    return token;
  };

  const getProtectedJson = async (
    environment: unknown,
    endpointPathOrUrl: string | URL,
    sourceKey: unknown,
    fallbackMessage: string,
    timeout: boolean,
  ): Promise<Record<string, unknown>> => {
    const config = getMarisonApiConfig(environment);
    let url: URL;
    if (typeof endpointPathOrUrl === "string" && endpointPathOrUrl.startsWith("/")) {
      url = new URL(`${config.baseUrl}${endpointPathOrUrl}`);
    } else {
      url = new URL(endpointPathOrUrl.toString());
      const base = new URL(config.baseUrl);
      const allowedPrefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
      if (
        url.origin !== base.origin ||
        (url.pathname !== base.pathname && !url.pathname.startsWith(allowedPrefix))
      ) {
        throw errorWithStatus("URL external Marison tidak valid.", 400);
      }
    }
    const token = await getMarisonAccessToken({ source_key: sourceKey }, environment);
    const timestamp = dependencies.nowIso();
    const canonical = ["GET", url.pathname, token, sha256Hex(Buffer.alloc(0)), timestamp].join(":");
    const response = await dependencies.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "X-Timestamp": timestamp, "X-Signature": hmacSha512Hex(token, canonical) },
      ...(timeout ? { signal: dependencies.timeoutSignal(20_000) } : {}),
    });
    const payload = await responseJson(response);
    if (!response.ok) throw errorWithStatus(String(payload.message || fallbackMessage), response.status);
    return payload;
  };

  const getMarisonProtectedJson = (environment: unknown, endpointPathOrUrl: string | URL) =>
    getProtectedJson(
      environment,
      endpointPathOrUrl,
      "employee_sync",
      `Gagal mengambil ${new URL(typeof endpointPathOrUrl === "string" && endpointPathOrUrl.startsWith("/") ? `${getMarisonApiConfig(environment).baseUrl}${endpointPathOrUrl}` : endpointPathOrUrl.toString()).pathname} dari API Marison.`,
      true
    );

  const getMarisonExternalJson = (source: { source_key?: unknown }, environment: unknown, endpointPathOrUrl: string | URL) =>
    getProtectedJson(environment, endpointPathOrUrl, source.source_key, "Gagal mengambil data dari API eksternal.", false);

  const getAllMarisonCollection = async (environment: unknown, pathname: string): Promise<unknown[]> => {
    const rows: unknown[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const payload = await getMarisonProtectedJson(environment, `${pathname}?per_page=100&page=${page}`);
      const data = objectValue(payload.data);
      const pageRows = Array.isArray(payload.data) ? payload.data : Array.isArray(data.data) ? data.data : [];
      rows.push(...pageRows);
      const meta = objectValue(payload.meta);
      if (page >= Number(meta.total_pages || 1) || pageRows.length === 0) return rows;
    }
    throw errorWithStatus(`Pagination ${pathname} melebihi batas aman.`, 502);
  };

  return { normalizeMarisonEnvironment, getMarisonEnvironmentState, getMarisonApiConfig, getMarisonAccessToken, getMarisonProtectedJson, getMarisonExternalJson, getAllMarisonCollection };
};
