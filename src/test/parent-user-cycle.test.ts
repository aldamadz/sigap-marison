import { describe, expect, it, vi } from 'vitest';
import { getChildUsers } from '@/services/parent-user.service';

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({
  is: () => ({ order: async () => ({ error: null, data: [
    { id: 'bm', parent_id: 'staff', full_name: 'BM' },
    { id: 'staff', parent_id: 'bm', full_name: 'Staff' },
  ] }) }),
}) }) } }));

describe('subordinate hierarchy cycle boundary', () => {
  it('does not include the root or recurse indefinitely on legacy configured cycles', async () => {
    const children = await getChildUsers('bm');
    expect(children.map(child => child.id)).toEqual(['staff']);
  });
});
