import { appendFileSync, existsSync, fstatSync, readFileSync, renameSync, statSync, statfsSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildPlan, digest, IMAGE_ID, retainedTag, validateState } from './docker-retention-plan.mjs';
import { collectInventory, docker } from './docker-retention-inventory.mjs';

const ROOT = '/opt/sigap/image-retention';
const write = (path, value) => {
  writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(path + '.tmp', path);
};
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const disk = () => { const s = statfsSync('/'); return { total: s.blocks * s.bsize, free: s.bavail * s.bsize }; };
const containerImage = (run, container) => JSON.parse(run(['container', 'inspect', container]))[0].Image;
const inspectId = (run, ref) => JSON.parse(run(['image', 'inspect', ref]))[0].Id;

export function assertHeldLock() {
  if (hostname() !== 'sigap-app-prod-01' || readFileSync('/run/systemd/container', 'utf8').trim() !== 'lxc'
    || process.env.SIGAP_PRODUCTION_LOCK !== '1') throw Error('Use the CT104 shared-lock wrapper');
  const fd = fstatSync(9), file = statSync(ROOT + '/deployment.lock');
  if (fd.dev !== file.dev || fd.ino !== file.ino || !/FLOCK\s+ADVISORY\s+WRITE/.test(readFileSync('/proc/self/fdinfo/9', 'utf8')))
    throw Error('The inherited deployment lock is not held');
}

export function verifySuccess(inventory, state, serviceKey, expectedImage) {
  const service = state.services.find(entry => entry.key === serviceKey);
  const container = inventory.containers.find(entry => entry.name === service?.container);
  if (!service || !IMAGE_ID.test(expectedImage) || container?.imageId !== expectedImage
    || container.state !== 'running' || container.health === 'unhealthy'
    || serviceKey === 'app' && container.health !== 'healthy') throw Error('Deployment success/health identity mismatch');
  return service;
}

export async function verifyPublic(expectedSha, fetcher = fetch) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw Error('Invalid deployed revision');
  for (const path of ['/health/version', '/health/live', '/health/ready', '/']) {
    const response = await fetcher('https://sigap.marisoncloud.com' + path, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (response.status !== 200) throw Error('Post-deploy smoke check failed');
    if (path === '/health/version') {
      if ((await response.json()).gitSha !== expectedSha) throw Error('Public SHA mismatch');
    } else await response.body?.cancel();
  }
}

export function refreshRollbackReferences(plan, run, save) {
  const references = [];
  for (const slot of plan.slots) {
    for (const id of [slot.active, ...slot.rollback.map(row => row.id)]) {
      const tag = retainedTag(slot.service, id);
      run(['image', 'tag', id, tag]);
      if (inspectId(run, tag) !== id) throw Error('Rollback tag verification failed');
    }
    references.push({ ...slot, activeTag: retainedTag(slot.service, slot.active) });
  }
  // Publish only after every full-ID reference has been verified.
  save({ version: 1, planDigest: plan.planDigest, services: references });
}

export function applyPlan(plan, { run, inventory, state, audit, saveReferences, firstApprovedIds = null, pruneCache = true }) {
  // Re-read all containers/images/references under the same lock; never use stale approval coordinates.
  if (buildPlan(state, inventory()).planDigest !== plan.planDigest) throw Error('Inventory changed; review a new plan');
  refreshRollbackReferences(plan, run, saveReferences);
  const deleted = [], skipped = [];
  for (const candidate of plan.remove) {
    if (firstApprovedIds && !firstApprovedIds.includes(candidate.id)) {
      skipped.push(candidate.id); audit({ action: 'deferred-first-approval', id: candidate.id }); continue;
    }
    const current = inventory();
    if (current.containers.some(container => container.imageId === candidate.id)
      || current.references.some(ref => ref.id === candidate.id)
      || state.externalReferences.some(ref => ref.id === candidate.id)) {
      skipped.push(candidate.id); audit({ action: 'skip-protected', id: candidate.id }); continue;
    }
    const image = current.images.find(image => image.id === candidate.id);
    if (!image) { audit({ action: 'already-absent', id: candidate.id }); continue; }
    if (JSON.stringify(image.tags) !== JSON.stringify(candidate.tags)) throw Error('Image tags changed; cleanup stopped');
    // Untag exact audited refs only. No --force, no parent pruning; Docker also rejects new container references.
    const refs = image.tags.length ? image.tags : [image.id];
    for (const ref of refs) if (inspectId(run, ref) !== candidate.id) throw Error('Image reference changed');
    audit({ action: 'delete-intent', id: candidate.id, tags: refs });
    const output = run(['image', 'rm', '--no-prune', ...refs]);
    const remains = inventory().images.some(image => image.id === candidate.id);
    audit({ action: remains ? 'untagged-not-deleted' : 'image-deleted', id: candidate.id, tags: refs, output });
    if (!remains) deleted.push(candidate.id);
  }
  if (pruneCache) {
    audit({ action: 'cache-prune-start', unusedOnly: true, olderThanHours: 168 });
    const output = run(['builder', 'prune', '--force', '--filter', 'until=168h']);
    audit({ action: 'cache-prune-finish', output });
  }
  return { deleted, skipped };
}

async function main() {
  process.umask(0o077); assertHeldLock();
  const [mode, serviceKey, imageId, sha] = process.argv.slice(2);
  if (!['plan', 'prepare', 'success', 'approve'].includes(mode)) throw Error('Expected plan|prepare|success|approve');
  const policy = read(ROOT + '/policy.json'), state = validateState(read(ROOT + '/state.json'));
  const audit = value => appendFileSync(ROOT + '/audit.jsonl', JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n', { mode: 0o600 });
  const referenceAudit = () => JSON.parse(execFileSync(process.getuid() === 0
    ? '/usr/local/sbin/sigap-retention-reference-audit' : 'sudo',
  process.getuid() === 0 ? [] : ['-n', '/usr/local/sbin/sigap-retention-reference-audit'],
  { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  const inventory = () => collectInventory(policy, docker, referenceAudit);
  if (mode === 'prepare') {
    const service = state.services.find(entry => entry.key === serviceKey);
    if (!service || containerImage(docker, service.container) !== imageId || !IMAGE_ID.test(imageId)) throw Error('Pre-build image mismatch');
    docker(['image', 'tag', imageId, retainedTag(serviceKey, imageId)]);
    audit({ action: 'pre-build-pin', service: serviceKey, id: imageId });
    return;
  }
  if (mode === 'approve') {
    // Approval enables future post-success runs, but is NOT itself a cleanup trigger.
    const plan = read(ROOT + '/pending-plan.json'), fresh = buildPlan(state, inventory());
    if (serviceKey !== plan.planDigest || fresh.planDigest !== plan.planDigest) throw Error('Exact current plan approval required');
    write(ROOT + '/approval.json', { policy: fresh.policy, policyDigest: digest(policy), planDigest: fresh.planDigest,
      approvedAt: new Date().toISOString(), stateDigest: digest(state), firstApprovedIds: fresh.remove.map(image => image.id), firstCleanupCompleted: false });
    audit({ action: 'policy-approved', planDigest: fresh.planDigest });
    console.log('Approval recorded; cleanup waits for a verified deployment-success hook.');
    return;
  }
  if (mode === 'success') {
    const actual = inventory(), service = verifySuccess(actual, state, serviceKey, imageId);
    if (serviceKey === 'app') await verifyPublic(sha);
    else {
      // Coordinated worker releases must supply BOTH trusted service-specific checks.
      const checks = policy.serviceChecks?.[serviceKey];
      if (!checks?.health || !checks?.smoke) throw Error('Service-specific health/smoke adapters must be installed before recording this rollout');
      for (const kind of ['health', 'smoke']) {
        const check = checks[kind];
        if (!Array.isArray(check) || check.length < 1 || !/^\/usr\/local\/lib\/sigap-image-retention\//.test(check[0]))
          throw Error('Health/smoke adapter must be an installed trusted executable');
        const evidence = JSON.parse(execFileSync(check[0], [...check.slice(1), service.container, imageId, sha],
          { encoding: 'utf8', timeout: 60000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] }));
        if (evidence.ok !== true || evidence.imageId !== imageId || evidence.service !== serviceKey) throw Error('Service-specific check failed');
      }
    }
    if (containerImage(docker, service.container) !== imageId) throw Error('Container changed during smoke tests');
    service.releases = [...service.releases.filter(release => release.id !== imageId),
      { id: imageId, completedAt: new Date().toISOString(), revision: sha,
        evidence: serviceKey === 'app' ? 'container-healthy+public-version/live/ready/root' : 'service-specific-health+smoke-adapters' }];
    state.managedImages = [...new Set([...state.managedImages, imageId])];
    write(ROOT + '/state.json', state);
    audit({ action: 'successful-deployment', service: serviceKey, id: imageId, revision: sha });
  }
  const plan = buildPlan(state, inventory());
  write(ROOT + '/pending-plan.json', plan);
  console.log(JSON.stringify({ planDigest: plan.planDigest, retained: plan.keep.length, candidates: plan.remove.length, slots: plan.slots }));
  if (mode === 'plan') return;
  if (!existsSync(ROOT + '/approval.json') || read(ROOT + '/approval.json').policy !== plan.policy
    || read(ROOT + '/approval.json').policyDigest !== digest(policy)) {
    audit({ action: 'approval-required', planDigest: plan.planDigest }); console.log('No cleanup: first deletion requires operator approval.'); return;
  }
  const before = disk(); audit({ action: 'cleanup-start', planDigest: plan.planDigest, disk: before });
  try {
    const approval = read(ROOT + '/approval.json');
    if (approval.firstCleanupCompleted !== true && (!Array.isArray(approval.firstApprovedIds)
      || approval.firstApprovedIds.some(id => !IMAGE_ID.test(id)))) throw Error('First deletion approval is incomplete');
    const result = applyPlan(plan, { run: docker, inventory, state, audit,
      firstApprovedIds: approval.firstCleanupCompleted ? null : approval.firstApprovedIds,
      saveReferences: references => write(ROOT + '/rollback.json', references) });
    const after = disk();
    audit({ action: 'cleanup-finish', ...result, before, after, freedBytes: after.free - before.free });
    if (!approval.firstCleanupCompleted) write(ROOT + '/approval.json', { ...approval, firstCleanupCompleted: true });
  } catch (error) {
    audit({ action: 'cleanup-failed', message: error.message, before, after: disk() }); throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
