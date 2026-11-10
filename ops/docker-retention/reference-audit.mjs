import { collectInventory } from '../../scripts/docker-retention-inventory.mjs';
import { readdirSync } from 'node:fs';

// Installed root-owned, fixed entry point: no caller-controlled paths/arguments.
if (process.argv.length > 2 || process.getuid() !== 0) throw Error('Fixed root-only reference audit');
const roots = ['/opt/sigap/rollouts', '/opt/sigap/releases', '/opt/sigap/maintenance',
  ...readdirSync('/opt/sigap').filter(name => /\.(py|mjs|sh|json|ya?ml)$/.test(name)).map(name => '/opt/sigap/' + name)];
const inventory = collectInventory({ referenceRoots: roots });
console.log(JSON.stringify({ references: inventory.references, filesAudited: inventory.filesAudited }));
