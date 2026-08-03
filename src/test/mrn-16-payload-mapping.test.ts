import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  parseMarisonPayloadCatalogQuery,
  parseMarisonPayloadMappingCommand,
} from '../../server/marison-payload-mapping-request.mjs';
import { executeMarisonPayloadMappingCommand } from '../../server/marison-payload-mapping-handler.mjs';
import { matchesMarisonPayloadMappingFilter } from '@/lib/marison-payload-mapping';
import { resolveMarisonEffectiveProjectBranch } from '../../server/marison-branch-resolution.mjs';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('MRN-16 staging payload mappings', () => {
  it('uses mirror catalogs and mapping endpoints, never free-form external IDs', () => {
    const migration = read('supabase/migrations/20260731100000_marison_outbound_payload_mappings.sql');
    const service = read('src/services/marison-payload-mapping.service.ts');
    const backend = read('backend/src/domain-runtime.ts');
    expect(migration).toContain('marison_outbound_record_mappings');
    expect(migration).toContain('target_record_id');
    expect(migration).toContain("p_environment <> 'staging'");
    expect(service).toContain('/api/admin/marison-payload-mappings');
    expect(backend).toContain('getMarisonPayloadMappings');
    expect(backend).toContain('configureMarisonPayloadMapping');
    expect(backend).toContain('marison_employee_id');
    expect(backend).toContain('marison_branch_id');
    expect(backend).toContain('marison_project_id');
  });

  it('uses valid activity log enum values for mapping inserts and updates', () => {
    const migration = read('supabase/migrations/20260731145000_fix_marison_payload_mapping_audit_action.sql');
    expect(migration).toContain("'INSERT'::public.activity_action");
    expect(migration).toContain("'UPDATE'::public.activity_action");
    expect(migration).not.toContain("'UPSERT'");
  });

  it('resolves requester and each signer by stable profile ID', () => {
    const backend = read('backend/src/domain-runtime.ts');
    expect(backend).toContain('loadMarisonProfileIdentityResolver');
    expect(backend).toContain('signature.user_id');
    expect(backend).toContain('staging_mapping');
    expect(backend).toContain('buildApprovalResolutionKey(signature.step_order');
    expect(backend).toContain('const identity = await resolveMarisonOutboundIdentity(surat)');
    expect(backend).toContain('submitted_by: overrides.nik');
    expect(backend).toContain('approvals: overrides.approvals');
  });

  it('keeps singleton compatibility data out of business payload resolution', () => {
    const backend = read('backend/src/domain-runtime.ts');
    const resolver = backend.slice(backend.indexOf('const getMarisonOutboundMappings'), backend.indexOf('const getMarisonDispatchInput'));
    expect(resolver).not.toContain('marison_outbound_settings');
    expect(resolver).not.toContain('override_nik');
    expect(resolver).toContain('isValidSourceBranchId');
    expect(resolver).toContain('isValidSourceProjectId');
    expect(read('supabase/migrations/20260731170000_mrn16_external_identity_readiness.sql')).toContain('marison_payload_effective_branch_id');
  });

  it.each([
    ['048', 'unit', 13, 8],
    ['046', 'non_unit', 20, 11],
    ['047', 'non_unit', 12, 1],
  ])('resolves surat %s from effective project, not requester office', (_surat, kind, projectId, branchId) => {
    expect(resolveMarisonEffectiveProjectBranch({
      kind,
      officeBranchId: 1,
      sourceProject: { marison_project_id: projectId, marison_synced_at: '2026-08-01T00:00:00Z', master_offices: { marison_branch_id: branchId, marison_synced_at: '2026-08-01T00:00:00Z' } },
    })).toEqual({ projectId, branchId, branchSource: 'external_source' });
  });

  it('uses mapped target project and its matching target branch', () => {
    expect(resolveMarisonEffectiveProjectBranch({
      kind: 'unit',
      officeBranchId: 1,
      sourceProject: { marison_project_id: 13, marison_synced_at: '2026-08-01T00:00:00Z', master_offices: { marison_branch_id: 8, marison_synced_at: '2026-08-01T00:00:00Z' } },
      mappedProject: { marison_project_id: 20, marison_synced_at: '2026-08-01T00:00:00Z', master_offices: { marison_branch_id: 11, marison_synced_at: '2026-08-01T00:00:00Z' } },
    })).toEqual({ projectId: 20, branchId: 11, branchSource: 'staging_mapping' });
  });

  it('keeps Asset branch based on application office', () => {
    expect(resolveMarisonEffectiveProjectBranch({
      kind: 'asset',
      officeBranchId: 1,
      sourceProject: { marison_project_id: 20, master_offices: { marison_branch_id: 11 } },
    })).toEqual({ projectId: null, branchId: 1, branchSource: 'external_source' });
  });

  it('rejects invalid project or branch before POST', () => {
    const post = vi.fn();
    expect(() => resolveMarisonEffectiveProjectBranch({
      kind: 'unit',
      officeBranchId: 1,
      sourceProject: { marison_project_id: 'invalid', master_offices: { marison_branch_id: 0 } },
    })).toThrow('Effective project dan branch outbound tidak tervalidasi.');
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects stale source project provenance', () => {
    expect(() => resolveMarisonEffectiveProjectBranch({
      kind: 'unit',
      sourceProject: { marison_project_id: 13, marison_synced_at: null, master_offices: { marison_branch_id: 8, marison_synced_at: '2026-08-01T00:00:00Z' } },
    })).toThrow('Effective project dan branch outbound tidak tervalidasi.');
  });

  it('rejects stale source project office provenance', () => {
    expect(() => resolveMarisonEffectiveProjectBranch({
      kind: 'unit',
      sourceProject: { marison_project_id: 13, marison_synced_at: '2026-08-01T00:00:00Z', master_offices: { marison_branch_id: 8, marison_synced_at: null } },
    })).toThrow('Effective project dan branch outbound tidak tervalidasi.');
  });

  it('labels Asset office mapping and synchronized office source distinctly', () => {
    expect(resolveMarisonEffectiveProjectBranch({ kind: 'asset', officeBranchId: 1, officeSource: 'staging_mapping' })).toEqual({ projectId: null, branchId: 1, branchSource: 'staging_mapping' });
    expect(resolveMarisonEffectiveProjectBranch({ kind: 'asset', officeBranchId: 1, officeSource: 'external_source' })).toEqual({ projectId: null, branchId: 1, branchSource: 'external_source' });
    expect(resolveMarisonEffectiveProjectBranch({ kind: 'asset', officeBranchId: null })).toEqual({ projectId: null, branchId: null, branchSource: 'unavailable' });
  });

  it('resolves project from master data when snapshot omits external project ID', () => {
    expect(resolveMarisonEffectiveProjectBranch({
      kind: 'non_unit',
      officeBranchId: 1,
      sourceProject: { marison_project_id: 12, marison_synced_at: '2026-08-01T00:00:00Z', master_offices: { marison_branch_id: 1, marison_synced_at: '2026-08-01T00:00:00Z' } },
    })).toEqual({ projectId: 12, branchId: 1, branchSource: 'external_source' });
  });

  it('records per-signer resolution sources in immutable prepared metadata', () => {
    const migration = read('supabase/migrations/20260730120000_marison_outbound_identity_overrides.sql');
    const backend = read('backend/src/domain-runtime.ts');
    expect(migration).toContain('Payload resolution sources are immutable');
    expect(backend).toContain('p_resolution_sources: dispatch.resolutionSources');
    expect(backend).toContain('requesterNik');
    expect(backend).toContain('buildApprovalResolutionKey');
  });

  it('validates mapping commands and scoped catalog queries before calling SQL', () => {
    expect(parseMarisonPayloadMappingCommand({
      entityType: 'profile',
      recordId: '00000000-0000-4000-8000-000000000001',
      targetRecordId: '00000000-0000-4000-8000-000000000002',
      reason: 'Trial user memakai mirror employee staging',
    })).toMatchObject({ entityType: 'profile' });
    expect(() => parseMarisonPayloadMappingCommand({
      entityType: 'profile',
      recordId: 'not-a-uuid',
      reason: 'invalid',
    })).toThrow('Payload mapping tidak valid');
    expect(() => parseMarisonPayloadMappingCommand({
      entityType: 'office',
      recordId: '00000000-0000-4000-8000-000000000001',
      targetRecordId: '10000000-0000-4000-8000-000000000001',
      reason: '',
    })).toThrow('Alasan wajib');

    const catalogUrl = new URL('https://sigap.test/api/admin/marison-payload-mapping-catalog?entityType=project&q=madiun&limit=999&branchId=12');
    expect(parseMarisonPayloadCatalogQuery(catalogUrl)).toEqual({
      entityType: 'project',
      query: 'madiun',
      limit: 50,
      branchId: 12,
    });
    expect(() => parseMarisonPayloadCatalogQuery(new URL('https://sigap.test/?entityType=unknown'))).toThrow('Jenis katalog');
  });

  it('executes a validated staging mapping command and maps stale writes to conflict', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: { target_record_id: '00000000-0000-4000-8000-000000000002' },
      error: null,
    });
    await expect(executeMarisonPayloadMappingCommand({
      actorId: '00000000-0000-4000-8000-000000000003',
      environment: 'staging',
      payload: {
        entityType: 'profile',
        recordId: '00000000-0000-4000-8000-000000000001',
        targetRecordId: '00000000-0000-4000-8000-000000000002',
        reason: 'Mapping user trial ke employee mirror staging',
      },
      rpc,
    })).resolves.toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith('configure_marison_payload_mapping', expect.objectContaining({
      p_environment: 'staging',
      p_entity_type: 'profile',
    }));

    const staleError = Object.assign(new Error('stale'), { code: '40001' });
    await expect(executeMarisonPayloadMappingCommand({
      actorId: '00000000-0000-4000-8000-000000000003',
      environment: 'staging',
      payload: {
        entityType: 'profile',
        recordId: '00000000-0000-4000-8000-000000000001',
        targetRecordId: null,
        reason: 'Reset mapping yang sudah berubah',
        expectedUpdatedAt: '2026-07-31T00:00:00.000Z',
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: staleError }),
    })).rejects.toMatchObject({ status: 409 });

    await expect(executeMarisonPayloadMappingCommand({
      actorId: '00000000-0000-4000-8000-000000000003',
      environment: 'production',
      payload: {},
      rpc: vi.fn(),
    })).rejects.toMatchObject({ status: 404 });
  });

  it('classifies mapping filters without treating invalid mappings as usable', () => {
    const validMapping = {
      target_record_id: '00000000-0000-4000-8000-000000000002',
      mapping_valid: true,
    } as any;
    const invalidMapping = {
      target_record_id: '00000000-0000-4000-8000-000000000002',
      mapping_valid: false,
    } as any;

    expect(matchesMarisonPayloadMappingFilter('override', null, false, validMapping)).toBe(true);
    expect(matchesMarisonPayloadMappingFilter('override', null, false, invalidMapping)).toBe(false);
    expect(matchesMarisonPayloadMappingFilter('invalid', 10, true, invalidMapping)).toBe(true);
    expect(matchesMarisonPayloadMappingFilter('empty', null, false, null)).toBe(true);
    expect(matchesMarisonPayloadMappingFilter('unavailable', 10, false, invalidMapping)).toBe(true);
    expect(matchesMarisonPayloadMappingFilter('unavailable', 10, true, null)).toBe(false);
  });
});
