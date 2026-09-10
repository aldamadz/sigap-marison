import { createHash, createHmac } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  stubRuntimeEnv,
  unstubRuntimeEnv,
  bootDomainRuntime,
  closeApp,
  type BootedRuntime,
} from "./harness/domain-runtime-harness";

let booted: BootedRuntime | null = null;
const datasourceFetchCalls: Array<{ url: string; options: RequestInit }> = [];

beforeEach(async () => {
  stubRuntimeEnv(vi);
  vi.stubEnv("MARISON_DEPLOYMENT_ENVIRONMENT", "staging");
  vi.stubEnv("MARISON_STAGING_BASE_URL", "https://example.test/api");
  vi.stubEnv("MARISON_STAGING_CLIENT_ID", "client");
  vi.stubEnv("MARISON_STAGING_CLIENT_SECRET", "secret");
  
  datasourceFetchCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as { url: string }).url);
    datasourceFetchCalls.push({ url: String(url), options: init || {} });
    
    if (String(url).includes("/access-token")) {
      return { ok: true, status: 200, json: async () => ({ data: { access_token: "fake-token" } }) };
    }
    
    return { ok: true, status: 200, json: async () => ({ data: [{ id: 1 }] }) };
  }));
  
  booted = await bootDomainRuntime();
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-08T00:00:00.000Z").getTime());
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
    
    booted!.runtime.setDomainRuntimeDependenciesForTest({
      nowIso: () => "2026-09-08T00:00:00.000Z",
      supabase: {
        from: () => chain,
        auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
      } as unknown
    });

    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/data-sources/unit/query",
      headers: { authorization: "Bearer fake-session" },
      payload: { variables: { project_id: 20 } }
    });

    expect(res.statusCode).toBe(200);
    expect(datasourceFetchCalls.length).toBe(2);

    const tokenFetch = datasourceFetchCalls[0];
    expect(tokenFetch.url).toBe("https://example.test/api/access-token");

    const dataFetch = datasourceFetchCalls[1];
    expect(dataFetch.url).toBe("https://example.test/api/unit?project_id=20&per_page=100");
    expect(dataFetch.options.signal).toBeUndefined();

    const headers = dataFetch.options.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fake-token");
    expect(headers["X-Timestamp"]).toBe("2026-09-08T00:00:00.000Z");

    const canonical = `GET:/api/unit:fake-token:${createHash("sha256").update(Buffer.alloc(0)).digest("hex")}:2026-09-08T00:00:00.000Z`;
    expect(canonical).not.toContain("project_id=20");
    expect(headers["X-Signature"]).toBe(createHmac("sha512", "fake-token").update(canonical).digest("hex"));
  });
});
