import type { FastifyReply, FastifyRequest } from "fastify";
import { getSession } from "../lib/session.js";
import { loadSuratMasterData } from "../services/surat.service.js";

export const masterData = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = await getSession(request, reply);
  reply.header("Cache-Control", "private, max-age=30");
  return loadSuratMasterData(session!.access_token);
};
