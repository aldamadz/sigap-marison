import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMarisonFundWithoutProject } from '../../server/marison-fund-without-project.mjs';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('MRN-21: dana umum tanpa proyek guard outbound', () => {
  it('treats null, undefined, and empty string as "no project" so the early return triggers', () => {
    // Kombinasi nyata dari surat dana umum: project_id null di DB menghasilkan
    // recordProjectId "" (firstString) dan sourceProjectId null (externalIdFrom).
    expect(isMarisonFundWithoutProject(null, null)).toBe(true);
    expect(isMarisonFundWithoutProject(null, '')).toBe(true);
    expect(isMarisonFundWithoutProject(undefined, undefined)).toBe(true);
    expect(isMarisonFundWithoutProject(null, undefined)).toBe(true);
    expect(isMarisonFundWithoutProject(undefined, '')).toBe(true);
  });

  it('keeps requested or recorded projects out of the dana umum early return', () => {
    // Proyek yang diminta atau tercatat tidak boleh jatuh ke jalur "tanpa proyek".
    expect(isMarisonFundWithoutProject(12, '')).toBe(false);
    expect(isMarisonFundWithoutProject(null, '00000000-0000-4000-8000-000000000001')).toBe(false);
    expect(isMarisonFundWithoutProject(12, '00000000-0000-4000-8000-000000000001')).toBe(false);
  });

  it('uses the helper in the fund guard instead of a strict null comparison', () => {
    const backend = read('backend/src/domain-runtime.ts');
    const resolver = backend.slice(backend.indexOf('const getMarisonOutboundMappings'), backend.indexOf('const getMarisonDispatchInput'));
    expect(resolver).toContain('isMarisonFundWithoutProject(sourceProjectId, recordProjectId)');
    // Regresi 2026-08-20: `=== null` gagal mengenali "" dari firstString sehingga
    // dana umum jatuh ke validasi effective project/branch dan ditolak (500).
    expect(resolver).not.toMatch(/recordProjectId\s*===\s*null/);
    expect(resolver).not.toMatch(/sourceProjectId\s*===\s*null/);
  });

  it('keeps the "requested but invalid project is rejected" invariant beside the dana umum early return', () => {
    const backend = read('backend/src/domain-runtime.ts');
    const resolver = backend.slice(backend.indexOf('const getMarisonOutboundMappings'), backend.indexOf('const getMarisonDispatchInput'));
    expect(resolver).toContain('Proyek yang diminta tapi tidak tervalidasi tetap ditolak di bawah.');
    expect(resolver).toContain('resolveMarisonEffectiveProjectBranch');
  });

  it('packages the fund-without-project helper into the runtime image so the build endpoint can import it', () => {
    // Regresi 2026-08-20: fail saat deploy karena dockerfile tidak menyalin
    // server/marison-fund-without-project.mjs sehingga import di backend/dist
    // gagal dengan ERR_MODULE_NOT_FOUND dan container tidak sehat.
    const dockerfile = read('dockerfile');
    expect(dockerfile).toContain(
      'COPY server/marison-fund-without-project.mjs ./server/marison-fund-without-project.mjs',
    );
  });
});