import { describe, expect, it } from 'vitest';
import { usesAutomaticBranchReporting } from '@sigap/shared';

describe('automatic branch reporting scope', () => {
  it.each(['KC', 'KCP', ' kc '])('staff and supervisors at %s report directly to BM', scope => {
    expect(usesAutomaticBranchReporting(scope, 'Staff Admin')).toBe(true);
    expect(usesAutomaticBranchReporting(scope, 'Supervisor Marketing')).toBe(true);
    expect(usesAutomaticBranchReporting(scope, 'Assistant Manager')).toBe(true);
  });
  it.each(['BM', 'Branch Manager', ' branch   manager ', 'Direktur I', 'Director Utama'])(
    'preserves the configured relation for %s', title => {
      expect(usesAutomaticBranchReporting('KC', title)).toBe(false);
    },
  );
  it.each(['Pusat', 'Kost', null, undefined, 'unknown'])('does not invent HQ/Kost/unknown relationships for %s', scope => {
    expect(usesAutomaticBranchReporting(scope, 'Staff')).toBe(false);
  });
});
