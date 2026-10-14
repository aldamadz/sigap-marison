import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export const renderMaintenancePage = ({ reference = "OPS-573", startedAt } = {}) => {
  const date = startedAt ? new Date(startedAt) : null;
  if (date && !Number.isFinite(date.getTime())) throw new Error("Invalid maintenance start time");
  const started = date ? new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", dateStyle: "long", timeStyle: "short",
  }).format(date) + " WIB" : null;
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#ffffff">
<title>Pemeliharaan SIGAP | Marison</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff;color:#222a2b;font-family:Arial,Helvetica,sans-serif;letter-spacing:0;line-height:1.6}
.shell{max-width:1080px;margin:auto;padding:0 36px}header{border-bottom:1px solid #dfe6e3}
.brand{min-height:112px;display:flex;align-items:center;gap:30px}.brand img{width:156px;height:68px;object-fit:contain}
.brand-name{border-left:1px solid #dfe6e3;padding-left:30px;font-size:21px;font-weight:700}.brand-name small{display:block;font-size:12px;font-weight:400;color:#69726f}
main.shell{padding:70px 36px 64px;min-height:calc(100svh - 190px)}.status{display:flex;align-items:center;gap:9px;color:#966215;font-size:12px;font-weight:700;text-transform:uppercase}
.status:before{content:"";width:8px;height:8px;background:#c89128;border-radius:50%;flex:none}h1{font-size:36px;line-height:1.2;margin:22px 0;max-width:700px}
.intro{font-size:18px;color:#59635f;max-width:680px;margin:0 0 38px}.assurance{border-left:3px solid #27873c;padding-left:22px;max-width:700px}
.assurance h2{font-size:17px;margin:0 0 6px}.assurance p{margin:0;color:#59635f;font-size:15px}
.details{display:flex;gap:56px;flex-wrap:wrap;margin:46px 0 32px;padding-top:24px;border-top:1px solid #dfe6e3}
dt{font-size:12px;color:#69726f}dd{margin:4px 0 0;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.retry{display:inline-flex;align-items:center;justify-content:center;background:#27873c;border:1px solid #27873c;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600}
.retry:hover{background:#206e31}.retry:focus-visible{outline:3px solid #c89128;outline-offset:4px}
footer{background:#f4f7f5;border-top:1px solid #dfe6e3;color:#69726f;font-size:12px;padding:22px 0}.footer-content{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media(max-width:600px){.shell{padding:0 22px}.brand{min-height:96px;gap:18px}.brand img{width:126px;height:58px}.brand-name{padding-left:18px;font-size:18px}.brand-name small{font-size:11px}main.shell{padding:44px 22px}h1{font-size:30px}.intro{font-size:16px}.details{gap:20px;margin-top:34px}.details dl{margin:0;flex-basis:100%}}
</style></head><body>
<header><div class="shell brand"><img src="/maintenance-logo.png" alt="Marison Regency Group"><div class="brand-name">SIGAP<small>Sistem Pengajuan &amp; Persetujuan</small></div></div></header>
<main class="shell"><div class="status">Pemeliharaan terjadwal</div><h1>SIGAP sedang dalam pemeliharaan</h1>
<p class="intro">Kami sedang memperbarui infrastruktur SIGAP. Pengajuan dan persetujuan dihentikan sementara selama proses ini.</p>
<section class="assurance" aria-labelledby="data-status"><h2 id="data-status">Data Anda tetap tersimpan</h2><p>Dokumen, lampiran, dan riwayat pengajuan tetap dipertahankan. Layanan dibuka kembali setelah pemeriksaan selesai.</p></section>
<div class="details">${started ? `<dl><dt>Mulai pemeliharaan</dt><dd>${escape(started)}</dd></dl>` : ""}<dl><dt>Status layanan</dt><dd>Sementara tidak tersedia</dd></dl><dl><dt>Referensi pemeliharaan</dt><dd>${escape(reference)}</dd></dl></div>
<a class="retry" href="/">Periksa kembali</a></main>
<footer><div class="shell footer-content"><span>Marison Regency Group</span><span>SIGAP &middot; Pembaruan infrastruktur</span></div></footer>
</body></html>`;
};

export const createMaintenanceServer = ({ logo, reference, startedAt, retryAfter = 120, apiOnly = false } = {}) => {
  if (!Number.isSafeInteger(retryAfter) || retryAfter < 1 || retryAfter > 3600) throw new Error("Invalid Retry-After");
  if (typeof apiOnly !== "boolean") throw new Error("Invalid maintenance surface");
  const html = Buffer.from(renderMaintenancePage({ reference, startedAt }));
  const common = {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
  const server = createServer((request, response) => {
    const path = (request.url || "/").split("?")[0];
    let status = 503;
    let type = "text/html; charset=utf-8";
    let body = html;
    if (path === "/maintenance-logo.png" && ["GET", "HEAD"].includes(request.method)) {
      status = 200; type = "image/png"; body = logo || Buffer.alloc(0);
    } else if (path === "/health/live" && ["GET", "HEAD"].includes(request.method)) {
      status = 200; type = "application/json"; body = Buffer.from('{"status":"maintenance","service":"sigap-maintenance"}');
    } else if (apiOnly || path === "/api" || path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/supabase/")) {
      type = "application/json";
      body = Buffer.from(JSON.stringify({ error: "maintenance", message: "SIGAP sedang dalam pemeliharaan. Silakan coba kembali nanti." }));
    }
    response.writeHead(status, { ...common, "Content-Type": type, "Content-Length": body.length,
      ...(status === 503 ? { "Retry-After": String(retryAfter) } : {}) });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  return server;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3080);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid maintenance port");
  const surface = process.env.MAINTENANCE_SURFACE || "web";
  if (!["web", "api"].includes(surface)) throw new Error("Invalid maintenance surface");
  const logo = readFileSync(new URL("../../public/logo-marison-regency-group.png", import.meta.url));
  const server = createMaintenanceServer({ logo, reference: process.env.MAINTENANCE_REFERENCE,
    startedAt: process.env.MAINTENANCE_STARTED_AT, apiOnly: surface === "api" });
  server.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`SIGAP maintenance listening on port ${port}`));
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close());
}
