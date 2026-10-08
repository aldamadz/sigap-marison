import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootDomainRuntime, closeApp, fetchCalls, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime } from "./harness/domain-runtime-harness";

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
let booted: BootedRuntime | null = null;
let role = "admin";
const updateUserById = vi.fn(async () => ({ data: { user: { id: targetId } }, error: null }));

beforeEach(async () => {
  stubRuntimeEnv(vi);
  vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", "test-only-bootstrap-password");
  role = "admin";
  updateUserById.mockClear();
  booted = await bootDomainRuntime();
  booted.runtime.setDomainRuntimeDependenciesForTest({ supabase: {
    auth: { getUser: async (token: string | undefined) => token
      ? { data: { user: { id: actorId } }, error: null }
      : { data: { user: null }, error: { message: "Unauthorized" } }, admin: { updateUserById } },
    from: (table: string) => ({
      select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: {
        id, email: "tester@example.test", role, is_active: true, deleted_at: null,
      }, error: null }) }) }),
      insert: async () => ({ data: table === "activity_logs" ? [] : null, error: null }),
    }),
    schema: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
  } });
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
});

describe("admin reset-password route wiring", () => {
  const url = `/api/admin/users/${targetId}/reset-password`;
  it("uses the configured server client and never exposes the bootstrap password", async () => {
    const response = await booted!.app.inject({ method: "POST", url, headers: { authorization: "Bearer test-session" } });
    expect(response.statusCode).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(targetId, { password: "test-only-bootstrap-password" });
    expect(response.json()).toMatchObject({ success: true });
    expect(response.body).not.toContain("test-only-bootstrap-password");
    expect(fetchCalls).toEqual([]);
  });
  it("rejects non-admin users before touching credentials", async () => {
    role = "user";
    const response = await booted!.app.inject({ method: "POST", url, headers: { authorization: "Bearer test-session" } });
    expect(response.statusCode).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-site requests", async () => {
    expect((await booted!.app.inject({ method: "POST", url })).statusCode).toBe(401);
    expect((await booted!.app.inject({ method: "POST", url, headers: {
      authorization: "Bearer test-session", "sec-fetch-site": "cross-site",
    } })).statusCode).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
