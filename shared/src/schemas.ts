import { z } from "zod";

export const bffIdentifierSchema = z.string().regex(
  /^[A-Za-z_][A-Za-z0-9_]*$/,
  "Identifier tidak valid.",
);

export const bffOperationSchema = z.object({
  method: z.string().min(1),
  args: z.array(z.unknown()).default([]),
});

export const bffQuerySchema = z.object({
  kind: z.enum(["table", "rpc"]).default("table"),
  name: bffIdentifierSchema,
  args: z.record(z.string(), z.unknown()).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  operations: z.array(bffOperationSchema).default([]),
});

export type BffQuery = z.infer<typeof bffQuerySchema>;

export const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(4096),
});
