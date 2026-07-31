import { describe, expect, it } from 'vitest';
import {
  buildApprovalResolutionKey,
  getCanonicalRequesterProfileId,
  mergePayloadResolutionSources,
  resolveApprovalPayloadIdentities,
  resolveProfilePayloadIdentity,
} from '../../server/marison-payload-identity.mjs';

describe('MRN-16 per-profile signer payload resolution', () => {
  it('keeps requester and signer mappings independent', () => {
    const requester = resolveProfilePayloadIdentity({ profileId: 'A', sourceNik: 'TRIAL-001', mappingNik: 'A 114', validSourceNik: false });
    const approvals = resolveApprovalPayloadIdentities([
      { profileId: 'B', sourceNik: 'TRIAL-002' },
      { profileId: 'C', sourceNik: 'TRIAL-003' },
    ], { B: 'A 115', C: 'A 116' }, { B: false, C: false });
    expect(requester.nik).toBe('A 114');
    expect(approvals.map((item) => item.nik)).toEqual(['A 115', 'A 116']);
    expect(approvals.every((item) => item.nik !== requester.nik)).toBe(true);
  });

  it('uses validated SIGAP NIK without mapping and fails invalid signer', () => {
    expect(resolveProfilePayloadIdentity({ profileId: 'B', sourceNik: 'A 115', mappingNik: '', validSourceNik: true }).source).toBe('synchronized');
    expect(() => resolveProfilePayloadIdentity({ profileId: 'C', sourceNik: 'TRIAL-003', mappingNik: '', validSourceNik: false })).toThrow('C');
  });

  it('uses current profile mapping over stale signer snapshot and repeats consistently', () => {
    const signers = [{ profileId: 'B', sourceNik: 'OLD' }, { profileId: 'B', sourceNik: 'OLD' }];
    const resolved = resolveApprovalPayloadIdentities(signers, { B: 'A 115' }, { B: false });
    expect(resolved.map((item) => item.nik)).toEqual(['A 115', 'A 115']);
  });

  it('uses the business requester instead of the admin who created the record', () => {
    expect(getCanonicalRequesterProfileId({
      created_by: 'admin-profile',
      requester_snapshot: { profile_id: 'requester-profile' },
    })).toBe('requester-profile');
    expect(getCanonicalRequesterProfileId({
      created_by: 'admin-profile',
      data_snapshot: { requester: { user_id: 'requester-from-data' } },
    })).toBe('requester-from-data');
  });

  it('keeps resolution metadata unique for repeated signers at different stages', () => {
    expect(buildApprovalResolutionKey(2, 'signer-a')).toBe('approval:2:signer-a');
    expect(buildApprovalResolutionKey(4, 'signer-a')).toBe('approval:4:signer-a');
    expect(mergePayloadResolutionSources(
      { branchId: 'synchronized', projectId: 'mapping_staging' },
      { requesterNik: 'mapping_staging', 'approval:2:signer-a': 'synchronized' },
    )).toEqual({
      branchId: 'synchronized',
      projectId: 'mapping_staging',
      requesterNik: 'mapping_staging',
      'approval:2:signer-a': 'synchronized',
    });
  });
});
