import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPicomatch } from './picomatch-backport.mjs';

const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const severe = severity => severity === 'high' || severity === 'critical';
const exact = cause => cause?.name === 'picomatch' && cause.url === advisory && cause.severity === 'high';

export function verifyStagingAudit(report, packages, patched, now = Date.now()) {
  const findings = report.vulnerabilities;
  assert.ok(!report.error && findings && report.auditReportVersion === 2 && report.metadata?.vulnerabilities,
    'Expected a complete npm audit report');
  for (const cause of Object.values(findings).flatMap(item => item.via)) {
    if (typeof cause === 'string') assert.ok(findings[cause], 'Incomplete transitive advisory chain');
    else if (severe(cause.severity)) assert.ok(exact(cause), 'Unmitigated high or critical advisory');
  }
  const reachesPatch = (name, seen = new Set()) => {
    if (seen.has(name) || !findings[name]) return false;
    const next = new Set([...seen, name]);
    return findings[name].via.some(cause => typeof cause === 'string' ? reachesPatch(cause, next) : exact(cause));
  };
  const high = Object.entries(findings).filter(([, item]) => severe(item.severity));
  assert.equal(high.length, report.metadata.vulnerabilities.high + report.metadata.vulnerabilities.critical);
  if (high.length) assert.ok(now < Date.parse('2026-12-18T00:00:00+07:00'), 'Review or remove the temporary staging backport');
  for (const [name, item] of high) {
    assert.equal(item.severity, 'high', 'Critical advisories always block staging');
    assert.ok(item.nodes?.length && item.nodes.every(path => packages[path]?.dev === true),
      'A high finding affects a non-dev dependency');
    assert.ok(reachesPatch(name), 'High finding is not explained by the verified backport');
    if (name === 'picomatch') assert.ok(item.nodes.every(path => patched.has(path)), 'An affected picomatch copy is unverified');
  }
  return high.length;
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  assert.ok(process.env.npm_execpath, 'Run via npm run audit:staging');
  const patched = checkPicomatch(process.cwd());
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', '--audit-level=high'], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.ok([0, 1].includes(result.status), 'npm audit failed to run');
  const report = JSON.parse(result.stdout);
  const { packages } = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  try {
    const count = verifyStagingAudit(report, packages, patched);
    assert.equal(result.status, count > 0 ? 1 : 0, 'Inconsistent npm audit exit status');
    console.log(JSON.stringify({ ...report.metadata.vulnerabilities, verifiedBackportFindings: count }));
    if (count > 0) console.log(`Staging only: ${advisory} remains reported for the pinned npm version; installed parser digests verified.`);
  } catch (error) {
    console.error(result.stdout);
    throw error;
  }
}
