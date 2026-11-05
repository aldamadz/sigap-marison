import { COMPONENTS } from './components.mjs';
import { observationStatements, receiveTelemetry } from './telemetry.mjs';

export const SERVICES = COMPONENTS.filter(service => service.url);

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
  if (service.id === 'sigap' || service.id === 'sigap_staging') return value.status === 'ready';
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
    let latencyMs = Math.round(performance.now() - started);
    if (response.status !== 200) {
      await response.body?.cancel();
      return { ok: false, latencyMs, httpStatus: response.status, reason: 'http' };
    }
    const contentType = response.headers.get('content-type') || '';
    const body = await readLimited(response, kind === 'health' ? 8192 : 131072);
    latencyMs = Math.round(performance.now() - started);
    if (body === null) return { ok: false, latencyMs, httpStatus: 200, reason: 'large_response' };
    if (kind === 'page') {
      const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1] || '';
      const ok = contentType.includes('text/html') && /<html[\s>]/i.test(body)
        && (!service.pageTitle || title.toLowerCase().includes(service.pageTitle.toLowerCase()));
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
  if (!service.health) {
    const page = await check(`${service.url}/`, 'page', service, fetchImpl);
    return { service: service.id, slot: Math.floor(checkedAt / 60000), checkedAt,
      outcome: page.ok ? 'up' : 'down', latencyMs: page.latencyMs, httpStatus: page.httpStatus, reason: page.reason };
  }
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
    httpStatus: failed ? failed.httpStatus : 200,
    reason: failed?.reason ?? null,
  };
}

export async function runChecks(env, checkedAt = Date.now(), fetchImpl = fetch) {
  const results = await Promise.all(SERVICES.map((service) => probeService(service, fetchImpl, checkedAt)));
  await env.DB.batch(observationStatements(env.DB, results));
  if (Math.floor(checkedAt / 60000) % 1440 === 0) {
    await env.DB.prepare('DELETE FROM checks WHERE checked_at < ?').bind(checkedAt - RETENTION_MS).run();
    await env.DB.prepare('DELETE FROM daily_checks WHERE day < ?').bind(jakartaDay(checkedAt - RETENTION_MS)).run();
    await env.DB.prepare('DELETE FROM component_checks WHERE checked_at < ?').bind(checkedAt - RETENTION_MS).run();
    await env.DB.prepare('DELETE FROM component_daily_checks WHERE day < ?').bind(jakartaDay(checkedAt - RETENTION_MS)).run();
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
  const schedule = state.schedule;
  if (schedule) {
    const key = `sigap:${schedule.id}`;
    const serviceIds = host === 'sigap.marisoncloud.com' ? '["sigap"]' : '["sigap_staging"]';
    statements.push(env.DB.prepare(`UPDATE maintenance SET lifecycle_status='replaced',
      closed_at=COALESCE(closed_at, ?), cancelled_at=COALESCE(cancelled_at, ?)
      WHERE source='sigap' AND id<>? AND lifecycle_status='published' AND cancelled_at IS NULL AND ${guard}`)
      .bind(syncedAt, syncedAt, key, revision));
    const closed = schedule.status !== 'published';
    statements.push(env.DB.prepare(`INSERT INTO maintenance
      (id, title, description, service_ids, starts_at, ends_at, created_at, source, impact,
        lifecycle_status, closed_at, cancelled_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, 'sigap', ?, ?, ?, ? WHERE ${guard}
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description,
        service_ids=excluded.service_ids, starts_at=excluded.starts_at, ends_at=excluded.ends_at, impact=excluded.impact,
        lifecycle_status=excluded.lifecycle_status,
        closed_at=CASE WHEN excluded.lifecycle_status='published' THEN NULL
          ELSE COALESCE(maintenance.closed_at, maintenance.cancelled_at, excluded.closed_at) END,
        cancelled_at=CASE WHEN excluded.lifecycle_status='cancelled'
          THEN COALESCE(maintenance.cancelled_at, maintenance.closed_at, excluded.closed_at) ELSE NULL END
        WHERE maintenance.source='sigap'`)
      .bind(key, `${CATEGORY_LABELS[schedule.category]} SIGAP`, schedule.message.trim(), serviceIds,
        Date.parse(schedule.startsAt), Date.parse(schedule.endsAt), syncedAt, schedule.impact,
        schedule.status, closed ? syncedAt : null, schedule.status === 'cancelled' ? syncedAt : null, revision));
  } else {
    statements.push(env.DB.prepare(`UPDATE maintenance SET lifecycle_status='unknown',
      closed_at=COALESCE(closed_at, ?), cancelled_at=COALESCE(cancelled_at, ?)
      WHERE source='sigap' AND lifecycle_status='published' AND cancelled_at IS NULL AND ${guard}`)
      .bind(syncedAt, syncedAt, revision));
  }
  await env.DB.batch(statements);
  return { revision, scheduleId: schedule?.id || null };
}

export default {
  async fetch(request, env) {
    if (request && new URL(request.url).pathname === '/report') return receiveTelemetry(request, env);
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  },
  async scheduled(controller, env) {
    await runChecks(env, controller.scheduledTime);
    try { await syncSigapMaintenance(env); }
    catch { console.warn('SIGAP maintenance sync unavailable; retaining last known state'); }
  },
};
