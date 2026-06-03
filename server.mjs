import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const port = Number(process.env.PORT || 80);
const distDir = resolve(process.env.DIST_DIR || "dist");
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null;

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

const smtpConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE ?? "true").toLowerCase() === "true",
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
};

let mailTransporter = null;

const FILE_VIEW_TOKEN_TTL_MS = 2 * 60 * 1000;
const externalAccessTokenCache = new Map();

const hashFileViewToken = (token) => createHash("sha256").update(token).digest("hex");
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const hmacSha512Hex = (secret, value) => createHmac("sha512", secret).update(value).digest("hex");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const getMailTransporter = () => {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass || !smtpConfig.from) {
    const error = new Error("SMTP belum dikonfigurasi lengkap.");
    error.status = 503;
    throw error;
  }
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
    });
  }
  return mailTransporter;
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const uniqueEmails = (values) => [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(isEmail))];

const useExternalStorage = () => storageMode === "self_hosted_supabase" && !!storageSupabase;
const uploadStorageClient = () => useExternalStorage() ? storageSupabase : supabase;

const storageOriginBase = (origin) => {
  if (origin === "external" && storagePublicBaseUrl) return storagePublicBaseUrl;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`;
  return "";
};

const makeStoragePublicUrl = (bucket, path, origin = useExternalStorage() ? "external" : "primary") => {
  const base = storageOriginBase(origin);
  return base ? `${base}/${bucket}/${path}` : `${bucket}/${path}`;
};

const readRequestBody = (req, maxBytes = 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error("Request body terlalu besar");
      err.status = 413;
      req.destroy(err);
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
});

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
};

const getPathValue = (value, path) => {
  if (!path) return value;
  return String(path).split(".").filter(Boolean).reduce((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    return current[key];
  }, value);
};

const normalizeExternalOption = (item, source) => {
  const value = getPathValue(item, source.value_path) ?? item?.code ?? item?.id ?? item?.value ?? item?.name;
  const label = getPathValue(item, source.label_path) ?? item?.name ?? item?.label ?? item?.code ?? value;
  return {
    value: value == null ? "" : String(value),
    label: label == null ? "" : String(label),
    raw: item,
  };
};

const requireSupabaseUser = async (token) => {
  if (!supabase) throw new Error("Supabase server credentials are not configured.");
  let userRes;
  let error;
  try {
    const result = await supabase.auth.getUser(token);
    userRes = result.data;
    error = result.error;
  } catch (fetchError) {
    console.error("Supabase auth network error:", fetchError);
    const err = new Error("Gagal menghubungi Supabase Auth. Periksa DNS/koneksi server.");
    err.status = 503;
    throw err;
  }
  if (error || !userRes?.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return userRes.user;
};

const sendInternalEmailNotification = async (token, payload) => {
  const actor = await requireSupabaseUser(token);
  const userIds = Array.isArray(payload?.user_ids) ? payload.user_ids.filter(Boolean) : [];
  if (userIds.length === 0) return { sent: 0, recipients: [] };

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, department_id, office_id")
    .in("id", userIds);
  if (profileError) throw profileError;

  const departmentIds = [...new Set((profiles || []).map((profile) => profile.department_id).filter(Boolean))];
  const officeIds = [...new Set((profiles || []).map((profile) => profile.office_id).filter(Boolean))];

  const [{ data: departments }, { data: offices }] = await Promise.all([
    departmentIds.length
      ? supabase.from("master_departments").select("id, email").in("id", departmentIds)
      : Promise.resolve({ data: [] }),
    officeIds.length
      ? supabase.from("master_offices").select("id, email").in("id", officeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const recipients = uniqueEmails([
    ...(profiles || []).map((profile) => profile.email),
    ...(departments || []).map((department) => department.email),
    ...(offices || []).map((office) => office.email),
  ]);

  if (recipients.length === 0) return { sent: 0, recipients: [] };

  const title = String(payload?.title || "Notifikasi SIGAP").slice(0, 160);
  const message = String(payload?.message || "").slice(0, 4000);
  const link = typeof payload?.link === "string" ? payload.link : "";
  const appUrl = String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || "").replace(/\/+$/, "");
  const fullLink = link && appUrl && link.startsWith("/") ? `${appUrl}${link}` : link;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="font-size:18px;margin:0 0 12px">${title}</h2>
      <p style="font-size:14px;margin:0 0 16px">${message.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]))}</p>
      ${fullLink ? `<p><a href="${fullLink}" style="display:inline-block;background:#111827;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;font-size:13px">Buka SIGAP</a></p>` : ""}
      <p style="margin-top:24px;font-size:11px;color:#6b7280">Email otomatis dari SIGAP. Dikirim oleh ${actor.email || actor.id}.</p>
    </div>
  `;

  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: smtpConfig.from,
    to: recipients,
    subject: title,
    text: `${message}${fullLink ? `\n\n${fullLink}` : ""}`,
    html,
  });

  return { sent: recipients.length, recipients };
};

const parseUploadForm = async (req) => {
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  });
  return request.formData();
};

const sanitizeStoragePath = (value) => String(value || "")
  .replace(/\\/g, "/")
  .split("/")
  .filter(Boolean)
  .map((part) => part.replace(/[^\w.-]+/g, "_"))
  .join("/");

const uploadInternalStorageFile = async (token, req) => {
  await requireSupabaseUser(token);
  if (!uploadStorageClient()) throw new Error("Storage credentials are not configured.");

  const form = await parseUploadForm(req);
  const bucket = String(form.get("bucket") || "").trim();
  const requestedPath = sanitizeStoragePath(form.get("path"));
  const file = form.get("file");
  const upsert = String(form.get("upsert") || "false").toLowerCase() === "true";

  if (!bucket || !/^[a-zA-Z0-9_-]+$/.test(bucket)) {
    const err = new Error("Bucket storage tidak valid.");
    err.status = 400;
    throw err;
  }
  if (!requestedPath) {
    const err = new Error("Path storage tidak valid.");
    err.status = 400;
    throw err;
  }
  if (!file || typeof file.arrayBuffer !== "function") {
    const err = new Error("File wajib dikirim.");
    err.status = 400;
    throw err;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const origin = useExternalStorage() ? "external" : "primary";
  const { error } = await uploadStorageClient().storage.from(bucket).upload(requestedPath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert,
  });
  if (error) throw error;

  return {
    bucket,
    path: requestedPath,
    origin,
    publicUrl: makeStoragePublicUrl(bucket, requestedPath, origin),
  };
};

const fillEndpointTemplate = (template, variables = {}) => {
  const missing = [];
  const path = String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = variables[key];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.push(key);
      return "";
    }
    return encodeURIComponent(String(value));
  });

  if (missing.length > 0) {
    const err = new Error(`Parameter belum lengkap: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }

  return path.startsWith("/") ? path : `/${path}`;
};

const getMarisonAccessToken = async (source) => {
  const authConfig = source.auth_config || {};
  const clientId = process.env[authConfig.client_id_env || "MARISON_EXTERNAL_CLIENT_ID"];
  const clientSecret = process.env[authConfig.client_secret_env || "MARISON_EXTERNAL_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    const err = new Error("Credential API unit belum dikonfigurasi di server.");
    err.status = 500;
    throw err;
  }

  const cacheKey = `${source.source_key}:${clientId}`;
  const cached = externalAccessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const baseUrl = String(source.base_url || "").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.message || "Gagal membuat access token API unit.");
    err.status = response.status;
    throw err;
  }

  const token = payload?.data?.access_token;
  if (!token) {
    const err = new Error("Response access token API unit tidak valid.");
    err.status = 502;
    throw err;
  }

  const expiresInRaw = payload?.data?.expires_in;
  const expiresInSeconds = Number.parseInt(String(expiresInRaw ?? "900"), 10);
  externalAccessTokenCache.set(cacheKey, {
    token,
    expiresAt: Date.now() + (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 900) * 1000,
  });
  return token;
};

const queryExternalDataSource = async (sourceKey, variables = {}) => {
  if (!supabase) throw new Error("Supabase server credentials are not configured.");

  const { data: source, error } = await supabase
    .from("external_data_sources")
    .select("*")
    .eq("source_key", sourceKey)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !source) {
    const err = new Error("Data source tidak ditemukan atau tidak aktif.");
    err.status = 404;
    throw err;
  }

  const method = String(source.method || "GET").toUpperCase();
  if (method !== "GET") {
    const err = new Error("Method data source belum didukung.");
    err.status = 400;
    throw err;
  }

  const baseUrl = String(source.base_url || "").replace(/\/+$/, "");
  const endpointPath = fillEndpointTemplate(source.endpoint_template, variables);
  const url = new URL(`${baseUrl}${endpointPath}`);
  Object.entries(variables?.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {};
  if (source.auth_type === "marison_token_hmac_sha512") {
    const token = await getMarisonAccessToken(source);
    const authConfig = source.auth_config || {};
    const configuredSigningSecret = process.env[authConfig.signing_secret_env || "MARISON_EXTERNAL_SIGNING_SECRET"];
    const signingSecret = configuredSigningSecret || token;
    if (!signingSecret) {
      const err = new Error("Signing secret API unit belum dikonfigurasi di server.");
      err.status = 500;
      throw err;
    }

    const timestamp = new Date().toISOString();
    const bodyHash = sha256Hex(Buffer.alloc(0));
    const canonical = [method, url.pathname, token, bodyHash, timestamp].join(":");
    headers.Authorization = `Bearer ${token}`;
    headers["X-Timestamp"] = timestamp;
    headers["X-Signature"] = hmacSha512Hex(signingSecret, canonical);
  }

  const response = await fetch(url, { method, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.message || "Gagal mengambil data dari API eksternal.");
    err.status = response.status;
    throw err;
  }

  const rawItems = getPathValue(payload, source.response_path) ?? [];
  const items = Array.isArray(rawItems)
    ? rawItems
    : Array.isArray(rawItems?.data)
      ? rawItems.data
      : [];

  return {
    source: {
      key: source.source_key,
      name: source.name,
    },
    options: items
      .map((item) => normalizeExternalOption(item, source))
      .filter((item) => item.value && item.label),
    raw_count: items.length,
  };
};

const canReadSurat = async (surat, userId) => {
  if (!surat || !userId) return false;
  if (surat.created_by === userId || surat.pic_id === userId) return true;
  if ((surat.surat_signatures || []).some((sig) => sig.user_id === userId)) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return profile?.role === "admin";
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
      const origin = storagePublicBaseUrl && value.startsWith(storagePublicBaseUrl) ? "external" : "primary";
      if (slash > 0) return { bucket: rest.slice(0, slash), path: rest.slice(slash + 1), origin };
    }
  } catch {}

  for (const bucket of knownBuckets) {
    if (value.startsWith(`${bucket}/`)) {
      return { bucket, path: value.slice(bucket.length + 1), origin: "primary" };
    }
  }

  if (value.startsWith("lampiran_")) return { bucket: "lampiran_surat", path: value, origin: "primary" };
  if (value.startsWith("payment-")) return { bucket: "payment_files", path: value, origin: "primary" };
  if (value.startsWith("spk-")) return { bucket: "spk_files", path: value, origin: "primary" };

  return { bucket: "dokumen_surat", path: value, origin: "primary" };
};

const storageRefKey = (ref) => ref ? `${ref.bucket}/${ref.path}` : "";

const storageClientForRef = (ref) => {
  if (ref?.origin === "external" && storageSupabase) return storageSupabase;
  return supabase;
};

const getAllowedStorageRefs = (surat) => {
  const refs = [
    surat.file_path,
    surat.pdf_path,
    surat.lampiran_path,
    surat.pic_attachment,
    ...(surat.surat_attachments || []).map((a) => a.file_url),
    ...(surat.surat_chats || []).map((c) => c.attachment_url),
    ...(surat.finance_reviews || []).map((f) => f.payment_file_path),
    ...(surat.surat_signatures || []).flatMap((s) => [s.file_path_snap, s.pdf_path_snap]),
  ];
  return new Set(refs.map(parseStorageRef).filter(Boolean).map(storageRefKey));
};

const getAuthorizedSurat = async (suratId, token) => {
  if (!supabase) throw new Error("Supabase server credentials are not configured.");

  const { data: userRes, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userRes?.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, file_path, pdf_path, lampiran_path, pic_attachment, created_by, pic_id")
    .eq("id", suratId)
    .maybeSingle();
  if (suratError || !surat) {
    if (suratError) console.error("getAuthorizedSurat base query failed:", suratError);
    const err = new Error(suratError ? `Gagal membaca dokumen: ${suratError.message}` : "Dokumen tidak ditemukan");
    err.status = 404;
    throw err;
  }

  const [signaturesRes, attachmentsRes, chatsRes, financeReviewsRes] = await Promise.all([
    supabase
      .from("surat_signatures")
      .select("id, user_id, file_path_snap, pdf_path_snap")
      .eq("surat_id", suratId),
    supabase
      .from("surat_attachments")
      .select("file_url")
      .eq("surat_id", suratId),
    supabase
      .from("surat_chats")
      .select("attachment_url")
      .eq("surat_id", suratId),
    supabase
      .from("finance_reviews")
      .select("payment_file_path")
      .eq("surat_id", suratId),
  ]);

  if (signaturesRes.error) console.error("getAuthorizedSurat signatures query failed:", signaturesRes.error);
  if (attachmentsRes.error) console.error("getAuthorizedSurat attachments query failed:", attachmentsRes.error);
  if (chatsRes.error) console.error("getAuthorizedSurat chats query failed:", chatsRes.error);
  if (financeReviewsRes.error) console.error("getAuthorizedSurat finance query failed:", financeReviewsRes.error);

  surat.surat_signatures = signaturesRes.data || [];
  surat.surat_attachments = attachmentsRes.data || [];
  surat.surat_chats = chatsRes.data || [];
  surat.finance_reviews = financeReviewsRes.data || [];

  if (!(await canReadSurat(surat, userRes.user.id))) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return { surat, user: userRes.user };
};

const enqueuePdfJob = async (suratId, token, { refresh = false, signatureId = null } = {}) => {
  const { surat, user } = await getAuthorizedSurat(suratId, token);

  if (!surat.file_path) throw new Error("File Excel dokumen belum tersedia.");

  if (signatureId && !refresh) {
    const signature = (surat.surat_signatures || []).find((sig) => sig.id === signatureId);
    if (signature?.pdf_path_snap) {
      return { status: "ready", pdfUrl: signature.pdf_path_snap, cached: true, signatureId };
    }
  }

  let activeJobQuery = supabase
    .from("document_pdf_jobs")
    .select("id, status, pdf_url, error_message, signature_id")
    .eq("surat_id", suratId)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (signatureId) activeJobQuery = activeJobQuery.eq("signature_id", signatureId);

  const { data: activeJob } = await activeJobQuery.maybeSingle();
  if (activeJob) {
    return {
      status: activeJob.status,
      jobId: activeJob.id,
      pdfUrl: activeJob.pdf_url,
      error: activeJob.error_message,
      signatureId: activeJob.signature_id,
    };
  }

  let latestDoneJobQuery = supabase
    .from("document_pdf_jobs")
    .select("id, status, pdf_url, error_message, signature_id")
    .eq("surat_id", suratId)
    .eq("status", "done")
    .not("pdf_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (signatureId) latestDoneJobQuery = latestDoneJobQuery.eq("signature_id", signatureId);

  const { data: latestDoneJob } = await latestDoneJobQuery.maybeSingle();
  if (latestDoneJob?.pdf_url && !refresh) {
    return {
      status: "ready",
      jobId: latestDoneJob.id,
      pdfUrl: latestDoneJob.pdf_url,
      cached: true,
      signatureId: latestDoneJob.signature_id,
    };
  }

  if (surat.pdf_path && !refresh) {
    return { status: "ready", pdfUrl: surat.pdf_path, cached: true };
  }

  const { data: job, error } = await supabase
    .from("document_pdf_jobs")
    .insert([{
      surat_id: suratId,
      source_file_path: surat.file_path,
      signature_id: signatureId,
      requested_by: user.id,
      refresh,
    }])
    .select("id, status")
    .single();
  if (error) throw error;

  return { status: job.status, jobId: job.id, cached: false, refreshed: refresh };
};

const getPdfJobStatus = async (jobId, token) => {
  const { data: userRes, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userRes?.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const { data: job, error } = await supabase
    .from("document_pdf_jobs")
    .select("id, surat_id, signature_id, status, pdf_url, error_message")
    .eq("id", jobId)
    .single();
  if (error || !job) {
    const err = new Error("Job PDF tidak ditemukan");
    err.status = 404;
    throw err;
  }

  await getAuthorizedSurat(job.surat_id, token);
  return { status: job.status, jobId: job.id, signatureId: job.signature_id, pdfUrl: job.pdf_url, error: job.error_message };
};

const getAuthorizedStorageFile = async (suratId, token, rawPath) => {
  const { surat } = await getAuthorizedSurat(suratId, token);
  const requested = parseStorageRef(rawPath);
  if (!requested) {
    const err = new Error("Path file tidak valid");
    err.status = 400;
    throw err;
  }

  if (!getAllowedStorageRefs(surat).has(storageRefKey(requested))) {
    const err = new Error("File tidak terkait dengan surat ini");
    err.status = 403;
    throw err;
  }

  const { data, error } = await storageClientForRef(requested).storage.from(requested.bucket).download(requested.path);
  if (error || !data) {
    const err = new Error(error?.message || "File tidak ditemukan");
    err.status = 404;
    throw err;
  }

  return { file: data, ref: requested };
};

const createFileViewToken = async (suratId, token, rawPath) => {
  const { surat, user } = await getAuthorizedSurat(suratId, token);
  const requested = parseStorageRef(rawPath);
  if (!requested) {
    const err = new Error("Path file tidak valid");
    err.status = 400;
    throw err;
  }

  if (!getAllowedStorageRefs(surat).has(storageRefKey(requested))) {
    const err = new Error("File tidak terkait dengan surat ini");
    err.status = 403;
    throw err;
  }

  const viewToken = randomBytes(32).toString("base64url");
  const { error } = await supabase
    .from("file_view_tokens")
    .insert({
      token_hash: hashFileViewToken(viewToken),
      bucket: requested.bucket,
      object_path: requested.path,
      storage_origin: requested.origin || "primary",
      requested_by: user.id,
      surat_id: surat.id,
      expires_at: new Date(Date.now() + FILE_VIEW_TOKEN_TTL_MS).toISOString(),
    });
  if (error) throw error;

  return {
    token: viewToken,
    viewUrl: `/api/files/view/${viewToken}`,
    expiresIn: Math.floor(FILE_VIEW_TOKEN_TTL_MS / 1000),
  };
};

const consumeFileViewToken = async (viewToken) => {
  const { data: tokenRows, error: tokenError } = await supabase
    .rpc("consume_file_view_token", { p_token_hash: hashFileViewToken(viewToken) });
  if (tokenError) throw tokenError;

  const tokenData = tokenRows?.[0];
  if (!tokenData) {
    const err = new Error("Token file tidak valid atau sudah kedaluwarsa");
    err.status = 410;
    throw err;
  }

  const { data, error } = await storageClientForRef({ origin: tokenData.storage_origin }).storage.from(tokenData.bucket).download(tokenData.object_path);
  if (error || !data) {
    const err = new Error(error?.message || "File tidak ditemukan");
    err.status = 404;
    throw err;
  }

  return { file: data, ref: { bucket: tokenData.bucket, path: tokenData.object_path, origin: tokenData.storage_origin } };
};

const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname);
  const candidate = normalize(requested === "/" ? "/index.html" : requested);
  let filePath = resolve(join(distDir, candidate));
  if (!filePath.startsWith(distDir) || !existsSync(filePath)) {
    filePath = join(distDir, "index.html");
  }
  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(res);
};

await mkdir(distDir, { recursive: true });

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/api\/documents\/([0-9a-f-]+)\/pdf$/i);
    if (req.method === "GET" && match) {
      const token = getBearerToken(req);
      const refresh = url.searchParams.get("refresh") === "1";
      const signatureId = url.searchParams.get("signature_id");
      const result = await enqueuePdfJob(match[1], token, { refresh, signatureId });
      return sendJson(res, 200, result);
    }

    const jobMatch = url.pathname.match(/^\/api\/pdf-jobs\/([0-9a-f-]+)$/i);
    if (req.method === "GET" && jobMatch) {
      const token = getBearerToken(req);
      const result = await getPdfJobStatus(jobMatch[1], token);
      return sendJson(res, 200, result);
    }

    const fileMatch = url.pathname.match(/^\/api\/documents\/([0-9a-f-]+)\/file$/i);
    if (req.method === "GET" && fileMatch) {
      const token = getBearerToken(req);
      const rawPath = url.searchParams.get("path");
      const { file, ref } = await getAuthorizedStorageFile(fileMatch[1], token, rawPath);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = ref.path.split("/").pop() || "file";
      res.writeHead(200, {
        "Content-Type": file.type || contentTypes[extname(filename)] || "application/octet-stream",
        "Content-Length": buffer.length,
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      });
      res.end(buffer);
      return;
    }

    const tokenMatch = url.pathname.match(/^\/api\/documents\/([0-9a-f-]+)\/file-token$/i);
    if (req.method === "POST" && tokenMatch) {
      const token = getBearerToken(req);
      const rawPath = url.searchParams.get("path");
      const result = await createFileViewToken(tokenMatch[1], token, rawPath);
      return sendJson(res, 200, result);
    }

    const viewMatch = url.pathname.match(/^\/api\/files\/view\/([A-Za-z0-9_-]+)$/);
    if (req.method === "GET" && viewMatch) {
      const { file, ref } = await consumeFileViewToken(viewMatch[1]);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = ref.path.split("/").pop() || "file";
      res.writeHead(200, {
        "Content-Type": file.type || contentTypes[extname(filename)] || "application/octet-stream",
        "Content-Length": buffer.length,
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      });
      res.end(buffer);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (req.method === "POST" && url.pathname === "/api/storage/upload") {
        const token = getBearerToken(req);
        const result = await uploadInternalStorageFile(token, req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/notifications/email") {
        const token = getBearerToken(req);
        const body = await readRequestBody(req);
        const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
        const result = await sendInternalEmailNotification(token, payload);
        return sendJson(res, 200, result);
      }

      const dataSourceMatch = url.pathname.match(/^\/api\/data-sources\/([a-zA-Z0-9_-]+)\/query$/);
      if (req.method === "POST" && dataSourceMatch) {
        const token = getBearerToken(req);
        await requireSupabaseUser(token);
        const body = await readRequestBody(req);
        const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
        const result = await queryExternalDataSource(dataSourceMatch[1], payload?.variables || {});
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { error: "Not found" });
    }

    await serveStatic(req, res);
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { error: error.message || "Internal server error" });
  }
}).listen(port, () => {
  console.log(`Agenda Flow server listening on ${port}`);
});
