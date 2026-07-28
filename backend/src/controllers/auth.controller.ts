import { loginSchema } from "@sigap/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import * as authService from "../services/auth.service.js";

export const login = async (request: FastifyRequest, reply: FastifyReply) => (
  authService.login(request, reply, loginSchema.parse(request.body))
);

export const session = async (request: FastifyRequest, reply: FastifyReply) => (
  authService.currentSession(request, reply)
);

export const logout = async (request: FastifyRequest, reply: FastifyReply) => (
  authService.logout(request, reply)
);

export const updateUser = async (request: FastifyRequest, reply: FastifyReply) => (
  authService.updateUser(request, reply, request.body as Record<string, unknown>)
);

export const verifyOtp = async (request: FastifyRequest, reply: FastifyReply) => (
  authService.verifyOtp(request, reply, request.body as Record<string, unknown>)
);
