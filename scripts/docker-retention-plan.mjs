import { createHash } from 'node:crypto';

export const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
export const SERVICE_KEY = /^[a-z][a-z0-9-]{0,39}$/;
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const retainedTag = (service, id) => `sigap-retained/${service}:sha-${id.slice(7)}`;

export function validateState(state) {
  if (state?.version !== 1 || !Array.isArray(state.services) || !Array.isArray(state.managedImages)
    || !Array.isArray(state.externalReferences)) throw Error('Invalid retention state');
  const keys = new Set(), names = new Set();
  for (const service of state.services) {
    if (!SERVICE_KEY.test(service.key) || keys.has(service.key) || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(service.container)
      || names.has(service.container) || !Array.isArray(service.releases)) throw Error('Invalid/duplicate retention service');
    keys.add(service.key); names.add(service.container);
    for (const release of service.releases) {
      if (!IMAGE_ID.test(release.id) || !Number.isFinite(Date.parse(release.completedAt)) || !release.evidence)
        throw Error('Release must have a full image ID and successful-deployment evidence');
    }
  }
  if (state.managedImages.some(id => !IMAGE_ID.test(id))
    || state.externalReferences.some(ref => !IMAGE_ID.test(ref.id) || !ref.source)) throw Error('Invalid managed image/reference');
  return state;
}

export function buildPlan(state, inventory) {
  validateState(state);
  const images = new Map(inventory.images.map(image => [image.id, image]));
  if (images.size !== inventory.images.length || [...images.keys()].some(id => !IMAGE_ID.test(id))) throw Error('Invalid image inventory');
  const reasons = new Map(), slots = [];
  const protect = (id, reason) => {
    if (!images.has(id)) throw Error(`Protected image is missing: ${id}`);
    reasons.set(id, [...(reasons.get(id) || []), reason]);
  };
  for (const container of inventory.containers) protect(container.imageId, `container:${container.name}:${container.state}`);
  for (const ref of [...state.externalReferences, ...inventory.references]) {
    if (images.has(ref.id)) protect(ref.id, `reference:${ref.source}`);
  }
  for (const service of state.services) {
    const current = inventory.containers.find(container => container.name === service.container);
    if (!current) throw Error(`Managed container is missing: ${service.container}`);
    const releases = [...service.releases].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
    const unique = [...new Set(releases.map(release => release.id))].filter(id => id !== current.imageId);
    // Missing retained rollback versions are an audit failure, not permission to skip them.
    const rollback = unique.slice(0, 3);
    protect(current.imageId, `active:${service.key}`);
    for (const [index, id] of rollback.entries()) protect(id, `rollback:${service.key}:${index + 1}`);
    slots.push({ service: service.key, container: service.container, active: current.imageId,
      rollback: rollback.map(id => ({ id, tag: retainedTag(service.key, id) })) });
  }
  const owned = new Set([...state.managedImages, ...state.services.flatMap(service => service.releases.map(release => release.id))]);
  const keep = [], remove = [];
  for (const image of [...images.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const why = reasons.get(image.id) || [];
    if (!owned.has(image.id)) why.push('unmanaged-or-unverified');
    // An unknown repository tag on a known ID is an additional ownership boundary.
    if ((image.tags || []).some(tag => !/^(agenda-flow:|sigap-retained\/)/.test(tag))) why.push('foreign-repository-tag');
    (why.length ? keep : remove).push({ ...image, reasons: why.length ? why : ['older-managed-version'] });
  }
  const basis = { policy: 'active-plus-3-unique-successful-rollbacks-v1', slots, keep, remove,
    containers: inventory.containers, references: inventory.references, externalReferences: state.externalReferences,
    stateDigest: digest(state), cache: { unusedOnly: true, olderThanHours: 168 } };
  return { ...basis, planDigest: digest(basis) };
}
