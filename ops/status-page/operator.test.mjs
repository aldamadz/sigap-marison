import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildCommand } from './operator.mjs';

const NOW = Date.UTC(2026, 10, 3, 5);

test('incident command validates services and creates a prepared write', () => {
  const result = buildCommand('incident-create', {
    title: 'Gangguan SIGAP', summary: 'Akses publik terputus', severity: 'major', services: ['sigap'],
  }, NOW);
  assert.equal(result.params[4], '["sigap"]');
  assert.match(result.sql, /VALUES \(\?, \?, \?, \?, \?, \?, \?\)/);
  assert.throws(() => buildCommand('incident-create', {
    title: 'Gangguan SIGAP', summary: 'Akses publik terputus', severity: 'major', services: ['sigap', 'sigap'],
  }, NOW), /services/);
});

test('maintenance requires a future bounded interval with timezone', () => {
  assert.throws(() => buildCommand('maintenance-create', {
    title: 'Pembaruan SIGAP', description: 'Pembaruan layanan', services: ['sigap'],
    startsAt: '2026-11-03T13:00:00', endsAt: '2026-11-03T14:00:00+07:00',
  }, NOW), /timezone/);
  const result = buildCommand('maintenance-create', {
    title: 'Pembaruan SIGAP', description: 'Pembaruan layanan', services: ['sigap'],
    startsAt: '2026-11-03T13:00:00+07:00', endsAt: '2026-11-03T14:00:00+07:00',
  }, NOW);
  assert.equal(result.params[3], '["sigap"]');
  assert.equal(Number(result.params[5]) - Number(result.params[4]), 3600000);
});

test('update and cancel use guarded statements', () => {
  const id = 'b9ecffad-f5ed-49d4-a3cd-4291d7837168';
  const update = buildCommand('incident-update', { incidentId: id,
    phase: 'resolved', message: 'Layanan pulih sepenuhnya' }, NOW);
  assert.match(update.sql, /NOT EXISTS/);
  assert.match(update.sql, /CASE phase/);
  assert.match(update.sql, /CAST\(\? AS INTEGER\)/);
  assert.equal(update.params.at(-1), '3');
  const cancel = buildCommand('maintenance-cancel', { maintenanceId: id }, NOW);
  assert.match(cancel.sql, /cancelled_at IS NULL/);
  assert.throws(() => buildCommand('incident-update', { incidentId: 'not-a-uuid',
    phase: 'resolved', message: 'Layanan pulih sepenuhnya' }, NOW), /UUID/);
});
