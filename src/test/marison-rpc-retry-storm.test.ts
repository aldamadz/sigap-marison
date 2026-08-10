import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeMarisonPayloadMappingCommand } from '../../server/marison-payload-mapping-handler.mjs';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Marison RPC retry-storm hardening', () => {
  it('makes replacement retries idempotent and mapping conflicts non-throwing in SQL', () => {
    const migration = read('supabase/migrations/20260810090000_stop_marison_rpc_retry_storm.sql');
    expect(migration).toContain('return v_existing');
    expect(migration).toContain("'unchanged', true");
    expect(migration).toContain("'conflict', true");
    expect(migration).toContain("'EXPECTED_VERSION_REQUIRED'");
    expect(migration).toContain("'STALE_VERSION'");
    expect(migration).toContain('from public, anon, authenticated, service_role');
    expect(migration).not.toContain("raise exception 'Replacement already exists'");
    expect(migration).not.toContain("raise exception 'Expected version wajib diisi'");
    expect(migration).not.toMatch(/grant execute on function public\.[a-z_]+_strict/);
  });

  it('maps a structured SQL conflict to HTTP 409 without retrying the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { conflict: true, code: 'EXPECTED_VERSION_REQUIRED' },
      error: null,
    });

    await expect(executeMarisonPayloadMappingCommand({
      actorId: '00000000-0000-4000-8000-000000000003',
      environment: 'staging',
      payload: {
        entityType: 'profile',
        recordId: '00000000-0000-4000-8000-000000000001',
        targetRecordId: '00000000-0000-4000-8000-000000000002',
        reason: 'Ganti mapping staging',
      },
      rpc,
    })).rejects.toMatchObject({
      status: 409,
      code: 'EXPECTED_VERSION_REQUIRED',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
