import { bffIdentifierSchema, bffQuerySchema } from "@sigap/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import { assertSameOrigin, getSession } from "../lib/session.js";
import * as bffService from "../services/bff.service.js";

export const query = async (request: FastifyRequest, reply: FastifyReply) => {
  assertSameOrigin(request);
  const session = await getSession(request, reply);
  return bffService.executeQuery(session!.access_token, bffQuerySchema.parse(request.body));
};

export const storageFile = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = await getSession(request, reply);
  const input = request.query as { bucket?: string; path?: string };
  const file = await bffService.downloadOwnAvatar(session!.user.id, input.bucket, input.path);
  return reply
    .header("Content-Type", file.contentType)
    .header("Content-Length", file.buffer.length)
    .header("Cache-Control", "private, max-age=60")
    .send(file.buffer);
};

export const invokeFunction = async (
  request: FastifyRequest<{ Params: { name: string } }>,
  reply: FastifyReply,
) => {
  assertSameOrigin(request);
  const session = await getSession(request, reply);
  const name = bffIdentifierSchema.parse(request.params.name);
  return bffService.invokeFunction(
    session!.access_token,
    name,
    request.body as { options?: Record<string, unknown> },
  );
};
