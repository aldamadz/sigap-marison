import type { FastifyRequest } from "fastify";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sigap_session" : "sigap_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_COOKIE_MAX_BYTES = 3800;

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface CookieSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: SessionUser;
}

export interface PublicSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at?: number;
  user: SessionUser;
}

const parseCookies = (req: FastifyRequest): Record<string, string> => {
  const raw = String(req.headers.cookie || "");
  const entries = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return [part, ""] as const;
      const key = part.slice(0, separator);
      const value = decodeURIComponent(part.slice(separator + 1));
      return [key, value] as const;
    });
  return Object.fromEntries(entries);
};

export const createSessionCrypto = (sessionSecret: string) => {
  const key = createHash("sha256").update(sessionSecret).digest();

  const encrypt = (session: CookieSession): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
  };

  const decrypt = (value: string): CookieSession | null => {
    try {
      const payload = Buffer.from(String(value || ""), "base64url");
      if (payload.length < 29) return null;
      const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
      decipher.setAuthTag(payload.subarray(12, 28));
      const plaintext = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
      return JSON.parse(plaintext) as CookieSession;
    } catch {
      return null;
    }
  };

  return { encrypt, decrypt };
};

export const createSessionCookieHelpers = (sessionSecret: string) => {
  const { encrypt, decrypt } = createSessionCrypto(sessionSecret);

  const hasSessionCookie = (req: FastifyRequest): boolean => Boolean(parseCookies(req)[SESSION_COOKIE]);

  const readCookieSession = (req: FastifyRequest): CookieSession | null => {
    const cached = (req as unknown as { sigapSession?: CookieSession | null }).sigapSession;
    if (cached !== undefined) return cached ?? null;
    return decrypt(parseCookies(req)[SESSION_COOKIE]);
  };

  const compactSessionUser = (user: { id?: string; email?: string | null }): SessionUser => ({
    id: String(user?.id || ""),
    email: user?.email || null,
  });

  const buildCookieValue = (session: CookieSession): string => {
    const compactSession: CookieSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: compactSessionUser(session.user),
    };
    return encrypt(compactSession);
  };

  const sessionCookie = (session: CookieSession): string => {
    const flags = [
      `${SESSION_COOKIE}=${encodeURIComponent(buildCookieValue(session))}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      process.env.NODE_ENV === "production" ? "Secure" : "",
      `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ];
    return flags.filter(Boolean).join("; ");
  };

  const clearedSessionCookie = (): string => {
    const flags = [
      `${SESSION_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      process.env.NODE_ENV === "production" ? "Secure" : "",
      "Max-Age=0",
    ];
    return flags.filter(Boolean).join("; ");
  };

  const setSessionCookie = (session: CookieSession): string => {
    const cookie = sessionCookie(session);
    if (Buffer.byteLength(cookie, "utf8") > SESSION_COOKIE_MAX_BYTES) {
      const err = new Error("Sesi login terlalu besar untuk disimpan dengan aman.");
      (err as Error & { status?: number }).status = 500;
      throw err;
    }
    return cookie;
  };

  const clearSessionCookie = (): string => clearedSessionCookie();

  const publicSession = (session: CookieSession | null): PublicSession | null => {
    if (!session) return null;
    return {
      access_token: "cookie-session",
      refresh_token: "",
      token_type: "bearer",
      expires_in: Math.max(0, Number(session.expires_at || 0) - Math.floor(Date.now() / 1000)),
      expires_at: session.expires_at,
      user: session.user,
    };
  };

  return {
    hasSessionCookie,
    readCookieSession,
    sessionCookie,
    clearedSessionCookie,
    setSessionCookie,
    clearSessionCookie,
    publicSession,
  };
};
