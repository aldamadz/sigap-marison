import type { FastifyInstance } from "fastify";
import * as controller from "../controllers/bff.controller.js";

export const registerBffRoutes = async (app: FastifyInstance) => {
  app.post("/api/bff/query", {
    bodyLimit: 2 * 1024 * 1024,
    schema: { body: { type: "object", required: ["name"], maxProperties: 6 } },
  }, controller.query);
  app.get("/api/bff/storage/file", controller.storageFile);
  app.post<{ Params: { name: string } }>("/api/bff/functions/:name", {
    bodyLimit: 2 * 1024 * 1024,
    schema: {
      params: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string", pattern: "^[A-Za-z_][A-Za-z0-9_]*$" } },
      },
      body: { type: "object", maxProperties: 1 },
    },
  }, controller.invokeFunction);
};
