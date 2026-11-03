const SERVICES = [
  { id: 'drive', name: 'Maris Drive', domain: 'drive.marisoncloud.com', url: 'https://drive.marisoncloud.com' },
  { id: 'ai', name: 'AI Workspace', domain: 'ai.marisoncloud.com', url: 'https://ai.marisoncloud.com' },
  { id: 'sigap', name: 'SIGAP', domain: 'sigap.marisoncloud.com', url: 'https://sigap.marisoncloud.com' },
  { id: 'marison', name: 'Marison Cloud', domain: 'marisoncloud.com', url: 'https://marisoncloud.com' },
];

const STALE_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const LOGO_BASE64 = '__LOGO_BASE64__';
const LABELS = { up: 'Beroperasi', degraded: 'Gangguan sebagian', down: 'Gangguan', unknown: 'Belum tersedia' };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function historyFor(rows, now) {
  const currentHour = Math.floor(now / 3600000);
  const buckets = new Map(rows.map((row) => [number(row.hour), row]));
  return Array.from({ length: 24 }, (_, index) => {
    const row = buckets.get(currentHour - 23 + index);
    if (!row) return 'unknown';
    if (number(row.down) > 0) return 'down';
    if (number(row.degraded) > 0) return 'degraded';
    return 'up';
  });
}

export function buildStatus({ recent = [], totals = [], hourly = [] }, now = Date.now()) {
  const services = SERVICES.map((service) => {
    const observations = recent.filter((row) => row.service === service.id)
      .sort((left, right) => number(right.checked_at) - number(left.checked_at));
    const latest = observations[0];
    const previous = observations[1];
    const age = latest ? now - number(latest.checked_at) : Infinity;
    let status = !latest || age < 0 || age > STALE_MS ? 'unknown' : latest.outcome;
    if (status === 'down' && (!previous || previous.outcome !== 'down')) status = 'degraded';
    if (!LABELS[status]) status = 'unknown';

    const total = totals.find((row) => row.service === service.id);
    const samples = number(total?.samples);
    const healthy = number(total?.healthy);
    const availability = samples >= 10 ? `${((healthy / samples) * 100).toFixed(1)}%` : 'Belum cukup data';
    const latency = status !== 'unknown' && latest?.latency_ms != null
      ? `${number(latest.latency_ms)} ms` : '—';
    const updated = status !== 'unknown'
      ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(number(latest.checked_at)) + ' WIB'
      : 'Menunggu pemeriksaan terbaru';

    return {
      ...service,
      status,
      label: LABELS[status],
      latency,
      updated,
      availability,
      samples,
      history: historyFor(hourly.filter((row) => row.service === service.id), now),
    };
  });

  const overall = services.some((service) => service.status === 'down') ? 'down'
    : services.some((service) => service.status === 'degraded') ? 'degraded'
      : services.some((service) => service.status === 'unknown') ? 'unknown' : 'up';
  const overallLabel = {
    up: 'Semua layanan beroperasi',
    degraded: 'Sebagian layanan perlu perhatian',
    down: 'Ada layanan yang terganggu',
    unknown: 'Status belum dapat dipastikan',
  }[overall];
  return { overall, overallLabel, services, generatedAt: now };
}

export async function loadStatus(db, now = Date.now()) {
  const [recent, totals, hourly] = await Promise.all([
    db.prepare(`SELECT service, checked_at, outcome, latency_ms, position FROM (
      SELECT service, checked_at, outcome, latency_ms,
        ROW_NUMBER() OVER (PARTITION BY service ORDER BY checked_at DESC) AS position
      FROM checks WHERE checked_at >= ?
    ) WHERE position <= 2`).bind(now - STALE_MS - 60000).all(),
    db.prepare(`SELECT service, COUNT(*) AS samples,
      SUM(CASE WHEN outcome = 'up' THEN 1 ELSE 0 END) AS healthy
      FROM checks WHERE checked_at >= ? GROUP BY service`).bind(now - WEEK_MS).all(),
    db.prepare(`SELECT service, CAST(checked_at / 3600000 AS INTEGER) AS hour,
      SUM(CASE WHEN outcome = 'down' THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN outcome = 'degraded' THEN 1 ELSE 0 END) AS degraded
      FROM checks WHERE checked_at >= ? GROUP BY service, hour`).bind(now - DAY_MS).all(),
  ]);
  return buildStatus({ recent: recent.results, totals: totals.results, hourly: hourly.results }, now);
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const CSS = String.raw`
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202c34;background:#f5f7f8}
*{box-sizing:border-box}body{margin:0}a{color:inherit}button{font:inherit}header{background:#fff;border-bottom:1px solid #dce3e6}
.shell{width:min(1120px,calc(100% - 48px));margin:auto}.top{height:84px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:18px}.brand img{width:118px;height:48px;object-fit:contain;object-position:left}.brand-mark{border-left:1px solid #dce3e6;padding-left:18px;font-size:15px;font-weight:700}
.top-link{font-size:13px;color:#355163;text-decoration:none}.top-link:hover{text-decoration:underline}main{padding:44px 0 80px}
.eyebrow{color:#39705b;font-size:12px;font-weight:700;text-transform:uppercase}.intro{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:32px}
h1{font-size:32px;line-height:1.22;margin:8px 0 9px;font-weight:720}p{margin:0}.subtitle{font-size:14px;color:#647582;line-height:1.55}
.refresh{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #cdd8dc;border-radius:5px;background:#fff;color:#254336;cursor:pointer;white-space:nowrap}
.refresh:hover{background:#edf6f1}.refresh:disabled{opacity:.6;cursor:wait}
.overview{display:flex;align-items:center;gap:16px;border:1px solid #cdded4;border-left:5px solid #269653;background:#f0f9f3;padding:20px 23px;margin-bottom:29px}
.overview[data-status="degraded"]{border-color:#e7d6ac;border-left-color:#c68310;background:#fff9e9}.overview[data-status="down"]{border-color:#e9c9c9;border-left-color:#cb4949;background:#fff3f3}
.overview[data-status="unknown"]{border-color:#d7dfe3;border-left-color:#788d98;background:#f8fafb}.overview-dot{width:13px;height:13px;border-radius:50%;background:#269653;flex:none;box-shadow:0 0 0 5px #d4efdb}
.overview[data-status="degraded"] .overview-dot{background:#c68310;box-shadow:0 0 0 5px #f8e9c1}.overview[data-status="down"] .overview-dot{background:#cb4949;box-shadow:0 0 0 5px #f9dddd}
.overview[data-status="unknown"] .overview-dot{background:#788d98;box-shadow:0 0 0 5px #e4eaed}.overview strong{display:block;font-size:17px}.overview small{display:block;color:#60717b;margin-top:4px;font-size:12px}
.section-heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}h2{font-size:18px;margin:0}.section-heading span{font-size:12px;color:#637681}
.service-list{list-style:none;margin:0;padding:0;border-top:1px solid #d7e0e3}.service{display:grid;grid-template-columns:minmax(190px,1.5fr) minmax(150px,1fr) minmax(165px,1fr) minmax(140px,1fr);gap:14px 18px;align-items:center;padding:23px 2px;border-bottom:1px solid #d7e0e3}
.service-name a{font-size:15px;font-weight:700;text-decoration:none}.service-name a:hover{text-decoration:underline}.domain{display:block;font-size:12px;color:#71818b;margin-top:4px;overflow-wrap:anywhere}
.metric-label{font-size:11px;text-transform:uppercase;color:#76858e;margin-bottom:5px}.metric-value{font-size:13px;font-weight:600}.status-value{display:flex;align-items:center;gap:8px}.status-dot{width:8px;height:8px;border-radius:50%;background:#288e4e;flex:none}
.service[data-status="degraded"] .status-dot{background:#c68310}.service[data-status="down"] .status-dot{background:#cb4949}.service[data-status="unknown"] .status-dot{background:#788d98}
.history-block{grid-column:1/-1;display:flex;align-items:center;gap:17px}.history{display:grid;grid-template-columns:repeat(24,minmax(0,1fr));gap:4px;flex:1}.bar{height:17px;background:#56af70;border-radius:2px}
.bar.degraded{background:#dfad4c}.bar.down{background:#de6969}.bar.unknown{background:#d9e1e5}.history-caption{font-size:11px;color:#71818b;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:16px;color:#6c7d86;font-size:11px}.legend-item{display:inline-flex;align-items:center;gap:7px}.legend .bar{width:12px;height:12px}
.note{border-top:1px solid #d7e0e3;padding-top:22px;margin-top:37px;color:#687982;font-size:12px;line-height:1.6}.note strong{color:#364c59}footer{margin-top:26px;color:#84939b;font-size:12px}
@media(max-width:760px){.shell{width:min(100% - 32px,1120px)}.top{height:72px}.brand img{width:90px;height:40px}.brand-mark{font-size:13px;padding-left:12px}.top-link{font-size:12px}main{padding-top:29px}.intro{align-items:start}h1{font-size:25px}.refresh{padding:9px}.refresh span{display:none}.service{grid-template-columns:1fr 1fr;gap:18px 12px;padding:20px 0}.service-name{grid-column:1/-1}.history-block{gap:9px}.history{gap:2px}.bar{height:14px}.history-caption{font-size:10px}.overview{padding:17px 16px}.overview strong{font-size:15px}}
@media(max-width:400px){.top-link{display:none}.service{grid-template-columns:1fr 1fr}.history-caption{display:none}}
`;

const APP_JS = String.raw`
const labels={up:'Beroperasi',degraded:'Gangguan sebagian',down:'Gangguan',unknown:'Belum tersedia'};
const button=document.querySelector('#refresh');
async function refresh(){
  button.disabled=true;
  try{
    const response=await fetch('/api/status',{cache:'no-store'});
    if(!response.ok)throw new Error('Status tidak tersedia');
    const data=await response.json();
    const overview=document.querySelector('#overview');
    overview.dataset.status=data.overall;
    document.querySelector('#overall-label').textContent=data.overallLabel;
    document.querySelector('#updated-at').textContent='Diperbarui '+new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(data.generatedAt)+' WIB';
    for(const service of data.services){
      const row=document.querySelector('[data-service="'+service.id+'"]');
      if(!row)continue;
      row.dataset.status=service.status;
      row.querySelector('[data-field="status"]').textContent=service.label;
      row.querySelector('[data-field="latency"]').textContent=service.latency;
      row.querySelector('[data-field="availability"]').textContent=service.availability;
      row.querySelector('[data-field="updated"]').textContent=service.updated;
      row.querySelectorAll('.history .bar').forEach((bar,index)=>{bar.className='bar '+service.history[index]});
    }
  }catch{
    const overview=document.querySelector('#overview');
    overview.dataset.status='unknown';
    document.querySelector('#overall-label').textContent='Status belum dapat dipastikan';
    document.querySelector('#updated-at').textContent='Gagal mengambil pembaruan terbaru';
    document.querySelectorAll('[data-service]').forEach(row=>{row.dataset.status='unknown';row.querySelector('[data-field="status"]').textContent=labels.unknown});
  }finally{button.disabled=false}
}
button.addEventListener('click',refresh);
setInterval(refresh,60000);
`;

function renderHtml(data) {
  const rows = data.services.map((service) => `<li class="service" data-service="${service.id}" data-status="${service.status}">
    <div class="service-name"><a href="${service.url}" target="_blank" rel="noopener noreferrer">${escape(service.name)}</a><span class="domain">${escape(service.domain)}</span></div>
    <div><div class="metric-label">Kondisi</div><div class="metric-value status-value"><span class="status-dot" aria-hidden="true"></span><span data-field="status">${escape(service.label)}</span></div></div>
    <div><div class="metric-label">Respons terakhir</div><div class="metric-value" data-field="latency">${escape(service.latency)}</div></div>
    <div><div class="metric-label">Tersedia 7 hari</div><div class="metric-value" data-field="availability">${escape(service.availability)}</div></div>
    <div class="history-block"><div class="history" aria-label="Riwayat kondisi 24 jam">${service.history.map((status) => `<span class="bar ${status}" title="${LABELS[status]}"></span>`).join('')}</div><span class="history-caption">24 jam terakhir</span></div>
    <span class="domain" data-field="updated">${escape(service.updated)}</span>
  </li>`).join('');
  const generated = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(data.generatedAt);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f7f8"><title>Status Layanan | Marison Cloud</title><meta name="description" content="Status ketersediaan layanan Marison Cloud."><link rel="icon" href="/logo.png"><style>${CSS}</style><script src="/app.js" defer></script></head>
  <body><header><div class="shell top"><div class="brand"><a href="https://marisoncloud.com" aria-label="Marison Cloud"><img src="/logo.png" alt="Marison"></a><span class="brand-mark">Status layanan</span></div><a class="top-link" href="https://marisoncloud.com">Kembali ke Marison Cloud →</a></div></header>
  <main class="shell"><div class="intro"><div><div class="eyebrow">Pemantauan publik</div><h1>Kondisi layanan Marison Cloud</h1><p class="subtitle">Diperiksa dari luar infrastruktur Marison setiap menit.</p></div><button class="refresh" id="refresh" type="button" aria-label="Perbarui status">↻ <span>Perbarui</span></button></div>
  <div class="overview" id="overview" data-status="${data.overall}" role="status" aria-live="polite"><span class="overview-dot" aria-hidden="true"></span><div><strong id="overall-label">${escape(data.overallLabel)}</strong><small id="updated-at">Diperbarui ${escape(generated)} WIB</small></div></div>
  <section aria-labelledby="services-title"><div class="section-heading"><h2 id="services-title">Layanan</h2><span>4 layanan dipantau</span></div><ul class="service-list">${rows}</ul><div class="legend"><span class="legend-item"><span class="bar"></span>Beroperasi</span><span class="legend-item"><span class="bar degraded"></span>Gangguan sebagian</span><span class="legend-item"><span class="bar down"></span>Gangguan</span><span class="legend-item"><span class="bar unknown"></span>Belum ada data</span></div></section>
  <div class="note"><strong>Tentang pemantauan.</strong> Halaman ini menguji akses publik dan kesiapan layanan. Angka ketersediaan dihitung dari pemeriksaan yang tersedia selama 7 hari, bukan jaminan SLA. Jika pemeriksaan berhenti lebih dari 3 menit, status ditampilkan belum tersedia.</div>
  <footer>Waktu ditampilkan dalam WIB (UTC+7).</footer></main></body></html>`;
}

const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: HEADERS });
    const path = new URL(request.url).pathname;
    if (path === '/logo.png') {
      const bytes = Uint8Array.from(atob(LOGO_BASE64), (character) => character.charCodeAt(0));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...HEADERS, 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    }
    if (path === '/app.js') return new Response(request.method === 'HEAD' ? null : APP_JS, { headers: { ...HEADERS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    if (path !== '/' && path !== '/api/status') return new Response('Not found', { status: 404, headers: HEADERS });
    let data;
    try {
      data = await loadStatus(env.DB);
    } catch {
      data = buildStatus({});
      if (path === '/api/status') return Response.json(data, { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
    }
    if (path === '/api/status') return Response.json(data, { headers: { ...HEADERS, 'cache-control': 'no-store' } });
    return new Response(request.method === 'HEAD' ? null : renderHtml(data), { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  },
};
