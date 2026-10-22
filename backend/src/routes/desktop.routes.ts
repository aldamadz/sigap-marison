import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { adminSupabase } from "../lib/supabase.js";
import { assertSameOrigin, getSession } from "../lib/session.js";
import {
  DESKTOP_CLIENT, DESKTOP_ORIGIN, desktopChallenge, desktopCursor, desktopEnabled,
  desktopHash, desktopId, desktopSecret, desktopToken, desktopVerifier, pairingInput, safeDesktopPath,
} from "../lib/desktop-integration.js";

const failure = (statusCode: number, message: string): never => {
  throw Object.assign(new Error(message), { statusCode });
};
const db = () => adminSupabase || failure(503, "Layanan perangkat belum tersedia.");
const checked = <T>(result: { data: T; error: unknown }) => {
  if (result.error) failure(503, "Layanan perangkat sementara tidak tersedia.");
  return result.data;
};
const rpc = async (name: string, args: Record<string, unknown>) => checked(await db().rpc(name, args));
const webUser = async (request: FastifyRequest, reply: FastifyReply) => {
  assertSameOrigin(request);
  return (await getSession(request, reply))!.user.id;
};
const webAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const id = await webUser(request, reply);
  const profile = checked(await db().from("profiles").select("role").eq("id", id).single());
  if (profile?.role !== "admin") failure(403, "Akses admin diperlukan.");
  return id;
};
const bearer = (request: FastifyRequest) => {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(request.headers.authorization || ""));
  if (!match) failure(401, "invalid_session");
  return match![1];
};
const device = async (request: FastifyRequest) => {
  const result = await rpc("desktop_authenticate", { p_access_hash: desktopHash(bearer(request)) });
  if (!result?.user_id) failure(401, "invalid_session");
  return result as { user_id: string; session_id: string; full_name: string; device_name: string };
};
const tokenResponse = (result: any, access: string, refresh: string, reply: FastifyReply) => {
  if (result?.error) return reply.code(result.error === "slow_down" ? 429
    : result.error === "authorization_pending" ? 202 : 401).send({ error: result.error });
  if (!result?.session_id) failure(503, "Layanan perangkat sementara tidak tersedia.");
  return {
    token_type: "Bearer", access_token: access, refresh_token: refresh,
    expires_in: Math.max(0, Math.min(600, Math.floor((Date.parse(result.expires_at) - Date.now()) / 1000))),
    session_id: result.session_id, user_id: result.user_id, session_expires_at: result.expires_at,
    scope: "profile:read notifications:read notifications:mark_read",
  };
};
const deviceColumns = "id,user_id,installation_id,device_name,platform,created_at,refreshed_at,expires_at,revoked_at,revocation_reason";

export const registerDesktopRoutes = async (root: FastifyInstance) => {
  await root.register(async (app) => {
    app.addHook("onRequest", async (_request, reply) => {
      reply.header("Cache-Control", "no-store").header("Pragma", "no-cache");
      if (!desktopEnabled()) return reply.code(404).send({ error: "Not found" });
    });
    const limited = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } }, bodyLimit: 4096 };

    app.post("/api/desktop/pairings", {
      ...limited, config: { rateLimit: { max: 8, timeWindow: "15 minutes" } },
    }, async (request) => {
      const input = pairingInput.parse(request.body);
      const code = desktopSecret();
      const confirmation = String(randomInt(100_000_000)).padStart(8, "0");
      // Expired pairing secrets cannot be used; periodically trim only their metadata.
      checked(await db().from("desktop_pairing_requests").delete().lt("expires_at", new Date(Date.now() - 86_400_000).toISOString()));
      const pairing = checked(await db().from("desktop_pairing_requests").insert({
        device_code_hash: desktopHash(code), confirmation_hash: desktopHash(confirmation),
        challenge: input.code_challenge, installation_id: input.installation_id,
        device_name: input.device_name, platform: input.platform,
      }).select("id").single());
      return {
        device_code: code, user_code: confirmation, expires_in: 300, interval: 5,
        verification_uri: `${DESKTOP_ORIGIN}/desktop/authorize?request=${pairing!.id}`,
        client_id: DESKTOP_CLIENT,
      };
    });

    app.get("/api/desktop/pairings/:id", limited, async (request, reply) => {
      await webUser(request, reply);
      const id = desktopId.parse((request.params as { id: string }).id);
      const result = checked(await db().from("desktop_pairing_requests")
        .select("id,device_name,platform,expires_at,status,failed_attempts").eq("id", id).maybeSingle());
      if (!result || result.status !== "pending" || result.failed_attempts >= 5 || Date.parse(result.expires_at) <= Date.now()) {
        failure(410, "Permintaan telah berakhir. Mulai login lagi dari aplikasi.");
      }
      return { id: result!.id, device_name: result!.device_name, platform: result!.platform, expires_at: result!.expires_at };
    });

    app.post("/api/desktop/pairings/:id/decision", {
      ...limited, config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    }, async (request, reply) => {
      const actor = await webUser(request, reply);
      const id = desktopId.parse((request.params as { id: string }).id);
      const input = z.object({ user_code: z.string().regex(/^\d{8}$/), approve: z.boolean() }).strict().parse(request.body);
      const result = await rpc("desktop_pair_decide", {
        p_id: id, p_actor: actor, p_confirmation_hash: desktopHash(input.user_code), p_approve: input.approve,
      });
      if (result?.error) failure(400, result.error === "invalid_confirmation" ? "Kode perangkat tidak sesuai." : "Permintaan tidak aktif.");
      return { ok: true };
    });

    app.post("/api/desktop/token", limited, async (request, reply) => {
      const input = z.object({ client_id: z.literal(DESKTOP_CLIENT), device_code: desktopToken, code_verifier: desktopVerifier }).strict().parse(request.body);
      const access = desktopSecret(); const refresh = desktopSecret();
      const result = await rpc("desktop_pair_exchange", {
        p_device_hash: desktopHash(input.device_code), p_challenge: desktopChallenge(input.code_verifier),
        p_access_hash: desktopHash(access), p_refresh_hash: desktopHash(refresh),
      });
      if (result?.error === "slow_down") reply.header("Retry-After", "5");
      return tokenResponse(result, access, refresh, reply);
    });

    app.post("/api/desktop/refresh", limited, async (request, reply) => {
      const input = z.object({ client_id: z.literal(DESKTOP_CLIENT), refresh_token: desktopToken }).strict().parse(request.body);
      const access = desktopSecret(); const refresh = desktopSecret();
      return tokenResponse(await rpc("desktop_refresh_session", {
        p_old_hash: desktopHash(input.refresh_token), p_access_hash: desktopHash(access), p_refresh_hash: desktopHash(refresh),
      }), access, refresh, reply);
    });

    app.get("/api/desktop/me", limited, async (request) => {
      const current = await device(request);
      return { user: { id: current.user_id, full_name: current.full_name }, device: { id: current.session_id, name: current.device_name } };
    });

    app.get("/api/desktop/notifications", limited, async (request) => {
      const current = await device(request);
      const input = z.object({ before: desktopCursor.optional() }).strict().parse(request.query);
      let query = db().from("notifications").select("id,type,title,message,link,is_read,created_at,read_at")
        .eq("user_id", current.user_id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(51);
      if (input.before) query = query.or(`created_at.lt.${input.before.at},and(created_at.eq.${input.before.at},id.lt.${input.before.id})`);
      const rows = checked(await query) || [];
      const items = rows.slice(0, 50).map(({ link, ...row }) => ({ ...row, path: safeDesktopPath(link) }));
      const last = items.at(-1);
      return {
        items, next_cursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString("base64url") : null,
        poll_interval: 30, server_time: new Date().toISOString(),
      };
    });

    app.post("/api/desktop/notifications/:id/read", limited, async (request, reply) => {
      const current = await device(request);
      const id = desktopId.parse((request.params as { id: string }).id);
      const result = checked(await db().from("notifications").update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", id).eq("user_id", current.user_id).select("id").maybeSingle());
      if (!result) return reply.code(404).send({ error: "Not found" });
      return { ok: true };
    });

    app.post("/api/desktop/logout", limited, async (request) => {
      const current = await device(request);
      checked(await db().from("desktop_device_sessions").update({ revoked_at: new Date().toISOString(), revoked_by: current.user_id, revocation_reason: "device_logout" })
        .eq("id", current.session_id).is("revoked_at", null));
      return { ok: true };
    });

    for (const admin of [false, true]) {
      const prefix = admin ? "/api/desktop/admin/devices" : "/api/desktop/devices";
      app.get(prefix, limited, async (request, reply) => {
        const actor = await (admin ? webAdmin : webUser)(request, reply);
        let query = db().from("desktop_device_sessions").select(deviceColumns).order("created_at", { ascending: false }).limit(200);
        if (!admin) query = query.eq("user_id", actor);
        const devices = checked(await query) || [];
        if (!admin || !devices.length) return { devices };
        const names = checked(await db().from("profiles").select("id,full_name").in("id", [...new Set(devices.map(d => d.user_id))])) || [];
        const byId = new Map(names.map(p => [p.id, p.full_name]));
        return { devices: devices.map(d => ({ ...d, full_name: byId.get(d.user_id) || null })) };
      });
      app.post(`${prefix}/:id/revoke`, limited, async (request, reply) => {
        const actor = await (admin ? webAdmin : webUser)(request, reply);
        const id = desktopId.parse((request.params as { id: string }).id);
        let query = db().from("desktop_device_sessions").update({
          revoked_at: new Date().toISOString(), revoked_by: actor, revocation_reason: admin ? "admin_revocation" : "owner_revocation",
        }).eq("id", id).is("revoked_at", null);
        if (!admin) query = query.eq("user_id", actor);
        const result = checked(await query.select("id").maybeSingle());
        if (!result) return reply.code(404).send({ error: "Not found" });
        return { ok: true };
      });
    }
  });
};
