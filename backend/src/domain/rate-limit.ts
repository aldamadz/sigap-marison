import type { FastifyRequest } from "fastify";

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export type RateLimitStore = Map<string, RateLimitEntry>;

export const MAX_RATE_LIMIT_STORE_SIZE = 5000;

const activeRateLimit = (store: RateLimitStore, key: string): RateLimitEntry | null => {
  const now = Date.now();
  const current = store.get(key);
  if (current && current.resetAt > now) return current;
  if (current) store.delete(key);
  return null;
};

const pruneExpiredEntries = (store: RateLimitStore): void => {
  if (store.size <= MAX_RATE_LIMIT_STORE_SIZE) return;
  const now = Date.now();
  for (const [entryKey, entry] of store) {
    if (entry.resetAt <= now) store.delete(entryKey);
  }
};

export const enforceRateLimit = (
  store: RateLimitStore,
  key: string,
  max: number,
): void => {
  const current = activeRateLimit(store, key);
  if (!current || current.count < max) return;
  const err = new Error("Terlalu banyak percobaan. Coba lagi nanti.") as Error & {
    status?: number;
    retryAfter?: number;
  };
  err.status = 429;
  err.retryAfter = Math.max(1, Math.ceil((current.resetAt - Date.now()) / 1000));
  throw err;
};

export const recordRateLimit = (
  store: RateLimitStore,
  key: string,
  windowMs: number,
): void => {
  const current = activeRateLimit(store, key);
  if (current) {
    current.count += 1;
  } else {
    store.set(key, { count: 1, resetAt: Date.now() + windowMs });
  }
  pruneExpiredEntries(store);
};

export const clientIp = (req: FastifyRequest): string => {
  const forwarded = String(
    req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "",
  );
  return forwarded.split(",")[0].trim();
};
