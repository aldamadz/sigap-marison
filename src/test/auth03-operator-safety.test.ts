import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('keeps AUTH-03 operator guards and rollback effective with Python optimization', () => {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' };
  if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT;
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['-B', 'ops/auth03/test_safety_guards.py'], { env, encoding: 'utf8', timeout: 20000 });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
});
