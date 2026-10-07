import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  contentTypes,
  filenameHeaderValue,
  withSecurityHeaders,
} from "../../lib/http.js";

type CookieSession = {
  access_token: string;
  expires_at?: number;
  user: {
    id: string;
  };
};

type BffRuntimeDependencies = {
  assertSameOrigin: (req: IncomingMessage) => void;
  requireCookieSession: (req: IncomingMessage) => CookieSession;
  readJsonBody: (req: IncomingMessage, maxBytes?: number) => Promise<any>;
  createUserSupabaseClient: (accessToken: string) => any;
  getStorageSupabase: () => any;
  sanitizeStoragePath: (value: unknown) => string;
  removeStoragePathPrefix: (path: string, prefix: string) => string;
  storagePathPrefix: string;
};

const BFF_QUERY_METHODS = new Set([
  "select", "insert", "update", "upsert", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "overlaps", "match", "not", "or", "filter",
  "order", "limit", "range", "single", "maybeSingle", "csv", "throwOnError",
]);

/**
 * Server-side allowlist for /api/events table subscriptions.
 *
 * The browser multiplexes every postgres_changes binding into a single
 * EventSource, so without this list an authenticated user could subscribe to
 * any table whose RLS SELECT policy they satisfy. In particular `profiles`
 * must stay out: its SELECT policy allows every authenticated user to read
 * all active profiles, and postgres_changes delivers full rows — meaning one
 * request to /api/events?tables=profiles would broadcast nik, email, and
 * phone numbers to every logged-in user.
 *
 * RLS remains the row-level guard; this list is the table-level guard.
 * Keep in sync with the postgres_changes bindings in src/ (AttentionProvider,
 * RealtimeSync, InboxPage). A table subscribed by the frontend but missing
 * here fails the whole stream with 400 — loudly, instead of leaking silently.
 */
const REALTIME_ALLOWED_TABLES: ReadonlySet<string> = new Set([
  "activity_logs",
  "agendas",
  "marison_sync_issues",
  "master_offices",
  "master_projects",
  "notifications",
  "surat_attachments",
  "surat_linked_documents",
  "surat_recommendation_tasks",
  "surat_registrasi",
  "surat_revision_events",
  "surat_signatures",
]);

const assertBffIdentifier = (value: unknown, label: string) => {
  const normalized = String(value || "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    const err = new Error(`${label} tidak valid.`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  return normalized;
};

export const createBffRuntime = ({
  assertSameOrigin,
  requireCookieSession,
  readJsonBody,
  createUserSupabaseClient,
  getStorageSupabase,
  sanitizeStoragePath,
  removeStoragePathPrefix,
  storagePathPrefix,
}: BffRuntimeDependencies) => {
  const realtimeClients = new Set<ServerResponse>();

  const handleQuery = async (req: IncomingMessage) => {
    assertSameOrigin(req);
    const session = requireCookieSession(req);
    const payload = await readJsonBody(req, 2 * 1024 * 1024);
    const kind = payload?.kind === "rpc" ? "rpc" : "table";
    const name = assertBffIdentifier(payload?.name, kind === "rpc" ? "Nama RPC" : "Nama tabel");

    const client = createUserSupabaseClient(session.access_token);
    let query = kind === "rpc"
      ? client.rpc(name, payload?.args || {}, payload?.options)
      : client.from(name);
    const operations = Array.isArray(payload?.operations) ? payload.operations : [];
    if (!operations.length && kind === "table") {
      const err = new Error("Operasi query tidak boleh kosong.") as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    for (const operation of operations) {
      const method = String(operation?.method || "");
      if (!BFF_QUERY_METHODS.has(method) || typeof query?.[method] !== "function") {
        const err = new Error(`Operasi query ${method || "(kosong)"} tidak diizinkan.`) as Error & { status?: number };
        err.status = 400;
        throw err;
      }
      query = query[method](...(Array.isArray(operation.args) ? operation.args : []));
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

  const handleFunction = async (req: IncomingMessage, functionName: string) => {
    assertSameOrigin(req);
    const session = requireCookieSession(req);
    const name = assertBffIdentifier(functionName, "Nama function");
    const payload = await readJsonBody(req, 2 * 1024 * 1024);
    const result = await createUserSupabaseClient(session.access_token).functions.invoke(name, payload?.options || {});
    return {
      data: result.data ?? null,
      error: result.error ? { message: result.error.message, name: result.error.name } : null,
    };
  };

  const handleStorageFile = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const session = requireCookieSession(req);
    const bucket = assertBffIdentifier(url.searchParams.get("bucket"), "Nama bucket");
    const path = sanitizeStoragePath(url.searchParams.get("path"));
    let relativePath;
    try {
      relativePath = removeStoragePathPrefix(path, storagePathPrefix);
    } catch {
      relativePath = "";
    }
    if (bucket !== "avatars" || !/^[0-9a-f-]{36}\/avatar_[A-Za-z0-9_.-]+(?:_thumb\.webp)?$/i.test(relativePath)) {
      const err = new Error("Akses file harus melalui endpoint dokumen yang terotorisasi.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    if (!relativePath.startsWith(`${session.user.id}/`)) {
      const err = new Error("Akses avatar ditolak.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }
    const { data, error } = await getStorageSupabase().storage.from(bucket).download(path);
    if (error || !data) {
      const err = new Error(error?.message || "File tidak ditemukan.") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    res.writeHead(200, withSecurityHeaders({
      "Content-Type": data.type || contentTypes[extname(path)] || "application/octet-stream",
      "Content-Length": String(buffer.length),
      "Content-Disposition": filenameHeaderValue(path.split("/").pop() || "file"),
      "Cache-Control": "private, max-age=60",
    }));
    res.end(buffer);
  };

  const openRealtimeStream = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const session = requireCookieSession(req);
    const tables = [...new Set(String(url.searchParams.get("tables") || "")
      .split(",")
      .map((table) => table.trim())
      .filter(Boolean)
      .map((table) => assertBffIdentifier(table, "Nama tabel")))];
    if (!tables.length || tables.length > 32) {
      const err = new Error("Daftar tabel realtime harus berisi 1 sampai 32 tabel.") as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    const rejectedTables = tables.filter((table) => !REALTIME_ALLOWED_TABLES.has(table));
    if (rejectedTables.length > 0) {
      const err = new Error(
        `Tabel realtime tidak diizinkan: ${rejectedTables.join(", ")}.`,
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    }

    const client = createUserSupabaseClient(session.access_token);
    await client.realtime.setAuth(session.access_token);

    res.writeHead(200, withSecurityHeaders({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    }));
    res.write("retry: 3000\n");
    res.write(": connected\n\n");
    realtimeClients.add(res);

    let closed = false;
    let eventSequence = 0;
    const channel = client.channel(`sigap-bff:${session.user.id}:${randomUUID()}`);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload: any) => {
        if (closed || res.destroyed) return;
        eventSequence += 1;
        res.write(`id: ${Date.now()}-${eventSequence}\n`);
        res.write("event: postgres_change\n");
        res.write(`data: ${JSON.stringify({
          schema: payload.schema,
          table: payload.table,
          eventType: payload.eventType,
          commit_timestamp: payload.commit_timestamp,
          new: payload.new || {},
          old: payload.old || {},
        })}\n\n`);
      });
    }

    const heartbeatTimer = setInterval(() => {
      if (!closed && !res.destroyed) res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 25_000);
    const remainingTokenMs = Math.max(60_000, Number(session.expires_at || 0) * 1000 - Date.now() - 5 * 60_000);
    const reconnectTimer = setTimeout(() => {
      if (!closed && !res.destroyed) res.end();
    }, Math.min(45 * 60_000, remainingTokenMs));

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeatTimer);
      clearTimeout(reconnectTimer);
      realtimeClients.delete(res);
      client.removeChannel(channel).catch(() => {});
    };

    channel.subscribe((status: string) => {
      if (closed || res.destroyed) return;
      if (status === "SUBSCRIBED") {
        res.write("event: ready\ndata: {}\n\n");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        res.write(`event: stream_error\ndata: ${JSON.stringify({ status })}\n\n`);
        res.end();
      }
    });

    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("close", cleanup);
  };

  return {
    handleQuery,
    handleFunction,
    handleStorageFile,
    openRealtimeStream,
  };
};
