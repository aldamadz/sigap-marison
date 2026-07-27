import type { FastifyReply, FastifyRequest } from "fastify";
import { createPublicSupabaseClient } from "../lib/supabase.js";
import {
  assertSameOrigin,
  clearSessionCookie,
  getSession,
  publicSession,
  readSession,
  setSessionCookie,
  type CookieSession,
} from "../lib/session.js";

export const login = async (
  request: FastifyRequest,
  reply: FastifyReply,
  credentials: { email: string; password: string },
) => {
  assertSameOrigin(request);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session) {
    const unauthorized = new Error("Email atau password salah.") as Error & { statusCode: number };
    unauthorized.statusCode = 401;
    throw unauthorized;
  }
  setSessionCookie(reply, data.session as CookieSession);
  return { user: data.user, session: publicSession(data.session as CookieSession) };
};

export const currentSession = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = await getSession(request, reply, false);
  return { session: publicSession(session), user: session?.user || null };
};

export const logout = async (request: FastifyRequest, reply: FastifyReply) => {
  assertSameOrigin(request);
  const session = readSession(request);
  if (session?.access_token) {
    const client = createPublicSupabaseClient();
    await client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    await client.auth.signOut({ scope: "local" });
  }
  clearSessionCookie(reply);
  return { ok: true };
};

export const updateUser = async (
  request: FastifyRequest,
  reply: FastifyReply,
  attributes: Record<string, unknown>,
) => {
  assertSameOrigin(request);
  const session = await getSession(request, reply);
  const client = createPublicSupabaseClient();
  const { error: sessionError } = await client.auth.setSession({
    access_token: session!.access_token,
    refresh_token: session!.refresh_token,
  });
  if (sessionError) throw sessionError;
  const { data, error } = await client.auth.updateUser(attributes);
  if (error) throw error;
  const { data: current } = await client.auth.getSession();
  if (current.session) setSessionCookie(reply, current.session as CookieSession);
  return { user: data.user };
};

export const verifyOtp = async (
  request: FastifyRequest,
  reply: FastifyReply,
  attributes: Record<string, unknown>,
) => {
  assertSameOrigin(request);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.auth.verifyOtp(attributes as never);
  if (error || !data.session) {
    const unauthorized = new Error(error?.message || "Token pemulihan tidak valid.") as Error & { statusCode: number };
    unauthorized.statusCode = error?.status || 401;
    throw unauthorized;
  }
  setSessionCookie(reply, data.session as CookieSession);
  return { user: data.user, session: publicSession(data.session as CookieSession) };
};
