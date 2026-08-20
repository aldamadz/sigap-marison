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
  if (kind === 'asset') delete normalizedSources.projectId;
  if (kind === 'fund') {
    delete normalizedSources.requesterNik;
    delete normalizedSources.branchId;
  }

  // Fund boleh tanpa proyek (dana umum): projectId hanya divalidasi bila ada.
  const required = kind === 'fund' ? [] : ['requesterNik', 'branchId'];
  if (kind === 'unit' || kind === 'non_unit') required.push('projectId');
  if (required.some((key) => !VALID_SOURCES.has(normalizedSources[key]))) {
    throw new Error('Metadata sumber payload belum lengkap.');
  }
  // Fund tanpa proyek diizinkan, tetapi projectId yang hadir tetap harus valid.
  if (kind === 'fund' && normalizedSources.projectId !== undefined && !VALID_SOURCES.has(normalizedSources.projectId)) {
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

export const classifyMarisonRecoveryIssue = (value) => {
  const message = normalized(value) || 'Identitas payload belum siap.';
  const lowerMessage = message.toLowerCase();
  const signerMatch = message.match(/penandatangan tahap\s+(\d+)/i);

  if (signerMatch) {
    const blockedStage = Number(signerMatch[1]);
    return {
      reasonCode: 'SIGNER_IDENTITY_MISSING',
      reason: `Penandatangan tahap ${blockedStage} belum memiliki Identitas External atau Mapping Payload Staging yang valid.`,
      blockedStage,
    };
  }
  if (lowerMessage.includes('pemohon')) {
    return {
      reasonCode: 'REQUESTER_IDENTITY_MISSING',
      reason: 'Pemohon belum memiliki Identitas External atau Mapping Payload Staging yang valid.',
    };
  }
  if (lowerMessage.includes('project') && lowerMessage.includes('branch') && lowerMessage.includes('tidak cocok')) {
    return {
      reasonCode: 'PROJECT_BRANCH_MISMATCH',
      reason: 'Project ID external terhubung ke Branch ID external yang berbeda dari kantor proyek efektif.',
    };
  }
  if (lowerMessage.includes('project')) {
    return {
      reasonCode: 'PROJECT_IDENTITY_MISSING',
      reason: 'Identitas external proyek atau kantor pemilik proyek belum lengkap dan tervalidasi.',
    };
  }
  if (lowerMessage.includes('branch')) {
    return {
      reasonCode: 'BRANCH_IDENTITY_MISSING',
      reason: 'Branch ID external untuk kantor terkait belum lengkap dan tervalidasi.',
    };
  }
  return { reasonCode: 'NOT_PRE_POST_FAILURE', reason: message };
};

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
