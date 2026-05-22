import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { extname } from "node:path";
import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.PORT || 80);
const host = process.env.HOST || "0.0.0.0";
const publicUrl = process.env.EXTERNAL_API_PUBLIC_URL || "https://external.marison-testing.biz.id";
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const maxSkewMs = Number(process.env.EXTERNAL_API_MAX_SKEW_MS || 5 * 60 * 1000);
const maxLimit = Number(process.env.EXTERNAL_API_MAX_LIMIT || 100);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const contentTypes = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

const safeEqualHex = (a, b) => {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && timingSafeEqual(left, right);
};

const getBearerToken = (request) => {
  const auth = request.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
};

const getRequestIp = (request) => {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (raw?.split(",")[0] || request.ip || "").replace(/^::ffff:/, "").trim();
};

const parseExternalTimestamp = (value) => {
  if (!value) return NaN;
  if (/^\d+$/.test(value)) {
    const n = Number(value);
    return n < 10_000_000_000 ? n * 1000 : n;
  }
  return Date.parse(value);
};

const parseStorageRef = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const value = raw.trim();
  const knownBuckets = [
    "dokumen_surat",
    "lampiran_surat",
    "spk_files",
    "payment_files",
    "chat_attachments",
  ];

  try {
    const parsed = new URL(value);
    const marker = "/storage/v1/object/public/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const rest = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
      const slash = rest.indexOf("/");
      if (slash > 0) return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1) };
    }
  } catch {}

  for (const bucket of knownBuckets) {
    if (value.startsWith(`${bucket}/`)) {
      return { bucket, path: value.slice(bucket.length + 1) };
    }
  }

  if (value.startsWith("lampiran_")) return { bucket: "lampiran_surat", path: value };
  if (value.startsWith("payment-")) return { bucket: "payment_files", path: value };
  if (value.startsWith("spk-")) return { bucket: "spk_files", path: value };

  return { bucket: "dokumen_surat", path: value };
};

const makeFileDescriptor = (suratId, type, ref, extra = {}) => {
  const parsed = parseStorageRef(ref);
  if (!parsed) return null;
  const params = new URLSearchParams(extra);
  const query = params.toString() ? `?${params.toString()}` : "";
  return {
    type,
    file_name: parsed.path.split("/").pop() || null,
    view_url: `/api/surat/${suratId}/files/${type}${query}`,
  };
};

const sanitizeSurat = (row) => {
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const signatures = Array.isArray(row.signatures) ? row.signatures : [];
  const financeReviews = Array.isArray(row.finance_reviews) ? row.finance_reviews : [];

  const files = [
    makeFileDescriptor(row.id, "document", row.file_path),
    makeFileDescriptor(row.id, "pdf", row.pdf_path),
    makeFileDescriptor(row.id, "spk", row.pic_attachment),
    ...attachments.map((a) => makeFileDescriptor(row.id, "attachment", a.file_url, { attachment_id: a.id })),
    ...signatures.map((s) => makeFileDescriptor(row.id, "signature-pdf", s.pdf_path_snap, { signature_id: s.id })),
    ...financeReviews.map((f) => makeFileDescriptor(row.id, "payment", f.payment_file_path, { finance_review_id: f.id })),
  ].filter(Boolean);

  const {
    file_path: _filePath,
    pdf_path: _pdfPath,
    pic_attachment: _picAttachment,
    ...safeRow
  } = row;

  return {
    ...safeRow,
    attachments: attachments.map(({ file_url, ...attachment }) => ({
      ...attachment,
      file: makeFileDescriptor(row.id, "attachment", file_url, { attachment_id: attachment.id }),
    })),
    signatures: signatures.map(({ pdf_path_snap, ...signature }) => ({
      ...signature,
      file: makeFileDescriptor(row.id, "signature-pdf", pdf_path_snap, { signature_id: signature.id }),
    })),
    finance_reviews: financeReviews.map(({ payment_file_path, ...review }) => ({
      ...review,
      file: makeFileDescriptor(row.id, "payment", payment_file_path, { finance_review_id: review.id }),
    })),
    files,
  };
};

const writeAuditLog = async ({ clientId, request, statusCode, errorMessage = null }) => {
  try {
    await supabase.from("external_api_audit_logs").insert({
      client_id: clientId || null,
      method: request.method,
      path: request.url,
      status_code: statusCode,
      ip_address: getRequestIp(request) || null,
      user_agent: request.headers["user-agent"] || null,
      error_message: errorMessage,
    });
  } catch (error) {
    request.log.error({ err: error }, "external audit log failed");
  }
};

const authenticateExternalRequest = async (request) => {
  const bearerToken = getBearerToken(request);
  const timestampHeader = request.headers["x-timestamp"];
  const signatureHeader = request.headers["x-signature"];
  if (!bearerToken || !timestampHeader || !signatureHeader) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  const timestampMs = parseExternalTimestamp(String(timestampHeader));
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxSkewMs) {
    const err = new Error("Timestamp tidak valid");
    err.statusCode = 401;
    throw err;
  }

  const { data: client, error } = await supabase
    .from("external_api_clients")
    .select("id, name, hmac_secret, allowed_ips, is_active")
    .eq("token_hash", sha256Hex(bearerToken))
    .eq("is_active", true)
    .maybeSingle();
  if (error || !client) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  const requestIp = getRequestIp(request);
  if (Array.isArray(client.allowed_ips) && client.allowed_ips.length > 0 && !client.allowed_ips.includes(requestIp)) {
    const err = new Error("IP tidak diizinkan");
    err.statusCode = 403;
    err.clientId = client.id;
    throw err;
  }

  const bodyHash = sha256Hex(Buffer.alloc(0));
  const canonical = [
    request.method,
    request.url,
    String(timestampHeader),
    bodyHash,
  ].join("\n");
  const expected = createHmac("sha256", client.hmac_secret).update(canonical).digest("hex");
  if (!safeEqualHex(expected, String(signatureHeader).trim().toLowerCase())) {
    const err = new Error("Signature tidak valid");
    err.statusCode = 401;
    err.clientId = client.id;
    throw err;
  }

  await supabase
    .from("external_api_clients")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", client.id);

  return { id: client.id, name: client.name };
};

const querySuratList = async (queryParams) => {
  const limit = Math.min(Math.max(Number(queryParams.limit || 50), 1), maxLimit);
  const cursorValue = queryParams.cursor || "MA==";
  const cursor = Number(Buffer.from(cursorValue, "base64url").toString("utf8"));
  const offset = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;

  let query = supabase
    .from("surat_external_export")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  for (const key of ["department_code", "office_code", "project_code", "status"]) {
    if (queryParams[key]) query = query.eq(key, queryParams[key]);
  }

  if (queryParams.updated_since) query = query.gte("updated_at", queryParams.updated_since);

  const { data, error, count } = await query;
  if (error) throw error;

  const nextOffset = offset + (data?.length || 0);
  return {
    data: (data || []).map(sanitizeSurat),
    page: {
      limit,
      count: data?.length || 0,
      total: count ?? null,
      next_cursor: data && data.length === limit ? Buffer.from(String(nextOffset)).toString("base64url") : null,
    },
  };
};

const querySuratDetail = async (suratId) => {
  const { data, error } = await supabase
    .from("surat_external_export")
    .select("*")
    .eq("id", suratId)
    .single();
  if (error || !data) {
    const err = new Error("Surat tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }
  return sanitizeSurat(data);
};

const resolveFileRef = async (suratId, type, query) => {
  const { data, error } = await supabase
    .from("surat_external_export")
    .select("id, file_path, pdf_path, pic_attachment, attachments, signatures, finance_reviews")
    .eq("id", suratId)
    .single();
  if (error || !data) {
    const err = new Error("Surat tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (type === "document") return parseStorageRef(data.file_path);
  if (type === "pdf") return parseStorageRef(data.pdf_path);
  if (type === "spk") return parseStorageRef(data.pic_attachment);
  if (type === "attachment") {
    const attachment = (data.attachments || []).find((a) => a.id === query.attachment_id);
    return parseStorageRef(attachment?.file_url);
  }
  if (type === "signature-pdf") {
    const signature = (data.signatures || []).find((s) => s.id === query.signature_id);
    return parseStorageRef(signature?.pdf_path_snap);
  }
  if (type === "payment") {
    const review = (data.finance_reviews || []).find((f) => f.id === query.finance_review_id);
    return parseStorageRef(review?.payment_file_path);
  }
  return null;
};

const sendStorageFile = async (reply, ref) => {
  if (!ref) {
    const err = new Error("File tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path);
  if (error || !data) {
    const err = new Error(error?.message || "File tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const filename = ref.path.split("/").pop() || "file";
  return reply
    .header("Content-Type", data.type || contentTypes[extname(filename)] || "application/octet-stream")
    .header("Content-Length", buffer.length)
    .header("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`)
    .header("Cache-Control", "no-store")
    .send(buffer);
};

const app = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024,
});

await app.register(swagger, {
  openapi: {
    openapi: "3.0.3",
    info: {
      title: "SIGAP External Surat API",
      version: "1.0.0",
      description: "API server-to-server untuk membaca data surat, detail input, tanda tangan, lampiran, SPK, dan bukti transaksi.",
    },
    servers: [{ url: publicUrl }],
    components: {
      securitySchemes: {
        bearerToken: {
          type: "http",
          scheme: "bearer",
          description: "Client API token dari SIGAP.",
        },
        timestampHeader: {
          type: "apiKey",
          in: "header",
          name: "X-Timestamp",
          description: "Unix milliseconds, Unix seconds, atau ISO timestamp. Maksimum selisih 5 menit.",
        },
        signatureHeader: {
          type: "apiKey",
          in: "header",
          name: "X-Signature",
          description: "HMAC-SHA256 hex dari canonical string: METHOD, PATH_WITH_QUERY, X_TIMESTAMP, SHA256_HEX_BODY.",
        },
      },
    },
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true,
  },
});

app.get("/", {
  schema: {
    hide: true,
  },
}, async (_request, reply) => {
  reply.redirect("/docs");
});

app.get("/health", {
  schema: {
    hide: true,
  },
}, async () => ({ ok: true }));

app.get("/openapi.json", {
  schema: {
    hide: true,
  },
}, async () => app.swagger());

app.addHook("preHandler", async (request, reply) => {
  if (!request.routeOptions.url?.startsWith("/api/")) return;
  try {
    request.apiClient = await authenticateExternalRequest(request);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await writeAuditLog({
      clientId: error.clientId || null,
      request,
      statusCode,
      errorMessage: error.message || "Authentication failed",
    });
    return reply.code(statusCode).send({ error: statusCode === 403 ? "Forbidden" : "Unauthorized" });
  }
});

app.get("/api/surat", {
  schema: {
    tags: ["Surat"],
    summary: "List surat",
    security: [{ bearerToken: [], timestampHeader: [], signatureHeader: [] }],
    querystring: {
      type: "object",
      properties: {
        department_code: { type: "string" },
        office_code: { type: "string" },
        project_code: { type: "string" },
        status: { type: "string" },
        updated_since: { type: "string", format: "date-time" },
        limit: { type: "integer", minimum: 1, maximum: maxLimit, default: 50 },
        cursor: { type: "string" },
      },
    },
    response: {
      200: {
        type: "object",
        properties: {
          data: { type: "array", items: { type: "object", additionalProperties: true } },
          page: { type: "object", additionalProperties: true },
        },
      },
    },
  },
}, async (request, reply) => {
  try {
    const result = await querySuratList(request.query);
    await writeAuditLog({ clientId: request.apiClient.id, request, statusCode: 200 });
    return result;
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await writeAuditLog({ clientId: request.apiClient?.id, request, statusCode, errorMessage: error.message });
    return reply.code(statusCode).send({ error: error.message || "Internal server error" });
  }
});

app.get("/api/surat/:id", {
  schema: {
    tags: ["Surat"],
    summary: "Detail surat",
    security: [{ bearerToken: [], timestampHeader: [], signatureHeader: [] }],
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
      },
      required: ["id"],
    },
  },
}, async (request, reply) => {
  try {
    const data = await querySuratDetail(request.params.id);
    await writeAuditLog({ clientId: request.apiClient.id, request, statusCode: 200 });
    return { data };
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await writeAuditLog({ clientId: request.apiClient?.id, request, statusCode, errorMessage: error.message });
    return reply.code(statusCode).send({ error: error.message || "Internal server error" });
  }
});

app.get("/api/surat/:id/files/:fileType", {
  schema: {
    tags: ["Files"],
    summary: "Preview atau download file surat",
    description: "File dikirim sebagai stream inline. Gunakan header auth dan signature yang sama seperti endpoint data.",
    security: [{ bearerToken: [], timestampHeader: [], signatureHeader: [] }],
    params: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        fileType: {
          type: "string",
          enum: ["document", "pdf", "spk", "attachment", "signature-pdf", "payment"],
        },
      },
      required: ["id", "fileType"],
    },
    querystring: {
      type: "object",
      properties: {
        attachment_id: { type: "string" },
        signature_id: { type: "string" },
        finance_review_id: { type: "string" },
      },
    },
  },
}, async (request, reply) => {
  try {
    const ref = await resolveFileRef(request.params.id, request.params.fileType, request.query);
    const response = await sendStorageFile(reply, ref);
    await writeAuditLog({ clientId: request.apiClient.id, request, statusCode: 200 });
    return response;
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await writeAuditLog({ clientId: request.apiClient?.id, request, statusCode, errorMessage: error.message });
    return reply.code(statusCode).send({ error: error.message || "Internal server error" });
  }
});

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith("/api/")) {
    if (request.apiClient?.id) {
      await writeAuditLog({ clientId: request.apiClient.id, request, statusCode: 404, errorMessage: "Not found" });
    }
    return reply.code(404).send({ error: "Not found" });
  }
  return reply.code(404).send({ error: "Not found" });
});

await app.listen({ port, host });
