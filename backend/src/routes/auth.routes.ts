import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as controller from "../controllers/auth.controller.js";

const loginIdentityKey = (request: { body?: unknown; ip: string }) => {
  const email = String((request.body as { email?: string } | undefined)?.email || "").trim().toLowerCase();
  return createHash("sha256").update(email || request.ip).digest("hex");
};

export const registerAuthRoutes = async (app: FastifyInstance) => {
  app.post("/api/auth/login", {
    config: {
      rateLimit: {
        max: 8,
        timeWindow: "15 minutes",
        keyGenerator: loginIdentityKey,
      },
    },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", maxLength: 320 },
          password: { type: "string", minLength: 1, maxLength: 4096 },
        },
      },
    },
  }, controller.login);
  app.get("/api/auth/session", {
    schema: {
      response: {
        200: {
          type: "object",
          required: ["session", "user"],
          properties: {
            session: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  required: ["access_token", "refresh_token", "token_type", "expires_in", "user"],
                  properties: {
                    access_token: { type: "string" },
                    refresh_token: { type: "string" },
                    token_type: { type: "string" },
                    expires_in: { type: "number" },
                    expires_at: { type: "number" },
                    user: {
                      type: "object",
                      required: ["id"],
                      properties: {
                        id: { type: "string" },
                        email: { anyOf: [{ type: "string" }, { type: "null" }] },
                      },
                    },
                  },
                },
              ],
            },
            user: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  required: ["id"],
                  properties: {
                    id: { type: "string" },
                    email: { anyOf: [{ type: "string" }, { type: "null" }] },
                  },
                },
              ],
            },
          },
        },
      },
    },
  }, controller.session);
  app.post("/api/auth/logout", controller.logout);
  app.post("/api/auth/update-user", {
    schema: { body: { type: "object", maxProperties: 10 } },
  }, controller.updateUser);
  app.post("/api/auth/verify-otp", {
    config: { rateLimit: { max: 30, timeWindow: "15 minutes" } },
    schema: { body: { type: "object", maxProperties: 10 } },
  }, controller.verifyOtp);
};
