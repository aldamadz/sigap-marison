const SERVICES = [
  { id: 'drive', name: 'Maris Drive', domain: 'drive.marisoncloud.com', url: 'https://drive.marisoncloud.com' },
  { id: 'ai', name: 'AI Workspace', domain: 'ai.marisoncloud.com', url: 'https://ai.marisoncloud.com' },
  { id: 'sigap', name: 'SIGAP', domain: 'sigap.marisoncloud.com', url: 'https://sigap.marisoncloud.com' },
  { id: 'marison', name: 'Marison Cloud', domain: 'marisoncloud.com', url: 'https://marisoncloud.com' },
];

const STALE_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const LOGO_BASE64 = '__LOGO_BASE64__';
const LABELS = { up: 'Beroperasi', degraded: 'Gangguan sebagian', down: 'Gangguan', unknown: 'Belum tersedia' };
const PHASE_LABELS = { investigating: 'Investigasi', identified: 'Penyebab diketahui', monitoring: 'Pemantauan', resolved: 'Selesai' };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jakartaDay(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(timestamp);
}

function dateTime(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(timestamp) + ' WIB';
}

function serviceNames(raw) {
  try {
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids)].filter((id) => SERVICES.some((service) => service.id === id))
      .map((id) => SERVICES.find((service) => service.id === id).name);
  } catch { return []; }
}

function historyFor(rows, now) {
  const buckets = new Map(rows.map((row) => [row.day, row]));
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const day = jakartaDay(now - (HISTORY_DAYS - 1 - index) * DAY_MS);
    const row = buckets.get(day);
    const samples = number(row?.up_count) + number(row?.degraded_count) + number(row?.down_count);
    const status = !samples ? 'unknown' : number(row.down_count) ? 'down'
      : number(row.degraded_count) ? 'degraded' : 'up';
    return { day, status, samples };
  });
}

export function buildStatus({ recent = [], daily = [], incidents = [], updates = [], maintenance = [] }, now = Date.now()) {
  const incidentRows = incidents.map((incident) => {
    const timeline = updates.filter((update) => update.incident_id === incident.id)
      .sort((left, right) => number(left.created_at) - number(right.created_at));
    const phase = timeline.at(-1)?.phase || 'investigating';
    return {
      id: incident.id,
      title: incident.title,
      summary: incident.summary,
      severity: incident.severity,
      phase,
      phaseLabel: PHASE_LABELS[phase] || PHASE_LABELS.investigating,
      serviceNames: serviceNames(incident.service_ids),
      startedAt: number(incident.started_at),
      startedText: dateTime(number(incident.started_at)),
      timeline: [{ id: incident.id, phase: 'investigating', phaseLabel: PHASE_LABELS.investigating,
        message: incident.summary, at: number(incident.started_at), atText: dateTime(number(incident.started_at)) },
      ...timeline.map((update) => ({ id: update.id, phase: update.phase, phaseLabel: PHASE_LABELS[update.phase],
        message: update.message, at: number(update.created_at), atText: dateTime(number(update.created_at)) }))].reverse(),
    };
  }).sort((left, right) => Number(left.phase === 'resolved') - Number(right.phase === 'resolved') || right.startedAt - left.startedAt);
  const maintenanceRows = maintenance.filter((item) => !item.cancelled_at && number(item.ends_at) >= now)
    .map((item) => ({ id: item.id, title: item.title, description: item.description,
      serviceNames: serviceNames(item.service_ids), startsAt: number(item.starts_at),
      endsAt: number(item.ends_at), startsText: dateTime(number(item.starts_at)),
      endsText: dateTime(number(item.ends_at)), active: number(item.starts_at) <= now }))
    .sort((left, right) => left.startsAt - right.startsAt);
  const services = SERVICES.map((service) => {
    const observations = recent.filter((row) => row.service === service.id)
      .sort((left, right) => number(right.checked_at) - number(left.checked_at));
    const latest = observations[0];
    const previous = observations[1];
    const age = latest ? now - number(latest.checked_at) : Infinity;
    let status = !latest || age < 0 || age > STALE_MS ? 'unknown' : latest.outcome;
    if (status === 'down' && (!previous || previous.outcome !== 'down')) status = 'degraded';
    if (!LABELS[status]) status = 'unknown';

    const serviceDays = daily.filter((row) => row.service === service.id);
    const samples = serviceDays.reduce((sum, row) => sum + number(row.up_count) + number(row.degraded_count) + number(row.down_count), 0);
    const healthy = serviceDays.reduce((sum, row) => sum + number(row.up_count), 0);
    const availability = samples >= 10 ? `${((healthy / samples) * 100).toFixed(2)}%` : 'Belum cukup data';
    const firstAt = serviceDays.reduce((min, row) => Math.min(min, number(row.first_at)), Infinity);
    const expected = Number.isFinite(firstAt) ? Math.max(1, Math.ceil((now - Math.max(firstAt, now - HISTORY_DAYS * DAY_MS)) / 60000)) : 0;
    const coverage = samples >= 10 ? `${Math.min(100, (samples / expected) * 100).toFixed(1)}% cakupan` : 'Mengumpulkan sampel';
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
      coverage,
      samples,
      history: historyFor(serviceDays, now),
    };
  });

  const overall = services.some((service) => service.status === 'down') ? 'down'
    : services.some((service) => service.status === 'unknown') ? 'unknown'
      : services.some((service) => service.status === 'degraded') || incidentRows.some((incident) => incident.phase !== 'resolved') ? 'degraded' : 'up';
  const overallLabel = {
    up: 'Semua layanan beroperasi',
    degraded: 'Sebagian layanan perlu perhatian',
    down: 'Ada layanan yang terganggu',
    unknown: 'Status belum dapat dipastikan',
  }[overall];
  const timelineVersion = [
    ...incidentRows.map((incident) => `${incident.id}:${incident.timeline[0].id}`),
    ...maintenanceRows.map((item) => `${item.id}:${item.active}`),
  ].join('|');
  return { overall, overallLabel, services, incidents: incidentRows, maintenance: maintenanceRows, timelineVersion, generatedAt: now };
}

export async function loadStatus(db, now = Date.now()) {
  const [recent, daily, incidents, updates, maintenance] = await Promise.all([
    db.prepare(`SELECT service, checked_at, outcome, latency_ms, position FROM (
      SELECT service, checked_at, outcome, latency_ms,
        ROW_NUMBER() OVER (PARTITION BY service ORDER BY checked_at DESC) AS position
      FROM checks WHERE checked_at >= ?
    ) WHERE position <= 2`).bind(now - STALE_MS - 60000).all(),
    db.prepare(`SELECT service, day, up_count, degraded_count, down_count, first_at
      FROM daily_checks WHERE day >= ?`).bind(jakartaDay(now - (HISTORY_DAYS - 1) * DAY_MS)).all(),
    db.prepare(`SELECT id, title, summary, severity, service_ids, started_at
      FROM incidents WHERE started_at >= ? ORDER BY started_at DESC LIMIT 20`).bind(now - 90 * DAY_MS).all(),
    db.prepare(`SELECT id, incident_id, phase, message, created_at FROM incident_updates
      WHERE incident_id IN (SELECT id FROM incidents WHERE started_at >= ? ORDER BY started_at DESC LIMIT 20)
      ORDER BY created_at ASC LIMIT 200`).bind(now - 90 * DAY_MS).all(),
    db.prepare(`SELECT id, title, description, service_ids, starts_at, ends_at, cancelled_at
      FROM maintenance WHERE cancelled_at IS NULL AND ends_at >= ? AND starts_at <= ?
      ORDER BY starts_at ASC LIMIT 20`).bind(now, now + 30 * DAY_MS).all(),
  ]);
  return buildStatus({ recent: recent.results, daily: daily.results, incidents: incidents.results,
    updates: updates.results, maintenance: maintenance.results }, now);
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
.history-block{grid-column:1/-1;display:flex;align-items:center;gap:17px;min-width:0}.history{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:3px;flex:1;min-width:0}.bar{height:20px;background:#2abf72;border-radius:2px;border:0;padding:0}.history .bar{width:100%;cursor:pointer}.history .bar:focus-visible{outline:2px solid #275b78;outline-offset:2px}
.bar.degraded{background:#dfad4c}.bar.down{background:#de6969}.bar.unknown{background:#d9e1e5}.history-caption{font-size:11px;color:#71818b;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:16px;color:#6c7d86;font-size:11px}.legend-item{display:inline-flex;align-items:center;gap:7px}.legend .bar{width:12px;height:12px}
.coverage{display:block;color:#71818b;font-size:11px;font-weight:400;margin-top:3px}.sections{display:grid;grid-template-columns:1fr 1.4fr;gap:32px;margin-top:48px;align-items:start}
.status-section{border-top:2px solid #cbd9dc;padding-top:18px;min-width:0}.status-section h2{margin-bottom:17px}.empty{color:#73838c;font-size:13px;line-height:1.5;padding:17px 0}
.maintenance-list,.incident-list{list-style:none;padding:0;margin:0}.maintenance-item{border:1px solid #d6e0e3;background:#fff;border-radius:5px;padding:17px 18px;margin-bottom:11px}
.event-kicker{display:flex;align-items:center;gap:8px;color:#496376;font-size:11px;font-weight:700;text-transform:uppercase}.event-kicker .status-dot{background:#c68310}
.maintenance-item h3,.incident-item h3{font-size:15px;line-height:1.4;margin:8px 0}.event-meta{font-size:12px;color:#627781;line-height:1.6}.event-copy{font-size:13px;color:#40535d;line-height:1.6;margin:10px 0}
.incident-item{border:1px solid #d6e0e3;background:#fff;border-radius:5px;padding:19px;margin-bottom:13px}.incident-top{display:flex;align-items:start;justify-content:space-between;gap:10px}
.phase-badge{font-size:11px;font-weight:700;white-space:nowrap;padding:4px 8px;border-radius:3px;background:#fff1d4;color:#8d5800}.phase-badge.resolved{background:#e7f5eb;color:#218048}
.timeline{list-style:none;margin:18px 0 0;padding:0 0 0 18px;border-left:2px solid #dce5e8}.timeline li{position:relative;padding:0 0 18px 15px}.timeline li:last-child{padding-bottom:0}.timeline li::before{content:'';position:absolute;left:-23px;top:2px;width:8px;height:8px;background:#b0c1c8;border-radius:50%}.timeline li.resolved::before{background:#2abf72}.timeline li.identified::before{background:#d49222}.timeline li.monitoring::before{background:#4b9acd}
.timeline strong{font-size:12px}.timeline p{font-size:12px;line-height:1.55;color:#435762;margin:4px 0}.timeline time{font-size:11px;color:#778790}
.note{border-top:1px solid #d7e0e3;padding-top:22px;margin-top:37px;color:#687982;font-size:12px;line-height:1.6}.note strong{color:#364c59}footer{margin-top:26px;color:#84939b;font-size:12px}
@media(max-width:760px){.shell{width:min(100% - 32px,1120px)}.top{height:72px}.brand img{width:90px;height:40px}.brand-mark{font-size:13px;padding-left:12px}.top-link{font-size:12px}main{padding-top:29px}.intro{align-items:start}h1{font-size:25px}.refresh{padding:9px}.refresh span{display:none}.service{grid-template-columns:1fr 1fr;gap:18px 12px;padding:20px 0}.service-name{grid-column:1/-1}.history-block{gap:9px}.history{gap:2px}.bar{height:24px}.history-caption{font-size:10px}.overview{padding:17px 16px}.overview strong{font-size:15px}.sections{grid-template-columns:1fr;gap:34px;margin-top:38px}}
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
    if(data.timelineVersion!==document.body.dataset.timelineVersion){location.reload();return}
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
      row.querySelector('[data-field="coverage"]').textContent=service.coverage;
      row.querySelector('[data-field="updated"]').textContent=service.updated;
      row.querySelectorAll('.history .bar').forEach((bar,index)=>{
        const entry=service.history[index];
        bar.className='bar '+entry.status;
        bar.title=entry.day+': '+labels[entry.status]+' ('+entry.samples+' pemeriksaan)';
        bar.setAttribute('aria-label',bar.title);
      });
    }
  }catch{
    const overview=document.querySelector('#overview');
    overview.dataset.status='unknown';
    document.querySelector('#overall-label').textContent='Status belum dapat dipastikan';
    document.querySelector('#updated-at').textContent='Gagal mengambil pembaruan terbaru';
    document.querySelectorAll('[data-service]').forEach(row=>{
      row.dataset.status='unknown';
      row.querySelector('[data-field="status"]').textContent=labels.unknown;
      row.querySelector('[data-field="latency"]').textContent='—';
      row.querySelector('[data-field="availability"]').textContent='Belum tersedia';
      row.querySelector('[data-field="coverage"]').textContent='Pemeriksaan tertunda';
      row.querySelectorAll('.history .bar').forEach(bar=>{bar.className='bar unknown'});
    });
  }finally{button.disabled=false}
}
button.addEventListener('click',refresh);
document.querySelector('.service-list').addEventListener('click',event=>{
  const bar=event.target.closest('.history .bar');
  if(bar)bar.closest('.service').querySelector('[data-field="updated"]').textContent=bar.getAttribute('aria-label');
});
setInterval(refresh,60000);
`;

export function renderHtml(data) {
  const rows = data.services.map((service) => `<li class="service" data-service="${service.id}" data-status="${service.status}">
    <div class="service-name"><a href="${service.url}" target="_blank" rel="noopener noreferrer">${escape(service.name)}</a><span class="domain">${escape(service.domain)}</span></div>
    <div><div class="metric-label">Kondisi</div><div class="metric-value status-value"><span class="status-dot" aria-hidden="true"></span><span data-field="status">${escape(service.label)}</span></div></div>
    <div><div class="metric-label">Respons terakhir</div><div class="metric-value" data-field="latency">${escape(service.latency)}</div></div>
    <div><div class="metric-label">Uptime sampel 30 hari</div><div class="metric-value" data-field="availability">${escape(service.availability)}</div><span class="coverage" data-field="coverage">${escape(service.coverage)}</span></div>
    <div class="history-block"><div class="history" aria-label="Riwayat kondisi 30 hari">${service.history.map((entry) => `<button type="button" class="bar ${entry.status}" title="${escape(entry.day)}: ${LABELS[entry.status]} (${entry.samples} pemeriksaan)" aria-label="${escape(entry.day)}: ${LABELS[entry.status]} (${entry.samples} pemeriksaan)"></button>`).join('')}</div><span class="history-caption">30 hari terakhir</span></div>
    <span class="domain" data-field="updated">${escape(service.updated)}</span>
  </li>`).join('');
  const maintenanceItems = data.maintenance.map((item) => `<li class="maintenance-item">
    <div class="event-kicker"><span class="status-dot" aria-hidden="true"></span>${item.active ? 'Sedang berlangsung' : 'Terjadwal'}</div>
    <h3>${escape(item.title)}</h3><p class="event-meta">${escape(item.startsText)} – ${escape(item.endsText)}</p>
    <p class="event-copy">${escape(item.description)}</p><p class="event-meta">Layanan: ${escape(item.serviceNames.join(', '))}</p>
  </li>`).join('');
  const incidentItems = data.incidents.map((item) => `<li class="incident-item">
    <div class="incident-top"><div><div class="event-kicker"><span class="status-dot" aria-hidden="true"></span>${escape(item.serviceNames.join(', '))}</div>
    <h3>${escape(item.title)}</h3></div><span class="phase-badge ${item.phase === 'resolved' ? 'resolved' : ''}">${escape(item.phaseLabel)}</span></div>
    <p class="event-meta">${escape(item.startedText)}</p><p class="event-copy">${escape(item.summary)}</p>
    <ol class="timeline">${item.timeline.map((update) => `<li class="${escape(update.phase)}"><strong>${escape(update.phaseLabel)}</strong><p>${escape(update.message)}</p><time datetime="${new Date(update.at).toISOString()}">${escape(update.atText)}</time></li>`).join('')}</ol>
  </li>`).join('');
  const generated = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(data.generatedAt);
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f7f8"><title>Status Layanan | Marison Cloud</title><meta name="description" content="Status ketersediaan layanan Marison Cloud."><link rel="icon" href="/logo.png"><style>${CSS}</style><script src="/app.js?v=20261103-history" defer></script></head>
  <body data-timeline-version="${escape(data.timelineVersion)}"><header><div class="shell top"><div class="brand"><a href="https://marisoncloud.com" aria-label="Marison Cloud"><img src="/logo.png" alt="Marison"></a><span class="brand-mark">Status layanan</span></div><a class="top-link" href="https://marisoncloud.com">Kembali ke Marison Cloud →</a></div></header>
  <main class="shell"><div class="intro"><div><div class="eyebrow">Pemantauan publik</div><h1>Kondisi layanan Marison Cloud</h1><p class="subtitle">Diperiksa dari luar infrastruktur Marison setiap menit.</p></div><button class="refresh" id="refresh" type="button" aria-label="Perbarui status">↻ <span>Perbarui</span></button></div>
  <div class="overview" id="overview" data-status="${data.overall}" role="status" aria-live="polite"><span class="overview-dot" aria-hidden="true"></span><div><strong id="overall-label">${escape(data.overallLabel)}</strong><small id="updated-at">Diperbarui ${escape(generated)} WIB</small></div></div>
  <section aria-labelledby="services-title"><div class="section-heading"><h2 id="services-title">Layanan</h2><span>4 layanan dipantau</span></div><ul class="service-list">${rows}</ul><div class="legend"><span class="legend-item"><span class="bar"></span>Beroperasi</span><span class="legend-item"><span class="bar degraded"></span>Gangguan sebagian</span><span class="legend-item"><span class="bar down"></span>Gangguan</span><span class="legend-item"><span class="bar unknown"></span>Belum ada data</span></div></section>
  <div class="sections"><section class="status-section" aria-labelledby="maintenance-title"><h2 id="maintenance-title">Pemeliharaan terjadwal</h2>${maintenanceItems ? `<ul class="maintenance-list">${maintenanceItems}</ul>` : '<p class="empty">Tidak ada pemeliharaan yang dijadwalkan.</p>'}</section>
  <section class="status-section" aria-labelledby="incidents-title"><div class="section-heading"><h2 id="incidents-title">Riwayat insiden</h2><span>90 hari terakhir</span></div>${incidentItems ? `<ul class="incident-list">${incidentItems}</ul>` : '<p class="empty">Belum ada insiden yang tercatat.</p>'}</section></div>
  <div class="note"><strong>Tentang pemantauan.</strong> Pemeriksaan dilakukan dari luar server Marison setiap menit. Uptime dihitung dari sampel yang berhasil dikumpulkan dalam 30 hari; persentase cakupan menunjukkan kelengkapan pengukuran, bukan jaminan SLA. Jika pemeriksaan berhenti lebih dari 3 menit, status ditampilkan belum tersedia.</div>
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
    if (path === '/app.js') return new Response(request.method === 'HEAD' ? null : APP_JS, { headers: { ...HEADERS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
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
