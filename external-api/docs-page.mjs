export const buildDocsHtml = () => `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SIGAP External API Docs</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; min-height: 100vh; background: #0b1018; color: #e7edf6; letter-spacing: 0; }
    button, input, select, textarea { font: inherit; letter-spacing: 0; }
    a { color: inherit; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 284px minmax(0, 1fr); }
    .sidebar { position: sticky; top: 0; height: 100vh; border-right: 1px solid #293343; background: #151d29; padding: 24px 18px; }
    .brand { display: flex; align-items: center; gap: 11px; min-height: 42px; font-size: 16px; font-weight: 700; }
    .brand-mark { display: grid; place-items: center; width: 28px; height: 28px; color: #68d391; font-size: 20px; }
    .nav-label { margin: 34px 0 10px; color: #8f9bad; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .nav-link { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 38px; padding: 8px 10px; border-left: 2px solid transparent; color: #cbd5e1; text-decoration: none; font-size: 13px; }
    .nav-link:hover, .nav-link:focus-visible { background: #1d2837; color: #fff; outline: none; }
    .nav-link.active { border-left-color: #38bdf8; background: #193247; color: #fff; }
    .method-dot { color: #d66efd; font-size: 18px; line-height: 1; }
    .method-name { margin-left: auto; color: #22d3ee; font-size: 10px; font-weight: 700; }
    .content { width: min(1180px, calc(100% - 64px)); margin: 0 auto; padding: 54px 0 80px; }
    .topline { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
    h1 { margin: 0; color: #f8fafc; font-size: clamp(30px, 4vw, 42px); line-height: 1.15; }
    h2 { margin: 46px 0 18px; font-size: 22px; }
    h3 { margin: 0; font-size: 17px; }
    p { color: #b8c2d0; line-height: 1.65; }
    .version { display: inline-flex; margin-top: 14px; padding: 3px 8px; border: 1px solid #3c4a5e; border-radius: 999px; background: #1c2735; color: #dbeafe; font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
    .export { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid #526076; border-radius: 3px; background: transparent; color: #eef2f7; text-decoration: none; font-size: 12px; font-weight: 700; }
    .export:hover, .export:focus-visible { border-color: #38bdf8; outline: none; }
    .band { margin-top: 26px; border: 1px solid #2b3748; background: #172130; }
    .band-title { padding: 11px 16px; border-bottom: 1px solid #2b3748; color: #dce6f2; font-size: 12px; font-weight: 700; }
    .code-row { margin: 14px; padding: 13px 16px; border: 1px solid #253247; background: #111927; color: #f1f5f9; overflow-x: auto; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .header-list { display: grid; gap: 12px; }
    .help { margin-top: 12px; font-size: 13px; }
    .operation { margin-top: 18px; border: 1px solid #344154; background: #111925; }
    .operation-head { display: flex; align-items: center; gap: 13px; padding: 16px; border-bottom: 1px solid #344154; }
    .method { min-width: 52px; padding: 5px 8px; border-radius: 3px; background: #0e7490; color: white; text-align: center; font-size: 11px; font-weight: 800; }
    .path { color: #f8fafc; font: 600 14px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .operation-body { padding: 20px; }
    .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; }
    label { display: grid; gap: 7px; color: #d7e0eb; font-size: 12px; font-weight: 700; }
    .wide { grid-column: 1 / -1; }
    input, select, textarea { width: 100%; border: 1px solid #3b485b; border-radius: 3px; background: #0c1420; color: #f8fafc; padding: 10px 12px; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: #38bdf8; box-shadow: 0 0 0 2px rgb(56 189 248 / 18%); }
    textarea { min-height: 92px; resize: vertical; }
    .token-wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .icon-button { width: 42px; border: 1px solid #3b485b; border-radius: 3px; background: #192434; color: #dce6f2; cursor: pointer; }
    .icon-button:hover, .icon-button:focus-visible { border-color: #38bdf8; outline: none; }
    .actions { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
    .execute { min-height: 38px; padding: 0 18px; border: 1px solid #0891b2; border-radius: 3px; background: #0e7490; color: white; cursor: pointer; font-weight: 750; }
    .execute:hover, .execute:focus-visible { background: #0c849f; outline: none; }
    .execute:disabled { cursor: wait; opacity: .65; }
    .warning { color: #fbbf24; font-size: 12px; }
    .response { margin-top: 20px; border-top: 1px solid #344154; padding-top: 18px; }
    .response-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .status { color: #9fb0c3; font: 700 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { min-height: 90px; margin: 10px 0 0; padding: 14px; border: 1px solid #2e3a4b; background: #080e16; color: #dbeafe; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #263142; color: #738196; font-size: 12px; }
    @media (max-width: 820px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { position: static; width: 100%; height: auto; border-right: 0; border-bottom: 1px solid #293343; }
      .nav-label { margin-top: 18px; }
      .content { width: min(100% - 32px, 720px); padding-top: 32px; }
      .field-grid { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">&#10022;</span><span>SIGAP External API Docs</span></div>
      <div class="nav-label">Dokumentasi</div>
      <a class="nav-link active" href="#overview">Overview</a>
      <div class="nav-label">Endpoints</div>
      <a class="nav-link" href="#submission-decisions"><span class="method-dot" aria-hidden="true">&#9673;</span><span>Submission Decisions</span><span class="method-name">POST</span></a>
    </aside>

    <main class="content">
      <section id="overview">
        <div class="topline">
          <div><h1>SIGAP External API Docs</h1><span class="version">v1.0.0</span></div>
          <a class="export" href="/openapi.json" download="sigap-submission-decisions.openapi.json">Export OpenAPI</a>
        </div>
        <div class="band">
          <div class="band-title">API Base URL</div>
          <div class="code-row">https://external.marison-testing.biz.id</div>
        </div>
        <h2>Header Wajib</h2>
        <div class="header-list">
          <div class="code-row">Authorization: Bearer &lt;token&gt;</div>
          <div class="code-row">Content-Type: application/json</div>
        </div>
        <p class="help">Bearer token staging diberikan oleh administrator SIGAP. Token tidak boleh dikirim melalui query URL atau disimpan di source code.</p>
      </section>

      <section id="submission-decisions">
        <h2>01 - Submission Decisions</h2>
        <div class="operation">
          <div class="operation-head"><span class="method">POST</span><span class="path">/api/v1/submission-decisions</span></div>
          <div class="operation-body">
            <h3>Kirim keputusan pengajuan</h3>
            <p>Pilih <code>rejected</code> untuk menolak secara terminal atau <code>revision_required</code> untuk mengembalikan pengajuan ke Tindak Lanjut pemohon.</p>
            <form id="request-form">
              <div class="field-grid">
                <label class="wide">Bearer token
                  <span class="token-wrap"><input id="token" type="password" autocomplete="off" required placeholder="Masukkan token tanpa kata Bearer"><button id="toggle-token" class="icon-button" type="button" title="Tampilkan atau sembunyikan token" aria-label="Tampilkan atau sembunyikan token">&#9673;</button></span>
                </label>
                <label>event_id<input id="event-id" required></label>
                <label>decision<select id="decision"><option value="revision_required">revision_required</option><option value="rejected">rejected</option></select></label>
                <label class="wide">document_number<input id="document-number" required placeholder="041/UAI/MKT.1/VIII/2026"></label>
                <label class="wide">reason<textarea id="reason" required minlength="5" maxlength="1000" placeholder="Tuliskan alasan keputusan"></textarea></label>
                <label class="wide">decided_at<input id="decided-at" required></label>
              </div>
              <div class="actions"><button id="execute" class="execute" type="submit">Try Request</button><span class="warning">Token valid akan memproses data staging.</span></div>
            </form>
            <div class="response" aria-live="polite">
              <div class="response-head"><h3>Response</h3><span id="status" class="status">Belum dijalankan</span></div>
              <pre id="response-body">Response API akan tampil di sini.</pre>
            </div>
          </div>
        </div>
      </section>
      <div class="footer">SIGAP External API staging</div>
    </main>
  </div>
  <script src="/docs/app.js" defer></script>
</body>
</html>`;

export const docsClientScript = `(() => {
  const byId = (id) => document.getElementById(id);
  const form = byId("request-form");
  const token = byId("token");
  const execute = byId("execute");
  const status = byId("status");
  const responseBody = byId("response-body");

  byId("event-id").value = crypto.randomUUID();
  byId("decided-at").value = new Date().toISOString();
  byId("toggle-token").addEventListener("click", () => {
    token.type = token.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    execute.disabled = true;
    status.textContent = "Mengirim...";
    responseBody.textContent = "Menunggu response SIGAP.";
    const payload = {
      event_id: byId("event-id").value.trim(),
      document_number: byId("document-number").value.trim(),
      decision: byId("decision").value,
      reason: byId("reason").value.trim(),
      decided_at: byId("decided-at").value.trim(),
    };
    try {
      const response = await fetch("/api/v1/submission-decisions", {
        method: "POST",
        headers: { Authorization: "Bearer " + token.value.trim(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      status.textContent = "HTTP " + response.status;
      responseBody.textContent = formatted || "Response kosong.";
      if (response.ok) byId("event-id").value = crypto.randomUUID();
    } catch {
      status.textContent = "Network error";
      responseBody.textContent = "Tidak dapat menghubungi SIGAP External API.";
    } finally {
      execute.disabled = false;
    }
  });
})();`;
