import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { verifyStagingAudit } from './audit-staging.mjs';
import { checkPicomatch } from './picomatch-backport.mjs';

const req = createRequire(import.meta.url);
const matcherPath = 'node_modules/picomatch';
const toolPath = 'node_modules/example-tool';
const packages = { [matcherPath]: { dev: true }, [toolPath]: { dev: true } };
const patched = new Set([matcherPath]);
const now = Date.parse('2026-11-18T00:00:00+07:00');
const mockReport = () => ({
  auditReportVersion: 2,
  vulnerabilities: {
    picomatch: { severity: 'high', via: [{ name: 'picomatch', severity: 'high',
      url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf' }], nodes: [matcherPath] },
    'example-tool': { severity: 'high', via: ['picomatch'], nodes: [toolPath] },
  },
  metadata: { vulnerabilities: { high: 2, critical: 0 } },
});

test('all installed copies retain ordinary glob behavior with extglobs disabled', () => {
  for (const path of checkPicomatch(process.cwd())) {
    const picomatch = req(resolve(path));
    assert.equal(picomatch('src/**/*.{ts,tsx}')('src/pages/Dashboard.tsx'), true);
    assert.equal(picomatch('src/**/*.test.ts')('src/pages/Dashboard.tsx'), false);
    for (const options of [{}, { noext: false }, { noextglob: false, fastpaths: false }]) {
      const parsed = picomatch.parse('src/+(draft).txt', options);
      assert.equal(parsed.tokens.some(token => token.extglob), false);
    }
  }
});

test('accepts only the verified dev advisory and its transitive findings', () => {
  assert.equal(verifyStagingAudit(mockReport(), packages, patched, now), 2);
  assert.throws(() => verifyStagingAudit(mockReport(), packages, new Set(), now), /unverified/iu);
  assert.throws(() => verifyStagingAudit(mockReport(), { ...packages, [toolPath]: {} }, patched, now), /non-dev/u);
  assert.throws(() => verifyStagingAudit(mockReport(), packages, patched, Date.parse('2026-12-18T00:00:00+07:00')), /temporary staging backport/u);
});

test('blocks new high causes and unknown dependency chains', () => {
  const newCause = mockReport();
  newCause.vulnerabilities['example-tool'].via.push({ name: 'another-package', severity: 'high', url: 'https://example.invalid/other' });
  assert.throws(() => verifyStagingAudit(newCause, packages, patched, now), /unmitigated/iu);
  const incomplete = mockReport();
  incomplete.vulnerabilities['example-tool'].via.push('missing-advisory');
  assert.throws(() => verifyStagingAudit(incomplete, packages, patched, now), /incomplete/iu);
});
