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

const defaultEmailSettings = {
  enabled: true,
  inherit_global: true,
  app_url: "https://sigap.marison-testing.biz.id",
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
    app_url: String(raw.app_url || process.env.APP_PUBLIC_URL || process.env.VITE_APP_PUBLIC_URL || defaultEmailSettings.app_url)
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

const useExternalStorage = () => true;
const uploadStorageClient = () => storageSupabase;

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
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  const amount = Number(cleaned);
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
  const serial = String(detail.production_serial || detail.kode_produksi_nomor || "").trim();
  const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
  const formattedDate = formatEmailProductionDate(detail.production_date || detail.kode_produksi_tanggal || "");
  if (!serial && !block && !formattedDate) return unit?.raw?.production_code || "-";
  return `${serial}/UAI/PRC/${block}/${formattedDate}`;
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
    "signers",
  ]);
  const items = Array.isArray(input.items) ? input.items : [];
  const detailRows = Object.entries(input)
    .filter(([key, value]) => !hiddenKeys.has(key) && value !== "" && value != null)
    .map(([key, value]) => {
      const displayValue = typeof value === "object"
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

  const itemsHtml = items.length && itemColumns.length
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

  const detailsHtml = detailRows
    ? `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb">${detailRows}</table>`
    : "";

  return itemsHtml || detailsHtml
    ? `${itemsHtml}${detailsHtml}`
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
      storageUrl: useExternalStorage() ? storageSupabaseUrl : supabaseUrl,
      message: error?.message,
      cause: error?.cause?.message,
    });
    const err = new Error(
      useExternalStorage()
        ? "Server aplikasi tidak bisa menghubungi storage self-hosted. Periksa STORAGE_SUPABASE_URL dari container agenda-flow-prod."
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
  if (surat.created_by === userId) return true;
  if ((surat.surat_signatures || []).some((sig) => sig.user_id === userId)) return true;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return profile?.role === "admin";
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
    ...(surat.surat_attachments || []).map((a) => a.file_url),
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
    .select("id, file_path, pdf_path, lampiran_path, created_by")
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
      .select("id, user_id, file_path_snap, pdf_path_snap")
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
    const isAssetRequest = requested.startsWith("/assets/") || extname(requested) !== "";
    if (isAssetRequest) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end("Asset not found");
      return;
    }
    filePath = join(distDir, "index.html");
  }
  const type = contentTypes[extname(filePath)] || "application/octet-stream";
  const isHtml = extname(filePath) === ".html";
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": isHtml
      ? "no-store, no-cache, must-revalidate"
      : requested.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
  });
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
