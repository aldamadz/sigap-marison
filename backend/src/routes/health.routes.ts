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

export const registerHealthRoutes = async (app: FastifyInstance) => {
  app.get("/health/live", { schema: healthSchema }, async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));
  app.get("/health/ready", { schema: healthSchema }, async () => ({
    status: "ready",
    timestamp: new Date().toISOString(),
  }));
};
