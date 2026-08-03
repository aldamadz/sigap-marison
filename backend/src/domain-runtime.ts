// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- Domain handlers are migrated verbatim; route contracts provide regression coverage during typing.
import { createReadStream, existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import webpush from "web-push";
import sharp from "sharp";
import { normalizeWorkbookForPdf } from "../../document-workbook-normalizer.mjs";
import { createPgdPreviewData, renderPgdPdf } from "../../pgd-pdf-renderer.mjs";
import { resolveTableHorizontalAlignment } from "../../document-layout-rules.mjs";
import { buildProductionCode } from "../../production-code.mjs";
import {
  applyStoragePathPrefix,
  isStoragePathWithinPrefix,
  normalizeStoragePath,
  normalizeStoragePathPrefix,
  removeStoragePathPrefix,
} from "../../storage-path-policy.mjs";
import {
  assertMarisonOutboundContract,
  MARISON_OUTBOUND_CONTRACT_VERSION,
} from "../../server/marison-outbound-contract.mjs";
import { resolveMarisonOutboundNik } from "../../server/marison-outbound-identity.mjs";
import {
  buildApprovalResolutionKey,
  getCanonicalRequesterProfileId,
  mergePayloadResolutionSources,
  normalizePayloadResolutionSources,
  resolveProfilePayloadIdentity,
} from "../../server/marison-payload-identity.mjs";
import { executeMarisonPayloadMappingCommand } from "../../server/marison-payload-mapping-handler.mjs";
import {
  parseMarisonPayloadCatalogQuery,
} from "../../server/marison-payload-mapping-request.mjs";
import {
  executeMarisonBranchSync,
  executeMarisonEmployeeSync,
  executeMarisonProjectSync,
  previewMarisonBranchSync,
  previewMarisonEmployeeSync,
  previewMarisonProjectSync,
  runTrackedMarisonSync,
} from "../../server/marison-employee-sync.mjs";
import { createSessionCookieHelpers } from "./domain/session-cookie.js";
import { clientIp, enforceRateLimit, recordRateLimit } from "./domain/rate-limit.js";
import { isActiveAdminProfile, isActiveProfile } from "./domain/profile-authorization.js";

const execFileAsync = promisify(execFile);

const distDir = resolve(process.env.DIST_DIR || "dist");
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const sessionSecret = process.env.SESSION_SECRET;

if (!supabaseUrl || !supabasePublishableKey || !sessionSecret || sessionSecret.length < 32) {
  throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SESSION_SECRET (minimum 32 characters) are required.");
}

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
const storagePathPrefix = normalizeStoragePathPrefix(process.env.STORAGE_PATH_PREFIX || "");

const storageSupabase = storageMode === "self_hosted_supabase" && storageSupabaseUrl && storageServiceRoleKey
  ? createClient(storageSupabaseUrl, storageServiceRoleKey, { auth: { persistSession: false } })
  : null;

if (storageMode !== "self_hosted_supabase" || !storageSupabase || !storagePublicBaseUrl) {
  throw new Error("Self-hosted storage is required. Configure STORAGE_MODE, STORAGE_SUPABASE_URL, STORAGE_SUPABASE_SERVICE_ROLE_KEY, and STORAGE_PUBLIC_BASE_URL.");
}

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
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024);
const externalAccessTokenCache = new Map();
const templatePreviewTokens = new Map();
const templatePreviewRateLimits = new Map();
const passwordResetSendCooldowns = new Map();
const passwordResetIpRateLimits = new Map();
const loginIdentityRateLimits = new Map();
const loginIpRateLimits = new Map();
const marisonRealtimeClients = new Set();
let marisonEmployeeSyncInFlight = false;
let marisonBranchSyncInFlight = false;
let marisonProjectSyncInFlight = false;
const TEMPLATE_PREVIEW_TTL_MS = 2 * 60 * 1000;
const TEMPLATE_PREVIEW_MAX_PER_MINUTE = 6;
const PASSWORD_RESET_SEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_PER_WINDOW = 6;
const LOGIN_MAX_FAILURES_PER_IDENTITY = 8;
const LOGIN_MAX_FAILURES_PER_IP = 30;
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MARISON_ENVIRONMENTS = new Set(["staging", "production"]);
const marisonDeploymentEnvironment = String(process.env.MARISON_DEPLOYMENT_ENVIRONMENT || "").trim().toLowerCase();
if (!MARISON_ENVIRONMENTS.has(marisonDeploymentEnvironment)) {
  throw new Error("MARISON_DEPLOYMENT_ENVIRONMENT must be staging or production.");
}
const marisonSubmissionDispatchEnabled = String(
  process.env.MARISON_SUBMISSION_DISPATCH_ENABLED ?? (marisonDeploymentEnvironment === "staging" ? "true" : "false")
).toLowerCase() === "true";
const marisonOutboundInternalToken = String(process.env.MARISON_OUTBOUND_INTERNAL_TOKEN || "");
if (marisonSubmissionDispatchEnabled && marisonOutboundInternalToken.length < 32) {
  throw new Error("MARISON_OUTBOUND_INTERNAL_TOKEN minimal 32 karakter saat outbound Marison aktif.");
}
const marisonSyncCronToken = String(
  process.env.MARISON_SYNC_CRON_TOKEN
  || createHash("sha256").update(`marison-directory-sync:${sessionSecret}`).digest("hex")
);
const marisonOutboundNik = (override, ...candidates) => resolveMarisonOutboundNik({
  environment: marisonDeploymentEnvironment,
  stagingOverride: override,
  candidates,
});

const webPushConfig = {
  publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
  privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
  subject: process.env.WEB_PUSH_SUBJECT || `mailto:${smtpConfig?.from || "noreply@marison.id"}`,
};

if (webPushConfig.publicKey && webPushConfig.privateKey) {
  webpush.setVapidDetails(webPushConfig.subject, webPushConfig.publicKey, webPushConfig.privateKey);
}

const hashFileViewToken = (token) => createHash("sha256").update(token).digest("hex");
const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");
const hmacSha512Hex = (secret, value) => createHmac("sha512", secret).update(value).digest("hex");
const secretMatches = (supplied, expected) => {
  const suppliedHash = createHash("sha256").update(String(supplied || "")).digest();
  const expectedHash = createHash("sha256").update(String(expected || "")).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

const withSecurityHeaders = (headers = {}) => ({
  ...securityHeaders,
  ...headers,
});

const sanitizeDownloadFilename = (value) => String(value || "file")
  .replace(/[\r\n"]/g, "")
  .replace(/[\\/]+/g, "_")
  .trim() || "file";

const sanitizeFilenameStem = (value, fallback = "dokumen") => {
  const sanitized = String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return sanitized || fallback;
};

const filenameHeaderValue = (filename) => {
  const safe = sanitizeDownloadFilename(filename);
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
};

const contentTypeForFile = (file, filename) => {
  const type = String(file?.type || "").toLowerCase();
  const extensionType = contentTypes[extname(filename).toLowerCase()];
  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") {
    return extensionType || "application/octet-stream";
  }
  return type;
};

const buildDocumentFilename = (surat, fallbackPath, fallback = "dokumen") => {
  const originalName = sanitizeDownloadFilename(String(fallbackPath || "").split("/").pop() || fallback);
  const extension = extname(originalName) || ".pdf";
  const stemSource = surat?.judul_surat || surat?.no_surat || originalName.replace(extname(originalName), "");
  return `${sanitizeFilenameStem(stemSource, fallback)}${extension.toLowerCase()}`;
};

const assertRequestSize = (req, maxBytes = MAX_UPLOAD_BYTES) => {
  const length = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > maxBytes) {
    const err = new Error(`Ukuran file terlalu besar. Maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
    err.status = 413;
    throw err;
  }
};

const sendJson = (res, status, body, extraHeaders = {}) => {
  res.writeHead(status, withSecurityHeaders({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }));
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

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const defaultEmailSettings = {
  enabled: true,
  inherit_global: true,
  app_url: process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || "http://localhost:8080",
  recipients: {
    user: true,
    department: true,
    office: true,
  },
  privacy: {
    include_nik: false,
  },
  files: {
    main_pdf: "secure_link",
    initial_attachments: "secure_link",
    approval_attachments: "secure_link",
    max_total_attachment_mb: 15,
  },
  link_ttl_hours: 72,
};

const normalizeEmailSettings = (value) => {
  const raw = typeof value === "string" ? (() => {
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  })() : (value || {});
  const normalizeMode = (mode) => mode === "attachment" ? "attachment" : "secure_link";
  return {
    enabled: raw.enabled !== false,
    inherit_global: raw.inherit_global !== false,
    app_url: String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || raw.app_url || defaultEmailSettings.app_url)
      .trim()
      .replace(/\/+$/, ""),
    recipients: {
      user: raw.recipients?.user !== false,
      department: raw.recipients?.department !== false,
      office: raw.recipients?.office !== false,
    },
    privacy: {
      include_nik: raw.privacy?.include_nik === true,
    },
    files: {
      main_pdf: normalizeMode(raw.files?.main_pdf),
      initial_attachments: normalizeMode(raw.files?.initial_attachments),
      approval_attachments: normalizeMode(raw.files?.approval_attachments),
      max_total_attachment_mb: Math.max(Number(raw.files?.max_total_attachment_mb || 15), 1),
    },
    link_ttl_hours: Math.max(Number(raw.link_ttl_hours || 72), 1),
  };
};

const parseEmailSettingsOverride = (value) => {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try { return JSON.parse(value || "{}"); } catch { return {}; }
};

const mergeEmailSettings = (base, overrideValue) => {
  const override = parseEmailSettingsOverride(overrideValue);
  if (!overrideValue || override?.inherit_global !== false) return base;
  return {
  enabled: typeof override?.enabled === "boolean" ? override.enabled : base.enabled,
  app_url: base.app_url,
  recipients: {
    user: typeof override?.recipients?.user === "boolean" ? override.recipients.user : base.recipients.user,
    department: typeof override?.recipients?.department === "boolean" ? override.recipients.department : base.recipients.department,
    office: typeof override?.recipients?.office === "boolean" ? override.recipients.office : base.recipients.office,
  },
  privacy: {
    include_nik: typeof override?.privacy?.include_nik === "boolean" ? override.privacy.include_nik : base.privacy.include_nik,
  },
  files: {
    main_pdf: override?.files?.main_pdf === "attachment" || override?.files?.main_pdf === "secure_link"
      ? override.files.main_pdf
      : base.files.main_pdf,
    initial_attachments: override?.files?.initial_attachments === "attachment" || override?.files?.initial_attachments === "secure_link"
      ? override.files.initial_attachments
      : base.files.initial_attachments,
    approval_attachments: override?.files?.approval_attachments === "attachment" || override?.files?.approval_attachments === "secure_link"
      ? override.files.approval_attachments
      : base.files.approval_attachments,
    max_total_attachment_mb: Number.isFinite(Number(override?.files?.max_total_attachment_mb))
      ? Math.max(Number(override.files.max_total_attachment_mb), 1)
      : base.files.max_total_attachment_mb,
  },
  link_ttl_hours: Number.isFinite(Number(override?.link_ttl_hours))
    ? Math.max(Number(override.link_ttl_hours), 1)
    : base.link_ttl_hours,
  };
};

const shouldUseExternalStorage = () => true;
const uploadStorageClient = () => storageSupabase;

const storageOriginBase = (origin) => {
  if (origin === "external" && storagePublicBaseUrl) return storagePublicBaseUrl;
  if (supabaseUrl) return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public`;
  return "";
};

const makeStoragePublicUrl = (bucket, path, origin = shouldUseExternalStorage() ? "external" : "primary") => {
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

const readJsonBody = async (req, maxBytes = 1024 * 1024) => {
  const body = await readRequestBody(req, maxBytes);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    const err = new Error("Payload JSON tidak valid.");
    err.status = 400;
    throw err;
  }
};

const SESSION_COOKIE_HELPERS = createSessionCookieHelpers(sessionSecret);

const hasSessionCookie = (req) => SESSION_COOKIE_HELPERS.hasSessionCookie(req);
const readCookieSession = (req) => SESSION_COOKIE_HELPERS.readCookieSession(req);
const clearedSessionCookie = () => SESSION_COOKIE_HELPERS.clearSessionCookie();
const setSessionCookie = (res, session) => res.setHeader("Set-Cookie", SESSION_COOKIE_HELPERS.setSessionCookie(session));
const publicSession = (session) => SESSION_COOKIE_HELPERS.publicSession(session);

const assertSameOrigin = (req) => {
  const origin = String(req.headers.origin || "");
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") {
    const err = new Error("Cross-site request ditolak.");
    err.status = 403;
    throw err;
  }
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    const err = new Error("Origin request tidak valid.");
    err.status = 403;
    throw err;
  }
  if (originHost !== String(req.headers.host || "")) {
    const err = new Error("Origin request tidak diizinkan.");
    err.status = 403;
    throw err;
  }
};

const createPublicSupabaseClient = () => createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const createUserSupabaseClient = (accessToken) => createClient(supabaseUrl, supabasePublishableKey, {
  accessToken: async () => accessToken,
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const revokedSessionErrorCodes = new Set(["42501", "PGRST301", "PGRST303"]);

const assertActiveSessionProfile = async (session, res) => {
  const { data: profile, error } = await createUserSupabaseClient(session.access_token)
    .from("profiles")
    .select("is_active, deleted_at")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error && !revokedSessionErrorCodes.has(error.code)) {
    const err = new Error("Gagal memvalidasi status akun.");
    err.status = 503;
    throw err;
  }
  if (error || !isActiveProfile(profile)) {
    res.setHeader("Set-Cookie", clearedSessionCookie());
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
};

const requireCookieSession = (req) => {
  const session = readCookieSession(req);
  if (!session?.access_token || !session?.user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return session;
};

const refreshCookieSession = async (req, res) => {
  const session = readCookieSession(req);
  if (!session?.refresh_token) return null;
  if (Number(session.expires_at || 0) * 1000 > Date.now() + 10 * 60_000) {
    await assertActiveSessionProfile(session, res);
    req.sigapSession = session;
    return session;
  }
  const client = createPublicSupabaseClient();
  const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
  if (error || !data.session) {
    res.setHeader("Set-Cookie", clearedSessionCookie());
    return null;
  }
  await assertActiveSessionProfile(data.session, res);
  req.sigapSession = data.session;
  setSessionCookie(res, data.session);
  return data.session;
};

const handleAuthLogin = async (req, res) => {
  assertSameOrigin(req);
  const { email, password } = await readJsonBody(req, 16 * 1024);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const ipKey = clientIp(req) || "unknown";
  const identityKey = sha256Hex(normalizedEmail).slice(0, 24);
  enforceRateLimit(loginIdentityRateLimits, identityKey, LOGIN_MAX_FAILURES_PER_IDENTITY);
  enforceRateLimit(loginIpRateLimits, ipKey, LOGIN_MAX_FAILURES_PER_IP);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password: String(password || "") });
  if (error || !data.session) {
    recordRateLimit(loginIdentityRateLimits, identityKey, AUTH_RATE_LIMIT_WINDOW_MS);
    recordRateLimit(loginIpRateLimits, ipKey, AUTH_RATE_LIMIT_WINDOW_MS);
    const err = new Error("Email atau password salah.");
    err.status = 401;
    throw err;
  }
  loginIdentityRateLimits.delete(identityKey);
  setSessionCookie(res, data.session);
  return { user: data.user, session: publicSession(data.session) };
};

const handleAuthVerifyOtp = async (req, res) => {
  assertSameOrigin(req);
  const payload = await readJsonBody(req, 16 * 1024);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.auth.verifyOtp(payload);
  if (error || !data.session) {
    const err = new Error(error?.message || "Token pemulihan tidak valid.");
    err.status = error?.status || 401;
    throw err;
  }
  setSessionCookie(res, data.session);
  return { user: data.user, session: publicSession(data.session) };
};

const handleAuthUpdateUser = async (req, res) => {
  assertSameOrigin(req);
  const session = requireCookieSession(req);
  const payload = await readJsonBody(req, 32 * 1024);
  const client = createPublicSupabaseClient();
  const { error: setError } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (setError) throw setError;
  const { data, error } = await client.auth.updateUser(payload);
  if (error) throw error;
  const { data: current } = await client.auth.getSession();
  if (current.session) setSessionCookie(res, current.session);
  return { user: data.user };
};

const handleAuthLogout = async (req, res) => {
  assertSameOrigin(req);
  const session = readCookieSession(req);
  if (session?.access_token) {
    const client = createPublicSupabaseClient();
    await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    await client.auth.signOut({ scope: "local" });
  }
  res.setHeader("Set-Cookie", clearedSessionCookie());
  return { ok: true };
};

const BFF_QUERY_METHODS = new Set([
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "overlaps", "match", "not", "or", "filter",
  "order", "limit", "range", "single", "maybeSingle", "csv", "throwOnError",
]);

const assertBffIdentifier = (value, label) => {
  const normalized = String(value || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    const err = new Error(`${label} tidak valid.`);
    err.status = 400;
    throw err;
  }
  return normalized;
};

const handleBffQuery = async (req) => {
  assertSameOrigin(req);
  const session = requireCookieSession(req);
  const payload = await readJsonBody(req, 2 * 1024 * 1024);
  const kind = payload?.kind === "rpc" ? "rpc" : "table";
  const name = assertBffIdentifier(payload?.name, kind === "rpc" ? "Nama RPC" : "Nama tabel");

  const client = createUserSupabaseClient(session.access_token);
  let query = kind === "rpc"
    ? client.rpc(name, payload?.args || {}, payload?.options)
    : client.from(name);
  const operations = Array.isArray(payload?.operations) ? payload.operations : [];
  if (!operations.length && kind === "table") {
    const err = new Error("Operasi query tidak boleh kosong.");
    err.status = 400;
    throw err;
  }
  for (const operation of operations) {
    const method = String(operation?.method || "");
    if (!BFF_QUERY_METHODS.has(method) || typeof query?.[method] !== "function") {
      const err = new Error(`Operasi query ${method || "(kosong)"} tidak diizinkan.`);
      err.status = 400;
      throw err;
    }
    query = query[method](...(Array.isArray(operation.args) ? operation.args : []));
  }
  const result = await query;
  return {
    data: result.data ?? null,
    error: result.error ? {
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      code: result.error.code,
    } : null,
    count: result.count ?? null,
    status: result.status,
    statusText: result.statusText,
  };
};

const handleBffFunction = async (req, functionName) => {
  assertSameOrigin(req);
  const session = requireCookieSession(req);
  const name = assertBffIdentifier(functionName, "Nama function");
  const payload = await readJsonBody(req, 2 * 1024 * 1024);
  const result = await createUserSupabaseClient(session.access_token).functions.invoke(name, payload?.options || {});
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, name: result.error.name } : null,
  };
};

const handleBffStorageFile = async (req, res, url) => {
  const session = requireCookieSession(req);
  const bucket = assertBffIdentifier(url.searchParams.get("bucket"), "Nama bucket");
  const path = sanitizeStoragePath(url.searchParams.get("path"));
  let relativePath;
  try {
    relativePath = removeStoragePathPrefix(path, storagePathPrefix);
  } catch {
    relativePath = "";
  }
  if (bucket !== "avatars" || !/^[0-9a-f-]{36}\/avatar_[A-Za-z0-9_.-]+(?:_thumb\.webp)?$/i.test(relativePath)) {
    const err = new Error("Akses file harus melalui endpoint dokumen yang terotorisasi.");
    err.status = 403;
    throw err;
  }
  if (!relativePath.startsWith(`${session.user.id}/`)) {
    const err = new Error("Akses avatar ditolak.");
    err.status = 403;
    throw err;
  }
  const { data, error } = await storageSupabase.storage.from(bucket).download(path);
  if (error || !data) {
    const err = new Error(error?.message || "File tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  res.writeHead(200, withSecurityHeaders({
    "Content-Type": data.type || contentTypes[extname(path)] || "application/octet-stream",
    "Content-Length": buffer.length,
    "Content-Disposition": filenameHeaderValue(path.split("/").pop() || "file"),
    "Cache-Control": "private, max-age=60",
  }));
  res.end(buffer);
};

const openBffRealtimeStream = async (req, res, url) => {
  const session = requireCookieSession(req);
  const tables = [...new Set(String(url.searchParams.get("tables") || "")
    .split(",")
    .map((table) => table.trim())
    .filter(Boolean)
    .map((table) => assertBffIdentifier(table, "Nama tabel")))];
  if (!tables.length || tables.length > 32) {
    const err = new Error("Daftar tabel realtime harus berisi 1 sampai 32 tabel.");
    err.status = 400;
    throw err;
  }

  const client = createUserSupabaseClient(session.access_token);
  await client.realtime.setAuth(session.access_token);

  res.writeHead(200, withSecurityHeaders({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  }));
  res.write("retry: 3000\n");
  res.write(": connected\n\n");
  marisonRealtimeClients.add(res);

  let closed = false;
  let eventSequence = 0;
  const channel = client.channel(`sigap-bff:${session.user.id}:${randomUUID()}`);
  for (const table of tables) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      if (closed || res.destroyed) return;
      eventSequence += 1;
      res.write(`id: ${Date.now()}-${eventSequence}\n`);
      res.write("event: postgres_change\n");
      res.write(`data: ${JSON.stringify({
        schema: payload.schema,
        table: payload.table,
        eventType: payload.eventType,
        commit_timestamp: payload.commit_timestamp,
        new: payload.new || {},
        old: payload.old || {},
      })}\n\n`);
    });
  }

  const heartbeatTimer = setInterval(() => {
    if (!closed && !res.destroyed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 25_000);
  const remainingTokenMs = Math.max(60_000, Number(session.expires_at || 0) * 1000 - Date.now() - 5 * 60_000);
  const reconnectTimer = setTimeout(() => {
    if (!closed && !res.destroyed) res.end();
  }, Math.min(45 * 60_000, remainingTokenMs));

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    clearTimeout(reconnectTimer);
    marisonRealtimeClients.delete(res);
    client.removeChannel(channel).catch(() => {});
  };

  channel.subscribe((status) => {
    if (closed || res.destroyed) return;
    if (status === "SUBSCRIBED") {
      res.write("event: ready\ndata: {}\n\n");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      res.write(`event: stream_error\ndata: ${JSON.stringify({ status })}\n\n`);
      res.end();
    }
  });

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("close", cleanup);
};

const PASSWORD_RESET_LOGO_CID = "marison-logo@sigap";
const passwordResetLogoPath = [
  join(distDir, "logo-marison.png"),
  resolve("public", "logo-marison.png"),
].find((candidate) => existsSync(candidate));

const buildPasswordResetEmailHtml = ({ resetUrl }) => {
  const safeResetUrl = escapeHtml(resetUrl);
  const logoHtml = passwordResetLogoPath
    ? `<img src="cid:${PASSWORD_RESET_LOGO_CID}" width="76" alt="Marison Regency Group" style="display:block;width:76px;max-width:76px;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<div style="font-size:14px;font-weight:800;line-height:1.3;color:#2eaf35;">MARISON<br>REGENCY GROUP</div>`;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#10201a;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce8df;border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(16,32,26,0.10);">
        <tr>
          <td style="padding:28px 28px 20px 28px;border-bottom:1px solid #e6eee9;background:#fbfdfb;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:86px;vertical-align:middle;padding-right:16px;">
                  ${logoHtml}
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#2eaf35;letter-spacing:0.02em;">Marison - SIGAP</div>
                  <div style="font-size:22px;line-height:1.25;font-weight:800;color:#10201a;margin-top:8px;">Reset kata sandi akun</div>
                  <div style="font-size:12px;line-height:1.5;color:#64756d;margin-top:6px;">Digital approval system Marison Regency Group</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px 8px 28px;">
            <p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;color:#33443c;">Kami menerima permintaan untuk mengganti kata sandi akun SIGAP Anda.</p>
            <p style="margin:0 0 22px 0;font-size:15px;line-height:1.7;color:#33443c;">Klik tombol di bawah untuk membuat kata sandi baru. Link ini bersifat sementara dan akan kedaluwarsa otomatis.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
              <tr>
                <td style="border-radius:12px;background:#2eaf35;">
                  <a href="${safeResetUrl}" style="display:inline-block;padding:13px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Reset kata sandi</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#64756d;">Jika tombol tidak bisa dibuka, salin tautan berikut ke browser:</p>
            <p style="margin:0 0 20px 0;font-size:12px;line-height:1.6;word-break:break-all;color:#2f6f37;">${safeResetUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px 26px 28px;background:#f8fbf9;border-top:1px solid #e6eee9;">
            <p style="margin:0;font-size:12px;line-height:1.7;color:#65766e;">Abaikan email ini jika Anda tidak meminta reset kata sandi. Tim SIGAP tidak pernah meminta password melalui email, chat, atau telepon.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
};

const handlePasswordResetRequest = async (req) => {
  if (!supabase) {
    const err = new Error("Supabase server credentials are not configured.");
    err.status = 503;
    throw err;
  }

  const payload = await readJsonBody(req, 4096);
  const email = String(payload?.email || "").trim().toLowerCase();
  const ipKey = clientIp(req) || "unknown";
  const requestKey = `${ipKey}:${sha256Hex(email).slice(0, 16)}`;
  const publicResult = {
    ok: true,
    message: "Jika email terdaftar, link reset kata sandi akan dikirim.",
  };

  if (!isEmail(email)) return publicResult;

  enforceRateLimit(passwordResetIpRateLimits, ipKey, PASSWORD_RESET_MAX_PER_WINDOW);
  recordRateLimit(passwordResetIpRateLimits, ipKey, AUTH_RATE_LIMIT_WINDOW_MS);

  const recentSendUntil = passwordResetSendCooldowns.get(requestKey);
  if (recentSendUntil && recentSendUntil > Date.now()) {
    return publicResult;
  }

  let linkResult;
  try {
    linkResult = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || defaultEmailSettings.app_url).replace(/\/+$/, "")}/reset-password`,
      },
    });
  } catch (error) {
    console.error("Password reset link generation failed:", { message: error?.message });
    return publicResult;
  }

  if (linkResult.error || !linkResult.data?.properties) {
    console.warn("Password reset link not generated:", { message: linkResult.error?.message });
    return publicResult;
  }

  const appUrl = String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || defaultEmailSettings.app_url).replace(/\/+$/, "");
  const tokenHash = linkResult.data.properties.hashed_token;
  const resetUrl = tokenHash
    ? `${appUrl}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
    : linkResult.data.properties.action_link;

  if (!resetUrl) {
    console.warn("Password reset link missing action url.");
    return publicResult;
  }

  try {
    await getMailTransporter().sendMail({
      from: smtpConfig.from,
      to: email,
      subject: "Reset Kata Sandi SIGAP",
      text: `Kami menerima permintaan reset kata sandi SIGAP.\n\nBuka link berikut untuk membuat kata sandi baru:\n${resetUrl}\n\nAbaikan email ini jika Anda tidak meminta reset kata sandi.`,
      html: buildPasswordResetEmailHtml({ resetUrl }),
      attachments: passwordResetLogoPath
        ? [{
            filename: "logo-marison.png",
            path: passwordResetLogoPath,
            cid: PASSWORD_RESET_LOGO_CID,
            contentDisposition: "inline",
          }]
        : [],
    });
    passwordResetSendCooldowns.set(requestKey, Date.now() + PASSWORD_RESET_SEND_COOLDOWN_MS);
  } catch (error) {
    console.error("Password reset email failed:", { code: error?.code, command: error?.command, response: error?.response, message: error?.message });
    const err = new Error("Email reset belum bisa dikirim. Periksa konfigurasi SMTP.");
    err.status = 503;
    throw err;
  }

  return publicResult;
};

const getBearerToken = (req) => {
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  if (bearer && bearer !== "cookie-session") return bearer;
  return readCookieSession(req)?.access_token || "";
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
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_active, deleted_at")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileError) {
    const err = new Error("Gagal memvalidasi status akun.");
    err.status = 503;
    throw err;
  }
  if (!isActiveProfile(profile)) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  return userRes.user;
};

const requireAdminUser = async (token) => {
  const user = await requireSupabaseUser(token);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!isActiveAdminProfile(profile)) {
    const err = new Error("Akses ditolak: hanya admin");
    err.status = 403;
    throw err;
  }
  return user;
};

const formatTemplatePreviewDate = (date = new Date()) => date.toLocaleDateString("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const setPreviewCell = (worksheet, address, value, options = {}) => {
  const cell = worksheet.getCell(address);
  cell.value = value;
  cell.alignment = {
    ...(cell.alignment || {}),
    horizontal: options.horizontal || cell.alignment?.horizontal || "left",
    vertical: options.vertical || cell.alignment?.vertical || "middle",
    wrapText: options.wrap ?? true,
    ...(options.horizontal === "center" ? {} : { indent: Math.max(Number(cell.alignment?.indent || 0), 1) }),
  };
};

const columnNameToNumber = (columnName) => {
  let value = 0;
  for (const character of String(columnName || "").toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return value;
};

const columnNumberToName = (columnNumber) => {
  let value = columnNumber;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const parsePreviewRange = (range) => {
  const match = String(range || "").trim().toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return null;
  return {
    startCol: columnNameToNumber(match[1]),
    startRow: Number(match[2]),
    endCol: columnNameToNumber(match[3]),
    endRow: Number(match[4]),
  };
};

const formatPreviewRange = (startCol, startRow, endCol, endRow) =>
  `${columnNumberToName(startCol)}${startRow}:${columnNumberToName(endCol)}${endRow}`;

const previewRangesOverlap = (left, right) =>
  left.startCol <= right.endCol && left.endCol >= right.startCol &&
  left.startRow <= right.endRow && left.endRow >= right.startRow;

const mergePreviewRange = (worksheet, range) => {
  const parsed = parsePreviewRange(range);
  if (!parsed) return;
  const existingMerges = Array.isArray(worksheet.model?.merges) ? [...worksheet.model.merges] : [];
  existingMerges.forEach((existingRange) => {
    const existing = parsePreviewRange(existingRange);
    if (existing && previewRangesOverlap(existing, parsed)) worksheet.unMergeCells(existingRange);
  });
  worksheet.mergeCells(range);
};

const stylePreviewBox = (worksheet, range, options = {}) => {
  const parsed = parsePreviewRange(range);
  if (!parsed) return;
  const cell = worksheet.getCell(parsed.startRow, parsed.startCol);
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };
  cell.alignment = {
    horizontal: options.horizontal || "center",
    vertical: options.vertical || "middle",
    wrapText: true,
    ...(options.horizontal === "left" ? { indent: 1 } : {}),
  };
  if (options.bold) cell.font = { ...(cell.font || {}), bold: true };
};

const stylePreviewRange = (worksheet, range, options = {}) => {
  const parsed = parsePreviewRange(range);
  if (!parsed) return;
  for (let row = parsed.startRow; row <= parsed.endRow; row += 1) {
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (options.fill) cell.fill = options.fill;
      if (options.font) cell.font = { ...(cell.font || {}), ...options.font };
      if (options.alignment) cell.alignment = { ...(cell.alignment || {}), ...options.alignment };
      if (options.border) cell.border = { ...(cell.border || {}), ...options.border };
    }
  }
};

const clearPreviewRange = (worksheet, range, options = {}) => {
  const parsed = parsePreviewRange(range);
  if (!parsed) return;
  for (let row = parsed.startRow; row <= parsed.endRow; row += 1) {
    for (let col = parsed.startCol; col <= parsed.endCol; col += 1) {
      const cell = worksheet.getCell(row, col);
      if (options.values) cell.value = null;
      if (options.fill) cell.fill = { type: "pattern", pattern: "none" };
    }
  }
};

const previewGreenFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7FAF5" } };
const previewGreenFont = { color: { argb: "FF111827" }, bold: true };

const buildBoundedSignatureRoleCounts = (total) => {
  for (let membuat = 1; membuat <= Math.min(3, total - 2); membuat += 1) {
    for (let memeriksa = 1; memeriksa <= Math.min(3, total - membuat - 1); memeriksa += 1) {
      const menyetujui = total - membuat - memeriksa;
      if (menyetujui >= 1 && menyetujui <= 3) return [membuat, memeriksa, menyetujui];
    }
  }
  return [1, 1, 1];
};

const fillRecommendationPreview = (worksheet) => {
  stylePreviewRange(worksheet, "I18:J18", {
    fill: previewGreenFill,
    font: previewGreenFont,
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  setPreviewCell(worksheet, "C4", "TEST/UAI/PBO.4/VI/2026");
  setPreviewCell(worksheet, "A9", 1, { horizontal: "center" });
  setPreviewCell(worksheet, "B9", "Laptop kerja");
  setPreviewCell(worksheet, "D9", "REG-001");
  setPreviewCell(worksheet, "E9", "PO / Pengguna Contoh");
  setPreviewCell(worksheet, "F9", "Performa menurun");
  setPreviewCell(worksheet, "G9", "V", { horizontal: "center" });
  setPreviewCell(worksheet, "I9", "Service dan penggantian komponen");
  setPreviewCell(worksheet, "J9", "Prioritas operasional");
  setPreviewCell(worksheet, "B18", "Dokumen uji template rekomendasi. Data ini tidak disimpan sebagai surat.");
  setPreviewCell(worksheet, "I17", `Magelang, ${formatTemplatePreviewDate()}`);
  setPreviewCell(worksheet, "I18", "Membuat", { horizontal: "center" });
  setPreviewCell(worksheet, "J18", "Memeriksa", { horizontal: "center" });
  setPreviewCell(worksheet, "I19", "Preview Sistem\nTanggal pengujian", { horizontal: "center" });
  setPreviewCell(worksheet, "I23", "PENGGUNA CONTOH", { horizontal: "center" });
  setPreviewCell(worksheet, "J23", "MANAGER PO", { horizontal: "center" });
  setPreviewCell(worksheet, "I24", "Staff IT", { horizontal: "center" });
  setPreviewCell(worksheet, "J24", "Mgr. PO", { horizontal: "center" });
};

const getGenericPreviewValue = (field) => {
  const source = String(field.default_source || field.defaultSource || "manual").toLowerCase();
  const systemValues = {
    requester_name: "Pengguna Contoh",
    requester_nik: "TEST-001",
    requester_job_title: "Staff",
    department_name: "Departemen Contoh",
    office_name: "Kantor Pusat",
    project_name: "Proyek Contoh",
    entity_name: "PT Usaha Adi Karya",
    letter_number: "TEST/UAI/FORM.1/VI/2026",
    letter_title: "Dokumen Pengujian Template",
    request_place: "Magelang",
    request_date: new Date().toISOString().slice(0, 10),
    request_place_date: `Magelang, ${formatTemplatePreviewDate()}`,
  };
  if (systemValues[source] !== undefined) return systemValues[source];
  if (field.type === "date") return new Date().toISOString().slice(0, 10);
  if (field.type === "number" || field.type === "currency") return 1;
  if (field.type === "textarea") return "Catatan pengujian template. Data ini tidak disimpan sebagai surat.";
  return `Contoh ${String(field.label || field.key || "isian")}`;
};

const getGenericTableValue = (column) => {
  const key = String(column.key || "").toLowerCase();
  if (key.includes("kode")) return "TEST-001";
  if (key.includes("nama")) return "Barang atau layanan contoh";
  if (key === "sat" || key.includes("satuan")) return "Unit";
  if (key.includes("jumlah")) return 1;
  if (key === "status") return "2";
  if (key === "service") return "V";
  if (key === "ganti") return "";
  if (key.includes("tanggal")) return new Date().toISOString().slice(0, 10);
  return `Contoh ${String(column.label || column.key || "data")}`;
};

const fillGenericTemplatePreview = (workbook, inputSchema) => {
  const fields = Array.isArray(inputSchema) ? inputSchema : [];
  fields.forEach((field) => {
    const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
    const worksheet = workbook.worksheets[sheetIndex] || workbook.worksheets[0];
    if (!worksheet) return;

    if (field.type === "table") {
      const config = field.table_config || field.tableConfig;
      const startRow = Number(config?.start_row || config?.startRow || 0);
      if (!startRow) return;
      const noColumn = String(config?.no_column || config?.noColumn || "").toUpperCase();
      if (noColumn) setPreviewCell(worksheet, `${noColumn}${startRow}`, 1, { horizontal: "center" });
      (config?.columns || []).forEach((column) => {
        const columnName = String(column.column || "").trim().toUpperCase();
        if (!columnName) return;
        const horizontal = resolveTableHorizontalAlignment(column.key, column.type);
        setPreviewCell(worksheet, `${columnName}${startRow}`, getGenericTableValue(column), {
          horizontal,
        });
      });
      return;
    }

    const range = String(field.merge_range || field.mergeRange || field.cell || "").trim().toUpperCase();
    const address = range.split(":")[0];
    if (!address) return;
    setPreviewCell(worksheet, address, getGenericPreviewValue(field), {
      horizontal: field.horizontal || "left",
      vertical: field.vertical || "middle",
      wrap: field.wrap !== false,
    });
  });
};

const readTemplatePreviewSource = async (templateLink) => {
  const rawLink = String(templateLink || "").trim();
  if (!rawLink) {
    const err = new Error("File template belum tersedia.");
    err.status = 404;
    throw err;
  }

  if (rawLink.startsWith("/")) {
    const templatePath = resolve(join(distDir, decodeURIComponent(rawLink).replace(/^\/+/, "")));
    const relativeTemplatePath = relative(distDir, templatePath);
    if (relativeTemplatePath.startsWith("..") || !existsSync(templatePath)) {
      const err = new Error("Template uji tidak tersedia.");
      err.status = 404;
      throw err;
    }
    return await readFile(templatePath);
  }

  let templateUrl;
  try {
    templateUrl = new URL(rawLink);
  } catch {
    const err = new Error("Alamat template tidak valid.");
    err.status = 400;
    throw err;
  }
  const allowedHosts = new Set([supabaseUrl, storageSupabaseUrl, storagePublicBaseUrl]
    .filter(Boolean)
    .map((value) => new URL(value).host));
  if (templateUrl.protocol !== "https:" || !allowedHosts.has(templateUrl.host)) {
    const err = new Error("Host template tidak diizinkan.");
    err.status = 403;
    throw err;
  }

  const response = await fetch(templateUrl, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error("Gagal mengambil file template.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 20 * 1024 * 1024) {
    const err = new Error("Ukuran template melebihi batas 20 MB.");
    err.status = 413;
    throw err;
  }
  return buffer;
};

const enforceTemplatePreviewRateLimit = (userId) => {
  const now = Date.now();
  const recent = (templatePreviewRateLimits.get(userId) || []).filter((time) => now - time < 60_000);
  if (recent.length >= TEMPLATE_PREVIEW_MAX_PER_MINUTE) {
    const err = new Error("Terlalu banyak permintaan PDF uji. Coba lagi satu menit lagi.");
    err.status = 429;
    throw err;
  }
  recent.push(now);
  templatePreviewRateLimits.set(userId, recent);
};

const normalizeTemplatePreviewOptions = (payload = {}) => {
  const signatureCount = Math.min(Math.max(Number(payload.signature_count || payload.signatureCount || 3), 3), 8);
  const signatureRoles = Array.isArray(payload.signature_roles || payload.signatureRoles)
    ? (payload.signature_roles || payload.signatureRoles).slice(0, 3).map((value) => Number(value || 0))
    : [1, Math.max(signatureCount - 2, 1), 1];
  const roleTotal = signatureRoles.reduce((total, value) => total + value, 0);
  return {
    signature_count: signatureCount,
    signature_roles: roleTotal === signatureCount && signatureRoles.every((value) => value > 0 && value <= 3)
      ? signatureRoles
      : buildBoundedSignatureRoleCounts(signatureCount),
  };
};

const generateTemplatePreviewPdf = async (formId, options = {}) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formId)) {
    const err = new Error("Form yang dipilih tidak valid.");
    err.status = 400;
    throw err;
  }

  const { data: form, error: formError } = await supabase
    .from("master_forms")
    .select("id, nama_form, nomor_form, link_form, input_schema, signature_layout")
    .eq("id", formId)
    .maybeSingle();
  if (formError) throw formError;
  if (!form) {
    const err = new Error("Form tidak ditemukan.");
    err.status = 404;
    throw err;
  }

  const formName = String(form.nama_form || "").toUpperCase();
  if (formName.includes("PERMINTAAN BARANG")) {
    const previewData = createPgdPreviewData(options);
    previewData.formNumber = String(form.nomor_form || previewData.formNumber);
    return await renderPgdPdf(previewData, {
      logoPath: join(distDir, "logo-marison-regency-group.png"),
    });
  }

  const workDir = await mkdtemp(join(tmpdir(), "agenda-template-preview-"));
  try {
    const sourcePath = join(workDir, "preview.xlsx");
    const sourceBuffer = await readTemplatePreviewSource(form.link_form);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(sourceBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Sheet template tidak tersedia.");

    const formName = String(form.nama_form || "").toUpperCase();
    fillGenericTemplatePreview(workbook, form.input_schema);
    if (formName.includes("REKOMENDASI PEREMAJAAN")) fillRecommendationPreview(worksheet);
    await workbook.xlsx.writeFile(sourcePath);
    await normalizeWorkbookForPdf(sourcePath);

    await execFileAsync("soffice", [
      "--headless",
      "--nologo",
      "--nofirststartwizard",
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      sourcePath,
    ], { timeout: 120_000 });
    return await readFile(join(workDir, "preview.pdf"));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const createTemplatePreview = async (token, payload) => {
  const user = await requireAdminUser(token);
  enforceTemplatePreviewRateLimit(user.id);
  const now = Date.now();
  for (const [previewToken, preview] of templatePreviewTokens.entries()) {
    if (preview.expiresAt < now) templatePreviewTokens.delete(previewToken);
  }
  const formId = String(payload?.form_id || "").trim();
  const pdf = await generateTemplatePreviewPdf(formId, normalizeTemplatePreviewOptions(payload));
  const previewToken = randomBytes(32).toString("base64url");
  templatePreviewTokens.set(previewToken, {
    pdf,
    expiresAt: now + TEMPLATE_PREVIEW_TTL_MS,
  });
  return {
    previewUrl: `/api/admin/template-preview/${previewToken}`,
    expiresIn: Math.floor(TEMPLATE_PREVIEW_TTL_MS / 1000),
  };
};

const consumeTemplatePreview = (token) => {
  const preview = templatePreviewTokens.get(token);
  templatePreviewTokens.delete(token);
  if (!preview || preview.expiresAt < Date.now()) {
    const err = new Error("Pratinjau PDF sudah kedaluwarsa.");
    err.status = 410;
    throw err;
  }
  return preview.pdf;
};

const getAttentionStateForUser = async (userId) => {
  if (!supabase) throw new Error("Supabase server credentials are not configured.");
  if (!userId) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const { data, error } = await supabase.rpc("get_attention_state_for_user", {
    p_user_id: userId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const approvalCount = Number(row?.approval_count || 0);
  const verificationCount = Number(row?.verification_count || 0);
  const revisionCount = Number(row?.revision_count || 0);
  const requesterRevisionCount = Number(row?.follow_up_count || 0);
  const recommendationCount = Number(row?.recommendation_count || 0);
  const monitoringCount = Number(row?.monitoring_count || 0);

  return {
    approvalCount,
    verificationCount,
    revisionCount,
    recommendationCount,
    inboxCount: approvalCount + verificationCount + revisionCount,
    unreadNotifications: Number(row?.unread_notifications || 0),
    monitoringCount,
    followUpCount: requesterRevisionCount,
    masterOfficeReviewCount: Number(row?.master_office_review_count || 0),
    profileReviewCount: Number(row?.profile_review_count || 0),
    masterProjectReviewCount: Number(row?.master_project_review_count || 0),
    generatedAt: new Date().toISOString(),
  };
};

const getAttentionStateFromRequest = async (token) => {
  const user = await requireSupabaseUser(token);
  return getAttentionStateForUser(user.id);
};

const normalizePushSubscription = (value) => {
  const endpoint = String(value?.endpoint || "").trim();
  const p256dh = String(value?.keys?.p256dh || "").trim();
  const auth = String(value?.keys?.auth || "").trim();
  if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) {
    const err = new Error("Subscription Web Push tidak valid.");
    err.status = 400;
    throw err;
  }
  return {
    endpoint,
    expirationTime: value?.expirationTime || null,
    keys: { p256dh, auth },
  };
};

const getWebPushPublicKey = async (token) => {
  await requireSupabaseUser(token);
  return {
    enabled: Boolean(webPushConfig.publicKey && webPushConfig.privateKey),
    publicKey: webPushConfig.publicKey || null,
  };
};

const saveWebPushSubscription = async (token, payload, req) => {
  const user = await requireSupabaseUser(token);
  if (!webPushConfig.publicKey || !webPushConfig.privateKey) {
    const err = new Error("Web Push belum dikonfigurasi di server.");
    err.status = 503;
    throw err;
  }
  const subscription = normalizePushSubscription(payload?.subscription || payload);
  const { error } = await supabase
    .from("web_push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint: subscription.endpoint,
      subscription,
      user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
      disabled_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
  if (error) throw error;
  return { ok: true };
};

const removeWebPushSubscription = async (token, payload) => {
  const user = await requireSupabaseUser(token);
  const endpoint = String(payload?.endpoint || payload?.subscription?.endpoint || "").trim();
  if (!endpoint) return { ok: true };
  const { error } = await supabase
    .from("web_push_subscriptions")
    .update({ disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);
  if (error) throw error;
  return { ok: true };
};

const sendWebPushToUsers = async (userIds, payload = {}) => {
  if (!webPushConfig.publicKey || !webPushConfig.privateKey) return { sent: 0, skipped: "not_configured" };
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return { sent: 0 };

  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, user_id, endpoint, subscription")
    .in("user_id", ids)
    .is("disabled_at", null);
  if (error) {
    console.error("Load push subscriptions failed:", error);
    return { sent: 0, error: error.message };
  }

  let sent = 0;
  for (const row of data || []) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({
        title: "Marison - SIGAP",
        message: "Ada pembaruan yang perlu dicek.",
        link: payload.link || "/dashboard",
        tag: "sigap-attention",
      }), { TTL: 60 });
      sent += 1;
      supabase
        .from("web_push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .then(() => {});
    } catch (error) {
      const statusCode = error?.statusCode || error?.status;
      if (statusCode === 404 || statusCode === 410) {
        supabase
          .from("web_push_subscriptions")
          .update({ disabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => {});
      } else {
        console.error("Web Push send failed:", error?.message || error);
      }
    }
  }
  return { sent };
};

const getEmailSettings = async (formId = null) => {
  const [{ data: globalRow }, { data: formRow }] = await Promise.all([
    supabase.from("system_email_settings").select("config").eq("id", "global").maybeSingle(),
    formId
      ? supabase.from("master_forms").select("email_config").eq("id", formId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const base = normalizeEmailSettings(globalRow?.config || defaultEmailSettings);
  return mergeEmailSettings(base, formRow?.email_config);
};

const getEmailRecipientIds = async (surat) => {
  const profileIds = [surat?.created_by, ...(surat?.surat_signatures || []).map((item) => item.user_id)].filter(Boolean);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, department_id, office_id")
    .in("id", [...new Set(profileIds)]);

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

  return {
    profiles: profiles || [],
    departmentEmails: uniqueEmails((departments || []).map((department) => department.email)),
    officeEmails: uniqueEmails((offices || []).map((office) => office.email)),
    userEmails: uniqueEmails((profiles || []).map((profile) => profile.email)),
  };
};

const createEmailFileToken = async ({ suratId, bucket, path, origin = "primary", purpose = "email", ttlHours = 72, requestedBy = null }) => {
  const rawToken = randomBytes(32).toString("base64url");
  const { error } = await supabase
    .from("file_view_tokens")
    .insert({
      token_hash: hashFileViewToken(rawToken),
      bucket,
      object_path: path,
      storage_origin: origin,
      surat_id: suratId,
      requested_by: requestedBy,
      purpose,
      expires_at: new Date(Date.now() + Math.max(Number(ttlHours || 72), 1) * 60 * 60 * 1000).toISOString(),
    });
  if (error) throw error;
  return `/api/files/view/${rawToken}`;
};

const parseStorageRef = (value) => {
  if (!value) return null;
  const raw = String(value);
  const clean = raw.split("?")[0];
  if (clean.includes("/storage/v1/object/public/")) {
    const [left, ...rest] = clean.split("/storage/v1/object/public/");
    const path = rest.join("/storage/v1/object/public/");
    const baseBucket = path.split("/")[0];
    const externalStorageBases = [storageSupabaseUrl, storagePublicBaseUrl]
      .filter(Boolean)
      .map((base) => String(base).replace(/\/+$/, ""));
    return {
      bucket: baseBucket,
      path: path.slice(baseBucket.length + 1),
      origin: externalStorageBases.some((base) => left.startsWith(base)) ? "external" : "primary",
    };
  }
  if (clean.startsWith("lampiran_")) return { bucket: "lampiran_surat", path: clean, origin: "primary" };
  if (clean.startsWith("dokumen_")) return { bucket: "dokumen_surat", path: clean, origin: "primary" };
  const parts = clean.split("/");
  if (parts.length >= 2) {
    return { bucket: parts[0], path: parts.slice(1).join("/"), origin: "primary" };
  }
  return null;
};

const buildEmailFileLink = async (suratId, rawPath, config, requestedBy = null) => {
  const requested = parseStorageRef(rawPath);
  if (!requested) return null;
  return createEmailFileToken({
    suratId,
    bucket: requested.bucket,
    path: requested.path,
    origin: requested.origin || "primary",
    ttlHours: config.link_ttl_hours,
    requestedBy,
  });
};

const buildPersistentMarisonFileLink = async (surat, rawPath, requestedBy = null) => {
  const appUrl = String(process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || "").replace(/\/+$/, "");
  const requested = parseStorageRef(rawPath);
  if (!appUrl || !requested) return null;

  const rawToken = randomBytes(32).toString("base64url");
  const { error } = await supabase
    .from("file_view_tokens")
    .insert({
      token_hash: hashFileViewToken(rawToken),
      bucket: requested.bucket,
      object_path: requested.path,
      storage_origin: requested.origin || "primary",
      surat_id: surat.id,
      requested_by: requestedBy,
      purpose: "external_marison",
      expires_at: null,
    });
  if (error) throw error;

  const filename = encodeURIComponent(buildDocumentFilename(surat, requested.path, "lampiran"));
  return `${appUrl}/api/files/view/${rawToken}/${filename}`;
};

const downloadStorageAttachment = async (rawPath) => {
  const requested = parseStorageRef(rawPath);
  if (!requested) return null;
  const { data, error } = await storageClientForRef(requested).storage.from(requested.bucket).download(requested.path);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    filename: requested.path.split("/").pop() || "lampiran",
    content: buffer,
    contentType: data.type || contentTypes[extname(requested.path)] || "application/octet-stream",
    size: buffer.length,
    ref: requested,
  };
};

const escapeEmailHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const getSafeEmailHttpUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
};

const humanizeEmailKey = (key) => {
  const labels = {
    catatan: "Catatan",
    nama_barang: "Nama Barang",
    sat: "Satuan",
    jumlah: "Jumlah",
    status: "Status",
    keterangan: "Keterangan",
    kode: "Kode",
    requested_unit_count: "Jumlah Unit Diajukan",
    unit_request_sentence: "Ringkasan Permohonan",
    requires_recommendation: "Perlu Rekomendasi",
    recommendation_template_name: "Template Rekomendasi",
    recommendation_attachment_note: "Catatan Rekomendasi",
  };
  return labels[key] || String(key || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatEmailDisplayDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
};

const formatEmailCategory = (value) => {
  const category = String(value || "").trim().toLowerCase();
  const labels = {
    asset: "Aset",
    unit: "Unit",
    non_unit: "Non Unit",
    nonunit: "Non Unit",
    non_asset: "Non Aset",
    nonasset: "Non Aset",
  };
  return labels[category] || value || "-";
};

const getEmailUnitCode = (unit) => String(
  unit?.raw?.code ||
  unit?.raw?.unit_code ||
  unit?.raw?.kode ||
  unit?.code ||
  unit?.value ||
  unit?.label ||
  "-"
).trim();

const parseEmailMoney = (value) => {
  const cleaned = String(value ?? "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const amount = Number(cleaned || 0);
  return Number.isFinite(amount) ? amount : 0;
};

const formatEmailRupiah = (value) => {
  const amount = parseEmailMoney(value);
  if (amount === 0) return "-";
  return `Rp ${new Intl.NumberFormat("id-ID").format(amount)}`;
};

const formatEmailProductionDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const buildEmailProductionCode = (unit) => {
  const detail = unit?.allocation_detail || {};
  const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
  const formattedDate = formatEmailProductionDate(detail.production_date || detail.kode_produksi_tanggal || "");
  return buildProductionCode({
    serial: detail.production_serial || detail.kode_produksi_nomor,
    block,
    date: formattedDate,
  }) || unit?.raw?.production_code || "-";
};

const getEmailUnitType = (unit) => {
  const detail = unit?.allocation_detail || {};
  return String(
    detail.unit_type ||
    detail.type ||
    detail.tipe ||
    unit?.unit_type ||
    unit?.raw?.unit_type ||
    unit?.raw?.type ||
    unit?.raw?.tipe ||
    unit?.raw?.house_type ||
    "-"
  ).trim();
};

const renderAllocatedUnitsEmailTable = (units, project) => {
  if (!Array.isArray(units) || units.length === 0) return "";

  return `
    <div style="margin-top:20px">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">Unit Dialokasikan</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1">
          <thead>
            <tr style="background:#e2e8f0">
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;color:#334155">No.</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Proyek</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;color:#334155">Unit</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Tipe</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px;color:#334155">Struktur Atas</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px;color:#334155">Struktur Bawah</th>
              <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Kode Produksi</th>
            </tr>
          </thead>
          <tbody>
            ${units.map((unit, index) => {
              const detail = unit?.allocation_detail || {};
              return `
                <tr>
                  <td style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${index + 1}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px">${escapeEmailHtml(project?.name || project?.label || "-")}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;font-weight:700">${escapeEmailHtml(getEmailUnitCode(unit))}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px">${escapeEmailHtml(getEmailUnitType(unit))}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px">${escapeEmailHtml(formatEmailRupiah(detail.struktur_atas))}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px">${escapeEmailHtml(formatEmailRupiah(detail.struktur_bawah))}</td>
                  <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;font-family:Consolas,monospace">${escapeEmailHtml(buildEmailProductionCode(unit))}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
};

const renderEmailInputDetails = (inputValue) => {
  const input = inputValue && typeof inputValue === "object" && !Array.isArray(inputValue) ? inputValue : {};
  const hiddenKeys = new Set([
    "items",
    "request_mode",
    "request_category",
    "unit_config_snapshot",
    "requested_project",
    "requested_unit_count",
    "unit_request_sentence",
    "allocated_at",
    "allocated_project",
    "allocated_units",
    "allocated_unit_count",
    "allocated_by_signature_id",
    "recommendation_items",
    "signers",
  ]);
  const items = Array.isArray(input.items) ? input.items : [];
  const isNonUnitItems = items.some((item) =>
    item?.non_unit_id != null || item?.item_name != null || item?.planning_notes != null
  );
  const recommendationItems = Array.isArray(input.recommendation_items) ? input.recommendation_items : [];
  const detailRows = Object.entries(input)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== "" && value != null)
    .map(([key, value]) => {
      const displayValue = typeof value === "boolean"
        ? (value ? "Ya" : "Tidak")
        : typeof value === "object"
          ? value?.label || value?.name || JSON.stringify(value)
          : value;
      return `
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#64748b;font-size:12px;width:180px;vertical-align:top">${escapeEmailHtml(humanizeEmailKey(key))}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;color:#0f172a;font-size:13px;white-space:pre-wrap">${escapeEmailHtml(displayValue)}</td>
        </tr>`;
    }).join("");

  const itemColumns = [
    ["kode", "Kode"],
    ["nama_barang", "Nama Barang"],
    ["sat", "Satuan"],
    ["jumlah", "Jumlah"],
    ["status", "Status"],
    ["keterangan", "Keterangan"],
  ].filter(([key]) => items.some((item) => item?.[key] != null && String(item[key]).trim()));

  const itemsHtml = isNonUnitItems && items.length
    ? `
      <div style="margin-bottom:${detailRows ? "16px" : "0"}">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#0f172a">Daftar Pekerjaan Non Unit</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1">
            <thead>
              <tr style="background:#e2e8f0">
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;color:#334155">No.</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Jenis Pekerjaan</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Nama Pekerjaan</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px;color:#334155">Nilai Pengajuan</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Catatan Perencanaan</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => {
                const raw = item?.raw && typeof item.raw === "object" ? item.raw : {};
                const code = String(raw?.code || item?.kode || "").trim();
                const name = String(item?.non_unit_name || item?.label || raw?.name || "-").trim();
                return `
                  <tr>
                    <td style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${index + 1}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px">${escapeEmailHtml(code ? `${code} - ${name}` : name)}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.item_name || item?.nama_barang || "-")}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px;white-space:nowrap">${escapeEmailHtml(formatEmailRupiah(item?.subtotal))}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.planning_notes || "-")}</td>
                  </tr>`;
              }).join("")}
              <tr style="background:#f8fafc;font-weight:700">
                <td colspan="3" style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px">Total Pengajuan</td>
                <td style="padding:9px;border:1px solid #cbd5e1;text-align:right;font-size:12px;white-space:nowrap">${escapeEmailHtml(formatEmailRupiah(items.reduce((total, item) => total + parseEmailMoney(item?.subtotal), 0)))}</td>
                <td style="padding:9px;border:1px solid #cbd5e1"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`
    : items.length && itemColumns.length
      ? `
      <div style="margin-bottom:${detailRows ? "16px" : "0"}">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#0f172a">Daftar Barang</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1">
            <thead>
              <tr style="background:#e2e8f0">
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;color:#334155">No.</th>
                ${itemColumns.map(([, label]) => `<th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">${escapeEmailHtml(label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => `
                <tr>
                  <td style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${index + 1}</td>
                  ${itemColumns.map(([key]) => `<td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.[key] ?? "-")}</td>`).join("")}
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`
      : "";

  const recommendationItemsHtml = recommendationItems.length
    ? `
      <div style="margin-bottom:${detailRows || itemsHtml ? "16px" : "0"}">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:#0f172a">Daftar Rekomendasi</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1">
            <thead>
              <tr style="background:#e2e8f0">
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px;color:#334155">No.</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Nama Barang</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Lokasi / PIC</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Hasil</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Uraian</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Link</th>
                <th style="padding:9px;border:1px solid #cbd5e1;text-align:left;font-size:12px;color:#334155">Lampiran</th>
              </tr>
            </thead>
            <tbody>
              ${recommendationItems.map((item, index) => {
                const actionLabel = item?.recommendation_action === "service"
                  ? "Service"
                  : item?.recommendation_action === "ganti"
                    ? "Ganti Komponen"
                    : item?.recommendation_action === "beli_baru"
                      ? "Beli Baru"
                      : item?.recommendation_action === "tidak_direkomendasikan" || item?.is_recommended === false
                        ? "Tidak Direkomendasikan"
                        : "-";
                const link = getSafeEmailHttpUrl(item?.reference_link);
                const attachment = item?.recommendation_attachment || {};
                return `
                  <tr>
                    <td style="padding:9px;border:1px solid #cbd5e1;text-align:center;font-size:12px">${index + 1}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.nama_barang || "-")}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.lokasi_pic || "-")}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px">${escapeEmailHtml(actionLabel)}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(item?.uraian || "-")}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px">${link ? `<a href="${escapeEmailHtml(link)}" style="color:#047857;text-decoration:none">Buka link</a>` : escapeEmailHtml(item?.reference_link || "-")}</td>
                    <td style="padding:9px;border:1px solid #cbd5e1;font-size:12px;white-space:pre-wrap">${escapeEmailHtml(attachment?.file_name || "-")}</td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`
    : "";

  const detailsHtml = detailRows
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">${detailRows}</table>`
    : "";

  return itemsHtml || recommendationItemsHtml || detailsHtml
    ? `${itemsHtml}${recommendationItemsHtml}${detailsHtml}`
    : `<div style="color:#64748b;font-size:13px">Tidak ada detail input tambahan.</div>`;
};

const renderEmailHtml = ({ title, surat, config, fileLinks, attachmentNames, eventLabel, appUrl }) => {
  const requester = surat?.requester_snapshot || {};
  const location = surat?.location_snapshot || {};
  const dataSnapshot = surat?.data_snapshot || {};
  const requestedProject = dataSnapshot.requested_project || {};
  const allocatedUnits = Array.isArray(dataSnapshot.allocated_units) ? dataSnapshot.allocated_units : [];
  const signers = Array.isArray(dataSnapshot.signers) ? dataSnapshot.signers : [];
  const includeNik = config.privacy.include_nik === true;
  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;color:#6b7280;font-size:12px;width:170px;vertical-align:top">${label}</td>
      <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600">${value || "-"}</td>
    </tr>`;

  const fileLinksHtml = fileLinks.length
    ? fileLinks.map((item) => `<li style="margin:0 0 8px"><a href="${item.url}" style="color:#0f172a;text-decoration:underline;font-weight:600">${item.label}</a></li>`).join("")
    : "<li style=\"color:#6b7280;font-size:13px\">Tidak ada file link tersedia.</li>";

  const signersHtml = signers.length
    ? signers.map((signer) => `<li style="margin:0 0 8px;font-size:13px"><strong>${signer.job_title_display || signer.job_title || signer.label_jabatan || signer.role_name || "-"}</strong> &middot; ${signer.full_name || "-"}</li>`).join("")
    : "<li style=\"color:#6b7280;font-size:13px\">Data penandatangan belum tersedia.</li>";

  const attachmentsHtml = attachmentNames.length
    ? attachmentNames.map((name) => `<li style="margin:0 0 8px;font-size:13px">${name}</li>`).join("")
    : "<li style=\"color:#6b7280;font-size:13px\">Tidak ada lampiran attachment.</li>";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;background:#f8fafc;padding:24px">
      <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
        <div style="padding:22px 24px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">Marison - SIGAP</div>
          <div style="font-size:22px;font-weight:800;margin-top:6px">${title}</div>
          <div style="font-size:13px;opacity:.85;margin-top:6px">${eventLabel}</div>
        </div>
        <div style="padding:24px">
          <table style="width:100%;border-collapse:collapse">
            ${row("Nomor Surat", surat?.no_surat)}
            ${row("Judul", surat?.judul_surat)}
            ${row("Status", surat?.status)}
            ${row("Pengaju", `${requester.full_name || "-"}${includeNik && requester.nik ? ` (${requester.nik})` : ""}`)}
            ${row("Jabatan", requester.job_title)}
            ${row("Departemen", location.department?.name || "-")}
            ${row("Kantor", location.office?.name || "-")}
            ${row("Proyek", requestedProject.name || location.project?.name || "-")}
            ${row("Tempat, Tanggal", [surat?.request_place, formatEmailDisplayDate(surat?.request_date)].filter(Boolean).join(", ") || "-")}
            ${row("Kategori", formatEmailCategory(dataSnapshot.request_category))}
          </table>

          <div style="margin-top:20px;padding:16px;border:1px solid #e5e7eb;border-radius:14px;background:#f8fafc">
            <div style="font-size:14px;font-weight:700;margin-bottom:10px">Detail Input Dokumen</div>
            ${renderEmailInputDetails(dataSnapshot.input || {})}
          </div>

          ${renderAllocatedUnitsEmailTable(allocatedUnits, requestedProject || location.project || {})}

          ${(fileLinks.length || attachmentNames.length) ? `<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:20px">
            ${fileLinks.length ? `
            <div style="flex:1;min-width:240px">
              <div style="font-size:14px;font-weight:700;margin-bottom:8px">Tautan Dokumen</div>
              <ul style="margin:0;padding-left:18px">${fileLinksHtml}</ul>
            </div>` : ""}
            ${attachmentNames.length ? `
            <div style="flex:1;min-width:240px">
              <div style="font-size:14px;font-weight:700;margin-bottom:8px">File Terlampir pada Email</div>
              <ul style="margin:0;padding-left:18px">${attachmentsHtml}</ul>
            </div>` : ""}
          </div>` : ""}

          <div style="margin-top:20px">
            <div style="font-size:14px;font-weight:700;margin-bottom:8px">Penandatangan</div>
            <ol style="margin:0;padding-left:18px">${signersHtml}</ol>
          </div>

          ${appUrl ? `<div style="margin-top:24px;text-align:center">
            <a href="${escapeEmailHtml(appUrl)}" style="display:inline-block;background:#111827;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:700">Buka Sistem SIGAP</a>
          </div>` : ""}
        </div>
      </div>
    </div>
  `;
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const resolveEmailPdfPath = async (surat, token, eventType) => {
  const latestSignedSignature = [...(surat.surat_signatures || [])]
    .filter((signature) => signature?.is_signed)
    .sort((a, b) => Number(b.step_order || 0) - Number(a.step_order || 0))[0];
  const initialPath = latestSignedSignature?.pdf_path_snap || surat.pdf_path || null;
  if (initialPath) return initialPath;

  const signatureId = eventType === "signed" || eventType === "next_signer"
    ? latestSignedSignature?.id || null
    : null;

  try {
    const job = await enqueuePdfJob(surat.id, token, { refresh: false, signatureId });
    if (job?.pdfUrl) return job.pdfUrl;
  } catch (error) {
    console.error("Email PDF enqueue failed:", error);
  }

  const timeoutMs = Math.max(Number(process.env.EMAIL_PDF_WAIT_MS || 15000), 0);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1000);
    if (signatureId) {
      const { data } = await supabase
        .from("surat_signatures")
        .select("pdf_path_snap")
        .eq("id", signatureId)
        .maybeSingle();
      if (data?.pdf_path_snap) return data.pdf_path_snap;
    } else {
      const { data } = await supabase
        .from("surat_registrasi")
        .select("pdf_path")
        .eq("id", surat.id)
        .maybeSingle();
      if (data?.pdf_path) return data.pdf_path;
    }
  }
  return null;
};

const sendInternalEmailNotification = async (token, payload) => {
  const actor = await requireSupabaseUser(token);
  const suratId = payload?.surat_id || payload?.suratId;
  const eventType = String(payload?.event_type || payload?.eventType || "general");
  const legacyUserIds = Array.isArray(payload?.user_ids) ? payload.user_ids.filter(Boolean) : [];

  if (!suratId) {
    const userIds = legacyUserIds;
    if (userIds.length === 0) return { sent: 0, recipients: [] };
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, department_id, office_id")
      .in("id", userIds);
    if (profileError) throw profileError;
    const departmentIds = [...new Set((profiles || []).map((profile) => profile.department_id).filter(Boolean))];
    const officeIds = [...new Set((profiles || []).map((profile) => profile.office_id).filter(Boolean))];
    const [{ data: departments }, { data: offices }] = await Promise.all([
      departmentIds.length ? supabase.from("master_departments").select("id, email").in("id", departmentIds) : Promise.resolve({ data: [] }),
      officeIds.length ? supabase.from("master_offices").select("id, email").in("id", officeIds) : Promise.resolve({ data: [] }),
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
    await transporter.sendMail({ from: smtpConfig.from, to: recipients, subject: title, text: `${message}${fullLink ? `\n\n${fullLink}` : ""}`, html });
    return { sent: recipients.length, recipients };
  }

  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select(`
      id, no_surat, judul_surat, status, current_step, request_place, request_date,
      created_by, dept_id, office_id, project_id, penggunaan_id, is_aset,
      file_path, pdf_path, lampiran_path, form_input_data, requester_snapshot,
      location_snapshot, data_snapshot,
      surat_signatures (
        id, user_id, role_name, label_jabatan, step_order, is_signed, signed_at, available_at, file_path_snap, pdf_path_snap, signer_snapshot,
        profiles:user_id ( id, full_name, nik, job_title, email, department_id, office_id )
      ),
      surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id )
    `)
    .eq("id", suratId)
    .single();
  if (suratError || !surat) throw suratError || new Error("Surat tidak ditemukan");

  const formId = surat?.data_snapshot?.form?.id || surat?.data_snapshot?.form?.form_id || null;
  const emailSettings = await getEmailSettings(formId);
  if (!emailSettings.enabled) return { sent: 0, recipients: [] };

  const recipientData = await getEmailRecipientIds(surat);
  const recipients = uniqueEmails([
    ...(emailSettings.recipients.user ? recipientData.userEmails : []),
    ...(emailSettings.recipients.department ? recipientData.departmentEmails : []),
    ...(emailSettings.recipients.office ? recipientData.officeEmails : []),
  ]);
  if (recipients.length === 0) return { sent: 0, recipients: [] };

  const mainPdfPath = await resolveEmailPdfPath(surat, token, eventType);
  const refMap = [
    mainPdfPath ? { label: "PDF Dokumen", path: mainPdfPath, stage: "main" } : null,
    ...(Array.isArray(surat.surat_attachments) ? surat.surat_attachments.map((attachment) => ({
      label: attachment.file_name || attachment.requirement_label || "Lampiran",
      path: attachment.file_url,
      stage: attachment.stage || "initial",
    })) : []),
  ].filter(Boolean);

  const fileLinks = [];
  const attachments = [];
  const attachmentLimitBytes = Number(emailSettings.files.max_total_attachment_mb || 15) * 1024 * 1024;
  let attachmentBudget = attachmentLimitBytes;

  for (const item of refMap) {
    const mode = item.stage === "main"
      ? emailSettings.files.main_pdf
      : item.stage === "approval"
        ? emailSettings.files.approval_attachments
        : emailSettings.files.initial_attachments;
    if (mode === "attachment") {
      const file = await downloadStorageAttachment(item.path);
      if (file && file.size <= attachmentBudget) {
        attachments.push({
          filename: file.filename,
          content: file.content,
          contentType: file.contentType,
        });
        attachmentBudget -= file.size;
      }
      continue;
    }

    const link = await buildEmailFileLink(surat.id, item.path, emailSettings, actor.id);
    if (link) fileLinks.push({ label: item.label, url: `${process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || ""}${link}`.replace(/\/$/, "") });
  }

  const titleMap = {
    new_inbox: "Surat Masuk Baru",
    signed: "Surat Ditandatangani",
    rejected: "Surat Ditolak",
    next_signer: "Surat Menunggu Tanda Tangan Berikutnya",
    general: "Notifikasi SIGAP",
  };
  const title = titleMap[eventType] || titleMap.general;
  const eventLabel = {
    new_inbox: "Dokumen baru membutuhkan tindakan Anda",
    signed: "Perubahan status sudah diproses",
    rejected: "Dokumen ditolak dan memerlukan tindak lanjut",
    next_signer: "Dokumen sudah berpindah ke step berikutnya",
    general: "Informasi dokumen dari SIGAP",
  }[eventType] || "Informasi dokumen dari SIGAP";
  const appUrl = String(emailSettings.app_url || process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || "").replace(/\/+$/, "");
  const html = renderEmailHtml({
    title,
    surat,
    config: emailSettings,
    fileLinks,
    attachmentNames: attachments.map((item) => item.filename),
    eventLabel,
    appUrl,
  });
  const text = [
    `${title}`,
    `${surat.no_surat || "-"} - ${surat.judul_surat || "-"}`,
    `Status: ${surat.status || "-"}`,
    `Pengaju: ${surat.requester_snapshot?.full_name || "-"}`,
    `Departemen: ${surat.location_snapshot?.department?.name || "-"}`,
    `Kantor: ${surat.location_snapshot?.office?.name || "-"}`,
    `Proyek: ${surat.location_snapshot?.project?.name || surat.data_snapshot?.requested_project?.name || "-"}`,
  ].join("\n");

  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: smtpConfig.from,
    to: recipients,
    subject: `${title} - ${surat.judul_surat || surat.no_surat || "SIGAP"}`,
    text,
    html,
    attachments,
  });

  return { sent: recipients.length, recipients, attachments: attachments.length, fileLinks: fileLinks.length };
};

const getSuratNotificationParticipants = async (suratId) => {
  const { data: surat, error: suratError } = await supabase
    .from("surat_registrasi")
    .select("id, created_by")
    .eq("id", suratId)
    .maybeSingle();
  if (suratError || !surat) {
    const err = new Error(suratError ? suratError.message : "Surat tidak ditemukan.");
    err.status = 404;
    throw err;
  }

  const { data: signatures, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("user_id, verifier_snapshot")
    .eq("surat_id", suratId);
  if (signatureError) throw signatureError;

  const ids = new Set([surat.created_by].filter(Boolean));
  for (const signature of signatures || []) {
    if (signature.user_id) ids.add(signature.user_id);
    if (Array.isArray(signature.verifier_snapshot)) {
      signature.verifier_snapshot.forEach((item) => {
        if (item?.user_id) ids.add(item.user_id);
      });
    }
  }
  return { surat, participantIds: ids };
};

const sendInternalNotification = async (token, payload) => {
  const actor = await requireSupabaseUser(token);
  const userIds = [...new Set((Array.isArray(payload?.user_ids) ? payload.user_ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  const title = String(payload?.title || "Notifikasi SIGAP").trim().slice(0, 160);
  const message = String(payload?.message || "").trim().slice(0, 4000);
  const type = String(payload?.type || "info").trim().slice(0, 40);
  const link = typeof payload?.link === "string" ? payload.link.slice(0, 500) : null;
  const suratId = payload?.surat_id || payload?.suratId || null;
  const shouldEmail = payload?.email !== false;

  if (userIds.length === 0) return { inserted: 0, email: shouldEmail ? { sent: 0, recipients: [] } : null };
  if (!message) {
    const err = new Error("Pesan notifikasi wajib diisi.");
    err.status = 400;
    throw err;
  }

  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("role, is_active, deleted_at")
    .eq("id", actor.id)
    .maybeSingle();
  const isAdmin = isActiveAdminProfile(actorProfile);

  if (!isAdmin) {
    if (!suratId) {
      const onlySelf = userIds.length === 1 && userIds[0] === actor.id;
      if (!onlySelf) {
        const err = new Error("Tidak diizinkan membuat notifikasi untuk user lain.");
        err.status = 403;
        throw err;
      }
    } else {
      const { surat, participantIds } = await getSuratNotificationParticipants(suratId);
      if (!(await canReadSurat({ ...surat, surat_signatures: [...participantIds].map((id) => ({ user_id: id })) }, actor.id))) {
        const err = new Error("Tidak diizinkan membuat notifikasi untuk surat ini.");
        err.status = 403;
        throw err;
      }
      const invalidTarget = userIds.find((id) => !participantIds.has(id));
      if (invalidTarget) {
        const err = new Error("Target notifikasi tidak terkait dengan surat ini.");
        err.status = 403;
        throw err;
      }
    }
  }

  const rows = userIds.map((userId) => ({
    user_id: userId,
    title,
    message,
    type,
    link,
    is_read: false,
    data: {
      surat_id: suratId,
      signature_id: payload?.signature_id || payload?.signatureId || null,
      event_type: payload?.event_type || payload?.eventType || null,
      created_by_server: true,
    },
  }));

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("id");
  if (error) throw error;
  const push = await sendWebPushToUsers(userIds, { link }).catch((pushError) => {
    console.error("Web Push notify failed:", pushError);
    return { sent: 0, error: pushError.message };
  });

  let email = null;
  if (shouldEmail) {
    try {
      email = await sendInternalEmailNotification(token, payload);
    } catch (emailError) {
      console.error("Notification email failed:", emailError);
      email = { sent: 0, recipients: [], error: emailError.message };
    }
  }

  return { inserted: data?.length || 0, email, push };
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

const sanitizeStoragePath = normalizeStoragePath;
const writableStoragePath = (value) => applyStoragePathPrefix(value, storagePathPrefix);

const uploadInternalStorageFile = async (token, req) => {
  await requireSupabaseUser(token);
  if (!uploadStorageClient()) throw new Error("Storage credentials are not configured.");
  assertRequestSize(req);

  const form = await parseUploadForm(req);
  const bucket = String(form.get("bucket") || "").trim();
  const requestedPath = writableStoragePath(form.get("path"));
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
  if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
    const err = new Error(`Ukuran file terlalu besar. Maksimal ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
    err.status = 413;
    throw err;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const origin = shouldUseExternalStorage() ? "external" : "primary";
  let uploadResult;
  try {
    uploadResult = await uploadStorageClient().storage.from(bucket).upload(requestedPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert,
    });
  } catch (error) {
    console.error("Storage upload network error:", {
      bucket,
      path: requestedPath,
      origin,
      storageUrl: shouldUseExternalStorage() ? storageSupabaseUrl : supabaseUrl,
      message: error?.message,
      cause: error?.cause?.message,
    });
    const err = new Error(
      shouldUseExternalStorage()
        ? "Server aplikasi tidak bisa menghubungi storage self-hosted. Periksa STORAGE_SUPABASE_URL pada container aplikasi aktif."
        : "Server aplikasi tidak bisa menghubungi storage Supabase."
    );
    err.status = 502;
    throw err;
  }
  if (uploadResult.error) {
    console.error("Storage upload API error:", {
      bucket,
      path: requestedPath,
      origin,
      message: uploadResult.error.message,
    });
    throw uploadResult.error;
  }

  return {
    bucket,
    path: requestedPath,
    origin,
    publicUrl: makeStoragePublicUrl(bucket, requestedPath, origin),
  };
};

const uploadProfileAvatar = async (token, req) => {
  const user = await requireSupabaseUser(token);
  if (!supabase || !storageSupabase) throw new Error("Storage credentials are not configured.");
  assertRequestSize(req);

  const form = await parseUploadForm(req);
  const file = form.get("file");
  const allowedTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]);
  const maxAvatarBytes = 5 * 1024 * 1024;

  if (!file || typeof file.arrayBuffer !== "function") {
    const err = new Error("Foto profil wajib dikirim.");
    err.status = 400;
    throw err;
  }
  if (!allowedTypes.has(file.type)) {
    const err = new Error("Format foto harus JPG, PNG, atau WebP.");
    err.status = 415;
    throw err;
  }
  if (Number(file.size || 0) > maxAvatarBytes) {
    const err = new Error("Ukuran foto maksimal 5 MB.");
    err.status = 413;
    throw err;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  const validSignature = (
    (file.type === "image/jpeg" && isJpeg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp)
  );
  if (!validSignature) {
    const err = new Error("Isi file tidak sesuai dengan format gambar.");
    err.status = 415;
    throw err;
  }

  const extension = allowedTypes.get(file.type);
  const filePath = writableStoragePath(`${user.id}/avatar_${Date.now()}_${randomUUID()}.${extension}`);
  const thumbnailPath = filePath.replace(/\.[^.]+$/, "_thumb.webp");
  const { error: bucketError } = await storageSupabase.storage.getBucket("avatars");
  if (bucketError) {
    const { error: createBucketError } = await storageSupabase.storage.createBucket("avatars", {
      public: false,
      fileSizeLimit: maxAvatarBytes,
      allowedMimeTypes: [...allowedTypes.keys()],
    });
    if (createBucketError && !/already exists/i.test(createBucketError.message || "")) {
      throw createBucketError;
    }
  }

  const { error: uploadError } = await storageSupabase.storage
    .from("avatars")
    .upload(filePath, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const thumbnail = await sharp(buffer)
    .rotate()
    .resize(256, 256, { fit: "cover", position: "centre", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  const { error: thumbnailError } = await storageSupabase.storage
    .from("avatars")
    .upload(thumbnailPath, thumbnail, {
      contentType: "image/webp",
      cacheControl: "86400",
      upsert: false,
    });
  if (thumbnailError) {
    await storageSupabase.storage.from("avatars").remove([filePath]).catch(() => undefined);
    throw thumbnailError;
  }

  const avatarUrl = `/api/profile/avatar/file?path=${encodeURIComponent(filePath)}`;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);
  if (profileError) {
    await storageSupabase.storage.from("avatars").remove([filePath, thumbnailPath]).catch(() => undefined);
    throw profileError;
  }

  return { avatarUrl };
};

const getDepartmentAgendaActivity = async (token, url) => {
  await requireSupabaseUser(token);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  const departmentQuery = supabase
    .from("master_departments")
    .select("id, name, code")
    .order("name");
  const { data: departments, error: departmentsError } = await departmentQuery;
  if (departmentsError) throw departmentsError;

  const departmentIds = (departments || []).map((department) => department.id);
  if (departmentIds.length === 0) return [];

  const profileQuery = supabase
    .from("profiles")
    .select("id, department_id")
    .in("department_id", departmentIds)
    .is("deleted_at", null);
  const { data: scopedProfiles, error: scopedProfilesError } = await profileQuery;
  if (scopedProfilesError) throw scopedProfilesError;

  const profileIds = (scopedProfiles || []).map((item) => item.id);
  let agendas = [];
  if (profileIds.length > 0) {
    let agendaQuery = supabase
      .from("agendas")
      .select("created_by, status")
      .in("created_by", profileIds)
      .is("deleted_at", null);
    if (start) agendaQuery = agendaQuery.gte("start_time", start);
    if (end) agendaQuery = agendaQuery.lte("start_time", end);
    const { data, error } = await agendaQuery;
    if (error) throw error;
    agendas = data || [];
  }

  const departmentByProfile = new Map(
    (scopedProfiles || []).map((item) => [item.id, item.department_id])
  );
  const grouped = new Map(
    (departments || []).map((department) => [
      department.id,
      { name: department.name, tasks: 0, completed: 0 },
    ])
  );
  for (const agenda of agendas) {
    const departmentId = departmentByProfile.get(agenda.created_by);
    const entry = grouped.get(departmentId);
    if (!entry) continue;
    entry.tasks += 1;
    if (agenda.status === "Completed") entry.completed += 1;
  }

  return [...grouped.values()];
};

const replaceSignatureAttachmentFiles = async (token, req) => {
  const user = await requireSupabaseUser(token);
  if (!uploadStorageClient()) throw new Error("Storage credentials are not configured.");
  assertRequestSize(req);

  const form = await parseUploadForm(req);
  const suratId = String(form.get("suratId") || "").trim();
  const signatureId = String(form.get("signatureId") || "").trim();
  const stage = String(form.get("stage") || "approval").trim() || "approval";
  const rawMeta = String(form.get("metadata") || "[]");
  const metadata = JSON.parse(rawMeta);
  const files = form.getAll("files").filter((file) => file && typeof file.arrayBuffer === "function");

  if (!suratId || !signatureId || !Array.isArray(metadata) || files.length === 0) {
    const err = new Error("Payload lampiran tidak lengkap.");
    err.status = 400;
    throw err;
  }
  if (files.some((file) => Number(file.size || 0) > MAX_UPLOAD_BYTES)) {
    const err = new Error(`Ukuran file terlalu besar. Maksimal ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB per file.`);
    err.status = 413;
    throw err;
  }

  const { data: signature, error: signatureError } = await supabase
    .from("surat_signatures")
    .select("id, surat_id, user_id, verifier_snapshot")
    .eq("id", signatureId)
    .eq("surat_id", suratId)
    .maybeSingle();
  if (signatureError || !signature) {
    const err = new Error("Data tanda tangan tidak ditemukan.");
    err.status = 404;
    throw err;
  }

  const verifierIds = Array.isArray(signature.verifier_snapshot)
    ? signature.verifier_snapshot.map((item) => item?.user_id).filter(Boolean)
    : [];
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  const allowed = signature.user_id === user.id || verifierIds.includes(user.id) || isActiveAdminProfile(profile);
  if (!allowed) {
    const err = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  const requirementKeys = Array.from(new Set(metadata.map((item) => String(item.key || "").trim()).filter(Boolean)));
  if (requirementKeys.length === 0) {
    const err = new Error("Requirement lampiran tidak valid.");
    err.status = 400;
    throw err;
  }

  const { data: oldRows, error: oldRowsError } = await supabase
    .from("surat_attachments")
    .select("id, file_url")
    .eq("surat_id", suratId)
    .eq("signature_id", signatureId)
    .eq("stage", stage)
    .in("requirement_key", requirementKeys);
  if (oldRowsError) throw oldRowsError;

  if ((oldRows || []).length > 0) {
    await Promise.all((oldRows || []).map(async (row) => {
      const ref = parseStorageRef(row.file_url);
      if (!ref?.bucket || !ref?.path) return;
      const { error } = await storageClientForRef(ref).storage.from(ref.bucket).remove([ref.path]);
      if (error) console.error("Storage remove failed:", { path: row.file_url, message: error.message });
    }));

    const { error: deleteError } = await supabase
      .from("surat_attachments")
      .delete()
      .eq("surat_id", suratId)
      .eq("signature_id", signatureId)
      .eq("stage", stage)
      .in("requirement_key", requirementKeys);
    if (deleteError) throw deleteError;
  }

  const rows = [];
  for (const [index, file] of files.entries()) {
    const meta = metadata[index] || {};
    const key = String(meta.key || "").trim();
    if (!key) continue;

    const safeName = file.name.replace(/[^\w.-]+/g, "_");
    const filePath = writableStoragePath(`lampiran_${suratId}/${Date.now()}_${randomBytes(4).toString("hex")}_${safeName}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await uploadStorageClient().storage.from("lampiran_surat").upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    rows.push({
      surat_id: suratId,
      file_url: makeStoragePublicUrl("lampiran_surat", filePath, shouldUseExternalStorage() ? "external" : "primary"),
      file_name: file.name,
      file_type: file.type || null,
      file_size: file.size,
      created_by: user.id,
      stage,
      requirement_key: key,
      requirement_label: meta.label || key,
      signature_id: signatureId,
    });
  }

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from("surat_attachments")
    .insert(rows)
    .select("*");
  if (error) throw error;
  return data || [];
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

const normalizeMarisonEnvironment = (value) => {
  const environment = String(value || "").trim().toLowerCase();
  if (!MARISON_ENVIRONMENTS.has(environment)) {
    const err = new Error("Environment Marison tidak valid.");
    err.status = 400;
    throw err;
  }
  return environment;
};

const getMarisonEnvironmentState = async () => ({
  environment: marisonDeploymentEnvironment,
  updatedAt: null,
  updatedBy: null,
  locked: true,
});

const getMarisonApiConfig = (environment) => {
  const normalized = normalizeMarisonEnvironment(environment);
  const prefix = normalized === "staging" ? "MARISON_STAGING" : "MARISON_PRODUCTION";
  const defaultBaseUrl = normalized === "staging"
    ? "https://marison-external.digivasi.com/api"
    : "https://external.marisonregency.id/api";
  return {
    environment: normalized,
    baseUrl: String(process.env[`${prefix}_BASE_URL`] || defaultBaseUrl).replace(/\/+$/, ""),
    clientId: process.env[`${prefix}_CLIENT_ID`] || "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] || "",
  };
};

const getMarisonAccessToken = async (source, environment) => {
  const config = getMarisonApiConfig(environment);
  const { baseUrl, clientId, clientSecret } = config;
  if (!clientId || !clientSecret) {
    const err = new Error(`Credential API Marison ${config.environment} belum dikonfigurasi di server.`);
    err.status = 500;
    throw err;
  }

  const cacheKey = `${baseUrl}:${source.source_key}:${clientId}`;
  const cached = externalAccessTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const response = await fetch(`${baseUrl}/access-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.message || "Gagal membuat access token API eksternal Marison.");
    err.status = response.status;
    throw err;
  }

  const token = payload?.data?.access_token;
  if (!token) {
    const err = new Error("Response access token API eksternal Marison tidak valid.");
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

const getMarisonProtectedJson = async (environment, endpointPath) => {
  const config = getMarisonApiConfig(environment);
  const token = await getMarisonAccessToken({ source_key: "employee_sync" }, environment);
  const url = new URL(`${config.baseUrl}${endpointPath}`);
  const timestamp = new Date().toISOString();
  const bodyHash = sha256Hex(Buffer.alloc(0));
  const canonical = ["GET", url.pathname, token, bodyHash, timestamp].join(":");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Timestamp": timestamp,
      "X-Signature": hmacSha512Hex(token, canonical),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.message || `Gagal mengambil ${url.pathname} dari API Marison.`);
    err.status = response.status;
    throw err;
  }
  return payload;
};

const getAllMarisonCollection = async (environment, pathname) => {
  const rows = [];
  for (let page = 1; page <= 100; page += 1) {
    const payload = await getMarisonProtectedJson(
      environment,
      `${pathname}?per_page=100&page=${page}`
    );
    const pageRows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.data)
        ? payload.data.data
        : [];
    rows.push(...pageRows);
    const totalPages = Number(payload?.meta?.total_pages || 1);
    if (page >= totalPages || pageRows.length === 0) return rows;
  }
  const err = new Error(`Pagination ${pathname} melebihi batas aman.`);
  err.status = 502;
  throw err;
};

const getMarisonEmployeeSyncSource = async () => {
  const branches = await getAllMarisonCollection("staging", "/branches");
  const employees = await getAllMarisonCollection("staging", "/employees");
  return { employees, branches };
};

const getMarisonBranchSyncSource = async () => (
  getAllMarisonCollection(marisonDeploymentEnvironment, "/branches")
);

const getMarisonProjectSyncSource = async () => {
  const [branches, projects] = await Promise.all([
    getAllMarisonCollection(marisonDeploymentEnvironment, "/branches"),
    getAllMarisonCollection(marisonDeploymentEnvironment, "/projects"),
  ]);
  return { branches, projects };
};

const assertMarisonBranchSyncAvailable = () => {
  if (!supabase || !serviceRoleKey) {
    const err = new Error("Service role environment ini belum dikonfigurasi.");
    err.status = 500;
    throw err;
  }
};

const previewMarisonBranches = async (req) => {
  await requireAdminUser(getBearerToken(req));
  assertMarisonBranchSyncAvailable();
  const branches = await getMarisonBranchSyncSource();
  return previewMarisonBranchSync({
    supabase,
    branches,
    environment: marisonDeploymentEnvironment,
  });
};

const syncMarisonBranches = async (req) => {
  assertSameOrigin(req);
  const user = await requireAdminUser(getBearerToken(req));
  assertMarisonBranchSyncAvailable();
  const payload = await readJsonBody(req, 4096);
  if (payload?.confirm !== true) {
    const err = new Error("Konfirmasi sinkronisasi diperlukan.");
    err.status = 400;
    throw err;
  }
  if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
    const err = new Error("Sinkronisasi data external sedang berjalan.");
    err.status = 409;
    throw err;
  }
  marisonBranchSyncInFlight = true;
  try {
    const branches = await getMarisonBranchSyncSource();
    return await runTrackedMarisonSync({
      supabase,
      environment: marisonDeploymentEnvironment,
      triggerType: "manual",
      scope: "branches",
      initiatedBy: user.id,
      operation: () => executeMarisonBranchSync({
        supabase,
        branches,
        environment: marisonDeploymentEnvironment,
      }),
    });
  } finally {
    marisonBranchSyncInFlight = false;
  }
};

const previewMarisonProjects = async (req) => {
  await requireAdminUser(getBearerToken(req));
  assertMarisonBranchSyncAvailable();
  const source = await getMarisonProjectSyncSource();
  return previewMarisonProjectSync({
    supabase,
    ...source,
    environment: marisonDeploymentEnvironment,
  });
};

const syncMarisonProjects = async (req) => {
  const user = await requireAdminUser(getBearerToken(req));
  const body = await readJsonBody(req);
  if (body?.confirm !== true) {
    const err = new Error("Konfirmasi sinkronisasi proyek wajib dikirim.");
    err.status = 400;
    throw err;
  }
  assertMarisonBranchSyncAvailable();
  if (marisonBranchSyncInFlight || marisonEmployeeSyncInFlight || marisonProjectSyncInFlight) {
    const err = new Error("Sinkronisasi data external sedang berjalan.");
    err.status = 409;
    throw err;
  }
  marisonProjectSyncInFlight = true;
  try {
    const source = await getMarisonProjectSyncSource();
    return await runTrackedMarisonSync({
      supabase,
      environment: marisonDeploymentEnvironment,
      triggerType: "manual",
      scope: "projects",
      initiatedBy: user.id,
      operation: () => executeMarisonProjectSync({
        supabase,
        ...source,
        environment: marisonDeploymentEnvironment,
      }),
    });
  } finally {
    marisonProjectSyncInFlight = false;
  }
};

const assertMarisonEmployeeSyncAvailable = () => {
  if (marisonDeploymentEnvironment !== "staging") {
    const err = new Error("Sinkronisasi karyawan external hanya tersedia di staging.");
    err.status = 403;
    throw err;
  }
  if (!supabase || !serviceRoleKey) {
    const err = new Error("Service role staging belum dikonfigurasi.");
    err.status = 500;
    throw err;
  }
};

const previewMarisonEmployees = async (req) => {
  await requireAdminUser(getBearerToken(req));
  assertMarisonEmployeeSyncAvailable();
  const source = await getMarisonEmployeeSyncSource();
  return previewMarisonEmployeeSync({ supabase, ...source });
};

const syncMarisonEmployees = async (req) => {
  assertSameOrigin(req);
  const user = await requireAdminUser(getBearerToken(req));
  assertMarisonEmployeeSyncAvailable();
  const payload = await readJsonBody(req, 4096);
  if (payload?.confirm !== true) {
    const err = new Error("Konfirmasi sinkronisasi diperlukan.");
    err.status = 400;
    throw err;
  }
  if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
    const err = new Error("Sinkronisasi data external sedang berjalan.");
    err.status = 409;
    throw err;
  }
  marisonEmployeeSyncInFlight = true;
  try {
    const source = await getMarisonEmployeeSyncSource();
    return await runTrackedMarisonSync({
      supabase,
      environment: marisonDeploymentEnvironment,
      triggerType: "manual",
      scope: "directory",
      initiatedBy: user.id,
      operation: () => executeMarisonEmployeeSync({
        supabase,
        ...source,
        defaultPassword: String(process.env.STAGING_DEFAULT_USER_PASSWORD || ""),
      }),
    });
  } finally {
    marisonEmployeeSyncInFlight = false;
  }
};

const syncMarisonDirectoryFromCron = async (req) => {
  assertMarisonEmployeeSyncAvailable();
  if (marisonSyncCronToken.length < 32) {
    const err = new Error("Token cron sinkronisasi belum dikonfigurasi.");
    err.status = 503;
    throw err;
  }
  const suppliedToken = String(req.headers["x-internal-sync-token"] || "");
  if (!suppliedToken || sha256Hex(suppliedToken) !== sha256Hex(marisonSyncCronToken)) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  if (marisonEmployeeSyncInFlight || marisonBranchSyncInFlight || marisonProjectSyncInFlight) {
    const err = new Error("Sinkronisasi data external sedang berjalan.");
    err.status = 409;
    throw err;
  }
  marisonEmployeeSyncInFlight = true;
  marisonProjectSyncInFlight = true;
  try {
    const source = await getMarisonEmployeeSyncSource();
    const directory = await runTrackedMarisonSync({
      supabase,
      environment: marisonDeploymentEnvironment,
      triggerType: "cron",
      scope: "directory",
      operation: () => executeMarisonEmployeeSync({
        supabase,
        ...source,
        defaultPassword: String(process.env.STAGING_DEFAULT_USER_PASSWORD || ""),
      }),
    });
    const projectSource = await getMarisonProjectSyncSource();
    const projects = await runTrackedMarisonSync({
      supabase,
      environment: marisonDeploymentEnvironment,
      triggerType: "cron",
      scope: "projects",
      operation: () => executeMarisonProjectSync({
        supabase,
        ...projectSource,
        environment: marisonDeploymentEnvironment,
      }),
    });
    return {
      status: directory.status === "success" && projects.status === "success" ? "success" : "partial",
      directory,
      projects,
    };
  } finally {
    marisonEmployeeSyncInFlight = false;
    marisonProjectSyncInFlight = false;
  }
};

const queryExternalDataSource = async (sourceKey, variables = {}, options = {}) => {
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

  const state = options.environment
    ? { environment: normalizeMarisonEnvironment(options.environment) }
    : await getMarisonEnvironmentState();
  const config = getMarisonApiConfig(state.environment);
  const baseUrl = config.baseUrl;
  const endpointPath = fillEndpointTemplate(source.endpoint_template, variables);
  const url = new URL(`${baseUrl}${endpointPath}`);
  Object.entries(variables?.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const headers = {};
  if (source.auth_type === "marison_token_hmac_sha512") {
    const token = await getMarisonAccessToken(source, state.environment);
    const timestamp = new Date().toISOString();
    const bodyHash = sha256Hex(Buffer.alloc(0));
    const canonical = [method, url.pathname, token, bodyHash, timestamp].join(":");
    headers.Authorization = `Bearer ${token}`;
    headers["X-Timestamp"] = timestamp;
    headers["X-Signature"] = hmacSha512Hex(token, canonical);
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
      environment: state.environment,
    },
    options: items
      .map((item) => normalizeExternalOption(item, source))
      .filter((item) => item.value && item.label),
    raw_count: items.length,
  };
};

const getMarisonEnvironmentStatus = async (req) => {
  const user = await requireSupabaseUser(getBearerToken(req));
  const state = await getMarisonEnvironmentState();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const canManage = isActiveAdminProfile(profile);
  const config = getMarisonApiConfig(state.environment);
  let outboundSettings = null;
  if (canManage) {
    const { data, error: outboundError } = await supabase
      .from("marison_outbound_settings")
      .select("environment, enabled, updated_at, override_nik, override_branch_id, override_project_id")
      .eq("singleton", true)
      .maybeSingle();
    if (outboundError) throw outboundError;
    outboundSettings = data;
  }
  const result = {
    environment: state.environment,
    isStaging: state.environment === "staging",
    canManage,
    locked: true,
    source: "deployment",
    updatedAt: state.updatedAt,
    outbound: canManage ? {
      runtimeEnabled: marisonSubmissionDispatchEnabled,
      databaseEnabled: outboundSettings?.enabled === true,
      databaseEnvironment: outboundSettings?.environment || null,
      ready: marisonSubmissionDispatchEnabled
        && outboundSettings?.enabled === true
        && outboundSettings?.environment === state.environment,
       updatedAt: outboundSettings?.updated_at || null,
       overrideNikConfigured: Boolean(outboundSettings?.override_nik),
       overrideNikMasked: outboundSettings?.override_nik
         ? `${String(outboundSettings.override_nik).slice(0, 2)}***${String(outboundSettings.override_nik).slice(-2)}`
         : null,
       overrideBranchId: outboundSettings?.override_branch_id || null,
       overrideProjectId: outboundSettings?.override_project_id || null,
       overrideSources: {
         nik: outboundSettings?.override_nik ? "override" : "synchronized",
         branchId: outboundSettings?.override_branch_id ? "override" : "synchronized",
         projectId: outboundSettings?.override_project_id ? "override" : "synchronized",
       },
     } : undefined,
  };
  if (canManage) {
    result.environments = {
      [state.environment]: {
        configured: Boolean(config.clientId && config.clientSecret),
        host: new URL(config.baseUrl).host,
      },
    };
  }
  return result;
};

const probeMarisonDataSource = async (sourceKey, variables, environment) => {
  const startedAt = Date.now();
  try {
    const result = await queryExternalDataSource(sourceKey, variables, { environment });
    return {
      ok: true,
      count: result.raw_count,
      durationMs: Date.now() - startedAt,
      sample: result.options.slice(0, 3).map((option) => ({
        value: option.value,
        label: option.label,
        raw: option.raw,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      status: Number(error?.status || 500),
      message: error?.message || "Tes koneksi gagal.",
      durationMs: Date.now() - startedAt,
    };
  }
};

const testMarisonEnvironment = async (req) => {
  await requireAdminUser(getBearerToken(req));
  const environment = marisonDeploymentEnvironment;
  const projects = await probeMarisonDataSource("marison_projects", {}, environment);
  const projectId = projects.ok ? projects.sample.find((item) => item.raw?.id)?.raw?.id : null;
  const variables = projectId ? { project_id: projectId } : {};
  const units = projectId
    ? await probeMarisonDataSource("marison_units_by_project", variables, environment)
    : { ok: false, status: 424, message: "Proyek uji tidak tersedia.", durationMs: 0 };
  const nonUnits = projectId
    ? await probeMarisonDataSource("marison_non_units_by_project", variables, environment)
    : { ok: false, status: 424, message: "Proyek uji tidak tersedia.", durationMs: 0 };
  return {
    environment,
    testedAt: new Date().toISOString(),
    projectId,
    allHealthy: Boolean(projects.ok && units.ok && nonUnits.ok),
    checks: { projects, units, nonUnits },
  };
};

const canReadSurat = async (surat, userId) => {
  if (!surat || !userId) return false;
  if (surat.created_by === userId) return true;
  if ((surat.surat_signatures || []).some((sig) => sig.user_id === userId)) return true;
  if ((surat.surat_signatures || []).some((sig) =>
    Array.isArray(sig.verifier_snapshot) &&
    sig.verifier_snapshot.some((verifier) => verifier?.user_id === userId)
  )) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  return isActiveAdminProfile(profile);
};

const storageRefKey = (ref) => ref ? `${ref.bucket}/${ref.path}` : "";

const storageClientForRef = (ref) => {
  if (ref?.origin === "external" && storageSupabase) {
    if (!isStoragePathWithinPrefix(ref.path, storagePathPrefix)) {
      const err = new Error("Akses file lintas environment ditolak.");
      err.status = 403;
      throw err;
    }
    return storageSupabase;
  }
  return supabase;
};

const getAllowedStorageRefs = (surat) => {
  const refs = [
    surat.file_path,
    surat.pdf_path,
    surat.lampiran_path,
    ...(surat.surat_attachments || []).map((a) => a.file_url),
    ...(surat.surat_signatures || []).flatMap((s) => [s.file_path_snap, s.pdf_path_snap]),
  ];
  return new Set(refs.map(parseStorageRef).filter(Boolean).map(storageRefKey));
};

const isStorageRefAllowedForSurat = async (surat, requested) => {
  if (getAllowedStorageRefs(surat).has(storageRefKey(requested))) return true;
  if (requested?.bucket !== "dokumen_surat") return false;

  const { data: completedJobs, error } = await supabase
    .from("document_pdf_jobs")
    .select("pdf_url")
    .eq("surat_id", surat.id)
    .eq("status", "done")
    .not("pdf_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (completedJobs || []).some((job) => {
    const jobRef = parseStorageRef(job.pdf_url);
    return jobRef && storageRefKey(jobRef) === storageRefKey(requested);
  });
};

const asPlainRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const asArrayValue = (value) => Array.isArray(value) ? value : [];

const firstString = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const parseExternalInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseExternalMoney = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.replace(/[^\d,.-]/g, "");
  const digitsOnly = normalized.replace(/\D/g, "");
  const parsed = Number.parseInt(digitsOnly || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeExternalDate = (value) => {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!match) return text;
  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const requireExternalInteger = (value, label) => {
  const parsed = parseExternalInteger(value);
  if (parsed !== null && parsed > 0) return parsed;
  const err = new Error(`${label} eksternal belum tersedia atau bukan angka.`);
  err.status = 422;
  throw err;
};

const getExternalRaw = (value) => {
  const record = asPlainRecord(value);
  return asPlainRecord(record.raw);
};

const externalIdFrom = (...values) => {
  for (const value of values) {
    const record = asPlainRecord(value);
    const raw = getExternalRaw(record);
    const parsed = parseExternalInteger(
      raw.id ?? raw.project_id ?? raw.unit_id ?? raw.non_unit_id ??
      record.id ?? record.value ?? record.project_id ?? record.unit_id ?? record.non_unit_id
    );
    if (parsed !== null) return parsed;
  }
  return null;
};

const externalBranchIdFrom = (...values) => {
  for (const value of values) {
    const record = asPlainRecord(value);
    const raw = getExternalRaw(record);
    const branch = asPlainRecord(raw.branch || record.branch);
    const parsed = parseExternalInteger(
      raw.branch_id ?? raw.branchId ?? branch.id ??
      record.branch_id ?? record.branchId ?? record.external_branch_id
    );
    if (parsed !== null) return parsed;
  }
  return null;
};

const getMarisonLocation = (surat) => {
  const snapshot = asPlainRecord(surat?.data_snapshot);
  const snapshotLocation = asPlainRecord(snapshot.location);
  const location = asPlainRecord(surat?.location_snapshot);
  return {
    entity: asPlainRecord(location.entity || snapshotLocation.entity),
    office: asPlainRecord(location.office || snapshotLocation.office),
    project: asPlainRecord(location.project || snapshotLocation.project),
    department: asPlainRecord(location.department || snapshotLocation.department),
  };
};

const resolveMarisonBranchId = async (surat, ...values) => {
  const snapshotBranchId = externalBranchIdFrom(...values);
  if (snapshotBranchId !== null) return snapshotBranchId;

  const officeId = firstString(surat?.office_id, surat?.location_snapshot?.office?.id);
  if (!officeId) return null;
  const { data, error } = await supabase
    .from("master_offices")
    .select("marison_branch_id, marison_synced_at")
    .eq("id", officeId)
    .maybeSingle();
  if (error) throw error;
  if (data?.marison_branch_id > 0 && data?.marison_synced_at) return parseExternalInteger(data.marison_branch_id);
  if (marisonDeploymentEnvironment !== "staging") return null;
  const { data: mapping, error: mappingError } = await supabase
    .from("marison_outbound_record_mappings")
    .select("target_record_id")
    .eq("environment", "staging")
    .eq("entity_type", "office")
    .eq("record_id", officeId)
    .maybeSingle();
  if (mappingError) throw mappingError;
  if (!mapping?.target_record_id) return null;
  const { data: target, error: targetError } = await supabase
    .from("master_offices")
    .select("marison_branch_id, marison_synced_at")
    .eq("id", mapping.target_record_id)
    .maybeSingle();
  if (targetError) throw targetError;
  return target?.marison_branch_id > 0 && target?.marison_synced_at ? parseExternalInteger(target.marison_branch_id) : null;
};

const configureMarisonOutboundIdentityOverrides = async (req) => {
  const actor = await requireAdminUser(getBearerToken(req));
  const payload = await readJsonBody(req, 4096);
  const { data, error } = await supabase.rpc("configure_marison_outbound_identity_overrides", {
    p_actor_id: actor.id,
    p_environment: marisonDeploymentEnvironment,
    p_override_nik: String(payload?.overrideNik || "").trim() || null,
    p_override_branch_id: payload?.overrideBranchId == null || payload.overrideBranchId === "" ? null : Number(payload.overrideBranchId),
    p_override_project_id: payload?.overrideProjectId == null || payload.overrideProjectId === "" ? null : Number(payload.overrideProjectId),
    p_reason: String(payload?.reason || "").trim(),
  });
  if (error) throw error;
  return { success: true, configuration: data, actorId: actor.id };
};

const getMarisonOutboundMappings = async (surat = null) => {
  const useStagingMappings = marisonDeploymentEnvironment === "staging";
  const officeId = firstString(surat?.office_id, surat?.location_snapshot?.office?.id);
  const recordProjectId = firstString(surat?.project_id, surat?.location_snapshot?.project?.id);
  const recordQueries = [
    useStagingMappings && officeId ? supabase.from("marison_outbound_record_mappings").select("entity_type, record_id, target_record_id").eq("environment", "staging").eq("entity_type", "office").eq("record_id", officeId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    useStagingMappings && recordProjectId ? supabase.from("marison_outbound_record_mappings").select("entity_type, record_id, target_record_id").eq("environment", "staging").eq("entity_type", "project").eq("record_id", recordProjectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ];
  const recordResults = await Promise.all(recordQueries);
  const recordOverrides = recordResults.map((result) => {
    if (result.error) throw result.error;
    return result.data;
  });
  const officeMapping = recordOverrides[0] || {};
  const projectMapping = recordOverrides[1] || {};
  const [officeTarget, projectTarget] = await Promise.all([
     officeMapping.target_record_id ? supabase.from("master_offices").select("marison_branch_id, marison_synced_at").eq("id", officeMapping.target_record_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
     projectMapping.target_record_id ? supabase.from("master_projects").select("marison_project_id, marison_synced_at, office_id, master_offices!inner(marison_branch_id, marison_synced_at)").eq("id", projectMapping.target_record_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [officeTarget, projectTarget]) if (result.error) throw result.error;
  const sourceBranchId = await resolveMarisonBranchId(surat);
  const sourceProjectId = externalIdFrom(getMarisonRequestedProject(surat, getMarisonDispatchInput(surat)));
   const mappedBranchId = officeTarget.data?.marison_branch_id && officeTarget.data?.marison_synced_at ? officeTarget.data.marison_branch_id : null;
   const mappedProjectId = projectTarget.data?.marison_project_id && projectTarget.data?.marison_synced_at && projectTarget.data?.master_offices?.marison_branch_id && projectTarget.data?.master_offices?.marison_synced_at ? projectTarget.data.marison_project_id : null;
  const effectiveBranchId = parseExternalInteger(mappedBranchId ?? (await isValidSourceBranchId(sourceBranchId) ? sourceBranchId : null));
  const effectiveProjectId = parseExternalInteger(mappedProjectId ?? (await isValidSourceProjectId(sourceProjectId) ? sourceProjectId : null));
  if (effectiveBranchId !== null) {
    const { data: effectiveOffice, error: effectiveOfficeError } = await supabase
      .from("master_offices")
       .select("marison_branch_id, marison_synced_at")
      .eq("marison_branch_id", effectiveBranchId)
      .maybeSingle();
    if (effectiveOfficeError) throw effectiveOfficeError;
     if (!effectiveOffice || !effectiveOffice.marison_branch_id || !effectiveOffice.marison_synced_at) throw new Error("Effective branch ID outbound tidak tervalidasi.");
  }
  if (effectiveProjectId !== null) {
    const { data: effectiveProject, error: effectiveProjectError } = await supabase
      .from("master_projects")
       .select("marison_project_id, marison_synced_at, master_offices!inner(marison_branch_id, marison_synced_at)")
      .eq("marison_project_id", effectiveProjectId)
      .maybeSingle();
    if (effectiveProjectError) throw effectiveProjectError;
     if (!effectiveProject || !effectiveProject.marison_project_id || !effectiveProject.marison_synced_at || !effectiveProject.master_offices?.marison_branch_id || !effectiveProject.master_offices?.marison_synced_at) {
      throw new Error("Effective project ID outbound tidak tervalidasi.");
    }
    const effectiveProjectBranchId = parseExternalInteger(effectiveProject.master_offices?.marison_branch_id);
    if (effectiveBranchId !== null && effectiveProjectBranchId !== effectiveBranchId) throw new Error("Effective project dan branch outbound tidak cocok.");
  }
  return {
    branchId: effectiveBranchId,
    projectId: effectiveProjectId,
    sources: {
       branchId: mappedBranchId ? "staging_mapping" : effectiveBranchId !== null ? "external_source" : "unavailable",
       projectId: mappedProjectId ? "staging_mapping" : effectiveProjectId !== null ? "external_source" : "unavailable",
    },
  };
};

const isValidSourceBranchId = async (branchId) => {
  if (branchId == null) return false;
  const { data, error } = await supabase.from("master_offices").select("id")
     .eq("marison_branch_id", branchId).not("marison_synced_at", "is", null).limit(1).maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

const isValidSourceProjectId = async (projectId) => {
  if (projectId == null) return false;
  const { data, error } = await supabase.from("master_projects")
     .select("id, master_offices!inner(marison_branch_id, marison_synced_at)").eq("marison_project_id", projectId)
     .not("marison_synced_at", "is", null)
     .not("master_offices.marison_branch_id", "is", null).not("master_offices.marison_synced_at", "is", null).limit(1).maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

export const getMarisonPayloadMappings = async (req) => {
  const actor = await requireAdminUser(getBearerToken(req));
  if (marisonDeploymentEnvironment !== "staging") {
    const error = new Error("Mapping payload hanya tersedia di staging.");
    error.status = 404;
    throw error;
  }
  const entityType = new URL(req.url || '/', 'http://localhost').searchParams.get('entityType') || null;
  if (entityType && !/^(profile|office|project)$/.test(entityType)) {
    const error = new Error("Jenis mapping tidak valid.");
    error.status = 422;
    throw error;
  }
  const { data, error } = await supabase.rpc("get_marison_payload_mappings", {
    p_actor_id: actor.id,
    p_environment: marisonDeploymentEnvironment,
    p_entity_type: entityType,
  });
  if (error) throw error;
  return { mappings: data || [], actorId: actor.id };
};

export const getMarisonPayloadMappingCatalog = async (req, url) => {
  const actor = await requireAdminUser(getBearerToken(req));
  if (marisonDeploymentEnvironment !== "staging") { const error = new Error("Payload mappings hanya tersedia di staging."); error.status = 404; throw error; }
  const { entityType, query, limit, branchId } = parseMarisonPayloadCatalogQuery(url);
  const { data, error } = await supabase.rpc("get_marison_payload_mapping_catalog", { p_actor_id: actor.id, p_environment: marisonDeploymentEnvironment, p_entity_type: entityType, p_query: query, p_limit: limit, p_branch_id: branchId });
  if (error) throw error;
  return { catalog: data || [], actorId: actor.id };
};

export const configureMarisonPayloadMapping = async (req) => {
  const actor = await requireAdminUser(getBearerToken(req));
  const payload = await readJsonBody(req, 4096);
  return executeMarisonPayloadMappingCommand({
    actorId: actor.id,
    environment: marisonDeploymentEnvironment,
    payload,
    rpc: (name, args) => supabase.rpc(name, args),
  });
};

const getMarisonDispatchInput = (surat) => {
  const formInput = asPlainRecord(surat?.form_input_data);
  const snapshot = asPlainRecord(surat?.data_snapshot);
  const snapshotInput = asPlainRecord(snapshot.input);
  const verificationInputs = asPlainRecord(snapshot.verification_inputs);
  const latestVerificationInput = asPlainRecord(verificationInputs.latest);
  return { ...snapshotInput, ...latestVerificationInput, ...formInput };
};

const getMarisonAllocatedUnits = (surat, input) => {
  const snapshot = asPlainRecord(surat?.data_snapshot);
  const verificationDrafts = asPlainRecord(snapshot.verification_drafts);
  const latestDraftInput = Object.values(verificationDrafts)
    .map((value) => asPlainRecord(value))
    .filter((draft) => asArrayValue(asPlainRecord(draft.input).allocated_units).length > 0)
    .sort((left, right) => String(right.saved_at || "").localeCompare(String(left.saved_at || "")))
    .map((draft) => asPlainRecord(draft.input))[0] || {};
  return (
    asArrayValue(input.allocated_units).length > 0 ? asArrayValue(input.allocated_units) :
    asArrayValue(latestDraftInput.allocated_units).length > 0 ? asArrayValue(latestDraftInput.allocated_units) :
    asArrayValue(snapshot.allocated_units)
  );
};

const getMarisonRequestedProject = (surat, input) => {
  const snapshot = asPlainRecord(surat?.data_snapshot);
  return (
    input.allocated_project ||
    input.requested_project ||
    asPlainRecord(snapshot.input).allocated_project ||
    asPlainRecord(snapshot.input).requested_project ||
    snapshot.allocated_project ||
    snapshot.requested_project ||
    null
  );
};

const loadMarisonProfileIdentityResolver = async (profileIds) => {
  const ids = [...new Set(profileIds.filter(Boolean))];
  if (ids.length === 0) return (_profileId, _fallbackNik, label) => {
    const err = new Error(`${label} tidak memiliki profile user yang stabil.`);
    err.status = 422;
    throw err;
  };
  let mappings = [];
  if (marisonDeploymentEnvironment === "staging") {
    const mappingResult = await supabase
      .from("marison_outbound_record_mappings")
      .select("record_id, target_record_id")
      .eq("environment", "staging")
      .eq("entity_type", "profile")
      .in("record_id", ids);
    if (mappingResult.error) throw mappingResult.error;
    mappings = mappingResult.data || [];
  }
  const mappingByProfile = new Map((mappings || []).map((mapping) => [mapping.record_id, mapping.target_record_id]));
  const profileLookupIds = [...new Set([...ids, ...mappingByProfile.values()].filter(Boolean))];
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, nik, is_active, deleted_at, marison_employee_id, marison_synced_at, marison_review_required")
    .in("id", profileLookupIds);
  if (profileError) throw profileError;
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const isValidMirrorProfile = (profile) => Boolean(
    profile?.nik
    && profile?.is_active
    && !profile?.deleted_at
    && profile?.marison_employee_id > 0
    && profile?.marison_synced_at
  );

  return (profileId, fallbackNik, label) => {
    const mappedProfile = profileById.get(mappingByProfile.get(profileId));
    const sourceProfile = profileById.get(profileId);
    return resolveProfilePayloadIdentity({
      profileId,
      mappingNik: isValidMirrorProfile(mappedProfile) ? mappedProfile.nik : "",
      sourceNik: sourceProfile?.nik || fallbackNik,
      validSourceNik: isValidMirrorProfile(sourceProfile),
      label,
    });
  };
};

const buildMarisonApprovals = async (surat, resolveIdentity) => {
  const sources = {};
  const approvals = await Promise.all(asArrayValue(surat?.surat_signatures)
    .filter((signature) => signature?.is_signed && signature?.signed_at)
    .sort((left, right) => Number(left.step_order || 0) - Number(right.step_order || 0))
    .map(async (signature, index) => {
      const profile = asPlainRecord(signature.profiles);
      const signerSnapshot = asPlainRecord(signature.signer_snapshot);
      const signer = resolveIdentity(
        firstString(signature.user_id, profile.id),
        firstString(profile.nik, signerSnapshot.nik, signature.nik),
        `Penandatangan tahap ${index + 1}`,
      );
      sources[buildApprovalResolutionKey(signature.step_order, firstString(signature.user_id, profile.id), index)] = signer.source;
      return {
        role: firstString(signature.label_jabatan, signature.role_name, profile.job_title, signerSnapshot.job_title, "signer"),
        nik: signer.nik,
        action: "approved",
        actioned_at: new Date(signature.signed_at).toISOString(),
        notes: firstString(signature.catatan, signature.note, signature.notes),
      };
    }));

  if (approvals.length === 0) {
    const err = new Error("Approval eksternal tidak bisa dikirim karena NIK penandatangan belum tersedia.");
    err.status = 422;
    throw err;
  }
  return { approvals, sources };
};

const resolveMarisonOutboundIdentity = async (surat) => {
  const requesterProfileId = getCanonicalRequesterProfileId(surat);
  const signatures = asArrayValue(surat?.surat_signatures)
    .filter((signature) => signature?.is_signed && signature?.signed_at);
  const resolveIdentity = await loadMarisonProfileIdentityResolver([
    requesterProfileId,
    ...signatures.map((signature) => firstString(signature.user_id, asPlainRecord(signature.profiles).id)),
  ]);
  const requester = resolveIdentity(
    requesterProfileId,
    firstString(surat?.requester_snapshot?.nik, surat?.data_snapshot?.requester?.nik),
    "Pemohon",
  );
  const approvalResult = await buildMarisonApprovals(surat, resolveIdentity);
  return {
    requester,
    approvals: approvalResult.approvals,
    sources: { requesterNik: requester.source, ...approvalResult.sources },
  };
};

const buildMarisonAttachmentLinks = async (surat, actorId = null) => {
  const rows = [
    ...(surat?.pdf_path || surat?.file_path
      ? [{ file_url: surat.pdf_path || surat.file_path, file_name: "Dokumen pengajuan", requirement_label: "Dokumen Pengajuan Final" }]
      : []),
    ...asArrayValue(surat?.surat_attachments),
  ];
  const links = [];
  const seen = new Set();
  for (const [index, attachment] of rows.entries()) {
    if (!attachment?.file_url) continue;
    const ref = parseStorageRef(attachment.file_url);
    const key = storageRefKey(ref);
    if (!ref || seen.has(key)) continue;
    seen.add(key);
    const link = await buildPersistentMarisonFileLink(surat, attachment.file_url, actorId);
    if (link) {
      links.push({
        name: firstString(attachment.requirement_label, attachment.file_name, `Lampiran ${index + 1}`),
        link,
      });
    }
  }
  return links;
};

const buildMarisonUnitPayload = async (surat, input, actorId, overrides = {}) => {
  const requestedProject = getMarisonRequestedProject(surat, input);
   const projectId = requireExternalInteger(overrides.projectId ?? externalIdFrom(requestedProject), "Project ID");
   const branchId = requireExternalInteger(overrides.branchId ?? externalBranchIdFrom(requestedProject, input, surat.location_snapshot), "Branch ID");
  const units = getMarisonAllocatedUnits(surat, input).map((unit, index) => {
    const record = asPlainRecord(unit);
    const raw = getExternalRaw(record);
    const detail = asPlainRecord(record.allocation_detail);
    const productionSerial = firstString(detail.production_serial, detail.kode_produksi_nomor).padStart(3, "0");
    const productionBlock = firstString(detail.production_block, detail.kode_produksi_blok);
    const productionDate = normalizeExternalDate(firstString(detail.production_date, detail.kode_produksi_tanggal));
    const productionCode = buildProductionCode({
      serial: productionSerial,
      block: productionBlock,
      date: productionDate,
    }) || firstString(raw.production_code, record.production_code);
    return {
      unit_id: requireExternalInteger(externalIdFrom(record), `Unit ID baris ${index + 1}`),
      production_code: productionCode,
      type: firstString(
        raw.type,
        raw.unit_type,
        raw.tipe,
        record.type,
        record.unit_type,
        detail.unit_type,
        detail.type,
        detail.tipe
      ),
      addendum_atas_label: "Struktur Atas",
      addendum_atas_nominal: parseExternalMoney(detail.struktur_atas),
      addendum_bawah_label: "Struktur Bawah",
      addendum_bawah_nominal: parseExternalMoney(detail.struktur_bawah),
      planning_notes: firstString(detail.planning_notes, detail.catatan, input.catatan),
    };
  });
  if (units.length === 0) {
    const err = new Error("Unit belum dialokasikan, pengiriman ke Marison dibatalkan.");
    err.status = 422;
    throw err;
  }
  const payload = {
    submission_number: surat.no_surat,
    project_id: projectId,
    branch_id: branchId,
     submitted_by: overrides.nik,
    submitted_at: new Date(surat.created_at || Date.now()).toISOString(),
    units,
    attachments: await buildMarisonAttachmentLinks(surat, actorId),
     approvals: overrides.approvals,
  };
  return {
    endpoint: "/unit-submissions",
    kind: "unit",
    contractVersion: MARISON_OUTBOUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("unit", payload),
  };
};

const normalizeMarisonItems = (input) => asArrayValue(input.items).filter((item) => item && typeof item === "object");

const getMarisonRecommendationRows = (surat, input, recommendationDocument) => {
  const snapshot = asPlainRecord(surat?.data_snapshot);
  const childInput = asPlainRecord(recommendationDocument?.form_input_data);
  const candidates = [
    input.recommendation_decisions,
    snapshot.recommendation_decisions,
    childInput.recommendation_items,
  ];
  return candidates.map(asArrayValue).find((rows) => rows.length > 0) || [];
};

const findMarisonRecommendationRow = (rows, item, index) => {
  const itemName = firstString(item.nama_barang, item.item_name, item.nama, item.barang).toLowerCase();
  return rows.find((candidate) => {
    const record = asPlainRecord(candidate);
    const parentIndex = Number(record.parent_item_index || record.item_number || record.no || 0);
    const parentName = firstString(record.parent_item_name, record.nama_barang).toLowerCase();
    return parentIndex === index + 1 || (itemName && parentName === itemName);
  }) || null;
};

const getMarisonRecommendationDocument = async (parentSuratId) => {
  const { data: link, error: linkError } = await supabase
    .from("surat_linked_documents")
    .select("child_surat_id")
    .eq("parent_surat_id", parentSuratId)
    .eq("link_type", "recommendation")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link?.child_surat_id) return null;

  const { data: child, error: childError } = await supabase
    .from("surat_registrasi")
    .select(`
      id, no_surat, judul_surat, status, file_path, pdf_path, form_input_data,
      surat_signatures (
        id, user_id, role_name, label_jabatan, step_order, is_signed, signed_at, catatan, signer_snapshot,
        profiles:user_id ( id, full_name, nik, job_title )
      ),
      surat_attachments ( id, file_url, file_name, file_type, file_size, requirement_key, requirement_label )
    `)
    .eq("id", link.child_surat_id)
    .maybeSingle();
  if (childError) throw childError;
  return child || null;
};

const buildMarisonRecommendationItemAttachment = async (document, recommendation, actorId) => {
  const attachment = asPlainRecord(recommendation?.recommendation_attachment);
  const rawPath = firstString(
    attachment.file_url,
    recommendation?.recommendation_attachment_url
  );
  if (!document || !rawPath) return [];
  const link = await buildPersistentMarisonFileLink(document, rawPath, actorId);
  if (!link) return [];
  return [{
    name: firstString(attachment.file_name, recommendation?.recommendation_attachment_file_name, "Lampiran rekomendasi"),
    link,
  }];
};

const normalizeMarisonEmbeddedLinks = (value) => asArrayValue(value)
  .map((attachment, index) => {
    const record = asPlainRecord(attachment);
    const link = firstString(record.link, record.url);
    if (!/^https:\/\//i.test(link)) return null;
    return {
      name: firstString(record.name, record.title, record.file_name, `Lampiran item ${index + 1}`),
      link,
    };
  })
  .filter(Boolean);

const buildMarisonNonUnitPayload = async (surat, input, actorId, overrides = {}) => {
  const requestedProject = getMarisonRequestedProject(surat, input);
  const projectId = requireExternalInteger(overrides.projectId ?? externalIdFrom(requestedProject), "Project ID");
  const branchId = requireExternalInteger(overrides.branchId ?? externalBranchIdFrom(requestedProject, input, surat.location_snapshot), "Branch ID");
  const items = normalizeMarisonItems(input).map((item, index) => {
    const record = asPlainRecord(item);
    const raw = getExternalRaw(record);
    return {
      non_unit_id: requireExternalInteger(
        raw.non_unit_id ?? raw.id ?? record.non_unit_id ?? record.external_id ?? record.value,
        `Non Unit ID baris ${index + 1}`
      ),
      item_name: firstString(record.item_name, record.nama_barang, record.nama, record.barang, raw.name),
      subtotal: parseExternalMoney(record.subtotal ?? record.keterangan ?? record.nilai ?? record.nominal),
      planning_notes: firstString(record.planning_notes, record.catatan, record.keterangan, input.catatan),
    };
  });
  if (items.length === 0) {
    const err = new Error("Item non unit belum tersedia untuk dikirim.");
    err.status = 422;
    throw err;
  }
  return {
    endpoint: "/non-unit-submissions",
    kind: "non_unit",
    contractVersion: MARISON_OUTBOUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("non_unit", {
      submission_number: surat.no_surat,
      project_id: projectId,
      branch_id: branchId,
     submitted_by: overrides.nik,
      submitted_at: new Date(surat.created_at || Date.now()).toISOString(),
      notes: firstString(input.catatan, surat.judul_surat),
      items,
      attachments: await buildMarisonAttachmentLinks(surat, actorId),
     approvals: overrides.approvals,
    }),
  };
};

const buildMarisonAssetPayload = async (surat, input, actorId, overrides = {}) => {
  const requestedProject = getMarisonRequestedProject(surat, input);
  const branchId = requireExternalInteger(
    overrides.branchId ?? await resolveMarisonBranchId(surat, requestedProject, input, surat.location_snapshot),
    "Branch ID"
  );
  const items = normalizeMarisonItems(input);
  if (items.length === 0) {
    const err = new Error("Item aset belum tersedia untuk dikirim.");
    err.status = 422;
    throw err;
  }

  const recommendationDocument = await getMarisonRecommendationDocument(surat.id);
  const recommendationRows = getMarisonRecommendationRows(surat, input, recommendationDocument);
  const payloadItems = await Promise.all(items.map(async (item, index) => {
    const record = asPlainRecord(item);
    const recommendation = asPlainRecord(findMarisonRecommendationRow(recommendationRows, record, index));
    const embeddedAttachments = normalizeMarisonEmbeddedLinks(record.attachments);
    const recommendationAttachments = await buildMarisonRecommendationItemAttachment(
      recommendationDocument,
      recommendation,
      actorId
    );
    const quantity = requireExternalInteger(
      record.jumlah ?? record.quantity,
      `Jumlah aset baris ${index + 1}`
    );
    const estimatedPrice = parseExternalMoney(
      record.estimated_price ??
      record.harga_perkiraan ??
      record.perkiraan_harga ??
      record.harga ??
      record.nominal ??
      record.nilai
    );
    return {
      request_number: firstString(
        record.request_number,
        record.no_pengajuan,
        record.nomor_pengajuan,
        items.length === 1 ? surat.no_surat : `${surat.no_surat}-${String(index + 1).padStart(2, "0")}`
      ),
      asset_name: firstString(record.nama_barang, record.item_name, record.nama, record.barang),
      quantity,
      ...(estimatedPrice > 0 ? { estimated_price: estimatedPrice } : {}),
      description: firstString(record.keterangan, record.description),
      attachments: [...embeddedAttachments, ...recommendationAttachments],
    };
  }));

  if (recommendationDocument) {
    const recommendationLinks = await buildMarisonAttachmentLinks(recommendationDocument, actorId);
    const documentLink = recommendationLinks.find((item) => item.name === "Dokumen pengajuan")?.link ||
      recommendationLinks[0]?.link || "";
    if (documentLink) {
      payloadItems.forEach((item) => {
        if (!item.attachments.some((attachment) => attachment.link === documentLink)) {
          item.attachments.push({ name: "Dokumen Rekomendasi Aset", link: documentLink });
        }
      });
    }
  }

  const location = getMarisonLocation(surat);
  const payload = {
    submission_number: surat.no_surat,
    branch_id: branchId,
     submitted_by: overrides.nik,
    submitted_at: new Date(surat.created_at || Date.now()).toISOString(),
    category: firstString(location.office.kedudukan, location.office.position).toLowerCase() === "pusat"
      ? "Pengajuan Pusat"
      : "Pengajuan Cabang",
    description: firstString(input.catatan, surat.judul_surat),
    items: payloadItems,
     approvals: overrides.approvals,
  };
  return {
    endpoint: "/asset-purchase-requests",
    kind: "asset",
    contractVersion: MARISON_OUTBOUND_CONTRACT_VERSION,
    payload: assertMarisonOutboundContract("asset", payload),
  };
};

const buildMarisonDispatchPayload = async (surat, actorId, overrides = {}) => {
  const identity = await resolveMarisonOutboundIdentity(surat);
  const resolvedOverrides = {
    ...overrides,
    nik: identity.requester.nik,
    approvals: identity.approvals,
    sources: mergePayloadResolutionSources(overrides.sources, identity.sources),
  };
  const input = getMarisonDispatchInput(surat);
  const category = String(input.request_category || input.request_mode || "").trim().toLowerCase();
  let dispatch;
  if (category === "unit") dispatch = await buildMarisonUnitPayload(surat, input, actorId, resolvedOverrides);
  else if (category === "non_unit" || category === "nonunit") dispatch = await buildMarisonNonUnitPayload(surat, input, actorId, resolvedOverrides);
  else if (category === "asset") dispatch = await buildMarisonAssetPayload(surat, input, actorId, resolvedOverrides);
  else {
    const err = new Error(`Kategori ${category || "-"} belum memiliki endpoint outbound Marison.`);
    err.status = 422;
    throw err;
  }
  return {
    ...dispatch,
    resolutionSources: normalizePayloadResolutionSources(resolvedOverrides.sources, {
      kind: dispatch.kind,
      approvalCount: dispatch.payload.approvals?.length || 0,
      expectedApprovalKeys: Object.keys(identity.sources).filter((key) => key.startsWith("approval:")),
    }),
  };
};

const getMarisonDispatchQueueStatus = async (req, suratId) => {
  assertSameOrigin(req);
  await requireAdminUser(getBearerToken(req));
  const { data: surat, error } = await supabase
    .from("surat_registrasi")
    .select("id, status, data_snapshot")
    .eq("id", suratId)
    .maybeSingle();
  if (error) throw error;
  if (!surat) {
    const err = new Error("Surat tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  if (marisonSubmissionDispatchEnabled && ["SELESAI", "DONE"].includes(String(surat.status || "").toUpperCase())) {
    const { error: ensureError } = await supabase.rpc("ensure_marison_outbound_dispatch", {
      p_surat_id: suratId,
      p_environment: marisonDeploymentEnvironment,
    });
    if (ensureError) throw ensureError;
  }

  const { data: dispatchJob, error: jobError } = await supabase
    .from("marison_outbound_dispatches")
    .select("id, status, kind, attempt_count, next_attempt_at, last_attempt_at, post_started_at, completed_at, error_code, error_message, external_reference, skipped_reason, created_at, updated_at")
    .eq("surat_id", suratId)
    .eq("environment", marisonDeploymentEnvironment)
    .maybeSingle();

  if (jobError) throw jobError;

  const legacyDispatch = asPlainRecord(surat.data_snapshot?.marison_dispatch);

  return {
    enabled: marisonSubmissionDispatchEnabled,
    suratId: surat.id,
    suratStatus: surat.status,
    environment: marisonDeploymentEnvironment,
    job: dispatchJob || null,
    legacyDispatch: Object.keys(legacyDispatch).length > 0 ? {
      status: legacyDispatch.status || null,
      environment: legacyDispatch.environment || null,
      kind: legacyDispatch.kind || null,
      sentAt: legacyDispatch.sent_at || null,
      externalReference: legacyDispatch.external_reference || null,
    } : null,
  };
};

const buildMarisonOutboundJob = async (req, jobId) => {
  if (!marisonSubmissionDispatchEnabled) {
    const err = new Error("Outbound Marison tidak aktif pada environment ini.");
    err.status = 503;
    throw err;
  }
  const suppliedToken = String(req.headers["x-internal-outbound-token"] || "");
  if (!suppliedToken || !secretMatches(suppliedToken, marisonOutboundInternalToken)) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  const payload = await readJsonBody(req, 4096);
  const leaseToken = String(payload?.leaseToken || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leaseToken)) {
    const err = new Error("Lease token tidak valid.");
    err.status = 400;
    throw err;
  }

  const { data: job, error: jobError } = await supabase
    .from("marison_outbound_dispatches")
    .select("id, surat_id, environment, kind, endpoint, contract_version, payload, payload_body, payload_hash, status, lease_token, lease_expires_at, post_started_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) {
    const err = new Error("Job outbound tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  if (
    job.environment !== marisonDeploymentEnvironment ||
    job.status !== "processing" ||
    job.lease_token !== leaseToken ||
    job.post_started_at
  ) {
    const err = new Error("Lease job outbound tidak lagi aktif.");
    err.status = 409;
    throw err;
  }
  if (job.payload_body) {
    return {
      kind: job.kind,
      endpoint: job.endpoint,
      contractVersion: job.contract_version,
      payload: job.payload,
      payloadBody: job.payload_body,
      payloadHash: job.payload_hash,
    };
  }

  const { data: surat, error } = await supabase
    .from("surat_registrasi")
    .select(`
      id, no_surat, judul_surat, status, current_step, created_at, created_by, file_path, pdf_path,
      office_id, project_id, form_input_data, requester_snapshot, location_snapshot, data_snapshot,
      surat_signatures (
        id, user_id, role_name, label_jabatan, step_order, is_signed, signed_at, catatan, signer_snapshot,
        profiles:user_id ( id, full_name, nik, job_title )
      ),
      surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id )
    `)
    .eq("id", job.surat_id)
    .maybeSingle();
  if (error) throw error;
  if (!surat) {
    const err = new Error("Surat tidak ditemukan.");
    err.status = 404;
    throw err;
  }
  if (!["SELESAI", "DONE"].includes(String(surat.status || "").toUpperCase())) {
    const err = new Error("Surat belum selesai ditandatangani.");
    err.status = 422;
    throw err;
  }
  const dispatchInput = getMarisonDispatchInput(surat);
  const { data: recommendationLink, error: recommendationError } = await supabase
    .from("surat_linked_documents")
    .select("id")
    .eq("child_surat_id", surat.id)
    .eq("link_type", "recommendation")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (recommendationError) throw recommendationError;
  if (
    recommendationLink ||
    String(dispatchInput.linked_document_type || "").toLowerCase() === "recommendation" ||
    dispatchInput.linked_parent_surat_id
  ) {
    const err = new Error("Dokumen rekomendasi tidak boleh dikirim terpisah.");
    err.status = 422;
    throw err;
  }

   const overrides = await getMarisonOutboundMappings(surat);
   const dispatch = await buildMarisonDispatchPayload(surat, null, overrides);
  if (dispatch.kind !== job.kind || dispatch.endpoint !== job.endpoint) {
    const err = new Error("Kategori surat berubah setelah job outbound dibuat.");
    err.status = 422;
    throw err;
  }
  const payloadBody = JSON.stringify(dispatch.payload);
  const payloadHash = sha256Hex(Buffer.from(payloadBody));
   const { data: preparedRows, error: preparedError } = await supabase.rpc("prepare_marison_outbound_dispatch_with_sources", {
    p_job_id: job.id,
    p_lease_token: leaseToken,
    p_kind: dispatch.kind,
    p_endpoint: dispatch.endpoint,
    p_contract_version: dispatch.contractVersion,
    p_payload: dispatch.payload,
    p_payload_body: payloadBody,
     p_payload_hash: payloadHash,
     p_resolution_sources: dispatch.resolutionSources,
  });
  if (preparedError) throw preparedError;
  const prepared = Array.isArray(preparedRows) ? preparedRows[0] : null;
  if (!prepared) throw new Error("Payload outbound gagal disimpan.");

  return {
    kind: prepared.kind,
    endpoint: prepared.endpoint,
    contractVersion: prepared.contract_version,
    payload: prepared.payload,
    payloadBody: prepared.payload_body,
    payloadHash: prepared.payload_hash,
  };
};

const listMarisonOutboundDispatches = async (req, url) => {
  await requireAdminUser(getBearerToken(req));
  const allowedStatuses = new Set([
    "pending", "processing", "succeeded", "failed_retryable", "failed_terminal", "outcome_unknown", "skipped", "attention",
  ]);
  const status = String(url.searchParams.get("status") || "all");
  if (status !== "all" && !allowedStatuses.has(status)) {
    const err = new Error("Filter status tidak valid.");
    err.status = 400;
    throw err;
  }
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10) || 20));
  const from = (page - 1) * pageSize;
  let query = supabase
    .from("marison_outbound_dispatches")
    .select(`
      id, surat_id, environment, kind, status, attempt_count, next_attempt_at, last_attempt_at,
      post_started_at, completed_at, external_reference, error_code, error_message, skipped_reason,
      reconciliation_count, created_at, updated_at,
      surat_registrasi!inner(no_surat, judul_surat)
    `, { count: "exact" })
    .eq("environment", marisonDeploymentEnvironment)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (status === "attention") query = query.in("status", ["failed_terminal", "outcome_unknown"]);
  else if (status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query;
  if (error) throw error;

  return {
    environment: marisonDeploymentEnvironment,
    page,
    pageSize,
    total: count || 0,
    items: (data || []).map((row) => ({
      id: row.id,
      suratId: row.surat_id,
      noSurat: row.surat_registrasi?.no_surat || "-",
      title: row.surat_registrasi?.judul_surat || "-",
      environment: row.environment,
      kind: row.kind,
      status: row.status,
      attemptCount: row.attempt_count,
      nextAttemptAt: row.next_attempt_at,
      lastAttemptAt: row.last_attempt_at,
      postStartedAt: row.post_started_at,
      completedAt: row.completed_at,
      externalReference: row.external_reference,
      errorCode: row.error_code,
      failureReason: row.error_message || row.skipped_reason || null,
      reconciliationCount: row.reconciliation_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
};

const preflightMarisonOutboundRecovery = async (job, surat) => {
  if (!isPrePostRecoveryEligible(job, marisonDeploymentEnvironment) || !surat || !["SELESAI", "DONE"].includes(String(surat.status || "").toUpperCase())) {
    return { eligible: false, reasonCode: "NOT_PRE_POST_FAILURE", reason: "Job tidak terbukti gagal sebelum POST." };
  }
  try {
    const identity = await resolveMarisonOutboundIdentity(surat);
    const mappings = await getMarisonOutboundMappings(surat);
    normalizePayloadResolutionSources({ ...mappings.sources, ...identity.sources }, { kind: job.kind, approvalCount: identity.approvals.length });
    return { eligible: true, reasonCode: null, reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identity payload belum siap.";
    const match = message.match(/Penandatangan tahap (\d+)/);
    return {
      eligible: false,
      reasonCode: match ? "SIGNER_IDENTITY_MISSING" : message.includes("Pemohon") ? "REQUESTER_IDENTITY_MISSING" : message.includes("Branch") ? "BRANCH_IDENTITY_MISSING" : message.includes("Project") ? "PROJECT_IDENTITY_MISSING" : "NOT_PRE_POST_FAILURE",
      reason: match ? `Signer tahap ${match[1]} belum memiliki identitas payload yang valid. Lengkapi Mapping Payload Staging pada Master User sebelum membangun ulang dokumen.` : message,
      ...(match ? { blockedStage: Number(match[1]) } : {}),
    };
  }
};

const reconcileMarisonOutboundDispatch = async (req, dispatchId) => {
  assertSameOrigin(req);
  const actor = await requireAdminUser(getBearerToken(req));
  const payload = await readJsonBody(req, 8192);
  const action = String(payload?.action || "");
  const reason = String(payload?.reason || "").trim();
  const externalReference = String(payload?.externalReference || "").trim();
  if (!['mark_succeeded', 'reopen_confirmed_not_received', 'reopen_terminal_pre_post'].includes(action) || !reason) {
    const err = new Error("Aksi dan alasan rekonsiliasi wajib diisi.");
    err.status = 400;
    throw err;
  }
  if (action === "mark_succeeded" && !externalReference) {
    const err = new Error("Referensi eksternal wajib diisi.");
    err.status = 400;
    throw err;
  }
  if (action === "reopen_confirmed_not_received" && payload?.confirmDuplicateRisk !== true) {
    const err = new Error("Konfirmasi risiko pengiriman ulang wajib diberikan.");
    err.status = 400;
    throw err;
  }
  if (action === "reopen_terminal_pre_post") {
    const { data: job, error: jobError } = await supabase.from("marison_outbound_dispatches").select("id, surat_id, environment, status, kind, post_started_at, response, external_reference").eq("id", dispatchId).maybeSingle();
    if (jobError) throw jobError;
    if (!job) {
      const err = new Error("Job outbound tidak ditemukan.");
      err.status = 404;
      throw err;
    }
    const { data: surat, error: suratError } = await supabase.from("surat_registrasi").select("id, status, form_input_data, requester_snapshot, location_snapshot, data_snapshot, surat_signatures(id, user_id, step_order, is_signed, signed_at, signer_snapshot, profiles:user_id(id, nik, is_active, deleted_at, marison_employee_id, marison_synced_at))").eq("id", job?.surat_id).maybeSingle();
    if (suratError) throw suratError;
    const preflight = await preflightMarisonOutboundRecovery(job, surat);
    if (!preflight.eligible) {
      const err = new Error(preflight.reason);
      err.status = 409;
      err.code = preflight.reasonCode;
      throw err;
    }
  }

  const { error } = await supabase.rpc("reconcile_marison_outbound_dispatch", {
    p_job_id: dispatchId,
    p_actor_id: actor.id,
    p_action: action,
    p_reason: reason,
    p_external_reference: externalReference || null,
    p_confirm_duplicate_risk: payload?.confirmDuplicateRisk === true,
  });
  if (error) throw error;
  return { success: true };
};

const createMarisonOutboundReplacement = async (req, dispatchId) => {
  assertSameOrigin(req);
  const actor = await requireAdminUser(getBearerToken(req));
  if (marisonDeploymentEnvironment !== "staging") {
    const err = new Error("Replacement outbound hanya tersedia di staging.");
    err.status = 404;
    throw err;
  }
  const payload = await readJsonBody(req, 4096);
  const reason = String(payload?.reason || "").trim();
  if (!reason) {
    const err = new Error("Alasan replacement wajib diisi.");
    err.status = 400;
    throw err;
  }
  const { data, error } = await supabase.rpc("create_marison_outbound_replacement", {
    p_dispatch_id: dispatchId,
    p_actor_id: actor.id,
    p_reason: reason,
  });
  if (error) throw error;
  return { replacementId: data };
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
    .select("id, no_surat, judul_surat, file_path, pdf_path, lampiran_path, created_by")
    .eq("id", suratId)
    .maybeSingle();
  if (suratError || !surat) {
    if (suratError) console.error("getAuthorizedSurat base query failed:", suratError);
    const err = new Error(suratError ? `Gagal membaca dokumen: ${suratError.message}` : "Dokumen tidak ditemukan");
    err.status = 404;
    throw err;
  }

  const [signaturesRes, attachmentsRes] = await Promise.all([
    supabase
      .from("surat_signatures")
      .select("id, user_id, verifier_snapshot, file_path_snap, pdf_path_snap")
      .eq("surat_id", suratId),
    supabase
      .from("surat_attachments")
      .select("file_url")
      .eq("surat_id", suratId),
  ]);

  if (signaturesRes.error) console.error("getAuthorizedSurat signatures query failed:", signaturesRes.error);
  if (attachmentsRes.error) console.error("getAuthorizedSurat attachments query failed:", attachmentsRes.error);
  surat.surat_signatures = signaturesRes.data || [];
  surat.surat_attachments = attachmentsRes.data || [];

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

  const { data: activeJob, error: activeJobError } = await activeJobQuery.maybeSingle();
  if (activeJobError) throw activeJobError;
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

  const { data: latestDoneJob, error: latestDoneJobError } = await latestDoneJobQuery.maybeSingle();
  if (latestDoneJobError) throw latestDoneJobError;
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
  if (!job?.id || !job?.status) {
    const err = new Error("Job PDF gagal dibuat.");
    err.status = 503;
    throw err;
  }

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

  if (!(await isStorageRefAllowedForSurat(surat, requested))) {
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

  return { surat, file: data, ref: requested };
};

const createFileViewToken = async (suratId, token, rawPath) => {
  const { surat, user } = await getAuthorizedSurat(suratId, token);
  const requested = parseStorageRef(rawPath);
  if (!requested) {
    const err = new Error("Path file tidak valid");
    err.status = 400;
    throw err;
  }

  if (!(await isStorageRefAllowedForSurat(surat, requested))) {
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
    viewUrl: `/api/files/view/${viewToken}/${encodeURIComponent(buildDocumentFilename(surat, requested.path))}`,
    expiresIn: Math.floor(FILE_VIEW_TOKEN_TTL_MS / 1000),
  };
};

const consumeFileViewToken = async (viewToken) => {
  const { data: tokenMeta } = await supabase
    .from("file_view_tokens")
    .select("surat_id, object_path")
    .eq("token_hash", hashFileViewToken(viewToken))
    .maybeSingle();

  const { data: tokenRows, error: tokenError } = await supabase
    .rpc("consume_file_view_token", { p_token_hash: hashFileViewToken(viewToken) });
  if (tokenError) throw tokenError;

  const tokenData = tokenRows?.[0];
  if (!tokenData) {
    const err = new Error("Token file tidak valid atau sudah kedaluwarsa");
    err.status = 410;
    throw err;
  }

  const tokenStorageRef = {
    origin: tokenData.storage_origin,
    bucket: tokenData.bucket,
    path: tokenData.object_path,
  };
  const { data, error } = await storageClientForRef(tokenStorageRef).storage.from(tokenData.bucket).download(tokenData.object_path);
  if (error || !data) {
    const err = new Error(error?.message || "File tidak ditemukan");
    err.status = 404;
    throw err;
  }

  let surat = null;
  if (tokenMeta?.surat_id) {
    const { data: suratData } = await supabase
      .from("surat_registrasi")
      .select("id, no_surat, judul_surat")
      .eq("id", tokenMeta.surat_id)
      .maybeSingle();
    surat = suratData || null;
  }

  return {
    file: data,
    ref: { bucket: tokenData.bucket, path: tokenData.object_path, origin: tokenData.storage_origin },
    filename: buildDocumentFilename(surat, tokenData.object_path || tokenMeta?.object_path),
  };
};

const serveStatic = async (req, res) => {
  if (!["GET", "HEAD"].includes(req.method || "")) {
    res.writeHead(405, withSecurityHeaders({
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Allow": "GET, HEAD",
    }));
    res.end("Method not allowed");
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = decodeURIComponent(url.pathname);
  const candidate = normalize(requested === "/" ? "/index.html" : requested);
  let filePath = resolve(join(distDir, candidate));
  const relativePath = relative(distDir, filePath);
  const isInsideDist = relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
  const fileExists = isInsideDist && existsSync(filePath);
  const isDirectory = fileExists && statSync(filePath).isDirectory();
  if (!fileExists || isDirectory) {
    const isAssetRequest = requested.startsWith("/assets/") || extname(requested) !== "";
    if (isAssetRequest) {
      res.writeHead(404, withSecurityHeaders({
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      }));
      res.end("Asset not found");
      return;
    }
    filePath = join(distDir, "index.html");
  }
  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  const isHtml = extname(filePath) === ".html";
  const isServiceWorker = requested === "/sigap-sw.js";
  const isTemplateFile = requested.startsWith("/template excel/");
  res.writeHead(200, withSecurityHeaders({
    "Content-Type": type,
    "Cache-Control": isHtml
      ? "private, no-cache, must-revalidate"
      : isServiceWorker
        ? "no-cache, must-revalidate"
      : isTemplateFile
        ? "private, no-cache, must-revalidate"
      : requested.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
  }));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
};

await mkdir(distDir, { recursive: true });

export const handleRequest = async (req, res) => {
  const requestIdHeader = String(req.headers["x-request-id"] || "").trim();
  const requestId = /^[A-Za-z0-9_-]{8,80}$/.test(requestIdHeader) ? requestIdHeader : randomUUID();
  const requestPath = String(req.url || "").split("?")[0];
  res.setHeader("X-Request-Id", requestId);
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      assertSameOrigin(req);
    }
    if (url.pathname.startsWith("/api/") && hasSessionCookie(req)) {
      await refreshCookieSession(req, res);
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      await openBffRealtimeStream(req, res, url);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/profile/avatar/file") {
      const token = getBearerToken(req);
      await requireSupabaseUser(token);
      const filePath = sanitizeStoragePath(url.searchParams.get("path"));
      let relativePath;
      try {
        relativePath = removeStoragePathPrefix(filePath, storagePathPrefix);
      } catch {
        relativePath = "";
      }
      if (!/^[0-9a-f-]{36}\/avatar_[A-Za-z0-9_.-]+$/i.test(relativePath)) {
        return sendJson(res, 400, { error: "Path foto profil tidak valid." });
      }
      const wantsThumbnail = String(req.headers["sec-fetch-dest"] || "").toLowerCase() === "image";
      const thumbnailPath = filePath.replace(/\.[^.]+$/, "_thumb.webp");
      let requestedPath = wantsThumbnail ? thumbnailPath : filePath;
      let { data: file, error } = await storageSupabase.storage.from("avatars").download(requestedPath);

      if (wantsThumbnail && (error || !file)) {
        const original = await storageSupabase.storage.from("avatars").download(filePath);
        if (!original.error && original.data) {
          const originalBuffer = Buffer.from(await original.data.arrayBuffer());
          const thumbnail = await sharp(originalBuffer)
            .rotate()
            .resize(256, 256, { fit: "cover", position: "centre", withoutEnlargement: true })
            .webp({ quality: 78 })
            .toBuffer();
          await storageSupabase.storage.from("avatars").upload(thumbnailPath, thumbnail, {
            contentType: "image/webp",
            cacheControl: "86400",
            upsert: true,
          });
          requestedPath = thumbnailPath;
          file = new Blob([thumbnail], { type: "image/webp" });
          error = null;
        }
      }
      if (error || !file) {
        return sendJson(res, 404, { error: "Foto profil tidak ditemukan." });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": file.type || contentTypes[extname(requestedPath)] || "application/octet-stream",
        "Content-Length": buffer.length,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=31536000, immutable",
      }));
      res.end(buffer);
      return;
    }

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
      const { surat, file, ref } = await getAuthorizedStorageFile(fileMatch[1], token, rawPath);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = buildDocumentFilename(surat, ref.path, "file");
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": contentTypeForFile(file, filename),
        "Content-Length": buffer.length,
        "Content-Disposition": filenameHeaderValue(filename),
        "Cache-Control": "private, max-age=60",
      }));
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

    const viewMatch = url.pathname.match(/^\/api\/files\/view\/([A-Za-z0-9_-]+)(?:\/[^/?#]+)?$/);
    if (req.method === "GET" && viewMatch) {
      const { file, ref, filename: tokenFilename } = await consumeFileViewToken(viewMatch[1]);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = tokenFilename || buildDocumentFilename(null, ref.path, "file");
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": contentTypeForFile(file, filename),
        "Content-Length": buffer.length,
        "Content-Disposition": filenameHeaderValue(filename),
        "Cache-Control": "no-store",
      }));
      res.end(buffer);
      return;
    }

    const templatePreviewMatch = url.pathname.match(/^\/api\/admin\/template-preview\/([A-Za-z0-9_-]+)$/);
    if (req.method === "GET" && templatePreviewMatch) {
      const pdf = consumeTemplatePreview(templatePreviewMatch[1]);
      res.writeHead(200, withSecurityHeaders({
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": "inline; filename=template-test.pdf",
        "Cache-Control": "no-store",
      }));
      res.end(pdf);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        const result = await handleAuthLogin(req, res);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/auth/session") {
        const session = await refreshCookieSession(req, res);
        return sendJson(res, 200, { session: publicSession(session), user: session?.user || null });
      }

      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        const result = await handleAuthLogout(req, res);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/auth/update-user") {
        const result = await handleAuthUpdateUser(req, res);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/auth/verify-otp") {
        const result = await handleAuthVerifyOtp(req, res);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/auth/password-reset") {
        const result = await handlePasswordResetRequest(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/integrations/marison/status") {
        const result = await getMarisonEnvironmentStatus(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/integrations/marison/outbound-overrides") {
        const result = await configureMarisonOutboundIdentityOverrides(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/integrations/marison/test") {
        const result = await testMarisonEnvironment(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/integrations/marison/employees/preview") {
        const result = await previewMarisonEmployees(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/integrations/marison/branches/preview") {
        const result = await previewMarisonBranches(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/integrations/marison/branches/sync") {
        const result = await syncMarisonBranches(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/integrations/marison/projects/preview") {
        const result = await previewMarisonProjects(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/integrations/marison/projects/sync") {
        const result = await syncMarisonProjects(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/integrations/marison/employees/sync") {
        const result = await syncMarisonEmployees(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/internal/marison/directory-sync") {
        const result = await syncMarisonDirectoryFromCron(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/integrations/marison/dispatches") {
        const result = await listMarisonOutboundDispatches(req, url);
        return sendJson(res, 200, result);
      }

      const marisonReconcileMatch = url.pathname.match(/^\/api\/integrations\/marison\/dispatches\/([0-9a-f-]+)\/reconcile$/i);
      if (req.method === "POST" && marisonReconcileMatch) {
        const result = await reconcileMarisonOutboundDispatch(req, marisonReconcileMatch[1]);
        return sendJson(res, 200, result);
      }
      const marisonReplacementMatch = url.pathname.match(/^\/api\/integrations\/marison\/dispatches\/([0-9a-f-]+)\/replacement$/i);
      if (req.method === "POST" && marisonReplacementMatch) {
        return sendJson(res, 200, await createMarisonOutboundReplacement(req, marisonReplacementMatch[1]));
      }

      const marisonDispatchMatch = url.pathname.match(/^\/api\/integrations\/marison\/surat\/([0-9a-f-]+)\/dispatch$/i);
      if (req.method === "POST" && marisonDispatchMatch) {
        const result = await getMarisonDispatchQueueStatus(req, marisonDispatchMatch[1]);
        return sendJson(res, 200, result);
      }

      const marisonPreflightMatch = url.pathname.match(/^\/api\/integrations\/marison\/dispatches\/([0-9a-f-]+)\/preflight$/i);
      if (req.method === "GET" && marisonPreflightMatch) {
        assertSameOrigin(req);
        await requireAdminUser(getBearerToken(req));
        if (marisonDeploymentEnvironment !== "staging") {
          const err = new Error("Recovery outbound hanya tersedia di staging.");
          err.status = 404;
          throw err;
        }
        const { data: job, error: jobError } = await supabase
          .from("marison_outbound_dispatches")
          .select("id, surat_id, environment, status, kind, post_started_at, response, external_reference")
          .eq("id", marisonPreflightMatch[1])
          .maybeSingle();
        if (jobError) throw jobError;
        if (!job) {
          return sendJson(res, 404, { eligible: false, reasonCode: "NOT_PRE_POST_FAILURE", reason: "Job outbound tidak ditemukan." });
        }
        const { data: surat, error: suratError } = await supabase
          .from("surat_registrasi")
          .select("id, status, form_input_data, requester_snapshot, location_snapshot, data_snapshot, surat_signatures(id, user_id, step_order, is_signed, signed_at, signer_snapshot, profiles:user_id(id, nik, is_active, deleted_at, marison_employee_id, marison_synced_at))")
          .eq("id", job.surat_id)
          .maybeSingle();
        if (suratError) throw suratError;
        if (!surat) return { eligible: false, reasonCode: "NOT_PRE_POST_FAILURE", reason: "Surat tidak ditemukan." };
        const preflight = await preflightMarisonOutboundRecovery(job, surat);
        return { eligible: preflight.eligible, reasonCode: preflight.reasonCode, reason: preflight.reason, blockedStage: preflight.blockedStage };
      }

      const marisonBuildMatch = url.pathname.match(/^\/api\/internal\/marison\/outbound\/([0-9a-f-]+)\/build$/i);
      if (req.method === "POST" && marisonBuildMatch) {
        const result = await buildMarisonOutboundJob(req, marisonBuildMatch[1]);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/bff/query") {
        const result = await handleBffQuery(req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/bff/storage/file") {
        await handleBffStorageFile(req, res, url);
        return;
      }

      const bffFunctionMatch = url.pathname.match(/^\/api\/bff\/functions\/([A-Za-z_][A-Za-z0-9_]*)$/);
      if (req.method === "POST" && bffFunctionMatch) {
        const result = await handleBffFunction(req, bffFunctionMatch[1]);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/admin/template-preview") {
        const token = getBearerToken(req);
        const payload = await readJsonBody(req, 4096);
        const result = await createTemplatePreview(token, payload);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/admin/marison-payload-mappings") {
        return sendJson(res, 200, await getMarisonPayloadMappings(req), { "Cache-Control": "no-store" });
      }
      if (req.method === "GET" && url.pathname === "/api/admin/marison-payload-mapping-catalog") {
        return sendJson(res, 200, await getMarisonPayloadMappingCatalog(req, url), { "Cache-Control": "no-store" });
      }
      if (req.method === "POST" && url.pathname === "/api/admin/marison-payload-mappings") {
        return sendJson(res, 200, await configureMarisonPayloadMapping(req));
      }

      if (req.method === "GET" && url.pathname === "/api/attention/state") {
        const token = getBearerToken(req);
        const result = await getAttentionStateFromRequest(token);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/push/public-key") {
        const token = getBearerToken(req);
        const result = await getWebPushPublicKey(token);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/push/subscribe") {
        const token = getBearerToken(req);
        const payload = await readJsonBody(req);
        const result = await saveWebPushSubscription(token, payload, req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/push/unsubscribe") {
        const token = getBearerToken(req);
        const payload = await readJsonBody(req);
        const result = await removeWebPushSubscription(token, payload);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/storage/upload") {
        const token = getBearerToken(req);
        const result = await uploadInternalStorageFile(token, req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/profile/avatar") {
        const token = getBearerToken(req);
        const result = await uploadProfileAvatar(token, req);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/dashboard/department-activity") {
        const token = getBearerToken(req);
        const result = await getDepartmentAgendaActivity(token, url);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/surat/attachments/replace") {
        const token = getBearerToken(req);
        const result = await replaceSignatureAttachmentFiles(token, req);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/notifications/email") {
        const token = getBearerToken(req);
        const payload = await readJsonBody(req);
        const result = await sendInternalEmailNotification(token, payload);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/notifications/send") {
        const token = getBearerToken(req);
        const payload = await readJsonBody(req);
        const result = await sendInternalNotification(token, payload);
        return sendJson(res, 200, result);
      }

      const dataSourceMatch = url.pathname.match(/^\/api\/data-sources\/([a-zA-Z0-9_-]+)\/query$/);
      if (req.method === "POST" && dataSourceMatch) {
        const token = getBearerToken(req);
        await requireSupabaseUser(token);
        const payload = await readJsonBody(req);
        const result = await queryExternalDataSource(dataSourceMatch[1], payload?.variables || {});
        return sendJson(res, 200, result);
      }

      return sendJson(res, 404, { error: "Not found" });
    }

    await serveStatic(req, res);
  } catch (error) {
    const status = error.status || 500;
    const logMessage = `[api:${requestId}] ${req.method || "UNKNOWN"} ${requestPath} -> ${status}: ${error.message || "Internal server error"}`;
    if (status >= 500) console.error(logMessage);
    else if (status === 429) console.warn(logMessage);
    if (error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
    sendJson(res, status, { error: error.message || "Internal server error", requestId });
  }
};
