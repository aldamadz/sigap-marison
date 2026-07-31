export type MarisonMappingEntity = 'profile' | 'office' | 'project';

export type MarisonPayloadMapping = {
  entity_type: MarisonMappingEntity;
  record_id: string;
  target_record_id: string;
  mapped_name: string | null;
  mapped_nik: string | null;
  mapped_code: string | null;
  mapped_external_id: number | null;
  mapped_office_name: string | null;
  mapped_branch_id: number | null;
  mapping_valid: boolean;
  updated_at: string;
};
export type MarisonMappingCatalog = { id: string; name: string; nik?: string | null; code?: string | null; external_id?: number | null; office_name?: string | null; branch_id?: number | null; valid: boolean };

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-SIGAP-Client': 'web', ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || payload?.message || `Request gagal (${response.status})`);
  return payload;
};

export const marisonPayloadMappingService = {
  async list(entityType?: MarisonMappingEntity): Promise<MarisonPayloadMapping[]> {
    const suffix = entityType ? `?entityType=${encodeURIComponent(entityType)}` : '';
    return (await request(`/api/admin/marison-payload-mappings${suffix}`)).mappings || [];
  },
  async catalog(entityType: MarisonMappingEntity, query = '', branchId?: number | null): Promise<MarisonMappingCatalog[]> {
    const params = new URLSearchParams({ entityType, q: query, limit: '20' });
    if (branchId != null) params.set('branchId', String(branchId));
    return (await request(`/api/admin/marison-payload-mapping-catalog?${params}`)).catalog || [];
  },
  async save(input: {
    entityType: MarisonMappingEntity;
    recordId: string;
    targetRecordId: string | null;
    reason: string;
    expectedUpdatedAt?: string | null;
  }) {
    return request('/api/admin/marison-payload-mappings', { method: 'POST', body: JSON.stringify(input) });
  },
};
