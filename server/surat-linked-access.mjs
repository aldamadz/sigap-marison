const asArray = (value) => Array.isArray(value) ? value : [];

export const hasDirectSuratAccess = (surat, userId) => {
  const actorId = String(userId || '').trim();
  if (!surat || !actorId) return false;
  if (surat.created_by === actorId) return true;
  return asArray(surat.surat_signatures).some((signature) =>
    signature?.user_id === actorId
    || asArray(signature?.verifier_snapshot).some((verifier) => verifier?.user_id === actorId)
  );
};

export const activeRecommendationParentIds = (links) => [...new Set(
  asArray(links)
    .filter((link) => link?.link_type === 'recommendation' && link?.status === 'active')
    .map((link) => String(link?.parent_surat_id || '').trim())
    .filter(Boolean)
)];
