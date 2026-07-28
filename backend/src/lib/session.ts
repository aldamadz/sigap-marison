import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getEnvironment } from "../config/env.js";
import { isActiveProfile } from "../domain/profile-authorization.js";
import { createPublicSupabaseClient, createUserSupabaseClient } from "./supabase.js";

const env = getEnvironment();
const encryptionKey = createHash("sha256").update(env.SESSION_SECRET).digest();
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_COOKIE = env.NODE_ENV === "production" ? "__Host-sigap_session" : "sigap_session";
const revokedSessionErrorCodes = new Set(["42501", "PGRST301", "PGRST303"]);

export interface CookieSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string | null };
}

const encryptSession = (session: CookieSession) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
};

const decryptSession = (value: string | undefined): CookieSession | null => {
  try {
    const payload = Buffer.from(String(value || ""), "base64url");
    if (payload.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8"),
    ) as CookieSession;
  } catch {
    return null;
  }
};

const compactSession = (session: CookieSession): CookieSession => ({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  user: { id: session.user.id, email: session.user.email || null },
});

export const setSessionCookie = (reply: FastifyReply, session: CookieSession) => {
  const value = encryptSession(compactSession(session));
  if (Buffer.byteLength(value, "utf8") > 3700) {
    const error = new Error("Sesi login terlalu besar untuk disimpan dengan aman.") as Error & { statusCode: number };
    error.statusCode = 500;
    throw error;
  }
  reply.setCookie(SESSION_COOKIE, value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
};

export const clearSessionCookie = (reply: FastifyReply) => {
  reply.clearCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
  });
};

export const readSession = (request: FastifyRequest) => decryptSession(request.cookies[SESSION_COOKIE]);

export const assertSameOrigin = (request: FastifyRequest) => {
  if (String(request.headers["sec-fetch-site"] || "").toLowerCase() === "cross-site") {
    const error = new Error("Cross-site request ditolak.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  const origin = String(request.headers.origin || "");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    const error = new Error("Origin request tidak valid.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
  if (originHost !== String(request.headers.host || "")) {
    const error = new Error("Origin request tidak diizinkan.") as Error & { statusCode: number };
    error.statusCode = 403;
    throw error;
  }
};

export const requireActiveSessionProfile = async (session: CookieSession, reply: FastifyReply) => {
  const { data: profile, error } = await createUserSupabaseClient(session.access_token)
    .from("profiles")
    .select("is_active, deleted_at")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error && !revokedSessionErrorCodes.has(error.code)) {
    const unavailable = new Error("Gagal memvalidasi status akun.") as Error & { statusCode: number };
    unavailable.statusCode = 503;
    throw unavailable;
  }
  if (error || !isActiveProfile(profile)) {
    clearSessionCookie(reply);
    const unauthorized = new Error("Unauthorized") as Error & { statusCode: number };
    unauthorized.statusCode = 401;
    throw unauthorized;
  }
};

export const getSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
  required = true,
): Promise<CookieSession | null> => {
  let session = readSession(request);
  if (!session?.access_token || !session.user?.id) {
    if (!required) return null;
    const error = new Error("Unauthorized") as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
  if (Number(session.expires_at || 0) * 1000 <= Date.now() + 10 * 60_000) {
    const client = createPublicSupabaseClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (error || !data.session) {
      clearSessionCookie(reply);
      if (!required) return null;
      const unauthorized = new Error("Unauthorized") as Error & { statusCode: number };
      unauthorized.statusCode = 401;
      throw unauthorized;
    }
    session = data.session as CookieSession;
    setSessionCookie(reply, session);
  }
  try {
    await requireActiveSessionProfile(session, reply);
  } catch (error) {
    if (!required && (error as { statusCode?: number }).statusCode === 401) return null;
    throw error;
  }
  return session;
};

export const publicSession = (session: CookieSession | null) => session ? {
  access_token: "cookie-session",
  refresh_token: "",
  token_type: "bearer",
  expires_in: Math.max(0, Number(session.expires_at || 0) - Math.floor(Date.now() / 1000)),
  expires_at: session.expires_at,
  user: session.user,
} : null;
