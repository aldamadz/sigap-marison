import { TERMS } from './terms.mjs';
import { PRIVACY } from './privacy.mjs';
import { LANDING_LINKS_CSS, LANDING_LINKS_JS, enhanceLanding, renderLandingPreview } from './landing-links.mjs';
import { COMPONENTS, ALL_COMPONENTS, LEGACY_COMPONENTS } from './components.mjs';

const SERVICES = [...ALL_COMPONENTS, ...LEGACY_COMPONENTS];

const STALE_MS = 3 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const LOGO_BASE64 = '__LOGO_BASE64__';
const LABELS = { up: 'UP', down: 'DOWN', unknown: 'BELUM DIKETAHUI' };
const PHASE_LABELS = { investigating: 'Investigasi', identified: 'Penyebab diketahui', monitoring: 'Pemantauan', resolved: 'Selesai' };
const MAINTENANCE_LABELS = { completed: 'Selesai terpantau', cancelled: 'Dibatalkan',
  replaced: 'Jadwal diganti', unknown: 'Jadwal ditutup', elapsed: 'Periode berakhir' };
const OBSERVATION_LABELS = { process_down: 'Proses layanan tidak berjalan.', dependency_failed: 'Layanan belum siap merespons.',
  queue_stalled: 'Progres pekerjaan melewati batas pemeriksaan.', check_unavailable: 'Kondisi layanan belum dapat diperiksa.',
  disabled: 'Layanan dinonaktifkan melalui konfigurasi.' };

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
    const ratio = samples ? number(row.up_count) / samples : null;
    const status = ratio === null || (number(row?.unknown_count) > 0 && ratio === 1) ? 'unknown' : ratio === 1 ? 'up'
      : ratio >= 0.99 ? 'degraded' : ratio >= 0.95 ? 'partial' : 'down';
    const availability = ratio === null ? null : (ratio * 100).toFixed(2) + '%';
    const label = ratio === null ? 'Belum ada data'
      : `${availability} sampel sehat (${samples} pemeriksaan)${number(row?.unknown_count) ? `; ${number(row.unknown_count)} pemeriksaan belum diketahui` : ''}`;
    return { day, status, samples, availability, label };
  });
}

export function buildStatus({ recent = [], daily = [], incidents = [], updates = [], maintenance = [], sources = [] }, now = Date.now()) {
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
  const sigapSync = sources.find((source) => source.source === 'sigap');
  const maintenanceRows = maintenance.filter((item) => (!item.lifecycle_status || item.lifecycle_status === 'published') && !item.cancelled_at &&
      (number(item.ends_at) >= now || (item.source === 'sigap' && item.impact === 'full' && number(item.starts_at) <= now)))
    .map((item) => ({ id: item.id, title: item.title, description: item.description,
      serviceNames: serviceNames(item.service_ids), startsAt: number(item.starts_at),
      endsAt: number(item.ends_at), startsText: dateTime(number(item.starts_at)),
      endsText: dateTime(number(item.ends_at)), active: number(item.starts_at) <= now,
      overdue: item.source === 'sigap' && item.impact === 'full' && number(item.ends_at) < now,
      syncStale: item.source === 'sigap' && (!sigapSync || now - number(sigapSync.synced_at) > STALE_MS) }))
    .sort((left, right) => left.startsAt - right.startsAt);
  const maintenanceHistory = maintenance.filter((item) => (item.lifecycle_status && item.lifecycle_status !== 'published')
      || item.cancelled_at || (number(item.ends_at) < now && !(item.source === 'sigap' && item.impact === 'full')))
    .map((item) => {
      const status = item.lifecycle_status && item.lifecycle_status !== 'published' ? item.lifecycle_status
        : item.cancelled_at ? (item.source === 'sigap' ? 'unknown' : 'cancelled') : 'elapsed';
      const closed = number(item.closed_at || item.cancelled_at || item.ends_at);
      const started = number(item.starts_at);
      return { id: item.id, kind: 'maintenance', title: item.title, summary: item.description,
        phase: 'resolved', phaseLabel: MAINTENANCE_LABELS[status], maintenanceStatus: status,
        serviceNames: serviceNames(item.service_ids), startedAt: started, startedText: dateTime(started),
        timeline: [
          { phase: 'resolved', phaseLabel: MAINTENANCE_LABELS[status], at: closed, atText: dateTime(closed),
            message: status === 'completed' ? 'Pemeliharaan telah ditandai selesai. Waktu ini adalah waktu penutupan terpantau pada halaman status.'
              : status === 'cancelled' ? 'Pemeliharaan dibatalkan oleh pengelola layanan.'
                : status === 'replaced' ? 'Sumber SIGAP telah mengganti jadwal ini dengan jadwal lain.'
                  : status === 'elapsed' ? 'Periode gangguan terjadwal berakhir sesuai estimasi; bukan konfirmasi waktu pengerjaan aktual.'
                    : 'Jadwal telah ditutup. Status selesai atau dibatalkan tidak tersedia pada catatan lama.' },
          ...(started <= now && closed >= started ? [{ phase: 'monitoring', phaseLabel: 'Waktu mulai terjadwal',
            message: item.impact === 'full' ? 'Pemeliharaan dengan penghentian sementara akses layanan.' : 'Potensi gangguan akses tanpa penghentian penuh.',
            at: started, atText: dateTime(started) }] : []),
          { phase: 'identified', phaseLabel: 'Jadwal tercatat', message: `${item.description}\nEstimasi selesai: ${dateTime(number(item.ends_at))}`,
            at: number(item.created_at || item.starts_at), atText: dateTime(number(item.created_at || item.starts_at)) },
        ] };
    });
  const history = [...incidentRows.map(item => ({ ...item, kind: 'incident' })), ...maintenanceHistory]
    .sort((left, right) => Number(left.phase === 'resolved') - Number(right.phase === 'resolved') || right.startedAt - left.startedAt);
  const componentStatus = (service) => {
    const observations = recent.filter((row) => row.service === service.id)
      .sort((left, right) => number(right.checked_at) - number(left.checked_at));
    const latest = observations[0];
    const age = latest ? now - number(latest.checked_at) : Infinity;
    let status = !latest || age < 0 || age > STALE_MS ? 'unknown' : latest.outcome;
    if (status === 'degraded') status = 'down';
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
      note: status === 'unknown' && age > STALE_MS ? 'Menunggu laporan kesehatan terbaru.' : OBSERVATION_LABELS[latest?.reason] || '',
      history: historyFor(serviceDays, now),
      ...(service.children ? { children: service.children.map(componentStatus) } : {}),
    };
  };
  const services = COMPONENTS.map(componentStatus);
  // A stale child can never be hidden behind a fresh aggregate observation.
  const group = services.find(service => service.children);
  const groupStatus = group.children.some(child => child.status === 'down') ? 'down'
    : group.children.some(child => child.status === 'unknown') ? 'unknown' : group.status;
  group.status = groupStatus; group.label = LABELS[groupStatus];
  if (groupStatus === 'unknown') { group.latency = '—'; group.updated = 'Menunggu laporan kesehatan terbaru'; }

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
    ...maintenanceRows.map((item) => `${item.id}:${item.startsAt}:${item.endsAt}:${item.description}:${item.active}:${item.syncStale}`),
    ...maintenanceHistory.map(item => `${item.id}:${item.maintenanceStatus}:${item.timeline[0].at}:${item.summary}`),
  ].join('|');
  return { overall, overallLabel, services, incidents: incidentRows, history, maintenance: maintenanceRows, timelineVersion, generatedAt: now };
}

export async function loadStatus(db, now = Date.now()) {
  const [recent, daily, incidents, updates, maintenance, sources] = await Promise.all([
    db.prepare(`SELECT service, checked_at, outcome, latency_ms, reason, position FROM (
      SELECT service, checked_at, outcome, latency_ms, reason,
        ROW_NUMBER() OVER (PARTITION BY service ORDER BY checked_at DESC) AS position
      FROM (SELECT service,checked_at,outcome,latency_ms,reason FROM checks WHERE service='sigap'
        UNION ALL SELECT service,checked_at,outcome,latency_ms,reason FROM component_checks) WHERE checked_at >= ?
    ) WHERE position <= 2`).bind(now - STALE_MS - 60000).all(),
    db.prepare(`SELECT service, day, up_count, degraded_count, down_count, unknown_count, first_at
      FROM (SELECT service,day,up_count,degraded_count,down_count,0 AS unknown_count,first_at FROM daily_checks WHERE service='sigap'
        UNION ALL SELECT service,day,up_count,degraded_count,down_count,unknown_count,first_at FROM component_daily_checks)
      WHERE day >= ?`).bind(jakartaDay(now - (HISTORY_DAYS - 1) * DAY_MS)).all(),
    db.prepare(`SELECT id, title, summary, severity, service_ids, started_at
      FROM incidents WHERE started_at >= ? ORDER BY started_at DESC LIMIT 20`).bind(now - 90 * DAY_MS).all(),
    db.prepare(`SELECT id, incident_id, phase, message, created_at FROM incident_updates
      WHERE incident_id IN (SELECT id FROM incidents WHERE started_at >= ? ORDER BY started_at DESC LIMIT 20)
      ORDER BY created_at ASC LIMIT 200`).bind(now - 90 * DAY_MS).all(),
    db.prepare(`SELECT id, title, description, service_ids, starts_at, ends_at, cancelled_at, source, impact,
        created_at, lifecycle_status, closed_at FROM maintenance
      WHERE starts_at <= ? AND (ends_at >= ? OR closed_at >= ?
        OR (source='sigap' AND impact='full' AND lifecycle_status='published' AND cancelled_at IS NULL))
      ORDER BY CASE WHEN lifecycle_status='published' AND cancelled_at IS NULL AND
        (ends_at >= ? OR (source='sigap' AND impact='full')) THEN 0 ELSE 1 END,
        starts_at DESC LIMIT 60`).bind(now + 30 * DAY_MS, now - 90 * DAY_MS, now - 90 * DAY_MS, now).all(),
    db.prepare('SELECT source, revision, synced_at FROM status_sources').all(),
  ]);
  return buildStatus({ recent: recent.results, daily: daily.results, incidents: incidents.results,
    updates: updates.results, maintenance: maintenance.results, sources: sources.results }, now);
}

export async function loadFeed(db, now = Date.now()) {
  const since = now - 90 * DAY_MS;
  const [incidents, updates, maintenance, changes] = await Promise.all([
    db.prepare('SELECT id,title,summary,started_at FROM incidents WHERE started_at>=? ORDER BY started_at DESC LIMIT 40').bind(since).all(),
    db.prepare(`SELECT u.id,u.phase,u.message,u.created_at,i.title FROM incident_updates u
      JOIN incidents i ON i.id=u.incident_id WHERE u.created_at>=?
      ORDER BY u.created_at DESC LIMIT 80`).bind(since).all(),
    db.prepare(`SELECT id,title,description,starts_at,ends_at,created_at,cancelled_at,closed_at,lifecycle_status FROM maintenance
      WHERE created_at>=? OR cancelled_at>=? OR closed_at>=? OR ends_at>=?
      ORDER BY created_at DESC LIMIT 40`).bind(since, since, since, now).all(),
    db.prepare(`SELECT service,slot,checked_at,condition FROM (
      SELECT service,slot,checked_at,CASE WHEN outcome='up' THEN 'UP' WHEN outcome IN ('down','degraded') THEN 'DOWN' END AS condition,
      LAG(CASE WHEN outcome='up' THEN 'UP' WHEN outcome IN ('down','degraded') THEN 'DOWN' END) OVER (PARTITION BY service ORDER BY slot) AS previous,
      LAG(checked_at) OVER (PARTITION BY service ORDER BY slot) AS previous_at
      FROM (SELECT service,slot,checked_at,outcome FROM checks WHERE service='sigap'
        UNION ALL SELECT service,slot,checked_at,outcome FROM component_checks) WHERE checked_at>=?
    ) WHERE previous IS NOT NULL AND condition<>previous AND checked_at-previous_at<=180000
      ORDER BY checked_at DESC LIMIT 40`).bind(now - DAY_MS).all(),
  ]);
  const events = [
    ...incidents.results.map((item) => ({ id: `incident:${item.id}`, title: `Investigasi: ${item.title}`,
      description: item.summary, at: number(item.started_at), section: 'incidents-title' })),
    ...updates.results.map((item) => ({ id: `update:${item.id}`, title: `${PHASE_LABELS[item.phase]}: ${item.title}`,
      description: item.message, at: number(item.created_at), section: 'incidents-title' })),
    ...maintenance.results.flatMap((item) => [
      { id: `maintenance:${item.id}`, title: `Terjadwal: ${item.title}`,
        description: `${item.description}\nMulai: ${dateTime(number(item.starts_at))}\nEstimasi selesai: ${dateTime(number(item.ends_at))}`,
        at: number(item.created_at), section: 'maintenance-title' },
      ...(item.closed_at || item.cancelled_at ? [{ id: `maintenance-closed:${item.id}:${item.closed_at || item.cancelled_at}`,
        title: `${MAINTENANCE_LABELS[item.lifecycle_status] || 'Jadwal ditutup'}: ${item.title}`,
        description: `${item.description}\nStatus: ${MAINTENANCE_LABELS[item.lifecycle_status] || 'Jadwal ditutup'}. Waktu penutupan terpantau pada halaman status.`,
        at: number(item.closed_at || item.cancelled_at), section: 'incidents-title' }] : []),
    ]),
    ...changes.results.filter((item) => ALL_COMPONENTS.some((service) => service.id === item.service)).map((item) => ({
      id: `probe:${item.service}:${item.slot}`, title: `${SERVICES.find((service) => service.id === item.service).name}: ${item.condition}`,
      description: `Hasil pemeriksaan publik berubah menjadi ${item.condition}. Ini hasil probe, bukan konfirmasi penyebab gangguan.`,
      at: number(item.checked_at), section: 'services-title',
    })),
  ];
  return events.filter((event) => event.at <= now).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, 80);
}

function xml(value) {
  return escape(String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[\uD800-\uDFFF]/gu, ''));
}

export function renderRss(events, origin = 'https://status.marisoncloud.com', now = Date.now()) {
const items = events.map((event) => `<item><title>${xml(event.title)}</title><link>${origin}/#${event.section}</link><guid isPermaLink="false">${xml(event.id)}</guid><pubDate>${new Date(event.at).toUTCString()}</pubDate><description>${xml(escape(event.description))}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Status Layanan Marison Cloud</title><link>${origin}/</link><description>Kabar kondisi layanan, insiden, dan maintenance Marison Cloud.</description><language>id</language><ttl>1</ttl><lastBuildDate>${new Date(events[0]?.at ?? now).toUTCString()}</lastBuildDate><atom:link href="${origin}/rss.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
}

export function renderAtom(events, origin = 'https://status.marisoncloud.com', now = Date.now()) {
  const entries = events.map((event) => `<entry><id>${origin}/events/${encodeURIComponent(event.id)}</id><title type="text">${xml(event.title)}</title><updated>${new Date(event.at).toISOString()}</updated><link href="${origin}/#${event.section}"/><summary type="text">${xml(event.description)}</summary></entry>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xml:lang="id"><id>${origin}/</id><title>Status Layanan Marison Cloud</title><updated>${new Date(events[0]?.at ?? now).toISOString()}</updated><author><name>Tim IT Marison</name></author><link rel="self" type="application/atom+xml" href="${origin}/feed.atom"/><link rel="alternate" href="${origin}/"/>${entries}</feed>`;
}

// Lucide icons (ISC); see LUCIDE_LICENSE.txt.
const ICONS = {
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  rss: '<path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  close: '<path d="M18 6 6 18m0-12 12 12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};
const icon = (name) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const themeSwitch = () => `<div class="theme-switch" role="group" aria-label="Tema tampilan">${[['light','sun','Terang'],['dark','moon','Gelap'],['system','monitor','Sistem']].map(([value,name,label]) => `<button class="icon-button" type="button" data-set-theme="${value}" aria-label="Tema ${label.toLowerCase()}" title="${label}" aria-pressed="false">${icon(name)}</button>`).join('')}</div>`;

export const THEME_JS = String.raw`(()=>{
  const key='marison-status-theme';
  const valid=value=>['light','dark','system'].includes(value);
  let choice='system';
  try{const saved=localStorage.getItem(key);if(valid(saved))choice=saved}catch{}
  const media=matchMedia('(prefers-color-scheme: dark)');
  const apply=()=>{
    const theme=choice==='system'?(media.matches?'dark':'light'):choice;
    document.documentElement.dataset.theme=theme;
    document.documentElement.dataset.themeChoice=choice;
    document.querySelectorAll('[data-set-theme]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.setTheme===choice)));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#15171c':'#f5f7f8');
  };
  apply();
  document.addEventListener('DOMContentLoaded',apply);
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-set-theme]');
    if(!button||!valid(button.dataset.setTheme))return;
    choice=button.dataset.setTheme;
    try{localStorage.setItem(key,choice)}catch{}
    apply();
  });
  media.addEventListener('change',()=>{if(choice==='system')apply()});
  window.addEventListener('storage',event=>{if(event.key===key){choice=valid(event.newValue)?event.newValue:'system';apply()}});
})();`;

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
.preview-banner{background:#fff4d8;border-bottom:1px solid #dfc885;color:#694b16;font-size:12px;padding:8px 24px;text-align:center}
.intro-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}.rss-link{font-size:13px;font-weight:600;color:#966215;text-decoration:none;padding:10px 4px}.rss-link:hover{text-decoration:underline}.rss-link:focus-visible{outline:2px solid #966215;outline-offset:2px}
.subscribe-trigger{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;cursor:pointer}.subscribe-dialog{width:min(540px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow:auto;margin:auto;padding:24px;border:1px solid #cdd8dc;border-radius:8px;background:#fff;color:#202c34;box-shadow:0 20px 65px #142b3033}.subscribe-dialog::backdrop{background:#101b2866}.subscribe-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}.subscribe-heading h2{font-size:18px}.icon-button{display:grid;place-items:center;width:40px;height:40px;padding:0;border:0;border-radius:4px;background:transparent;color:#65757f;cursor:pointer;flex-shrink:0}.icon-button:hover{background:#edf3f0;color:#254336}.icon-button:focus-visible{outline:2px solid #269653;outline-offset:2px}.feed-section{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;border-bottom:1px solid #dce3e6;padding-bottom:12px;margin-bottom:20px}.feed-label{display:block;font-size:13px;font-weight:600;margin:20px 0 9px}.feed-field{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;border:1px solid #ccd7dc;border-radius:5px;background:#f7f9fa;padding:3px 4px 3px 12px}.feed-field input{width:100%;min-width:0;padding:8px 0;border:0;outline:0;background:transparent;color:#354653;font-size:13px;font-family:inherit}.feed-field:focus-within{outline:2px solid #269653;outline-offset:2px}.copy-feedback{min-height:20px;margin-top:12px;font-size:12px;color:#287346}.subscribe-dialog:focus{outline:none}@media(max-width:760px){.intro{flex-wrap:wrap}.subscribe-dialog{padding:20px}.intro-actions{flex-wrap:wrap}}
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
.service[data-status="up"]>div .status-dot{background:#288e4e}.service[data-status="degraded"]>div .status-dot{background:#c68310}.service[data-status="down"]>div .status-dot{background:#cb4949}.service[data-status="unknown"]>div .status-dot{background:#788d98}
.history-block{grid-column:1/-1;display:flex;align-items:center;gap:17px;min-width:0}.history{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:3px;flex:1;min-width:0}.bar{height:20px;background:#2abf72;border-radius:2px;border:0;padding:0}.history .bar{width:100%;cursor:pointer}.history .bar:focus-visible{outline:2px solid #275b78;outline-offset:2px}
.bar.degraded{background:#e9c341}.bar.partial{background:#e58a35}.bar.down{background:#de6969}.bar.unknown{background:#d9e1e5}.history-caption{font-size:11px;color:#71818b;white-space:nowrap}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:16px;color:#6c7d86;font-size:11px}.legend-item{display:inline-flex;align-items:center;gap:7px}.legend .bar{width:12px;height:12px}
.coverage{display:block;color:#71818b;font-size:11px;font-weight:400;margin-top:3px}.sections{display:grid;grid-template-columns:1fr 1.4fr;gap:32px;margin-top:48px;align-items:start}
.status-section{border-top:2px solid #cbd9dc;padding-top:18px;min-width:0}.status-section h2{margin-bottom:17px}.empty{color:#73838c;font-size:13px;line-height:1.5;padding:17px 0}
.maintenance-list,.incident-list{list-style:none;padding:0;margin:0}.maintenance-item{border:1px solid #d6e0e3;background:#fff;border-radius:5px;padding:17px 18px;margin-bottom:11px}
.event-kicker{display:flex;align-items:center;gap:8px;color:#496376;font-size:11px;font-weight:700;text-transform:uppercase}.event-kicker .status-dot{background:#c68310}
.maintenance-item h3,.incident-item h3{font-size:15px;line-height:1.4;margin:8px 0}.event-meta{font-size:12px;color:#627781;line-height:1.6}.event-copy{font-size:13px;color:#40535d;line-height:1.6;margin:10px 0}
.event-warning{font-size:12px;color:#9a6113;line-height:1.5;margin-top:8px}
.incident-item{border:1px solid #d6e0e3;background:#fff;border-radius:5px;padding:19px;margin-bottom:13px}.incident-top{display:flex;align-items:start;justify-content:space-between;gap:10px}
.phase-badge{font-size:11px;font-weight:700;white-space:nowrap;padding:4px 8px;border-radius:3px;background:#fff1d4;color:#8d5800}.phase-badge.resolved{background:#e7f5eb;color:#218048}
.timeline{list-style:none;margin:18px 0 0;padding:0 0 0 18px;border-left:2px solid #dce5e8}.timeline li{position:relative;padding:0 0 18px 15px}.timeline li:last-child{padding-bottom:0}.timeline li::before{content:'';position:absolute;left:-23px;top:2px;width:8px;height:8px;background:#b0c1c8;border-radius:50%}.timeline li.resolved::before{background:#2abf72}.timeline li.identified::before{background:#d49222}.timeline li.monitoring::before{background:#4b9acd}
.timeline strong{font-size:12px}.timeline p{font-size:12px;line-height:1.55;color:#435762;margin:4px 0}.timeline time{font-size:11px;color:#778790}
.note{border-top:1px solid #d7e0e3;padding-top:22px;margin-top:37px;color:#687982;font-size:12px;line-height:1.6}.note strong{color:#364c59}footer{margin-top:26px;color:#84939b;font-size:12px}
@media(max-width:760px){.shell{width:min(100% - 32px,1120px)}.top{height:72px}.brand img{width:90px;height:40px}.brand-mark{font-size:13px;padding-left:12px}.top-link{font-size:12px}main{padding-top:29px}.intro{align-items:start}h1{font-size:25px}.refresh{padding:9px}.refresh span{display:none}.service{grid-template-columns:1fr 1fr;gap:18px 12px;padding:20px 0}.service-name{grid-column:1/-1}.history-block{gap:9px}.history{gap:2px}.bar{height:24px}.history-caption{font-size:10px}.overview{padding:17px 16px}.overview strong{font-size:15px}.sections{grid-template-columns:1fr;gap:34px;margin-top:38px}}
@media(max-width:400px){.top-link{display:none}.service{grid-template-columns:1fr 1fr}.history-caption{display:none}}
.theme-switch{display:flex;align-items:center;border:1px solid #cdd8dc;border-radius:5px;padding:2px;gap:2px}.theme-switch .icon-button{width:34px;height:34px}.theme-switch [aria-pressed="true"]{background:#e0efe5;color:#216b3c}.header-actions{display:flex;align-items:center;gap:18px}.legal-links{display:flex;flex-wrap:wrap;gap:16px}.page-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px}.legal-links a{text-decoration:none}.legal-links a:hover{text-decoration:underline}
:root[data-theme="dark"]{color-scheme:dark;color:#e7eaf0;background:#15171c}
[data-theme="dark"] header,[data-theme="dark"] .subscribe-dialog,[data-theme="dark"] .maintenance-item,[data-theme="dark"] .incident-item{background:#1e2128;color:#e7eaf0;border-color:#343941}
[data-theme="dark"] .brand-mark,[data-theme="dark"] .feed-section,[data-theme="dark"] .service,[data-theme="dark"] .service-list,[data-theme="dark"] .status-section,[data-theme="dark"] .timeline,[data-theme="dark"] .note,[data-theme="dark"] .theme-switch{border-color:#3d444f}
[data-theme="dark"] .subtitle,[data-theme="dark"] .domain,[data-theme="dark"] .metric-label,[data-theme="dark"] .section-heading span,[data-theme="dark"] .history-caption,[data-theme="dark"] .legend,[data-theme="dark"] .coverage,[data-theme="dark"] .empty,[data-theme="dark"] .event-meta,[data-theme="dark"] .timeline time,[data-theme="dark"] .note,[data-theme="dark"] footer,[data-theme="dark"] .overview small{color:#aab4c0}
[data-theme="dark"] .top-link,[data-theme="dark"] .event-copy,[data-theme="dark"] .timeline p,[data-theme="dark"] .event-kicker,[data-theme="dark"] .note strong,[data-theme="dark"] .feed-field input{color:#d3dce7}
[data-theme="dark"] .refresh,[data-theme="dark"] .feed-field{background:#171a20;color:#d3dce7;border-color:#47515d}
[data-theme="dark"] .refresh:hover,[data-theme="dark"] .icon-button:hover{background:#303840;color:#e7eaf0}
[data-theme="dark"] .theme-switch [aria-pressed="true"]{background:#284437;color:#b9f0ce}
[data-theme="dark"] .icon-button{color:#b2bfcb}[data-theme="dark"] .eyebrow,[data-theme="dark"] .copy-feedback{color:#83d8a5}[data-theme="dark"] .rss-link,[data-theme="dark"] .event-warning{color:#f1c66f}
[data-theme="dark"] .overview{background:#172e23;border-color:#345c45;border-left-color:#42bc75}[data-theme="dark"] .overview-dot{background:#42bc75;box-shadow:0 0 0 5px #254b34}
[data-theme="dark"] .overview[data-status="degraded"]{background:#332b19;border-color:#77602c;border-left-color:#e3b747}[data-theme="dark"] .overview[data-status="degraded"] .overview-dot{background:#e3b747;box-shadow:0 0 0 5px #57451d}
[data-theme="dark"] .overview[data-status="down"]{background:#361e24;border-color:#76404a;border-left-color:#ee7d87}[data-theme="dark"] .overview[data-status="down"] .overview-dot{background:#ee7d87;box-shadow:0 0 0 5px #582f38}
[data-theme="dark"] .overview[data-status="unknown"]{background:#23262f;border-color:#515b69;border-left-color:#a5b2c2}[data-theme="dark"] .overview[data-status="unknown"] .overview-dot{background:#a5b2c2;box-shadow:0 0 0 5px #39404b}
[data-theme="dark"] .bar.unknown{background:#3d444f}[data-theme="dark"] .status-dot{background:#59c88b}[data-theme="dark"] .service[data-status="up"]>div .status-dot{background:#59c88b}[data-theme="dark"] .service[data-status="down"]>div .status-dot{background:#ee7d87}[data-theme="dark"] .service[data-status="unknown"]>div .status-dot{background:#a5b2c2}
[data-theme="dark"] .phase-badge{background:#42351e;color:#f1c66f}[data-theme="dark"] .phase-badge.resolved{background:#254434;color:#9ce2b6}[data-theme="dark"] .subscribe-dialog::backdrop{background:#0009}
@media(max-width:760px){.header-actions{gap:10px}.header-actions .top-link{display:none}.theme-switch .icon-button{width:30px;height:34px}.brand{gap:8px}.brand-mark{padding-left:8px}}
.legal-main{max-width:850px}.legal-main h1{margin:15px 0}.legal-meta{font-size:13px;color:#647582;margin-bottom:30px}.legal-toc{display:flex;flex-wrap:wrap;gap:10px 18px;padding:20px 0;border-block:1px solid #d7e0e3;margin-bottom:30px}.legal-toc a{font-size:13px;color:#39705b}.legal-section{padding:22px 0;border-bottom:1px solid #d7e0e3;scroll-margin-top:20px}.legal-section h2{margin-bottom:14px}.legal-section p{font-size:14px;line-height:1.8;margin:10px 0;color:#40535d}.legal-history{margin-top:30px}.legal-history li{font-size:13px;line-height:1.8;color:#647582}[data-theme="dark"] .legal-meta,[data-theme="dark"] .legal-history li{color:#aab4c0}[data-theme="dark"] .legal-section p{color:#d3dce7}[data-theme="dark"] .legal-toc,[data-theme="dark"] .legal-section{border-color:#3d444f}[data-theme="dark"] .legal-toc a{color:#83d8a5}
.service-details{grid-column:1/-1;width:100%;min-width:0}.service-details summary{display:flex;align-items:center;gap:9px;width:fit-content;max-width:100%;padding:9px 12px;cursor:pointer;border:1px solid #b9cbd0;border-radius:5px;font-size:13px;font-weight:600;list-style:none}.service-details summary::-webkit-details-marker{display:none}.service-details summary:focus-visible{outline:2px solid #27834b;outline-offset:3px}.service-details[open]>summary svg{transform:rotate(180deg)}.service-children{list-style:none;margin:16px 0 0;padding:0 0 0 20px;border-left:2px solid #c4d6ce}.service-children>.service:last-child{border-bottom:0}.service-name>strong{font-size:15px}.service-status-note{grid-column:1/-1;font-size:12px;color:#687982;line-height:1.5;margin:0}.service-children .service-name{min-width:0;overflow-wrap:anywhere}[data-theme="dark"] .service-details summary{border-color:#596b69}[data-theme="dark"] .service-children{border-color:#486052}[data-theme="dark"] .service-status-note{color:#aab4c0}@media(max-width:760px){.service-children{padding-left:12px}}
`;

const APP_JS = String.raw`
const labels={up:'UP',down:'DOWN',unknown:'BELUM DIKETAHUI'};
const button=document.querySelector('#refresh');
const subscribeDialog=document.querySelector('#subscribe-dialog');
document.querySelector('#subscribe').addEventListener('click',()=>subscribeDialog.showModal());
document.querySelector('#close-subscribe').addEventListener('click',()=>subscribeDialog.close());
subscribeDialog.addEventListener('click',event=>{
  if(event.target!==subscribeDialog)return;
  const rect=subscribeDialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)subscribeDialog.close();
});
subscribeDialog.addEventListener('close',()=>{document.querySelector('#copy-feedback').textContent=''});
subscribeDialog.querySelectorAll('[data-copy]').forEach(copyButton=>copyButton.addEventListener('click',async()=>{
  const input=document.getElementById(copyButton.dataset.copy);
  copyButton.disabled=true;
  try{
    await navigator.clipboard.writeText(input.value);
    document.querySelector('#copy-feedback').textContent='Tautan '+copyButton.dataset.format+' disalin.';
  }catch{
    input.focus();input.select();
    document.querySelector('#copy-feedback').textContent='Salin otomatis tidak tersedia. Tautan sudah dipilih.';
  }finally{copyButton.disabled=false}
}));
async function refresh(){
  button.disabled=true;
  try{
    const response=await fetch('/api/status',{cache:'no-store'});
    if(!response.ok)throw new Error('Status tidak tersedia');
    const data=await response.json();
    if(data.timelineVersion!==document.body.dataset.timelineVersion){if(!subscribeDialog.open)location.reload();return}
    const overview=document.querySelector('#overview');
    overview.dataset.status=data.overall;
    document.querySelector('#overall-label').textContent=data.overallLabel;
    document.querySelector('#updated-at').textContent='Diperbarui '+new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(data.generatedAt)+' WIB';
    for(const service of data.services.flatMap(item=>[item,...(item.children||[])])){
      const row=document.querySelector('[data-service="'+service.id+'"]');
      if(!row)continue;
      row.dataset.status=service.status;
      row.querySelector('[data-field="status"]').textContent=service.label;
      row.querySelector('[data-field="latency"]').textContent=service.latency;
      row.querySelector('[data-field="availability"]').textContent=service.availability;
      row.querySelector('[data-field="coverage"]').textContent=service.coverage;
      row.querySelector('[data-field="updated"]').textContent=service.updated;
      row.querySelector('[data-field="note"]').textContent=service.note||'';
      row.querySelectorAll(':scope > .history-block .history .bar').forEach((bar,index)=>{
        const entry=service.history[index];
        bar.className='bar '+entry.status;
        bar.title=entry.day+': '+entry.label;
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

export function renderHtml(data, { preview = false } = {}) {
  const feedOrigin = preview ? 'https://marison-status-page-staging.aldamaaa-id.workers.dev' : 'https://status.marisoncloud.com';
  const subscriptionDialog = `<dialog id="subscribe-dialog" class="subscribe-dialog" aria-labelledby="subscribe-title">
    <div class="subscribe-heading"><h2 id="subscribe-title">Berlangganan kabar</h2><button id="close-subscribe" class="icon-button" type="button" aria-label="Tutup dialog" title="Tutup">${icon('close')}</button></div>
    <div class="feed-section">${icon('rss')} RSS</div>
    ${[['rss', 'RSS', '/feed.rss'], ['atom', 'Atom', '/feed.atom']].map(([id, label, path]) => `<label class="feed-label" for="${id}-url">${label} feed</label><div class="feed-field"><input id="${id}-url" type="url" readonly value="${feedOrigin}${path}" spellcheck="false"><button type="button" class="icon-button" data-copy="${id}-url" data-format="${label}" aria-label="Salin tautan ${label}" title="Salin tautan ${label}">${icon('copy')}</button></div>`).join('')}
    <p id="copy-feedback" class="copy-feedback" role="status" aria-live="polite"></p></dialog>`;
  const renderService = (service) => `<li class="service" data-service="${service.id}" data-status="${service.status}">
    <div class="service-name">${service.url ? `<a href="${service.url}" target="_blank" rel="noopener noreferrer">${escape(service.name)}</a>` : `<strong>${escape(service.name)}</strong>`}<span class="domain">${escape(service.domain)}</span></div>
    <div><div class="metric-label">Kondisi</div><div class="metric-value status-value"><span class="status-dot" aria-hidden="true"></span><span data-field="status">${escape(service.label)}</span></div></div>
    <div><div class="metric-label">${service.url ? 'Respons terakhir' : 'Durasi pemeriksaan'}</div><div class="metric-value" data-field="latency">${escape(service.latency)}</div></div>
    <div><div class="metric-label">Uptime sampel 30 hari</div><div class="metric-value" data-field="availability">${escape(service.availability)}</div><span class="coverage" data-field="coverage">${escape(service.coverage)}</span></div>
    <div class="history-block"><div class="history" aria-label="Riwayat kondisi 30 hari">${service.history.map((entry) => `<button type="button" class="bar ${entry.status}" title="${escape(entry.day)}: ${escape(entry.label)}" aria-label="${escape(entry.day)}: ${escape(entry.label)}"></button>`).join('')}</div><span class="history-caption">30 hari terakhir</span></div>
    <span class="domain" data-field="updated">${escape(service.updated)}</span>
    <p class="service-status-note" data-field="note">${escape(service.note || '')}</p>
    ${service.children ? `<details class="service-details"><summary>${icon('chevron')} Kondisi tiap service (${service.children.length})</summary><ul class="service-children">${service.children.map(renderService).join('')}</ul></details>` : ''}
  </li>`;
  const rows = data.services.map(renderService).join('');
  const maintenanceItems = data.maintenance.map((item) => `<li class="maintenance-item">
    <div class="event-kicker"><span class="status-dot" aria-hidden="true"></span>${item.active ? 'Sedang berlangsung' : 'Terjadwal'}</div>
    <h3>${escape(item.title)}</h3><p class="event-meta">${escape(item.startsText)} – ${escape(item.endsText)}</p>
    <p class="event-copy">${escape(item.description)}</p><p class="event-meta">Layanan: ${escape(item.serviceNames.join(', '))}</p>
    ${item.overdue ? '<p class="event-warning">Estimasi selesai terlewati; maintenance masih berlangsung.</p>' : ''}
    ${item.syncStale ? '<p class="event-warning">Pembaruan jadwal SIGAP belum dapat dipastikan.</p>' : ''}
  </li>`).join('');
  const incidentItems = (data.history || data.incidents).map((item) => `<li class="incident-item">
    <div class="incident-top"><div><div class="event-kicker"><span class="status-dot" aria-hidden="true"></span>${escape(item.serviceNames.join(', '))}</div>
    <h3>${item.kind === 'maintenance' ? 'Pemeliharaan terjadwal: ' : ''}${escape(item.title)}</h3></div><span class="phase-badge ${item.phase === 'resolved' ? 'resolved' : ''}">${escape(item.phaseLabel)}</span></div>
    <p class="event-meta">${escape(item.startedText)}</p><p class="event-copy">${escape(item.summary)}</p>
    <ol class="timeline">${item.timeline.map((update) => `<li class="${escape(update.phase)}"><strong>${escape(update.phaseLabel)}</strong><p>${escape(update.message)}</p><time datetime="${new Date(update.at).toISOString()}">${escape(update.atText)}</time></li>`).join('')}</ol>
  </li>`).join('');
  const generated = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(data.generatedAt);
return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f5f7f8"><title>Status Layanan | Marison Cloud</title><meta name="description" content="Status ketersediaan SIGAP production, staging, storage, dan layanan pendukung."><link rel="alternate" type="application/rss+xml" title="Kabar Status Marison Cloud" href="/rss.xml"><link rel="alternate" type="application/atom+xml" title="Kabar Status Marison Cloud (Atom)" href="/feed.atom"><link rel="icon" href="/logo.png"><script src="/theme.js?v=1"></script><style>${CSS}</style><script src="/app.js?v=20261104-components-v1" defer></script></head>
  <body data-timeline-version="${escape(data.timelineVersion)}"><header><div class="shell top"><div class="brand"><a href="https://marisoncloud.com" aria-label="Marison Cloud"><img src="/logo.png" alt="Marison"></a><span class="brand-mark">Status layanan</span></div><div class="header-actions">${themeSwitch()}<a class="top-link" href="https://marisoncloud.com">Kembali ke Marison Cloud →</a></div></div></header>
  ${preview ? '<div class="preview-banner">Pratinjau staging halaman status: probe SIGAP production dan staging, jadwal SIGAP staging. Halaman publik tetap status.marisoncloud.com.</div>' : ''}
  <main class="shell"><div class="intro"><div><div class="eyebrow">Pemantauan SIGAP</div><h1>Kondisi layanan SIGAP</h1><p class="subtitle">Production, staging, penyimpanan, dan layanan pendukung.</p></div><div class="intro-actions"><button class="rss-link subscribe-trigger" id="subscribe" type="button" aria-haspopup="dialog">${icon('rss')} Berlangganan</button><button class="refresh" id="refresh" type="button" aria-label="Perbarui status">↻ <span>Perbarui</span></button></div></div>
  <div class="overview" id="overview" data-status="${data.overall}" role="status" aria-live="polite"><span class="overview-dot" aria-hidden="true"></span><div><strong id="overall-label">${escape(data.overallLabel)}</strong><small id="updated-at">Diperbarui ${escape(generated)} WIB</small></div></div>
  <section aria-labelledby="services-title"><div class="section-heading"><h2 id="services-title">Layanan</h2><span>4 layanan dipantau</span></div><ul class="service-list">${rows}</ul><div class="legend"><span class="legend-item"><span class="bar"></span>100% sehat</span><span class="legend-item"><span class="bar degraded"></span>99–&lt;100% sehat</span><span class="legend-item"><span class="bar partial"></span>95–&lt;99% sehat</span><span class="legend-item"><span class="bar down"></span>&lt;95% sehat</span><span class="legend-item"><span class="bar unknown"></span>Belum ada data</span></div></section>
  <div class="sections"><section class="status-section" aria-labelledby="maintenance-title"><h2 id="maintenance-title">Pemeliharaan terjadwal</h2>${maintenanceItems ? `<ul class="maintenance-list">${maintenanceItems}</ul>` : '<p class="empty">Tidak ada pemeliharaan yang dijadwalkan.</p>'}</section>
  <section class="status-section" aria-labelledby="incidents-title"><div class="section-heading"><h2 id="incidents-title">Riwayat insiden &amp; pemeliharaan</h2><span>90 hari terakhir</span></div>${incidentItems ? `<ul class="incident-list">${incidentItems}</ul>` : '<p class="empty">Belum ada insiden atau pemeliharaan yang tercatat.</p>'}</section></div>
  <div class="note"><strong>Tentang pemantauan.</strong> Aplikasi production dan staging diperiksa dari luar server setiap menit. Storage dan service diperiksa kolektor internal melalui kesiapan layanan, proses, dan progres antrean; pemeriksaan ini tidak menjalankan pengajuan atau menguji pengiriman ke vendor. Uptime dihitung dari sampel yang tersedia dalam 30 hari, bukan jaminan SLA. Data lebih dari 3 menit menjadi belum diketahui. Riwayat sebelum pemantauan dimulai tidak dianggap sehat.</div>
  <footer class="page-footer"><span>Waktu ditampilkan dalam WIB (UTC+7).</span><nav class="legal-links" aria-label="Kebijakan layanan"><a href="https://marisoncloud.com/privacy">Privacy Policy</a><a href="https://marisoncloud.com/terms">Terms of Service</a></nav></footer></main>${subscriptionDialog}</body></html>`;
}

const policyNav = () => '<nav class="legal-links" aria-label="Navigasi layanan"><a href="https://marisoncloud.com/">Beranda</a><a href="https://marisoncloud.com/privacy">Privacy Policy</a><a href="https://marisoncloud.com/terms">Terms of Service</a><a href="https://status.marisoncloud.com/">Status layanan</a></nav>';

function renderPolicy(policy, { preview = false, privacy = false } = {}) {
  const title = privacy ? 'Privacy Policy' : 'Terms of Service';
  const path = privacy ? 'privacy' : 'terms';
  const description = privacy ? 'Kebijakan privasi seluruh sistem digital resmi Marison Regency Group.' : 'Ketentuan penggunaan layanan digital resmi Marison Regency Group.';
  const content = policy.sections.map((section, index) => `<section id="${section.id}" class="legal-section"><h2>${index + 1}. ${escape(section.title)}</h2>${section.paragraphs.map(text => `<p>${escape(text)}</p>`).join('')}</section>`).join('');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f7f8"><title>${title} | Marison Regency Group</title><meta name="description" content="${description}"><link rel="canonical" href="https://marisoncloud.com/${path}"><script src="/terms/theme.js?v=1"></script><style>${CSS}.policy-navigation{padding:16px 0;border-bottom:1px solid #d7e0e3}.policy-navigation a{font-size:13px;line-height:1.6}.policy-navigation .legal-links{gap:12px 24px}[data-theme="dark"] .policy-navigation{border-color:#3d444f}</style></head><body><header><div class="shell top"><div class="brand"><a href="https://marisoncloud.com/"><img src="/terms/logo.png" alt="Marison Regency Group"></a><span class="brand-mark">${privacy ? 'Privasi' : 'Ketentuan layanan'}</span></div><div class="header-actions">${themeSwitch()}</div></div></header><div class="shell policy-navigation">${policyNav()}</div>${preview ? '<div class="preview-banner">Pratinjau staging</div>' : ''}<main class="shell legal-main"><div class="eyebrow">Marison Regency Group</div><h1>${title}</h1><p class="legal-meta">${privacy ? 'Kebijakan Privasi · ' : ''}Versi ${policy.version} · Berlaku dan diperbarui ${policy.dateLabel}</p><nav class="legal-toc" aria-label="Daftar isi ${privacy ? 'privasi' : 'ketentuan'}">${policy.sections.map(section => `<a href="#${section.id}">${escape(section.title)}</a>`).join('')}</nav>${content}<section class="legal-history"><h2>Riwayat perubahan</h2><ul>${policy.history.map(item => `<li>Versi ${item.version} · ${item.date}: ${escape(item.summary)}</li>`).join('')}</ul></section><footer class="page-footer"><span>Marison Regency Group</span>${policyNav()}</footer></main></body></html>`;
}

export function renderTerms(options = {}) { return renderPolicy(TERMS, options); }
export function renderPrivacy(options = {}) { return renderPolicy(PRIVACY, { ...options, privacy: true }); }

const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const mainHost = ['marisoncloud.com', 'www.marisoncloud.com'].includes(url.hostname);
    const legalPaths = ['/terms', '/terms/', '/privacy', '/privacy/', '/terms/theme.js', '/terms/logo.png', '/terms/landing.js', '/terms/landing.css'];
    if (mainHost && !legalPaths.includes(path)) {
      if (path !== '/' || !['GET', 'HEAD'].includes(request.method)) return fetch(request);
      const originRequest = new Request(request);
      for (const name of ['if-none-match', 'if-modified-since']) originRequest.headers.delete(name);
      const response = await fetch(originRequest);
      return request.method === 'HEAD' ? response : enhanceLanding(response);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405, headers: HEADERS });
    if (path === '/_preview/landing' && env.STATUS_ENVIRONMENT === 'staging') return new Response(request.method === 'HEAD' ? null : renderLandingPreview(), { headers: { ...HEADERS, 'content-security-policy': HEADERS['content-security-policy'].replace("style-src 'unsafe-inline'", "style-src 'self'"), 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (path === '/terms' || path === '/terms/') return new Response(request.method === 'HEAD' ? null : renderTerms({ preview: env.STATUS_ENVIRONMENT === 'staging' }), { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (path === '/privacy' || path === '/privacy/') return new Response(request.method === 'HEAD' ? null : renderPrivacy({ preview: env.STATUS_ENVIRONMENT === 'staging' }), { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (path === '/terms/landing.js' || path === '/terms/landing.css') return new Response(request.method === 'HEAD' ? null : path.endsWith('.js') ? LANDING_LINKS_JS : LANDING_LINKS_CSS, { headers: { ...HEADERS, 'content-type': `${path.endsWith('.js') ? 'text/javascript' : 'text/css'}; charset=utf-8`, 'cache-control': 'no-store' } });
    if (path === '/logo.png' || path === '/terms/logo.png') {
      const bytes = Uint8Array.from(atob(LOGO_BASE64), (character) => character.charCodeAt(0));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { ...HEADERS, 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    }
    if (path === '/app.js') return new Response(request.method === 'HEAD' ? null : APP_JS, { headers: { ...HEADERS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
    if (path === '/theme.js' || path === '/terms/theme.js') return new Response(request.method === 'HEAD' ? null : THEME_JS, { headers: { ...HEADERS, 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
    if (['/rss.xml', '/feed.rss', '/atom.xml', '/feed.atom'].includes(path)) {
      try {
        const events = await loadFeed(env.DB);
        const origin = env.STATUS_ENVIRONMENT === 'staging'
          ? 'https://marison-status-page-staging.aldamaaa-id.workers.dev' : 'https://status.marisoncloud.com';
        const atom = path === '/atom.xml' || path === '/feed.atom';
        return new Response(request.method === 'HEAD' ? null : atom ? renderAtom(events, origin) : renderRss(events, origin), {
          headers: { ...HEADERS, 'content-type': `${atom ? 'application/atom+xml' : 'application/rss+xml'}; charset=utf-8`, 'cache-control': 'no-store' },
        });
      } catch {
        return new Response(request.method === 'HEAD' ? null : 'Feed sementara tidak tersedia', { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
      }
    }
    if (path !== '/' && path !== '/api/status') return new Response('Not found', { status: 404, headers: HEADERS });
    let data;
    try {
      data = await loadStatus(env.DB);
    } catch {
      data = buildStatus({});
      if (path === '/api/status') return Response.json(data, { status: 503, headers: { ...HEADERS, 'cache-control': 'no-store' } });
    }
    if (path === '/api/status') return Response.json(data, { headers: { ...HEADERS, 'cache-control': 'no-store' } });
    return new Response(request.method === 'HEAD' ? null : renderHtml(data, { preview: env.STATUS_ENVIRONMENT === 'staging' }), { headers: { ...HEADERS, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  },
};
