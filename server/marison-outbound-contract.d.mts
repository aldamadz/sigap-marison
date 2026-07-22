import type { ZodType } from "zod";

export const MARISON_OUTBOUND_CONTRACT_VERSION: "v1";
export const marisonUnitSubmissionSchema: ZodType<Record<string, unknown>>;
export const marisonAssetPurchaseRequestSchema: ZodType<Record<string, unknown>>;
export function assertMarisonOutboundContract<T>(kind: string, payload: T): T;
