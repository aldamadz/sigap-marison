import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const TABLES = ['checks', 'component_checks', 'component_daily_checks', 'daily_checks',
  'incident_updates', 'incidents', 'maintenance', 'status_sources'];

export function openDatabase(path, { create = false, readOnly = false } = {}) {
  if (!create && !existsSync(path)) throw Error('Database has not been imported');
  const connection = new DatabaseSync(path, { readOnly });
  connection.exec('PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
  if (!readOnly) connection.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  const wrap = (sql, parameters = []) => ({
    bind: (...values) => wrap(sql, values),
    all: async () => ({ results: connection.prepare(sql).all(...parameters) }),
    run: async () => ({ meta: connection.prepare(sql).run(...parameters) }),
    execute: () => connection.prepare(sql).run(...parameters),
  });
  return {
    connection,
    prepare: wrap,
    async batch(statements) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const result = statements.map(statement => ({ meta: statement.execute() }));
        connection.exec('COMMIT');
        return result;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => connection.close(),
  };
}

export function auditDatabase(connection) {
  const integrity = connection.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok'
    || connection.prepare('PRAGMA foreign_key_check').all().length) throw Error('Database integrity failed');
  const schema = connection.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  const tables = schema.filter(row => row.type === 'table').map(row => row.name).sort();
  if (JSON.stringify(tables) !== JSON.stringify(TABLES)
    || schema.some(row => !['table', 'index'].includes(row.type))) throw Error('Unexpected imported schema');
  const manifest = {};
  for (const table of TABLES) {
    // Names originate exclusively from TABLES, never from an HTTP request.
    const hash = createHash('sha256');
    let count = 0;
    for (const row of connection.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate()) {
      hash.update(JSON.stringify(row) + '\n'); count++;
    }
    manifest[table] = { count, sha256: hash.digest('hex') };
  }
  return { schema, tables: manifest };
}
