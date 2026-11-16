import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

test('installer preserves provider rules/unrelated cron jobs and is idempotent in an isolated home', async t => {
  if (process.env.STATUS_PHP_TEST !== '1') { t.skip('PHP-enabled hosting required'); return; }
  const home = await mkdtemp(resolve(process.env.HOME || tmpdir(), 'status-install-'));
  try {
    const privateRoot = resolve(home, 'status-private');
    const release = resolve(privateRoot, 'releases/test');
    const web = resolve(home, 'status.marisoncloud.com/public');
    const bin = resolve(home, 'bin');
    for (const path of [release, web, bin, resolve(release, 'public')]) await mkdir(path, { recursive: true });
    for (const name of ['install.php', 'public/index.php', 'public/.htaccess']) await copyFile(new URL(name, import.meta.url), resolve(release, name));
    await writeFile(resolve(release, 'runtime.mjs'), '');
    await writeFile(resolve(privateRoot, 'status.sqlite'), 'fixture only');
    const config = { origin: 'https://status.marisoncloud.com', environment: 'preview',
      database: resolve(privateRoot, 'status.sqlite'), runtime: resolve(release, 'runtime.mjs') };
    const configPath = resolve(privateRoot, 'config.json');
    await writeFile(configPath, JSON.stringify(config));
    const provider = '# Provider-generated PHP settings\n<IfModule lsapi_module>\nphp_flag log_errors On\n</IfModule>\n';
    await writeFile(resolve(web, '.htaccess'), provider);
    const cronFixture = resolve(home, 'cron-fixture');
    const original = '# unrelated existing jobs\n0 4 * * * existing-backup\n';
    await writeFile(cronFixture, original);
    const fakeCrontab = resolve(bin, 'crontab');
    await writeFile(fakeCrontab, `#!${process.execPath}\nimport fs from 'node:fs';
const file=process.env.STATUS_CRON_FIXTURE;
if(process.argv[2]==='-l')process.stdout.write(fs.readFileSync(file));
else if(process.argv[2]==='-')fs.writeFileSync(file,fs.readFileSync(0));
else process.exit(1);\n`);
    await chmod(fakeCrontab, 0o700);
    const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, STATUS_CRON_FIXTURE: cronFixture };
    assert.equal(execFileSync('which', ['crontab'], { env, encoding: 'utf8' }).trim(), fakeCrontab);
    const install = (...args) => spawnSync('php', [resolve(release, 'install.php'), ...args], { env, encoding: 'utf8' });
    assert.equal(install('web').status, 0);
    assert.equal(install('web').status, 0);
    const actual = await readFile(resolve(web, '.htaccess'), 'utf8');
    assert.ok(actual.startsWith(provider));
    assert.equal(actual.match(/# BEGIN SIGAP STATUS OPS16/g).length, 1);
    assert.notEqual(install('cron', '--production').status, 0);
    assert.equal(await readFile(cronFixture, 'utf8'), original);
    config.environment = 'production';
    await writeFile(configPath, JSON.stringify(config));
    assert.equal(install('cron', '--production').status, 0);
    const first = await readFile(cronFixture, 'utf8');
    assert.ok(first.startsWith(original));
    assert.equal(install('cron', '--production').status, 0);
    assert.equal(await readFile(cronFixture, 'utf8'), first);
    await writeFile(resolve(web, 'index.php'), '<?php echo "not the status gateway";');
    assert.notEqual(install('web').status, 0);
    assert.equal(await readFile(resolve(web, 'index.php'), 'utf8'), '<?php echo "not the status gateway";');
  } finally { await rm(home, { recursive: true, force: true }); }
});
