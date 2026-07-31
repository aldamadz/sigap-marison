const normalized = (value) => String(value ?? '').trim();

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
