import { writeFileSync, readdirSync } from 'node:fs';
import { collectInventory } from '../../scripts/docker-retention-inventory.mjs';
import { buildPlan } from '../../scripts/docker-retention-plan.mjs';

// Read-only bootstrap report for the audited CT104 inventory. Does NOT install or delete.
process.umask(0o077);
if (process.getuid() !== 0) throw Error('Run as the CT104 operator');
const roots = ['/opt/sigap/rollouts', '/opt/sigap/releases', '/opt/sigap/maintenance',
  ...readdirSync('/opt/sigap').filter(name => /\.(py|mjs|sh|json|ya?ml)$/.test(name)).map(name => '/opt/sigap/' + name)];
const inventory = collectInventory({ referenceRoots: roots });
const imageFor = tag => {
  const image = inventory.images.find(image => image.tags.includes(tag));
  if (!image) throw Error('Bootstrap tag missing: ' + tag);
  return image;
};
const service = (key, container, rollbackTags) => {
  const current = inventory.containers.find(row => row.name === container);
  if (!current || current.state !== 'running') throw Error('Bootstrap service not running: ' + container);
  const ids = [...new Set([...rollbackTags.map(tag => imageFor(tag).id), current.imageId])];
  return { key, container, releases: ids.map(id => ({ id,
    completedAt: inventory.images.find(image => image.id === id).created,
    evidence: id === current.imageId ? 'bootstrap-live-container' : 'audited-preexisting-rollback-tag',
  })) };
};
const state = { version: 1,
  services: [
    service('app', 'agenda-flow-prod', ['agenda-flow:sec04-production-626b5bd31d', 'agenda-flow:rollback-nav-sur43-20261110', 'agenda-flow:rollback-sur44-20261110']),
    service('pdf', 'agenda-pdf-worker', ['agenda-flow:rollback-755-prod-pdf', 'agenda-flow:rollback-766-prod-pdf', 'agenda-flow:sec04-production-rollback-1']),
    service('sync', 'agenda-marison-sync', ['agenda-flow:sec03-production-workers-base-0', 'agenda-flow:sec04-production-rollback-2']),
    service('outbound', 'agenda-marison-outbound', ['agenda-flow:sec03-production-workers-base-1', 'agenda-flow:sec04-production-rollback-3']),
    service('external-api', 'agenda-flow-external-api', ['sigap-external:rollback-source573', 'agenda-flow:sec04-production-rollback-4']),
    service('tunnel', 'sigap-external-production-tunnel', []),
    service('file-relay', 'sigap-production-file-relay', []),
  ],
  managedImages: inventory.images.filter(image => image.tags.length && image.tags.every(tag => tag.startsWith('agenda-flow:'))).map(image => image.id),
  externalReferences: [],
};
// Image creation dates are only bootstrap ordering; future releases use verified completion time.
const policy = { version: 1, keepRollbackCount: 3, cacheOlderThanHours: 168, referenceRoots: [], serviceChecks: {} };
const plan = buildPlan(state, inventory);
for (const [name, value] of Object.entries({ state, policy, inventory, plan })) writeFileSync(name + '.json', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ images: inventory.images.length, containers: inventory.containers.length,
  filesAudited: inventory.filesAudited, referenceCoordinates: inventory.references.length,
  retained: plan.keep.length, candidates: plan.remove.length, planDigest: plan.planDigest }));
