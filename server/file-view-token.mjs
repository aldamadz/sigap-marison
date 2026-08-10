import { createHmac } from "node:crypto";

export const resolveFileViewTokenPath = (token, surat) =>
  token?.purpose === "external_marison_recommendation_pdf" ? surat?.pdf_path || null : token?.object_path || null;

export const stableRecommendationBearer = (secret, suratId) =>
  createHmac("sha256", secret).update(`external_marison_recommendation_pdf:${suratId}`).digest("base64url");

export const recommendationTokenRequestedBy = (actorId, childCreatorId, parentCreatorId) =>
  actorId || childCreatorId || parentCreatorId || null;
