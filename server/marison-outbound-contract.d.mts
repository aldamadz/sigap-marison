import type { ZodType } from "zod";

export const MARISON_OUTBOUND_CONTRACT_VERSION: "vendor-openapi-1.0.0";
export const MARISON_ASSET_CONTRACT_VERSION: "vendor-openapi-asset-2026-08-06";
export const marisonUnitSubmissionSchema: ZodType<Record<string, unknown>>;
export const marisonNonUnitSubmissionSchema: ZodType<Record<string, unknown>>;
export const marisonAssetPurchaseRequestSchema: ZodType<Record<string, unknown>>;
export function assertMarisonOutboundContract<T>(kind: string, payload: T): T;
