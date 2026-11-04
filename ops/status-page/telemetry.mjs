const TELEMETRY_IDS = ['sigap_storage', 'sigap_pdf', 'sigap_sync', 'sigap_outbound', 'sigap_external'];
const REASONS = new Set(['healthy', 'process_down', 'dependency_failed', 'queue_stalled', 'check_unavailable', 'disabled']);

export function telemetryRows(value, now) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.observedAt)
    || Object.keys(value).some(key => !['version', 'observedAt', 'components'].includes(key))
    || value.observedAt > now + 10000 || now - value.observedAt > 60000
    || !Array.isArray(value.components) || value.components.length !== TELEMETRY_IDS.length) throw Error('Invalid report');
  const ids = value.components.map(item => item?.id);
  if (new Set(ids).size !== TELEMETRY_IDS.length || TELEMETRY_IDS.some(id => !ids.includes(id))) throw Error('Invalid components');
  const rows = value.components.map(item => {
    if (!['up', 'down', 'unknown'].includes(item.status) || !REASONS.has(item.reason)
      || (item.latencyMs !== null && (!Number.isInteger(item.latencyMs) || item.latencyMs < 0 || item.latencyMs > 60000))
      || Object.keys(item).some(key => !['id', 'status', 'reason', 'latencyMs'].includes(key))) throw Error('Invalid observation');
    return { service: item.id, slot: Math.floor(value.observedAt / 60000), checkedAt: value.observedAt,
      outcome: item.status, latencyMs: item.latencyMs, httpStatus: null, reason: item.reason };
  });
  const workers = rows.filter(item => item.service !== 'sigap_storage');
  const outcome = workers.some(item => item.outcome === 'down') ? 'down'
    : workers.some(item => item.outcome === 'unknown') ? 'unknown' : 'up';
  rows.push({ ...rows[0], service: 'sigap_services', outcome,
    latencyMs: workers.every(item => item.latencyMs !== null) ? Math.max(...workers.map(item => item.latencyMs)) : null,
    reason: outcome === 'up' ? 'healthy' : outcome === 'unknown' ? 'check_unavailable' : 'dependency_failed' });
  return rows;
}

export function observationStatements(db, rows) {
  return rows.flatMap(row => {
    const modern = row.service !== 'sigap';
    const table = modern ? 'component_checks' : 'checks';
    const daily = modern ? 'component_daily_checks' : 'daily_checks';
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(row.checkedAt);
    return [
      db.prepare(`INSERT OR IGNORE INTO ${table} (service,slot,checked_at,outcome,latency_ms,http_status,reason) VALUES (?,?,?,?,?,?,?)`)
        .bind(row.service, row.slot, row.checkedAt, row.outcome, row.latencyMs, row.httpStatus, row.reason),
      db.prepare(`INSERT INTO ${daily} (service,day,up_count,degraded_count,down_count,${modern ? 'unknown_count,' : ''}first_at,last_at)
        SELECT ?,?,?,?,?,${modern ? '?,' : ''}?,? WHERE changes()=1
        ON CONFLICT(service,day) DO UPDATE SET up_count=up_count+excluded.up_count,
        degraded_count=degraded_count+excluded.degraded_count,down_count=down_count+excluded.down_count,
        ${modern ? 'unknown_count=unknown_count+excluded.unknown_count,' : ''}last_at=MAX(last_at,excluded.last_at)`)
        .bind(row.service, day, Number(row.outcome === 'up'), Number(row.outcome === 'degraded'), Number(row.outcome === 'down'),
          ...(modern ? [Number(row.outcome === 'unknown')] : []), row.checkedAt, row.checkedAt),
    ];
  });
}

export async function receiveTelemetry(request, env, now = Date.now()) {
  const respond = (status) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });
  if (request.method !== 'POST') return respond(405);
  const url = new URL(request.url);
  const stamp = request.headers.get('x-sigap-timestamp') || '';
  const signature = request.headers.get('x-sigap-signature') || '';
  if (url.host !== env.COLLECTOR_AUDIENCE || !env.COLLECTOR_PUBLIC_KEY
    || !/^\d{13}$/.test(stamp) || Math.abs(now - Number(stamp)) > 60000 || !/^[a-f0-9]{128}$/.test(signature)) return respond(401);
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) return respond(415);
  if (Number(request.headers.get('content-length') || 0) > 8192) return respond(413);
  const reader = request.body?.getReader();
  if (!reader) return respond(400);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); return respond(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = new TextDecoder().decode(bytes);
    const key = await crypto.subtle.importKey('spki', Uint8Array.from(atob(env.COLLECTOR_PUBLIC_KEY), char => char.charCodeAt(0)), 'Ed25519', false, ['verify']);
    const valid = await crypto.subtle.verify('Ed25519', key, Uint8Array.from(signature.match(/../g), item => parseInt(item, 16)),
      new TextEncoder().encode(`${stamp}\n${url.host}\n/report\n${body}`));
    if (!valid) return respond(401);
    let rows;
    try { rows = telemetryRows(JSON.parse(body), now); } catch { return respond(400); }
    await env.DB.batch(observationStatements(env.DB, rows));
    return respond(204);
  } catch { return respond(503); }
}
