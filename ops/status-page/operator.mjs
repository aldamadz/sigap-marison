import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICES = new Set(['drive', 'ai', 'sigap', 'marison']);
const PHASES = new Set(['identified', 'monitoring', 'resolved']);

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || value.trim().length < 5 || value.length > maxLength) {
    throw new Error(`${label} must contain 5-${maxLength} characters`);
  }
  return value.trim();
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new Error(`${label} requires an ISO timestamp with timezone`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function services(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > SERVICES.size
    || new Set(value).size !== value.length || value.some((id) => !SERVICES.has(id))) {
    throw new Error('services must list unique monitored service IDs');
  }
  return JSON.stringify(value);
}

function id(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('id must be a UUID');
  }
  return value;
}

export function buildCommand(command, input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Input must be a JSON object');
  if (command === 'incident-create') {
    const startedAt = input.startedAt ? timestamp(input.startedAt, 'startedAt') : now;
    if (startedAt > now || startedAt < now - 90 * 86400000) throw new Error('Incident must start within the last 90 days');
    if (!['minor', 'major', 'critical'].includes(input.severity)) throw new Error('Invalid severity');
    const incidentId = randomUUID();
    return { id: incidentId, sql: `INSERT INTO incidents
      (id, title, summary, severity, service_ids, started_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, params: [incidentId, requiredText(input.title, 'title', 160),
      requiredText(input.summary, 'summary', 2000), input.severity, services(input.services),
      String(startedAt), String(now)] };
  }
  if (command === 'incident-update') {
    if (!PHASES.has(input.phase)) throw new Error('Invalid phase');
    const updateId = randomUUID();
    const incidentId = id(input.incidentId);
    const phaseRank = { identified: 1, monitoring: 2, resolved: 3 }[input.phase];
    return { id: updateId, sql: `INSERT INTO incident_updates (id, incident_id, phase, message, created_at)
      SELECT ?, id, ?, ?, ? FROM incidents WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM incident_updates WHERE incident_id = ? AND phase = 'resolved')
      AND COALESCE((SELECT CASE phase WHEN 'identified' THEN 1 WHEN 'monitoring' THEN 2 ELSE 3 END
        FROM incident_updates WHERE incident_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1), 0) <= CAST(? AS INTEGER)`,
    params: [updateId, input.phase, requiredText(input.message, 'message', 3000),
      String(now), incidentId, incidentId, incidentId, String(phaseRank)] };
  }
  if (command === 'maintenance-create') {
    const startsAt = timestamp(input.startsAt, 'startsAt');
    const endsAt = timestamp(input.endsAt, 'endsAt');
    if (startsAt < now || endsAt <= startsAt || endsAt - startsAt > 30 * 86400000) {
      throw new Error('Maintenance must be future-dated and no longer than 30 days');
    }
    const maintenanceId = randomUUID();
    return { id: maintenanceId, sql: `INSERT INTO maintenance
      (id, title, description, service_ids, starts_at, ends_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, params: [maintenanceId,
      requiredText(input.title, 'title', 160), requiredText(input.description, 'description', 2000),
      services(input.services), String(startsAt), String(endsAt), String(now)] };
  }
  if (command === 'maintenance-cancel') {
    const maintenanceId = id(input.maintenanceId);
    return { id: maintenanceId, sql: `UPDATE maintenance SET cancelled_at = ?
      WHERE id = ? AND cancelled_at IS NULL AND ends_at > ?`,
    params: [String(now), maintenanceId, String(now)] };
  }
  throw new Error('Unsupported command');
}

async function main() {
  const [command, inputPath, productionFlag] = process.argv.slice(2);
  const { CF_API_TOKEN: token, CF_ACCOUNT_ID: account, CF_D1_DATABASE_ID: database,
    CF_ENVIRONMENT: environment } = process.env;
  if (!token || !account || !database || !['staging', 'production'].includes(environment)) {
    throw new Error('CF_API_TOKEN, CF_ACCOUNT_ID, CF_D1_DATABASE_ID and CF_ENVIRONMENT are required');
  }
  if (environment === 'production' && productionFlag !== '--production') {
    throw new Error('Production writes require the --production flag');
  }
  if (!command || !inputPath) throw new Error('Usage: node operator.mjs <command> <input.json> [--production]');
  const input = JSON.parse(await readFile(inputPath, 'utf8'));
  const query = buildCommand(command, input);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql: query.sql, params: query.params }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok || !result.success || result.result?.[0]?.meta?.changes !== 1) {
    throw new Error(`D1 write failed (HTTP ${response.status}); no event published`);
  }
  process.stdout.write(`${environment} ${command}: ${query.id}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
