import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn(async () => {
  const error = new Error("Unauthorized") as Error & { statusCode: number };
  error.statusCode = 401;
  throw error;
});
const loadMasterDataMock = vi.fn();

vi.mock("../../backend/src/lib/session.ts", () => ({ getSession: getSessionMock }));
vi.mock("../../backend/src/services/surat.service.ts", () => ({ loadSuratMasterData: loadMasterDataMock }));

let app: FastifyInstance;

beforeEach(async () => {
  const { registerSuratRoutes } = await import("../../backend/src/routes/surat.routes.ts");
  app = Fastify({ logger: false });
  app.setErrorHandler((error, _request, reply) => {
    void reply.code((error as Error & { statusCode?: number }).statusCode || 500).send({ error: error.message });
  });
  await registerSuratRoutes(app);
});

afterEach(async () => {
  await app.close();
  vi.clearAllMocks();
});

describe("SUR-12 master data route", () => {
  it("is registered, protected, and fail-closed before data access", async () => {
    const response = await app.inject({ method: "GET", url: "/api/surat/master-data" });

    expect(response.statusCode).toBe(401);
    expect(response.statusCode).not.toBe(404);
    expect(getSessionMock).toHaveBeenCalledTimes(1);
    expect(loadMasterDataMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods", async () => {
    const response = await app.inject({ method: "POST", url: "/api/surat/master-data" });

    expect(response.statusCode).toBe(404);
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
