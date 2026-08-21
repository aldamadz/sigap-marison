import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { registerDocsRoute } from "./docs-route.mjs";
import {
  isRfc3339,
  sha256Hex,
  verifyRequestSignature,
  verifyScryptSecret,
} from "./auth.mjs";
import { buildExternalOpenApi, submissionDecisionValidationSchema } from "./openapi.mjs";

const port = Number(process.env.PORT || 80);
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicUrl = String(process.env.EXTERNAL_API_PUBLIC_URL || "https://external.marison-testing.biz.id").replace(/\/+$/, "");
const appPublicUrl = String(process.env.APP_PUBLIC_URL || "https://sigap.marison-testing.biz.id").replace(/\/+$/, "");
const maxSkewMs = Number(process.env.EXTERNAL_API_MAX_SKEW_MS || 5 * 60 * 1000);
const maxLimit = Number(process.env.EXTERNAL_API_MAX_LIMIT || 100);
const accessTokenTtlSeconds = Number(process.env.EXTERNAL_API_ACCESS_TOKEN_TTL_SECONDS || 15 * 60);
const submissionDecisionsApiToken = String(process.env.SUBMISSION_DECISIONS_API_TOKEN || "");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
if (submissionDecisionsApiToken.length < 32) {
  throw new Error("SUBMISSION_DECISIONS_API_TOKEN must contain at least 32 characters.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const storageMode = process.env.STORAGE_MODE || "primary_supabase";
const storageSupabaseUrl = process.env.STORAGE_SUPABASE_URL;
const storageServiceRoleKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SERVICE_ROLE_KEY;
const storagePublicBaseUrl = String(
  process.env.STORAGE_PUBLIC_BASE_URL ||
  (storageSupabaseUrl ? `${storageSupabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public` : "")
).replace(/\/+$/, "");
const storageSupabase = storageMode === "self_hosted_supabase" && storageSupabaseUrl && storageServiceRoleKey
  ? createClient(storageSupabaseUrl, storageServiceRoleKey, { auth: { persistSession: false } })
  : null;

if (storageMode !== "self_hosted_supabase" || !storageSupabase || !storagePublicBaseUrl) {
  throw new Error("Self-hosted storage is required for external file access.");
}

const getBearerToken = (request) => {
  const auth = request.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
};

const storageClientForRef = (ref) => ref?.origin === "external" && storageSupabase ? storageSupabase : supabase;

const parseStorageRef = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  const knownBuckets = ["dokumen_surat", "lampiran_surat"];

  try {
    const parsed = new URL(value);
    const marker = "/storage/v1/object/public/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const rest = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
      const slash = rest.indexOf("/");
      const origin = storagePublicBaseUrl && value.startsWith(storagePublicBaseUrl) ? "external" : "primary";
      if (slash > 0) return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1), origin };
    }
  } catch {}

  for (const bucket of knownBuckets) {
    if (value.startsWith(`${bucket}/`)) return { bucket, path: value.slice(bucket.length + 1), origin: "primary" };
  }
  if (value.startsWith("lampiran_")) return { bucket: "lampiran_surat", path: value, origin: "primary" };
  return { bucket: "dokumen_surat", path: value, origin: "primary" };
};

const makeFileDescriptor = (suratId, type, rawRef, extra = {}) => {
  const ref = parseStorageRef(rawRef);
  if (!ref) return null;
  const query = new URLSearchParams(extra).toString();
  return {
    type,
    file_name: ref.path.split("/").pop() || null,
    view_url: `/api/surat/${suratId}/files/${type}${query ? `?${query}` : ""}`,
  };
};

const sanitizeSurat = (row) => {
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const signatures = Array.isArray(row.signatures) ? row.signatures : [];
  const files = [
    makeFileDescriptor(row.id, "document", row.file_path),
    makeFileDescriptor(row.id, "pdf", row.pdf_path),
    ...attachments.map((item) => makeFileDescriptor(row.id, "attachment", item.file_url, { attachment_id: item.id })),
    ...signatures.map((item) => makeFileDescriptor(row.id, "signature-pdf", item.pdf_path_snap, { signature_id: item.id })),
  ].filter(Boolean);

  return {
    ...row,
    file_path: undefined,
    pdf_path: undefined,
    attachments: attachments.map(({ file_url, ...item }) => ({
      ...item,
      file: makeFileDescriptor(row.id, "attachment", file_url, { attachment_id: item.id }),
    })),
    signatures: signatures.map(({ pdf_path_snap, ...item }) => ({
      ...item,
      file: makeFileDescriptor(row.id, "signature-pdf", pdf_path_snap, { signature_id: item.id }),
    })),
    files,
  };
};

const OFFICE_TYPE_LABELS = {
  pusat: "Kantor Pusat",
  kc: "KC",
  kcp: "KCP",
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const normalizeOfficeType = (value) => {
  const normalized = normalizeText(value).replace(/[\s._-]+/g, "");
  if (!normalized) return null;
  if (["pusat", "kantorpusat", "headquarter", "hq"].includes(normalized)) return "pusat";
  if (normalized === "kc") return "kc";
  if (normalized === "kcp") return "kcp";
  return null;
};

const getOfficeType = (office) => {
  const kedudukan = normalizeText(office?.kedudukan);
  const code = normalizeText(office?.code);
  const name = normalizeText(office?.name);
  if (kedudukan.includes("pusat") || name === "kantor pusat") return "pusat";
  if (kedudukan === "kcp" || code.startsWith("kcp") || name.startsWith("kcp ")) return "kcp";
  if (kedudukan === "kc" || code.startsWith("kc") || name.startsWith("kc ")) return "kc";
  return "kc";
};

const sanitizeOffice = (office, officeById = new Map()) => {
  const type = getOfficeType(office);
  const parent = office?.parent_id ? officeById.get(office.parent_id) : null;
  return {
    id: office.id,
    code: office.code || null,
    name: office.name || null,
    type,
    type_label: OFFICE_TYPE_LABELS[type],
    parent_id: office.parent_id || null,
    parent_code: parent?.code || null,
    parent_name: parent?.name || null,
  };
};

const isBranchDepartment = (department) => /\(cabang\)/i.test(String(department?.name || ""));
const normalizeDepartmentScope = (value) => {
  const normalized = normalizeText(value).replace(/[\s._-]+/g, "");
  if (!normalized || normalized === "all" || normalized === "semua") return "all";
  if (["pusat", "kantorpusat"].includes(normalized)) return "pusat";
  if (["cabang", "kc", "kcp"].includes(normalized)) return "cabang";
  return null;
};

const sanitizeDepartment = (department) => ({
  id: department.id,
  code: department.code || null,
  name: department.name || null,
  dept_index: department.dept_index ?? null,
  scope: isBranchDepartment(department) ? "cabang" : "pusat",
});

const loadMasterOffices = async () => {
  const { data, error } = await supabase
    .from("master_offices")
    .select("id, name, code, kedudukan, parent_id")
    .order("name", { ascending: true });
  if (error) throw error;
  const rows = data || [];
  const officeById = new Map(rows.map((office) => [office.id, office]));
  return rows
    .map((office) => sanitizeOffice(office, officeById))
    .sort((left, right) =>
      (left.type === right.type ? 0 : ["pusat", "kc", "kcp"].indexOf(left.type) - ["pusat", "kc", "kcp"].indexOf(right.type)) ||
      String(left.name || "").localeCompare(String(right.name || ""), "id")
    );
};

const loadMasterDepartments = async () => {
  const { data, error } = await supabase
    .from("master_departments")
    .select("id, name, code, dept_index")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || [])
    .map(sanitizeDepartment)
    .sort((left, right) =>
      (Number(left.dept_index ?? 9999) - Number(right.dept_index ?? 9999)) ||
      String(left.name || "").localeCompare(String(right.name || ""), "id")
    );
};

const writeAuditLog = async (request, statusCode, errorMessage = null) => {
  try {
    await supabase.from("external_api_audit_logs").insert({
      client_id: request.externalClient?.id || null,
      method: request.method,
      path: request.url,
      status_code: statusCode,
      ip_address: request.ip || null,
      user_agent: request.headers["user-agent"] || null,
      error_message: errorMessage,
    });
  } catch (error) {
    request.log.error({ err: error }, "external audit log failed");
  }
};

const authenticateRequest = async (request, reply) => {
  const token = getBearerToken(request);
  const timestamp = String(request.headers["x-timestamp"] || "");
  const signature = String(request.headers["x-signature"] || "").trim().toLowerCase();
  if (!token || !timestamp || !signature || !isRfc3339(timestamp)) {
    return reply.code(401).send({ message: "Unauthorized" });
  }

  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxSkewMs) {
    return reply.code(401).send({ message: "Unauthorized" });
  }

  const { data: accessToken, error } = await supabase
    .from("external_api_access_tokens")
    .select("id, client_id, expires_at, revoked_at, external_api_clients!inner(id, name, allowed_ips, is_active, scopes)")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  const client = accessToken?.external_api_clients;
  if (error || !accessToken || !client || accessToken.revoked_at || !client.is_active || Date.parse(accessToken.expires_at) <= Date.now()) {
    return reply.code(401).send({ message: "Unauthorized" });
  }
  if (Array.isArray(client.allowed_ips) && client.allowed_ips.length > 0 && !client.allowed_ips.includes(request.ip)) {
    request.externalClient = client;
    return reply.code(403).send({ message: "IP tidak diizinkan" });
  }

  if (!verifyRequestSignature(signature, token, {
    method: request.method,
    pathWithQuery: request.url,
    rawBody: request.rawBody ?? Buffer.alloc(0),
    timestamp,
  })) {
    request.externalClient = client;
    return reply.code(401).send({ message: "Unauthorized" });
  }

  request.externalClient = client;
  request.externalAccessTokenId = accessToken.id;
  await Promise.all([
    supabase.from("external_api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id),
    supabase.from("external_api_access_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", accessToken.id),
  ]);
};

const authenticateSubmissionDecisionRequest = async (request, reply) => {
  await authenticateRequest(request, reply);
  if (reply.sent) return;
  if (!Array.isArray(request.externalClient?.scopes) || !request.externalClient.scopes.includes("submission:decide")) {
    return reply.code(403).send({ message: "Client tidak memiliki scope submission:decide" });
  }
};

const resolveFileRef = async (suratId, type, query) => {
  const { data, error } = await supabase
    .from("surat_external_export")
    .select("id, file_path, pdf_path, attachments, signatures")
    .eq("id", suratId)
    .single();
  if (error || !data) return null;
  if (type === "document") return parseStorageRef(data.file_path);
  if (type === "pdf") return parseStorageRef(data.pdf_path);
  if (type === "attachment") return parseStorageRef((data.attachments || []).find((item) => item.id === query.attachment_id)?.file_url);
  if (type === "signature-pdf") return parseStorageRef((data.signatures || []).find((item) => item.id === query.signature_id)?.pdf_path_snap);
  return null;
};

const app = Fastify({
  logger: {
    redact: [
      "req.headers.authorization",
      "req.headers.x-signature",
      "req.body.client_secret",
      "res.body.data.access_token",
    ],
  },
  trustProxy: true,
});
app.removeContentTypeParser("application/json");
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
  request.rawBody = Buffer.from(body);
  try {
    done(null, JSON.parse(request.rawBody.toString("utf8")));
  } catch (error) {
    error.statusCode = 400;
    done(error);
  }
});
await app.register(rateLimit, { global: false });
await registerDocsRoute(app);

app.get("/", { schema: { hide: true } }, async (_request, reply) => reply.redirect("/docs/api"));
app.get("/openapi.json", { schema: { hide: true } }, async () => buildExternalOpenApi(publicUrl));
app.get("/health", { schema: { hide: true } }, async () => ({ status: "ok" }));

app.post("/api/v1/submission-decisions", {
  config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  preValidation: authenticateSubmissionDecisionRequest,
  onResponse: async (request, reply) => {
    await writeAuditLog(request, reply.statusCode, reply.statusCode >= 400 ? reply.statusMessage : null);
  },
  bodyLimit: 4096,
  schema: { hide: true, body: submissionDecisionValidationSchema },
}, async (request, reply) => {
  const upstream = await fetch(`${appPublicUrl}/api/v1/submission-decisions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${submissionDecisionsApiToken}`,
      "content-type": "application/json",
      "x-request-id": request.id,
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    request.log.error({ err: error }, "submission decision upstream failed");
    return null;
  });

  if (!upstream) {
    return reply.code(502).header("Cache-Control", "no-store").send({ message: "Backend SIGAP tidak dapat dihubungi." });
  }

  const responseBody = await upstream.text();
  const responseType = upstream.headers.get("content-type") || "application/json; charset=utf-8";
  return reply
    .code(upstream.status)
    .type(responseType)
    .header("Cache-Control", "no-store")
    .send(responseBody);
});

app.post("/api/access-token", {
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  schema: {
    summary: "Generate Access Token",
    tags: ["Authentication"],
    body: {
      type: "object",
      additionalProperties: false,
      required: ["client_id", "client_secret"],
      properties: {
        client_id: { type: "string" },
        client_secret: { type: "string" },
      },
    },
  },
}, async (request, reply) => {
  const { client_id: clientId, client_secret: clientSecret } = request.body;
  const { data: client } = await supabase
    .from("external_api_clients")
    .select("id, client_id, client_secret_hash, allowed_ips, is_active")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .maybeSingle();

  if (!client || !verifyScryptSecret(clientSecret, client.client_secret_hash)) {
    await writeAuditLog(request, 401, "Invalid client credentials");
    return reply.code(401).send({ message: "Invalid client credentials" });
  }
  if (Array.isArray(client.allowed_ips) && client.allowed_ips.length > 0 && !client.allowed_ips.includes(request.ip)) {
    request.externalClient = client;
    await writeAuditLog(request, 403, "IP tidak diizinkan");
    return reply.code(403).send({ message: "IP tidak diizinkan" });
  }

  const token = `sigap_at_${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + accessTokenTtlSeconds * 1000).toISOString();
  const { error } = await supabase.from("external_api_access_tokens").insert({
    client_id: client.id,
    token_hash: sha256Hex(token),
    expires_at: expiresAt,
  });
  if (error) throw error;

  request.externalClient = client;
  await supabase.from("external_api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  await writeAuditLog(request, 200);
  return {
    message: "Access token generated successfully",
    data: {
      access_token: token,
      token_type: "bearer",
      expires_in: String(accessTokenTtlSeconds),
    },
  };
});

const secured = {
  preHandler: authenticateRequest,
  onResponse: async (request, reply) => {
    await writeAuditLog(request, reply.statusCode, reply.statusCode >= 400 ? reply.statusMessage : null);
  },
  schema: {
    security: [{ bearerAuth: [], timestamp: [], signature: [] }],
  },
};

app.get("/api/master/offices", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "List Kantor",
    description: "Master kantor untuk onboarding akun. Gunakan `type=pusat`, `type=kc`, atau `type=kcp` untuk memfilter pilihan.",
    tags: ["Master Data"],
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pusat", "kc", "kcp"] },
      },
    },
  },
}, async (request, reply) => {
  const requestedType = normalizeOfficeType(request.query.type);
  if (request.query.type && !requestedType) {
    return reply.code(400).send({ message: "Tipe kantor tidak valid. Gunakan pusat, kc, atau kcp." });
  }
  const offices = await loadMasterOffices();
  return {
    data: requestedType ? offices.filter((office) => office.type === requestedType) : offices,
  };
});

app.get("/api/master/departments", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "List Departemen",
    description: "Master departemen untuk onboarding akun. Gunakan `scope=pusat` untuk pilihan Kantor Pusat atau `scope=cabang` untuk departemen cabang.",
    tags: ["Master Data"],
    querystring: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", enum: ["pusat", "cabang", "all"] },
      },
    },
  },
}, async (request, reply) => {
  const scope = normalizeDepartmentScope(request.query.scope);
  if (request.query.scope && !scope) {
    return reply.code(400).send({ message: "Scope departemen tidak valid. Gunakan pusat, cabang, atau all." });
  }
  const departments = await loadMasterDepartments();
  return {
    data: scope === "all" ? departments : departments.filter((department) => department.scope === scope),
  };
});

app.get("/api/onboarding/options", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "Opsi Onboarding Akun",
    description: "Mengembalikan pilihan tipe kantor, kantor, dan departemen untuk alur login pertama sistem eksternal.",
    tags: ["Master Data"],
  },
}, async () => {
  const [offices, departments] = await Promise.all([loadMasterOffices(), loadMasterDepartments()]);
  return {
    data: {
      office_types: [
        { value: "pusat", label: OFFICE_TYPE_LABELS.pusat },
        { value: "kc", label: OFFICE_TYPE_LABELS.kc },
        { value: "kcp", label: OFFICE_TYPE_LABELS.kcp },
      ],
      offices: {
        pusat: offices.filter((office) => office.type === "pusat"),
        kc: offices.filter((office) => office.type === "kc"),
        kcp: offices.filter((office) => office.type === "kcp"),
      },
      departments: departments.filter((department) => department.scope === "pusat"),
    },
  };
});

app.get("/api/surat", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "List Surat",
    tags: ["Surat"],
    querystring: {
      type: "object",
      properties: {
        department_code: { type: "string" },
        office_code: { type: "string" },
        project_code: { type: "string" },
        status: { type: "string" },
        updated_since: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: maxLimit, default: 50 },
        cursor: { type: "string" },
      },
    },
  },
}, async (request) => {
  const limit = Math.min(Math.max(Number(request.query.limit || 50), 1), maxLimit);
  const cursor = Number(Buffer.from(request.query.cursor || "MA==", "base64url").toString("utf8"));
  const offset = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  let query = supabase.from("surat_external_export").select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);
  for (const key of ["department_code", "office_code", "project_code", "status"]) {
    if (request.query[key]) query = query.eq(key, request.query[key]);
  }
  if (request.query.updated_since) query = query.gte("updated_at", request.query.updated_since);
  const { data, error, count } = await query;
  if (error) throw error;
  const nextOffset = offset + (data?.length || 0);
  return {
    data: (data || []).map(sanitizeSurat),
    page: {
      limit,
      count: data?.length || 0,
      total: count ?? null,
      next_cursor: data?.length === limit ? Buffer.from(String(nextOffset)).toString("base64url") : null,
    },
  };
});

app.get("/api/surat/:suratId", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "Detail Surat",
    tags: ["Surat"],
    params: {
      type: "object",
      required: ["suratId"],
      properties: { suratId: { type: "string", format: "uuid" } },
    },
  },
}, async (request, reply) => {
  const { data, error } = await supabase.from("surat_external_export").select("*").eq("id", request.params.suratId).single();
  if (error || !data) return reply.code(404).send({ message: "Surat tidak ditemukan" });
  return { data: sanitizeSurat(data) };
});

app.get("/api/surat/:suratId/files/:type", {
  ...secured,
  schema: {
    ...secured.schema,
    summary: "Preview File Surat",
    tags: ["Surat"],
    params: {
      type: "object",
      required: ["suratId", "type"],
      properties: {
        suratId: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["document", "pdf", "attachment", "signature-pdf"] },
      },
    },
    querystring: {
      type: "object",
      properties: {
        attachment_id: { type: "string", format: "uuid" },
        signature_id: { type: "string", format: "uuid" },
      },
    },
  },
}, async (request, reply) => {
  const ref = await resolveFileRef(request.params.suratId, request.params.type, request.query);
  if (!ref) return reply.code(404).send({ message: "File tidak ditemukan" });
  const { data, error } = await storageClientForRef(ref).storage.from(ref.bucket).download(ref.path);
  if (error || !data) return reply.code(404).send({ message: error?.message || "File tidak ditemukan" });
  const buffer = Buffer.from(await data.arrayBuffer());
  const filename = ref.path.split("/").pop() || "file";
  return reply
    .header("Content-Type", data.type || "application/octet-stream")
    .header("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`)
    .header("Cache-Control", "no-store")
    .send(buffer);
});

app.setErrorHandler(async (error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  if (!reply.sent) {
    reply.code(error.statusCode || 500).send({
      message: error.statusCode && error.statusCode < 500 ? error.message : "Internal server error",
    });
  }
});

await app.listen({ port, host: "0.0.0.0" });
