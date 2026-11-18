import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = '4.0.7';
const integrity = 'sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==';
const sourceHash = '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4';
const patchedHash = '8a80ae82b181e36061b905a476249b359d2a2d2c576c638f8b65a12718f0633e';
const digest = data => createHash('sha256').update(data).digest('hex');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const isPicomatch = (path, entry) => /(?:^|\/)node_modules\/picomatch$/u.test(path) || entry.name === 'picomatch';

export function checkPicomatch(root, { apply = false, omitDev = false } = {}) {
  const packages = readJson(join(root, 'package-lock.json')).packages;
  const entries = Object.entries(packages).filter(([path, entry]) => isPicomatch(path, entry));
  assert.ok(entries.length, 'No pinned picomatch entries: remove or update the staging backport');
  for (const [path, entry] of entries) {
    assert.match(path, /^(?:[\w@.-]+\/)*node_modules\/picomatch$/u);
    assert.ok(!path.split('/').includes('..'));
    assert.equal(entry.version, version, 'Backport must be reviewed for a new version');
    assert.equal(entry.integrity, integrity, 'Unexpected picomatch tarball integrity');
    assert.equal(entry.dev, true, 'Backport is only permitted for dev dependencies');
    const directory = join(root, path);
    if (omitDev) {
      assert.ok(!existsSync(directory), 'picomatch must not be installed in an omit-dev image');
      continue;
    }
    assert.ok(!lstatSync(directory).isSymbolicLink(), 'Unexpected linked dependency');
    assert.equal(readJson(join(directory, 'package.json')).version, version);
    const file = join(directory, 'lib', 'parse.js');
    assert.ok(lstatSync(file).isFile(), 'Expected a regular parser file');
    const contents = readFileSync(file);
    if (apply && digest(contents) === sourceHash) {
      // Disable extglobs at both parser entry points, even when a caller opts in.
      const modified = contents.toString('utf8').replaceAll('const opts = { ...options };',
        'const opts = { ...options, noext: true, noextglob: true };');
      assert.equal(digest(modified), patchedHash, 'Backport output integrity mismatch');
      writeFileSync(file, modified);
    }
    assert.equal(digest(readFileSync(file)), patchedHash, 'Patched picomatch parser was not installed');
  }
  return new Set(entries.map(([path]) => path));
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const paths = checkPicomatch(process.cwd(), { apply: true, omitDev: process.env.NODE_ENV === 'production' });
  console.log(`Verified picomatch backport lock: ${paths.size} dev entr${paths.size === 1 ? 'y' : 'ies'}.`);
}
