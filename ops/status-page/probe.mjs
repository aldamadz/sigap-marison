export const SERVICES = [
  { id: 'drive', name: 'Maris Drive', url: 'https://drive.marisoncloud.com', health: '/api/health' },
  { id: 'ai', name: 'AI Workspace', url: 'https://ai.marisoncloud.com', health: '/api/health' },
  { id: 'sigap', name: 'SIGAP', url: 'https://sigap.marisoncloud.com', health: '/health/ready' },
  { id: 'marison', name: 'Marison Cloud', url: 'https://marisoncloud.com', health: '/api/health' },
];

const TIMEOUT_MS = 8000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

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

export default {
  async fetch() {
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  },
  async scheduled(controller, env) {
    await runChecks(env, controller.scheduledTime);
  },
};
