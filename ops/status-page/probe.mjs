export const SERVICES = [
  { id: 'drive', name: 'Maris Drive', url: 'https://drive.marisoncloud.com', health: '/api/health' },
  { id: 'ai', name: 'AI Workspace', url: 'https://ai.marisoncloud.com', health: '/api/health' },
  { id: 'sigap', name: 'SIGAP', url: 'https://sigap.marisoncloud.com', health: '/health/ready' },
  { id: 'marison', name: 'Marison Cloud', url: 'https://marisoncloud.com', health: '/api/health' },
];

const TIMEOUT_MS = 8000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAINTENANCE_HOSTS = new Set(['sigap.marisoncloud.com', 'sigap.marison-testing.biz.id']);
const CATEGORY_LABELS = { repair: 'Perbaikan', development: 'Pengembangan', update: 'Pembaruan' };

function jakartaDay(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(timestamp);
}

async function readLimited(response, limit) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function validHealth(service, value) {
  if (!value || typeof value !== 'object') return false;
  if (service.id === 'sigap') return value.status === 'ready';
  if (service.id === 'ai') return value.ok === true;
  return ['api', 'database', 'storage', 'queue', 'scanner']
    .every((key) => value[key] === 'ok');
}

async function check(url, kind, service, fetchImpl) {
  const started = performance.now();
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: kind === 'health' ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const latencyMs = Math.round(performance.now() - started);
    if (response.status !== 200) {
      await response.body?.cancel();
      return { ok: false, latencyMs, httpStatus: response.status, reason: 'http' };
    }
    const contentType = response.headers.get('content-type') || '';
    const body = await readLimited(response, kind === 'health' ? 8192 : 131072);
    if (body === null) return { ok: false, latencyMs, httpStatus: 200, reason: 'large_response' };
    if (kind === 'page') {
      const ok = contentType.includes('text/html') && /<html[\s>]/i.test(body);
      return { ok, latencyMs, httpStatus: 200, reason: ok ? null : 'invalid_page' };
    }
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    const ok = contentType.includes('application/json') && validHealth(service, parsed);
    return { ok, latencyMs, httpStatus: 200, reason: ok ? null : 'invalid_health' };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - started),
      httpStatus: null,
      reason: error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network',
    };
  }
}

export async function probeService(service, fetchImpl = fetch, checkedAt = Date.now()) {
  const [page, health] = await Promise.all([
    check(`${service.url}/`, 'page', service, fetchImpl),
    check(`${service.url}${service.health}`, 'health', service, fetchImpl),
  ]);
  const outcome = !health.ok ? 'down' : page.ok ? 'up' : 'degraded';
  const failed = !health.ok ? health : !page.ok ? page : null;
  return {
    service: service.id,
    slot: Math.floor(checkedAt / 60000),
    checkedAt,
    outcome,
    latencyMs: Math.max(page.latencyMs, health.latencyMs),
    httpStatus: failed?.httpStatus ?? 200,
    reason: failed?.reason ?? null,
  };
}

export async function runChecks(env, checkedAt = Date.now(), fetchImpl = fetch) {
  const results = await Promise.all(SERVICES.map((service) => probeService(service, fetchImpl, checkedAt)));
  const day = jakartaDay(checkedAt);
  const statements = results.flatMap((result) => [
    env.DB.prepare('INSERT OR IGNORE INTO checks (service, slot, checked_at, outcome, latency_ms, http_status, reason) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(result.service, result.slot, result.checkedAt, result.outcome, result.latencyMs, result.httpStatus, result.reason),
    env.DB.prepare(`INSERT INTO daily_checks (service, day, up_count, degraded_count, down_count, first_at, last_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1
      ON CONFLICT(service, day) DO UPDATE SET
        up_count=up_count+excluded.up_count,
        degraded_count=degraded_count+excluded.degraded_count,
        down_count=down_count+excluded.down_count,
        last_at=MAX(last_at, excluded.last_at)`)
      .bind(result.service, day, Number(result.outcome === 'up'), Number(result.outcome === 'degraded'), Number(result.outcome === 'down'), checkedAt, checkedAt),
  ]);
  await env.DB.batch(statements);
  if (Math.floor(checkedAt / 60000) % 1440 === 0) {
    await env.DB.prepare('DELETE FROM checks WHERE checked_at < ?').bind(checkedAt - RETENTION_MS).run();
    await env.DB.prepare('DELETE FROM daily_checks WHERE day < ?').bind(jakartaDay(checkedAt - RETENTION_MS)).run();
  }
  return results;
}

function validScheduleState(state) {
  if (!state || !Number.isSafeInteger(state.revision) || state.revision < 0) return false;
  if (state.schedule === null) return true;
  const schedule = state.schedule;
  if (!schedule || typeof schedule !== 'object'
    || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(schedule.id || '')
    || !['published', 'completed', 'cancelled'].includes(schedule.status)
    || !Object.hasOwn(CATEGORY_LABELS, schedule.category)
    || !['full', 'disruption'].includes(schedule.impact)
    || typeof schedule.message !== 'string' || schedule.message.trim().length < 5
    || schedule.message.length > 1000) return false;
  const start = Date.parse(schedule.startsAt), end = Date.parse(schedule.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start
    && end - start <= 30 * 86400000;
}

export async function syncSigapMaintenance(env, syncedAt = Date.now()) {
  const host = env.SIGAP_MAINTENANCE_HOSTNAME;
  if (!MAINTENANCE_HOSTS.has(host) || !env.SIGAP_EDGE?.fetch) throw new Error('SIGAP maintenance binding is unavailable');
  const response = await env.SIGAP_EDGE.fetch(new Request(`https://${host}/api/maintenance/status`, {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000),
  }));
  if (response.status !== 200 || !(response.headers.get('content-type') || '').includes('application/json')) {
    await response.body?.cancel();
    throw new Error('SIGAP maintenance state is unavailable');
  }
  const body = await readLimited(response, 8192);
  let state;
  try { state = JSON.parse(body); } catch { throw new Error('SIGAP maintenance state is invalid'); }
  if (!validScheduleState(state)) throw new Error('SIGAP maintenance state is invalid');
  const revision = state.revision;
  const guard = `(SELECT revision FROM status_sources WHERE source = 'sigap') = ?`;
  const statements = [env.DB.prepare(`INSERT INTO status_sources (source, revision, synced_at) VALUES ('sigap', ?, ?)
    ON CONFLICT(source) DO UPDATE SET revision=excluded.revision, synced_at=excluded.synced_at
    WHERE excluded.revision >= status_sources.revision`).bind(revision, syncedAt)];
  const schedule = state.schedule?.status === 'published' ? state.schedule : null;
  if (schedule) {
    const key = `sigap:${schedule.id}`;
    statements.push(env.DB.prepare(`UPDATE maintenance SET cancelled_at=?
      WHERE source='sigap' AND id<>? AND cancelled_at IS NULL AND ${guard}`)
      .bind(syncedAt, key, revision));
    statements.push(env.DB.prepare(`INSERT INTO maintenance
      (id, title, description, service_ids, starts_at, ends_at, created_at, source, impact)
      SELECT ?, ?, ?, '["sigap"]', ?, ?, ?, 'sigap', ? WHERE ${guard}
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
        starts_at=excluded.starts_at, ends_at=excluded.ends_at, impact=excluded.impact,
        cancelled_at=NULL WHERE maintenance.source='sigap'`)
      .bind(key, `${CATEGORY_LABELS[schedule.category]} SIGAP`, schedule.message.trim(),
        Date.parse(schedule.startsAt), Date.parse(schedule.endsAt), syncedAt, schedule.impact, revision));
  } else {
    statements.push(env.DB.prepare(`UPDATE maintenance SET cancelled_at=?
      WHERE source='sigap' AND cancelled_at IS NULL AND ${guard}`)
      .bind(syncedAt, revision));
  }
  await env.DB.batch(statements);
  return { revision, scheduleId: schedule?.id || null };
}

export default {
  async fetch() {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  },
  async scheduled(controller, env) {
    await runChecks(env, controller.scheduledTime);
    try { await syncSigapMaintenance(env); }
    catch { console.warn('SIGAP maintenance sync unavailable; retaining last known state'); }
  },
};
