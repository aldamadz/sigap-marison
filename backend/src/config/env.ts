import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(80),
  APP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DIST_DIR: z.string().default("dist"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  STORAGE_MODE: z.literal("self_hosted_supabase"),
  STORAGE_SUPABASE_URL: z.string().url(),
  STORAGE_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STORAGE_PUBLIC_BASE_URL: z.string().url(),
  STORAGE_PATH_PREFIX: z.string().default(""),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  TRUST_PROXY: z.string().default("false").transform((value) => value === "true"),
});

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export const getEnvironment = (): Environment => {
  if (cachedEnvironment) return cachedEnvironment;
  const values = {
    ...process.env,
    PORT: process.env.PORT || process.env.APP_PORT || "80",
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY:
      process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    STORAGE_SUPABASE_SERVICE_ROLE_KEY:
      process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.STORAGE_SERVICE_ROLE_KEY,
  };
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Konfigurasi backend tidak valid: ${fields}`);
  }
  cachedEnvironment = result.data;
  return cachedEnvironment;
};
