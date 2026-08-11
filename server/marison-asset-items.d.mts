export type MarisonExternalLink = Readonly<{ name: string; link: string }>;

export class MarisonAssetItemsError extends Error {
  readonly code: "MARISON_ASSET_ITEMS_EMPTY";
  readonly status: 422;
}

export function freezeMarisonAssetPayload<T>(value: T): Readonly<T>;

export function mapMarisonAssetItems(input: {
  applicantItems: unknown;
  recommendationRows: unknown;
  recommendationPdf: unknown;
}): ReadonlyArray<Readonly<Record<string, unknown>>>;

export function mapMarisonAssetRequest<T extends Record<string, unknown>>(input: {
  request: T;
  applicantItems: unknown;
  recommendationRows: unknown;
  recommendationPdf: unknown;
}): Readonly<T & { items: ReadonlyArray<Readonly<Record<string, unknown>>> }>;
