import { createHash, randomBytes } from "node:crypto";

export const RECOMMENDATION_FILE_REFERENCE_TYPE = "sigap_recommendation_pdf";

export const generateFileViewBearer = () => randomBytes(32).toString("base64url");

export const hashFileViewBearer = (bearer) => createHash("sha256").update(bearer).digest("hex");

export const recommendationFileReference = (suratId, name = "Dokumen Rekomendasi Aset") => Object.freeze({
  type: RECOMMENDATION_FILE_REFERENCE_TYPE,
  surat_id: suratId,
  name,
});

export const isRecommendationFileReference = (value) => value?.type === RECOMMENDATION_FILE_REFERENCE_TYPE
  && typeof value?.surat_id === "string" && value.surat_id.length > 0;

export const expandRecommendationFileReferences = async (logicalPayload, mintUrl) => {
  const transport = structuredClone(logicalPayload);
  const cache = new Map();
  const mintedTokens = [];
  for (const item of transport?.items || []) {
    for (const attachment of item?.attachments || []) {
      if (!isRecommendationFileReference(attachment)) continue;
      const key = `${attachment.type}:${attachment.surat_id}`;
      if (!cache.has(key)) cache.set(key, Promise.resolve(mintUrl(attachment)));
      const minted = await cache.get(key);
      const resolved = typeof minted === "string" ? minted : minted.url;
      if (typeof minted === "object" && minted?.minted === true && !mintedTokens.some(({ tokenId }) => tokenId === minted.tokenId)) {
        mintedTokens.push({ tokenId: minted.tokenId, suratId: attachment.surat_id, attemptId: minted.attemptId });
      }
      delete attachment.type;
      delete attachment.surat_id;
      attachment.link = resolved;
    }
  }
  return { payload: transport, mintedTokens };
};

export const recommendationTokenRequestedBy = (actorId, childCreatorId, parentCreatorId) =>
  actorId || childCreatorId || parentCreatorId || null;

export const consumedFileViewTokenResult = (tokenData, file, surat, buildFilename) => ({
  tokenId: tokenData.token_id,
  suratId: tokenData.surat_id,
  file,
  ref: {
    bucket: tokenData.bucket,
    path: tokenData.object_path,
    origin: tokenData.storage_origin,
  },
  filename: buildFilename(surat, tokenData.object_path),
});
