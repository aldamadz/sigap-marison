const normalized = (value) => String(value ?? '').trim();
const VALID_SOURCES = new Set(['external_source', 'staging_mapping']);

export const getCanonicalRequesterProfileId = (surat) => normalized(
  surat?.requester_snapshot?.profile_id
  || surat?.requester_snapshot?.user_id
  || surat?.requester_snapshot?.id
  || surat?.data_snapshot?.requester?.profile_id
  || surat?.data_snapshot?.requester?.user_id
  || surat?.data_snapshot?.requester?.id,
);

export const buildApprovalResolutionKey = (stepOrder, profileId, fallbackIndex = 0) => {
  const id = normalized(profileId);
  if (!id) throw new Error('Profile penandatangan wajib tersedia untuk metadata resolusi.');
  const parsedStep = Number.parseInt(String(stepOrder ?? ''), 10);
  const step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : fallbackIndex + 1;
  return `approval:${step}:${id}`;
};

export const mergePayloadResolutionSources = (baseSources, identitySources) => ({
  ...(baseSources || {}),
  ...(identitySources || {}),
});

export const normalizePayloadResolutionSources = (sources, { kind, approvalCount, expectedApprovalKeys = null }) => {
  const input = sources && typeof sources === 'object' && !Array.isArray(sources) ? sources : {};
  const normalizedSources = { ...input };
  if (!normalizedSources.requesterNik && VALID_SOURCES.has(normalizedSources.nik)) {
    normalizedSources.requesterNik = normalizedSources.nik;
  }
  delete normalizedSources.nik;

  const required = ['requesterNik', 'branchId'];
  if (kind === 'unit' || kind === 'non_unit') required.push('projectId');
  if (required.some((key) => !VALID_SOURCES.has(normalizedSources[key]))) {
    throw new Error('Metadata sumber payload belum lengkap.');
  }

  const approvalKeys = Object.keys(normalizedSources).filter((key) => key.startsWith('approval:'));
  const expectedKeys = expectedApprovalKeys ? new Set(expectedApprovalKeys) : null;
  if (approvalKeys.length !== approvalCount || (expectedKeys && (expectedKeys.size !== approvalCount || [...expectedKeys].some((key) => !approvalKeys.includes(key))))) {
    throw new Error('Metadata sumber signer belum lengkap.');
  }
  if (approvalKeys.some((key) => {
    const parts = key.split(':');
    return parts.length !== 3 || !/^\d+$/.test(parts[1]) || !parts[2] || !VALID_SOURCES.has(normalizedSources[key]);
  })) {
    throw new Error('Metadata sumber signer belum lengkap.');
  }
  return normalizedSources;
};

export const isPrePostRecoveryEligible = (job, environment) => Boolean(
  environment === 'staging'
  && job?.environment === 'staging'
  && job?.environment === environment
  && job
  && job?.status === 'failed_terminal'
  && !job?.post_started_at
  && !job?.response
  && !job?.external_reference
);

export const resolveProfilePayloadIdentity = ({ profileId, sourceNik, mappingNik, validSourceNik, label = 'Profile' }) => {
  const id = normalized(profileId);
  if (!id) {
    const error = new Error(`${label} tidak memiliki profile user yang stabil.`);
    error.status = 422;
    throw error;
  }
  const mapped = normalized(mappingNik);
  if (mapped) return { profileId: id, nik: mapped, source: 'staging_mapping' };
  const source = normalized(sourceNik);
  if (source && validSourceNik) return { profileId: id, nik: source, source: 'external_source' };
  const error = new Error(`${label} (${id}) belum memiliki mapping employee staging yang valid.`);
  error.status = 422;
  throw error;
};

export const resolveApprovalPayloadIdentities = (signers, mappings, validSourceNiks) => signers.map((signer, index) => {
  const identity = resolveProfilePayloadIdentity({
    profileId: signer.profileId,
    sourceNik: signer.sourceNik,
    mappingNik: mappings[signer.profileId],
    validSourceNik: validSourceNiks[signer.profileId] === true,
  });
  return { ...identity, stage: index + 1 };
});
