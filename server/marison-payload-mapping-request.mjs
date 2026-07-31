const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTITY_TYPES = new Set(['profile', 'office', 'project']);

const httpError = (message, status) => Object.assign(new Error(message), { status });

export const parseMarisonPayloadMappingCommand = (payload) => {
  const entityType = String(payload?.entityType || '').trim();
  const recordId = String(payload?.recordId || '').trim();
  const targetRecordId = payload?.targetRecordId ? String(payload.targetRecordId).trim() : null;
  const reason = String(payload?.reason || '').trim();
  const expectedUpdatedAt = payload?.expectedUpdatedAt ? String(payload.expectedUpdatedAt).trim() : null;

  if (!ENTITY_TYPES.has(entityType) || !UUID_PATTERN.test(recordId)) {
    throw httpError('Payload mapping tidak valid.', 422);
  }
  if (targetRecordId && !UUID_PATTERN.test(targetRecordId)) {
    throw httpError('Target mapping tidak valid.', 422);
  }
  if (!reason || reason.length > 2000) {
    throw httpError('Alasan wajib diisi dan maksimal 2000 karakter.', 422);
  }
  if (expectedUpdatedAt && Number.isNaN(Date.parse(expectedUpdatedAt))) {
    throw httpError('Versi mapping tidak valid.', 422);
  }

  return { entityType, recordId, targetRecordId, reason, expectedUpdatedAt };
};

export const parseMarisonPayloadCatalogQuery = (url) => {
  const entityType = String(url.searchParams.get('entityType') || '').trim();
  if (!ENTITY_TYPES.has(entityType)) throw httpError('Jenis katalog mapping tidak valid.', 422);

  const query = String(url.searchParams.get('q') || '').trim().slice(0, 100);
  const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '20', 10);
  const limit = Math.min(50, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 20));
  const rawBranchId = url.searchParams.get('branchId');
  const branchId = rawBranchId == null || rawBranchId === '' ? null : Number(rawBranchId);
  if (branchId !== null && (!Number.isSafeInteger(branchId) || branchId <= 0)) {
    throw httpError('Branch katalog mapping tidak valid.', 422);
  }

  return { entityType, query, limit, branchId };
};
