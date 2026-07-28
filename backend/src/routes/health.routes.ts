import type { FastifyInstance } from "fastify";

const healthSchema = {
  response: {
    200: {
      type: "object",
      required: ["status", "timestamp"],
      properties: {
        status: { type: "string" },
        timestamp: { type: "string" },
      },
    },
  },
};

const versionSchema = {
  response: {
    200: {
      type: "object",
      additionalProperties: false,
      required: ["gitSha"],
      properties: {
        gitSha: { type: "string", pattern: "^(?:[a-f0-9]{40}|[a-f0-9]{64}|unknown)$" },
      },
    },
  },
};

export const normalizeGitSha = (value: string | undefined): string => {
  const candidate = String(value || "").trim().toLowerCase();
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(candidate) ? candidate : "unknown";
};

export const registerHealthRoutes = async (
  app: FastifyInstance,
  gitSha = normalizeGitSha(process.env.GIT_SHA),
) => {
  app.get("/health/live", { schema: healthSchema }, async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
  app.get("/health/ready", { schema: healthSchema }, async () => ({
    status: "ready",
    timestamp: new Date().toISOString(),
  }));
  app.get("/health/version", { schema: versionSchema }, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return { gitSha: normalizeGitSha(gitSha) };
  });
};
