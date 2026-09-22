/**
 * Backend enforcement: SPK Unit harus memakai seluruh koleksi
 * marison_units_by_project (paginasi penuh), bukan halaman pertama.
 */
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

const PAGE_SIZE = 100;
const pageOne = Array.from({ length: PAGE_SIZE }, (_, index) => ({
  code: `KWS-${String(index + 1).padStart(3, "0")}`,
  name: `Kuwasen ${index + 1}`,
}));
const pageTwo = Array.from({ length: PAGE_SIZE }, (_, index) => ({
  code: `KWS-${String(index + 101).padStart(3, "0")}`,
  name: `Kuwasen ${index + 101}`,
}));
const pageThree = Array.from({ length: 52 }, (_, index) => ({
  code: `KWS-${String(index + 201).padStart(3, "0")}`,
  name: `Kuwasen ${index + 201}`,
}));

const unitSource = {
  source_key: "marison_units_by_project",
  is_active: true,
  method: "GET",
  endpoint_template: "/unit?project_id={project_id}&per_page=100",
  auth_type: "marison_token_hmac_sha512",
  response_path: "data",
  value_path: "code",
  label_path: "name",
};

const sourceChain = {
  select: () => sourceChain,
  eq: () => sourceChain,
  maybeSingle: async () => ({ data: unitSource, error: null }),
};

const pagedMarisonFetch = vi.fn(async (input: unknown, init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as { url: string }).url);
  datasourceFetchCalls.push({ url: String(url), options: init || {} });

  if (String(url).includes("/access-token")) {
    return { ok: true, status: 200, json: async () => ({ data: { access_token: "fake-token" } }) };
  }
  const page = Number(new URL(String(url)).searchParams.get("page") || 1);
  const data = page === 1 ? pageOne : page === 2 ? pageTwo : pageThree;
  return {
    ok: true,
    status: 200,
    json: async () => ({ data, meta: { total: 252, total_pages: 3 } }),
  };
});

const unitRequestPayload = (count: number, requestedProject = { id: 23, code: "TEST-02", name: "TEST 01" }) => ({
  form_input_data: {
    request_category: "unit",
    request_mode: "unit",
    requested_project: requestedProject,
    requested_unit_count: count,
  },
});

const unitFetchUrls = () => datasourceFetchCalls
  .filter(({ url }) => url.includes("/unit?") || url.includes("/unit&"))
  .map(({ url }) => url);

beforeEach(async () => {
  stubRuntimeEnv(vi);
  vi.stubEnv("MARISON_DEPLOYMENT_ENVIRONMENT", "staging");
  vi.stubEnv("MARISON_STAGING_BASE_URL", "https://example.test/api");
  vi.stubEnv("MARISON_STAGING_CLIENT_ID", "client");
  vi.stubEnv("MARISON_STAGING_CLIENT_SECRET", "secret");

  datasourceFetchCalls.length = 0;
  vi.stubGlobal("fetch", pagedMarisonFetch);

  booted = await bootDomainRuntime();
  booted!.runtime.setDomainRuntimeDependenciesForTest({
    nowIso: () => "2026-09-22T00:00:00.000Z",
    supabase: {
      from: () => sourceChain,
      auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
    },
  });
});

afterEach(async () => {
  await closeApp(booted);
  booted = null;
  unstubRuntimeEnv(vi);
});

describe("POST /api/surat/unit-availability/validate", () => {
  it("membaca 252 unit (3 halaman) dan mengizinkan jumlah di dalam kapasitas", async () => {
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: unitRequestPayload(3),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true, availableCount: 252 });
    expect(unitFetchUrls()).toEqual([
      "https://example.test/api/unit?project_id=23&per_page=100&page=1",
      "https://example.test/api/unit?project_id=23&per_page=100&page=2",
      "https://example.test/api/unit?project_id=23&per_page=100&page=3",
    ]);
    expect(unitFetchUrls()).toHaveLength(3);
  });

  it("memblokir jumlah 0 dengan 4xx sebelum menyentuh vendor Marison", async () => {
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: unitRequestPayload(0),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("Jumlah unit wajib diisi");
    expect(unitFetchUrls()).toHaveLength(0);
  });

  it("memblokir jumlah melebihi ketersediaan setelah seluruh halaman dibaca", async () => {
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: unitRequestPayload(253),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("252");
    expect(unitFetchUrls()).toHaveLength(3);
  });

  it("memetakan kegagalan lookup Marison menjadi 4xx, bukan 500", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
      const url = typeof input === "string" ? input : (input instanceof URL ? input.href : (input as { url: string }).url);
      if (String(url).includes("/access-token")) {
        return { ok: true, status: 200, json: async () => ({ data: { access_token: "fake-token" } }) };
      }
      throw new Error("Vendor Marison tidak terjangkau");
    }));

    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: unitRequestPayload(2),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("Kapasitas unit belum dapat dipastikan");
  });

  it("tidak memvalidasi kategori non-unit dan tidak memanggil lookup unit", async () => {
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: { form_input_data: { request_category: "asset", request_mode: "barang" } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true, availableCount: null });
    expect(unitFetchUrls()).toHaveLength(0);
  });

  it("memblokir permintaan unit tanpa proyek", async () => {
    const res = await booted!.app.inject({
      method: "POST",
      url: "/api/surat/unit-availability/validate",
      headers: { authorization: "Bearer fake-session" },
      payload: { form_input_data: { request_category: "unit", requested_unit_count: 1 } },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("Proyek unit wajib dipilih");
    expect(unitFetchUrls()).toHaveLength(0);
  });
});
