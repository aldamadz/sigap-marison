import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export const registerErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error instanceof ZodError
      ? 400
      : Number((error as Error & { statusCode?: number; status?: number }).statusCode
        || (error as Error & { status?: number }).status
        || 500);
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    else if (statusCode >= 429) request.log.warn({ err: error }, "request rejected");
    else request.log.debug({ err: error }, "request rejected");
    const message = error instanceof ZodError
      ? "Payload tidak valid."
      : statusCode >= 500
        ? "Internal server error"
        : error instanceof Error
          ? error.message
          : "Request gagal.";
    return reply.code(statusCode).send({
      error: message,
      ...(error instanceof ZodError ? { details: error.flatten() } : {}),
      requestId: request.id,
    });
  });
};
