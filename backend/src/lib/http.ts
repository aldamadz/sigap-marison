import { extname } from "node:path";
import type { ServerResponse } from "node:http";

// Pure HTTP response/header/request-size helpers extracted from
// domain-runtime.ts. This module is a leaf: no session, auth, Supabase,
// rate-limit state, dispatcher, or domain handler logic.

export const securityHeaders: Record<string, string> = {
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

export const withSecurityHeaders = (headers: Record<string, string> = {}) => ({
  ...securityHeaders,
  ...headers,
});

export const sendJson = (
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) => {
  res.writeHead(status, withSecurityHeaders({
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  }));
  res.end(JSON.stringify(body));
};

export const assertRequestSize = (
  req: { headers: { "content-length"?: string | number } },
  maxBytes: number,
) => {
  const length = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(length) && length > maxBytes) {
    const err = new Error(`Ukuran file terlalu besar. Maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB.`) as Error & { status?: number };
    err.status = 413;
    throw err;
  }
};

export const contentTypes: Record<string, string> = {
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

export const sanitizeDownloadFilename = (value: unknown) => String(value || "file")
  .replace(/[\r\n"]/g, "")
  .replace(/[\\/]+/g, "_")
  .trim() || "file";

export const sanitizeFilenameStem = (value: unknown, fallback = "dokumen") => {
  const sanitized = String(value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return sanitized || fallback;
};

export const filenameHeaderValue = (filename: unknown) => {
  const safe = sanitizeDownloadFilename(filename);
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
};

export const contentTypeForFile = (file: { type?: string } | undefined, filename: string) => {
  const type = String(file?.type || "").toLowerCase();
  const extensionType = contentTypes[extname(filename).toLowerCase()];
  if (!type || type === "application/octet-stream" || type === "binary/octet-stream") {
    return extensionType || "application/octet-stream";
  }
  return type;
};

export const buildDocumentFilename = (
  surat: { judul_surat?: string; no_surat?: string } | undefined,
  fallbackPath: string,
  fallback = "dokumen",
) => {
  const originalName = sanitizeDownloadFilename(String(fallbackPath || "").split("/").pop() || fallback);
  const extension = extname(originalName) || ".pdf";
  const stemSource = surat?.judul_surat || surat?.no_surat || originalName.replace(extname(originalName), "");
  return `${sanitizeFilenameStem(stemSource, fallback)}${extension.toLowerCase()}`;
};
