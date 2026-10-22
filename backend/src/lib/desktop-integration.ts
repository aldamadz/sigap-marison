import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const DESKTOP_ORIGIN = "https://sigap.marison-testing.biz.id";
export const DESKTOP_CLIENT = "sigap-desktop-staging";
export const desktopEnabled = (environment = process.env.MARISON_DEPLOYMENT_ENVIRONMENT) => environment === "staging";
export const desktopHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const desktopSecret = () => randomBytes(32).toString("base64url");
export const desktopChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
export const desktopToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const desktopVerifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
export const desktopId = z.string().uuid();

export const pairingInput = z.object({
  client_id: z.literal(DESKTOP_CLIENT),
  installation_id: desktopId,
  device_name: z.string().trim().min(1).max(100).refine(value => !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)),
  platform: z.enum(["windows", "macos"]),
  code_challenge: desktopToken,
  code_challenge_method: z.literal("S256"),
}).strict();

export const safeDesktopPath = (value: unknown) => {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")
    || value.startsWith("//") || value.includes("\\") || Array.from(value).some(char => char.charCodeAt(0) <= 32)) return null;
  try {
    const url = new URL(value, DESKTOP_ORIGIN);
    if (url.origin !== DESKTOP_ORIGIN || !/^\/(dashboard|calendar|surat)(\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
};

export const desktopCursor = z.string().max(300).transform((value, ctx) => {
  try {
    const result = z.object({ at: z.string().datetime({ offset: true }), id: desktopId }).strict()
      .parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return result;
  } catch {
    ctx.addIssue({ code: "custom", message: "Cursor tidak valid." });
    return z.NEVER;
  }
});
