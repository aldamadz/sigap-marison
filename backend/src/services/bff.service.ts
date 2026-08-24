import type { BffQuery } from "@sigap/shared";
import { getEnvironment } from "../config/env.js";
import { createUserSupabaseClient, storageSupabase } from "../lib/supabase.js";

const env = getEnvironment();
const allowedMethods = new Set([
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "overlaps", "match", "not", "or", "filter",
  "order", "limit", "range", "single", "maybeSingle", "csv", "throwOnError",
]);

type DynamicQuery = Record<string, (...args: unknown[]) => DynamicQuery> & PromiseLike<{
  data: unknown;
  error: { message: string; details?: string; hint?: string; code?: string } | null;
  count?: number | null;
  status: number;
  statusText: string;
}>;

export const executeQuery = async (accessToken: string, payload: BffQuery) => {
  const client = createUserSupabaseClient(accessToken);
  let query = (payload.kind === "rpc"
    ? client.rpc(payload.name, payload.args, payload.options)
    : client.from(payload.name)) as unknown as DynamicQuery;
  if (payload.kind === "table" && payload.operations.length === 0) {
    const error = new Error("Operasi query tidak boleh kosong.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  for (const operation of payload.operations) {
    if (!allowedMethods.has(operation.method) || typeof query[operation.method] !== "function") {
      const error = new Error(`Operasi query ${operation.method || "(kosong)"} tidak diizinkan.`) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
    query = query[operation.method](...operation.args);
  }
  const result = await query;
  return {
    data: result.data ?? null,
    error: result.error ? {
      message: result.error.message,
      details: result.error.details,
      hint: result.error.hint,
      code: result.error.code,
    } : null,
    count: result.count ?? null,
    status: result.status,
    statusText: result.statusText,
  };
};

const normalizeStoragePath = (value: unknown) => {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) {
    const error = new Error("Path storage tidak valid.") as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

export const downloadOwnAvatar = async (userId: string, bucketValue: unknown, pathValue: unknown) => {
  const bucket = String(bucketValue || "");
  const path = normalizeStoragePath(pathValue);
  const prefix = String(env.STORAGE_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");
  const relativePath = prefix && path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path;
  if (
    bucket !== "avatars"
    || !/^[0-9a-f-]{36}\/avatar_[A-Za-z0-9_.-]+(?:_thumb\.webp)?$/i.test(relativePath)
  ) {
    const error = new Error("Akses file harus melalui endpoint dokumen yang terotorisasi.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  if (!relativePath.startsWith(`${userId}/`)) {
    const error = new Error("Akses avatar ditolak.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  const { data, error } = await storageSupabase.storage.from(bucket).download(path);
  if (error || !data) {
    const notFound = new Error(error?.message || "File tidak ditemukan.") as Error & { statusCode: number };
    notFound.statusCode = 404;
    throw notFound;
  }
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
};

export const invokeFunction = async (
  accessToken: string,
  name: string,
  body: { options?: Record<string, unknown> },
) => {
  const result = await createUserSupabaseClient(accessToken).functions.invoke(name, body.options || {});
  return {
    data: result.data ?? null,
    error: result.error ? { message: result.error.message, name: result.error.name } : null,
  };
};
