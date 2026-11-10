import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Only reference coordinates leave these files; never emit environment/config contents.
export function auditReferences(roots, images) {
  const references = [], visited = new Set();
  const tokens = images.flatMap(image => [image.id, ...(image.tags || [])].map(token => ({ token, id: image.id })));
  let count = 0;
  function walk(path, depth = 0) {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) throw Error(`Reference audit refuses symlink: ${path}`);
    if (info.isDirectory()) {
      if (depth > 12) throw Error('Reference audit depth exceeded');
      const checkout = existsSync(join(path, 'package.json')) && existsSync(join(path, 'dockerfile'));
      for (const entry of readdirSync(path).sort()) {
        if (/^(source(?:-|$)|node_modules$|\.git$|\.env|secrets$|patch-context$|github-runner$)/.test(entry)) continue;
        if (checkout && !/^(docker-compose.*\.ya?ml|.*rollback.*\.json)$/.test(entry)) continue;
        walk(join(path, entry), depth + 1);
      }
    } else if (info.isFile() && /\.(json|ya?ml|sh|py|mjs|md)$/.test(path)) {
      if (++count > 5000 || info.size > 4 * 1024 * 1024) throw Error('Reference audit bound exceeded');
      const text = readFileSync(path, 'utf8');
      for (const { token, id } of tokens) if (text.includes(token)) references.push({ id, source: path, token });
      visited.add(path);
    }
  }
  for (const root of roots) walk(root);
  return { references, filesAudited: visited.size };
}

export function collectInventory(policy, run = docker, audit = null) {
  const ids = [...new Set(run(['image', 'ls', '-aq', '--no-trunc']).split(/\s+/).filter(Boolean))].sort();
  const images = ids.length ? JSON.parse(run(['image', 'inspect', ...ids])).map(image => ({
    id: image.Id, tags: (image.RepoTags || []).filter(tag => tag !== '<none>:<none>').sort(),
    created: image.Created, size: image.Size,
    revision: image.Config?.Labels?.['org.opencontainers.image.revision'] || '',
  })) : [];
  const containerIds = run(['ps', '-aq', '--no-trunc']).split(/\s+/).filter(Boolean);
  const containers = containerIds.length ? JSON.parse(run(['container', 'inspect', ...containerIds])).map(container => ({
    id: container.Id, name: container.Name.replace(/^\//, ''), imageId: container.Image,
    state: container.State.Status, health: container.State.Health?.Status || null,
  })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const references = audit ? audit() : auditReferences(policy.referenceRoots, images);
  return { images, containers, ...references };
}
