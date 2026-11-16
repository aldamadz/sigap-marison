import test from 'node:test';
import assert from 'node:assert/strict';
import { statusOnly } from './status-release-scope.mjs';

test('status-only rollout excludes app deployment only for a narrow complete diff', () => {
  assert.equal(statusOnly(['ops/status-page/cpanel/runtime.mjs', 'docs/FEATURE_RELEASE_MAP.md']), true);
  assert.equal(statusOnly(['ops/status-page/page.mjs', '.github/workflows/status-page-quality.yml']), true);
  assert.equal(statusOnly(['scripts/status-release-scope.mjs', '.github/workflows/deploy-production.yml']), true);
  assert.equal(statusOnly([]), false);
  for (const file of ['backend/src/index.ts', 'shared/src/index.ts', 'src/App.tsx', 'dockerfile',
    'supabase/migrations/example.sql', 'package-lock.json', 'public/logo-marison.png',
    'scripts/deploy-app.sh', 'ops/status-page-other/malicious.mjs']) {
    assert.equal(statusOnly(['ops/status-page/page.mjs', file]), false, file);
  }
});
