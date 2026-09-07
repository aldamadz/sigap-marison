import { randomBytes, createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bootDomainRuntime, closeApp, fetchCalls, stubRuntimeEnv, unstubRuntimeEnv, type BootedRuntime } from "./harness/domain-runtime-harness";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(), execute: vi.fn(), projects: vi.fn(), tracked: vi.fn(),
}));
vi.mock("../../server/marison-employee-sync.mjs", async (original) => ({
  ...await original<object>(),
  previewMarisonEmployeeSync: mocks.preview,
  executeMarisonEmployeeSync: mocks.execute,
  executeMarisonProjectSync: mocks.projects,
  runTrackedMarisonSync: mocks.tracked,
}));

let booted: BootedRuntime;
let effectiveToken: string;
let password: string;
let bearer: string;
let logs: ReturnType<typeof vi.spyOn>;
const source = vi.fn();
const projectSource = vi.fn();
const database = vi.fn();
let role = "admin";

beforeEach(async () => {
  vi.clearAllMocks();
  stubRuntimeEnv(vi);
  const session = randomBytes(32).toString("hex");
  password = randomBytes(16).toString("hex");
  bearer = randomBytes(32).toString("hex");
  vi.stubEnv("SESSION_SECRET", session);
  vi.stubEnv("MARISON_SYNC_CRON_TOKEN", "");
  vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", "");
  effectiveToken = createHash("sha256").update(`marison-directory-sync:${session}`).digest("hex");
  logs = vi.spyOn(console, "error").mockImplementation(() => {});
  role = "admin";
  source.mockResolvedValue({ employees: [], branches: [] });
  projectSource.mockResolvedValue({ projects: [], branches: [] });
  mocks.preview.mockResolvedValue({ source: 0 });
  mocks.execute.mockResolvedValue({ status: "success" });
  mocks.projects.mockResolvedValue({ status: "success" });
  mocks.tracked.mockImplementation(({ operation }) => operation());
  database.mockImplementation((table) => {
    if (table !== "profiles") throw new Error("Unexpected database dependency");
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: { role, is_active: true, deleted_at: null }, error: null,
    }) }) }) };
  });
  booted = await bootDomainRuntime();
  booted.runtime.setDomainRuntimeDependenciesForTest({
    supabase: {
      auth: { getUser: async (token: string) => token === bearer
        ? { data: { user: { id: "admin-id" } }, error: null }
        : { data: { user: null }, error: { message: "Unauthorized" } } },
      from: database,
      rpc: () => { throw new Error("Unexpected RPC"); },
    },
    getMarisonEmployeeSyncSource: source,
    getMarisonProjectSyncSource: projectSource,
  });
}, 30000);

afterEach(async () => {
  expect(fetchCalls).toEqual([]);
  await closeApp(booted);
  logs.mockRestore();
  unstubRuntimeEnv(vi);
});

const request = (kind: "preview" | "manual" | "cron", token?: string) => booted.app.inject({
  method: kind === "preview" ? "GET" : "POST",
  url: kind === "cron" ? "/api/internal/marison/directory-sync"
    : `/api/integrations/marison/employees/${kind === "manual" ? "sync" : "preview"}`,
  headers: { host: "sigap.test", origin: "https://sigap.test", ...(token ? kind === "cron"
    ? { "x-internal-sync-token": token } : { authorization: `Bearer ${token}` } : {}) },
  ...(kind === "manual" ? { payload: { confirm: true } } : {}),
});
const noSync = () => {
  expect(source).not.toHaveBeenCalled();
  expect(projectSource).not.toHaveBeenCalled();
  expect(mocks.tracked).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.projects).not.toHaveBeenCalled();
};

it.each(["preview", "manual"] as const)("%s rejects missing bearer before config", async (kind) => {
  expect((await request(kind)).statusCode).toBe(401);
  noSync();
});
it.each(["preview", "manual"] as const)("%s rejects non-admin", async (kind) => {
  role = "user";
  expect((await request(kind, bearer)).statusCode).toBe(403);
  noSync();
});
it("preview admin succeeds without bootstrap password, without writes", async () => {
  const response = await request("preview", bearer);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ source: 0 });
  expect(mocks.preview).toHaveBeenCalledOnce();
  expect(mocks.tracked).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("manual rejects missing password before source and tracked sync", async () => {
  expect((await request("manual", bearer)).statusCode).toBe(503);
  noSync();
});
it.each([false, true])("cron rejects missing/wrong token with derived token available: %s", async (wrong) => {
  expect((await request("cron", wrong ? randomBytes(32).toString("hex") : undefined)).statusCode).toBe(401);
  noSync();
  expect(database).not.toHaveBeenCalled();
});
it.each([0, 7])("cron rejects invalid password length %s with sanitized response and log", async (length) => {
  const invalid = password.slice(0, length);
  vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", invalid);
  const response = await request("cron", effectiveToken);
  expect(response.statusCode).toBe(503);
  expect(response.json().error).toBe("Konfigurasi sinkronisasi karyawan belum lengkap.");
  expect(Object.keys(response.json()).sort()).toEqual(["error", "requestId"]);
  expect(logs).toHaveBeenCalledOnce();
  const output = response.body + JSON.stringify(logs.mock.calls);
  for (const forbidden of [password, "STAGING_DEFAULT_USER_PASSWORD", "SESSION_SECRET", "MARISON_SYNC_CRON_TOKEN", "Error:", " at ", ...(invalid ? [invalid] : [])]) {
    expect(output.includes(forbidden)).toBe(false);
  }
  noSync();
});
it.each(["manual", "cron"] as const)("%s valid config reaches only mocked executors", async (kind) => {
  vi.stubEnv("STAGING_DEFAULT_USER_PASSWORD", password);
  const response = await request(kind, kind === "cron" ? effectiveToken : bearer);
  expect(response.statusCode).toBe(200);
  expect(mocks.execute).toHaveBeenCalledOnce();
  expect(mocks.execute.mock.calls[0][0].defaultPassword === password).toBe(true);
  expect(source).toHaveBeenCalledOnce();
  expect(response.body.includes(password)).toBe(false);
  expect(logs).not.toHaveBeenCalled();
});
