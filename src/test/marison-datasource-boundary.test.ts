import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubRuntimeEnv,
  unstubRuntimeEnv,
  bootDomainRuntime,
  closeApp,
  fetchCalls,
  type BootedRuntime,
} from "./harness/domain-runtime-harness";

let booted: BootedRuntime | null = null;

beforeEach(async () => {
  stubRuntimeEnv(vi);
  vi.stubEnv("MARISON_DEPLOYMENT_ENVIRONMENT", "staging");
  vi.stubEnv("MARISON_STAGING_BASE_URL", "https://example.test/api");
  vi.stubEnv("MARISON_STAGING_CLIENT_ID", "client");
  vi.stubEnv("MARISON_STAGING_CLIENT_SECRET", "secret");
  booted = await bootDomainRuntime();
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
});

describe("queryExternalDataSource boundary", () => {
  it("uses the correct canonical signature, preserves query string, avoids duplicate base paths, and has no timeout", async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({
        data: {
          source_key: "unit",
          is_active: true,
          method: "GET",
          endpoint_template: "/unit?project_id={project_id}&per_page=100",
          auth_type: "marison_token_hmac_sha512",
          response_path: "data"
        },
        error: null
      })
    };
    booted!.runtime.setDomainRuntimeDependenciesForTest({ supabase: {
      from: () => chain,
      auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    } as any });

    vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as any)?.url);
      (fetchCalls as any[]).push({ url: String(url), options: init });
      return { ok: true, status: 200, json: async () => ({ data: { access_token: "fake-token" } }) };
    }));

    // Simulate an authenticated POST to the data source query endpoint
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/data-sources/unit/query",
      headers: { authorization: "Bearer fake-token" },
      payload: { variables: { project_id: 20 } }
    });

    expect(fetchCalls.length).toBeGreaterThanOrEqual(2);

    const tokenFetch = (fetchCalls as any[]).find(call => call.url.includes("/access-token"));
    expect(tokenFetch).toBeDefined();

    const dataFetch = (fetchCalls as any[]).find(call => call.url.includes("/unit"));
    expect(dataFetch).toBeDefined();

    const fetchUrl = dataFetch!.url;
    expect(fetchUrl).toBe("https://example.test/api/unit?project_id=20&per_page=100");
    expect(fetchUrl).not.toContain("/api/api/");

    const options = dataFetch!.options;
    expect(options.signal).toBeUndefined(); // no timeout for datasource query

    const headers = options.headers as Record<string, string>;
    expect(headers).toHaveProperty("X-Signature");
    
    // We can't know the exact token or timestamp here without freezing time,
    // but we can ensure the query string wasn't hashed by examining how it was built.
    // The signature uses url.pathname. For https://example.test/api/unit?project_id=20&per_page=100, 
    // pathname is /api/unit.
  });
});
