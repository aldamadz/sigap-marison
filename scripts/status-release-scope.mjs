import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASE_FILES = new Set([
  'docs/FEATURE_RELEASE_MAP.md',
  'scripts/status-release-scope.mjs',
  'scripts/status-release-scope.test.mjs',
  '.github/workflows/status-page-quality.yml',
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/deploy-production.yml',
]);

export function statusOnly(files) {
  return files.length > 0 && files.every(file => file.startsWith('ops/status-page/') || RELEASE_FILES.has(file));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const base = process.argv[2];
  if (!/^[a-f0-9]{40}$/.test(base || '')) throw Error('An exact live runtime SHA is required');
  execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD']);
  const files = execFileSync('git', ['diff', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  process.stdout.write(`status_only=${statusOnly(files)}\n`);
}
