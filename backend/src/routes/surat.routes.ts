import type { FastifyInstance } from "fastify";
import * as controller from "../controllers/surat.controller.js";

export const registerSuratRoutes = async (app: FastifyInstance) => {
  app.get("/api/surat/master-data", controller.masterData);
};
