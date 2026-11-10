import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildPlan, retainedTag, validateState } from './docker-retention-plan.mjs';
import { applyPlan, verifyPublic, verifySuccess } from './docker-image-retention.mjs';
import { auditReferences, collectInventory } from './docker-retention-inventory.mjs';

const id = n => 'sha256:' + n.toString(16).padStart(64, '0');
const image = n => ({ id: id(n), tags: ['agenda-flow:v' + n], created: '2026-11-01', size: 100 });
const release = n => ({ id: id(n), completedAt: new Date(Date.UTC(2026, 10, n)).toISOString(), evidence: 'fixture-success' });
function fixture() {
  const state = { version: 1, managedImages: [1, 2, 3, 4, 5, 6].map(id), externalReferences: [],
    services: [{ key: 'app', container: 'app', releases: [1, 2, 3, 4, 5, 6].map(release) }] };
  const inventory = { images: [1, 2, 3, 4, 5, 6].map(image), containers: [{ name: 'app', imageId: id(6), state: 'running', health: 'healthy' }], references: [] };
  return { state, inventory };
}
function engine(f = fixture()) {
  const data = structuredClone(f.inventory), commands = [], events = [];
  return { data, commands, events, state: f.state, inventory: () => structuredClone(data), audit: value => events.push(value),
    saveReferences: value => events.push({ action: 'saved-references', value }),
    run: args => {
      commands.push(args);
      if (args[0] === 'image' && args[1] === 'inspect') {
        const ref = args[2], found = data.images.find(image => image.id === ref || image.tags.includes(ref));
        if (!found) throw Error('Missing image');
        return JSON.stringify([{ Id: found.id }]);
      }
      if (args[0] === 'image' && args[1] === 'tag') {
        const found = data.images.find(image => image.id === args[2]); found.tags.push(args[3]); found.tags.sort(); return '';
      }
      if (args[0] === 'image' && args[1] === 'rm') {
        const refs = args.slice(3), targets = data.images.filter(image => refs.includes(image.id) || image.tags.some(tag => refs.includes(tag)));
        for (const target of targets) {
          if (data.containers.some(container => container.imageId === target.id)) throw Error('Docker container conflict');
          data.images.splice(data.images.indexOf(target), 1);
        }
        return 'Deleted: ' + targets.map(image => image.id).join(',');
      }
      if (args[0] === 'builder') return 'Total reclaimed space: 0B';
      throw Error('Unexpected command ' + args.join(' '));
    },
  };
}

test('retains active plus exactly three unique successful rollback IDs, not tags', () => {
  const f = fixture();
  f.state.services[0].releases.push({ ...release(5), completedAt: '2026-11-07' });
  f.inventory.images[4].tags.push('agenda-flow:alias');
  const p = buildPlan(f.state, f.inventory);
  assert.deepEqual(p.slots[0].rollback.map(row => row.id), [5, 4, 3].map(id));
  assert.deepEqual(p.remove.map(image => image.id), [1, 2].map(id));
});
test('running AND stopped containers protect every referenced image beyond rollback count', () => {
  const f = fixture();
  f.inventory.containers.push({ name: 'stopped', imageId: id(1), state: 'exited', health: null });
  f.inventory.containers.push({ name: 'other-running', imageId: id(2), state: 'running', health: null });
  assert.equal(buildPlan(f.state, f.inventory).remove.length, 0);
});
test('shared image versions are retained for each service and unioned safely', () => {
  const f = fixture();
  f.state.services.push({ key: 'pdf', container: 'pdf', releases: [1, 2, 3].map(release) });
  f.inventory.containers.push({ name: 'pdf', imageId: id(3), state: 'running', health: null });
  assert.equal(buildPlan(f.state, f.inventory).remove.length, 0);
});
test('rollback references, unknown images and foreign repository tags fail closed', () => {
  const f = fixture();
  f.inventory.references.push({ id: id(1), source: '/rollback.json' });
  f.inventory.images[1].tags.push('thirdparty:prod');
  f.inventory.images.push(image(99));
  assert.equal(buildPlan(f.state, f.inventory).remove.length, 0);
  f.inventory.images[1].tags = ['agenda-flow:v2'];
  f.state.externalReferences.push({ id: id(2), source: 'proxmox-host-rollback' });
  assert.equal(buildPlan(f.state, f.inventory).remove.length, 0);
});
test('missing managed container or retained rollback aborts instead of pruning', () => {
  const f = fixture();
  f.inventory.images = f.inventory.images.filter(image => image.id !== id(5));
  assert.throws(() => buildPlan(f.state, f.inventory), /Protected image is missing/);
  f.inventory.containers = [];
  assert.throws(() => buildPlan(f.state, f.inventory), /Managed container is missing/);
});
test('rejects malformed/unproven/duplicate service registration', () => {
  const f = fixture(); f.state.services[0].releases[0].evidence = '';
  assert.throws(() => validateState(f.state), /evidence/);
  f.state.services[0].releases[0].evidence = 'fixture';
  f.state.services.push(structuredClone(f.state.services[0]));
  assert.throws(() => validateState(f.state), /duplicate/);
});
test('approval coordinates include complete inventory and rollback evidence', () => {
  const f = fixture(), a = buildPlan(f.state, f.inventory);
  f.inventory.images[0].tags.push('agenda-flow:another');
  assert.notEqual(buildPlan(f.state, f.inventory).planDigest, a.planDigest);
  f.state.externalReferences.push({ id: id(1), source: 'new-ref' });
  assert.notEqual(buildPlan(f.state, f.inventory).planDigest, a.planDigest);
});
test('deployment health/identity and public exact200 smoke probes fail closed', async () => {
  const f = fixture();
  assert.equal(verifySuccess(f.inventory, f.state, 'app', id(6)).key, 'app');
  f.inventory.containers[0].health = 'unhealthy';
  assert.throws(() => verifySuccess(f.inventory, f.state, 'app', id(6)));
  const sha = 'a'.repeat(40), paths = [];
  await verifyPublic(sha, async url => { paths.push(new URL(url).pathname); return { status: 200, json: async () => ({ gitSha: sha }) }; });
  assert.deepEqual(paths, ['/health/version', '/health/live', '/health/ready', '/']);
  await assert.rejects(verifyPublic(sha, async () => ({ status: 503 })));
  await assert.rejects(verifyPublic(sha, async () => ({ status: 200, json: async () => ({ gitSha: 'b'.repeat(40) }) })));
});
test('rewrites and verifies canonical rollback references BEFORE deleting any image', () => {
  const e = engine(), p = buildPlan(e.state, e.inventory());
  const result = applyPlan(p, e);
  assert.deepEqual(result.deleted, [1, 2].map(id));
  const saveAt = e.events.findIndex(event => event.action === 'saved-references');
  const deleteAt = e.events.findIndex(event => event.action === 'delete-intent');
  assert.ok(saveAt >= 0 && deleteAt > saveAt);
  assert.equal(e.events[saveAt].value.services[0].rollback[0].tag, retainedTag('app', id(5)));
  assert.ok(e.commands.filter(args => args[0] === 'image' && args[1] === 'rm').every(args => args[2] === '--no-prune' && !args.includes('--force')));
  assert.deepEqual(e.commands.at(-1), ['builder', 'prune', '--force', '--filter', 'until=168h']);
});
test('changed inventory or failed reference verification never removes images or build cache', () => {
  const e = engine(), p = buildPlan(e.state, e.inventory());
  e.data.images[0].tags.push('agenda-flow:race');
  assert.throws(() => applyPlan(p, e), /Inventory changed/);
  assert.equal(e.commands.length, 0);
  const e2 = engine(), p2 = buildPlan(e2.state, e2.inventory());
  e2.run = () => { throw Error('Reference verification failed'); };
  assert.throws(() => applyPlan(p2, e2), /Reference verification/);
  assert.equal(e2.events.some(event => event.action === 'delete-intent'), false);
});
test('container or rollback reference appearing during cleanup is protected', () => {
  const e = engine(), p = buildPlan(e.state, e.inventory()), snapshot = e.inventory;
  let scans = 0;
  e.inventory = () => {
    if (++scans === 2) e.data.containers.push({ name: 'new-stopped', imageId: id(1), state: 'exited' });
    return snapshot();
  };
  const result = applyPlan(p, e);
  assert.ok(!result.deleted.includes(id(1)));
  assert.ok(result.skipped.includes(id(1)));
  assert.ok(e.data.images.some(image => image.id === id(1)));
});
test('Docker refusal stops later image and cache removal; intent remains audited', () => {
  const e = engine(), p = buildPlan(e.state, e.inventory()), run = e.run;
  e.run = args => { if (args[0] === 'image' && args[1] === 'rm') throw Error('Docker container conflict'); return run(args); };
  assert.throws(() => applyPlan(p, e), /container conflict/);
  assert.ok(e.events.some(event => event.action === 'delete-intent'));
  assert.equal(e.commands.some(args => args[0] === 'builder'), false);
});
test('first cleanup never expands beyond the exact IDs presented for initial approval', () => {
  const e = engine(), p = buildPlan(e.state, e.inventory());
  const result = applyPlan(p, { ...e, firstApprovedIds: [id(1)] });
  assert.deepEqual(result.deleted, [id(1)]);
  assert.deepEqual(result.skipped, [id(2)]);
  assert.ok(e.events.some(event => event.action === 'deferred-first-approval'));
});
test('no destructive CLI path before approval and no cleanup on failed/no-op deploy', () => {
  const cli = readFileSync(new URL('./docker-image-retention.mjs', import.meta.url), 'utf8');
  const deploy = readFileSync(new URL('./deploy-app.sh', import.meta.url), 'utf8');
  assert.ok(cli.indexOf("No cleanup: first deletion requires operator approval.") < cli.indexOf('const result = applyPlan'));
  assert.ok(cli.includes("if (mode === 'plan') return"));
  assert.ok(cli.includes("if (mode === 'approve')"));
  assert.ok(deploy.indexOf('success app') > deploy.indexOf('"$domain/"'));
  assert.ok(deploy.indexOf('prepare app') < deploy.indexOf('build "$service"'));
  assert.ok(deploy.lastIndexOf('started=0') < deploy.indexOf('success app'));
  assert.ok(!cli.includes('system\', \'prune'));
});
test('reference scanner exports only image coordinates, never env fields or file bodies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sigap-ref-'));
  try {
    writeFileSync(join(dir, 'rollback.json'), JSON.stringify({ image: id(1), secret: 'MUST_NOT_LEAK' }));
    mkdirSync(join(dir, 'secrets')); writeFileSync(join(dir, 'secrets', 'hidden.json'), id(2));
    const audit = auditReferences([dir], [image(1), image(2)]);
    assert.equal(audit.filesAudited, 1);
    assert.equal(audit.references.length, 1);
    assert.ok(!JSON.stringify(audit).includes('MUST_NOT_LEAK'));
  } finally { rmSync(dir, { recursive: true }); }
});
test('actual Docker inventory deduplicates image IDs and includes stopped containers', () => {
  const result = collectInventory({ referenceRoots: [] }, args => {
    if (args[0] === 'image' && args[1] === 'ls') return id(1) + '\n' + id(1);
    if (args[0] === 'image') return JSON.stringify([{ Id: id(1), RepoTags: ['agenda-flow:v1'], Config: { Env: ['DO_NOT_EXPOSE=secret'] } }]);
    if (args[0] === 'ps') return 'container';
    return JSON.stringify([{ Id: 'container', Name: '/stopped', Image: id(1), State: { Status: 'exited' }, Config: { Env: ['SECRET'] } }]);
  });
  assert.equal(result.images.length, 1); assert.equal(result.containers[0].state, 'exited');
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('a real host flock excludes concurrent deployment and cleanup processes', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sigap-lock-')), lock = join(dir, 'deploy.lock');
  const child = spawn('flock', ['--exclusive', lock, 'node', '-e', "console.log('LOCKED');process.stdin.resume()"]);
  try {
    await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
    const loser = spawnSync('flock', ['--exclusive', '--nonblock', lock, 'true']);
    assert.equal(loser.status, 1);
  } finally {
    const closed = new Promise(resolve => child.once('close', resolve)); child.stdin.end(); await closed;
    assert.equal(spawnSync('flock', ['--exclusive', '--nonblock', lock, 'true']).status, 0);
    rmSync(dir, { recursive: true });
  }
});
