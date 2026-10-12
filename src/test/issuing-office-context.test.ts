import { describe, expect, it } from 'vitest';
import { projectsForIssuingOffice } from '@/features/surat/registration/lib/issuing-office-context';
import { getBranchOfficerCandidates } from '@/features/surat/registration/lib/branch-officer-candidates';
import { isFirstMakerCandidate } from '@/features/surat/registration/lib/first-maker-candidates';
import { isProfileLocationReady } from '@/components/surat/form/surat-form-schema';

const offices = [
  { id: 'solo', kedudukan: 'KC', parent_id: null },
  { id: 'karanganyar', kedudukan: 'KCP', parent_id: 'solo' },
  { id: 'other-solo', kedudukan: 'KCP', parent_id: 'solo' },
  { id: 'magelang', kedudukan: 'KC', parent_id: null },
];
const projects = offices.map(o => ({ id: `${o.id}-project`, office_id: o.id }));
const requester = { id: 'carissa', office_id: 'karanganyar', department_id: 'admin', is_active: true, job_title: 'Staff Admin' };

describe('issuing office delegation context', () => {
  it('KC sees its own and descendant projects, not unrelated offices', () => {
    expect(projectsForIssuingOffice(projects, offices, 'solo').map(p => p.id))
      .toEqual(['solo-project', 'karanganyar-project', 'other-solo-project']);
  });
  it('KCP only sees its own projects; a shared location does not widen scope', () => {
    expect(projectsForIssuingOffice(projects, offices, 'karanganyar').map(p => p.id))
      .toEqual(['karanganyar-project']);
    expect(projectsForIssuingOffice(projects, offices, 'missing')).toEqual([]);
  });
  it('retains employee department and requires an explicit issuing office grant', () => {
    expect(isProfileLocationReady(requester, { office_id: 'solo', dept_id: 'admin' }, false, ['solo'])).toBe(true);
    expect(isProfileLocationReady(requester, { office_id: 'magelang', dept_id: 'admin' }, false, ['solo'])).toBe(false);
    expect(isProfileLocationReady(requester, { office_id: 'solo', dept_id: 'other' }, false, ['solo'])).toBe(false);
  });
  it('requester remains a maker while review officers follow the issuing office', () => {
    const users = [requester,
      { id: 'bm-solo', office_id: 'solo', is_active: true, job_title: 'Branch Manager' },
      { id: 'bm-magelang', office_id: 'magelang', is_active: true, job_title: 'Branch Manager' },
    ];
    const context = { requesterId: 'carissa', departmentId: 'admin', officeId: 'solo', offices };
    expect(isFirstMakerCandidate(requester, context)).toBe(true);
    expect(getBranchOfficerCandidates(users, context).map(u => u.id)).toEqual(['bm-solo']);
    expect(getBranchOfficerCandidates(users, { ...context, officeId: 'karanganyar' }).map(u => u.id)).toEqual(['bm-solo']);
    expect(requester.office_id).toBe('karanganyar');
  });
});
