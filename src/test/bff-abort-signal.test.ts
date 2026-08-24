// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

describe("BFF query cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("forwards abortSignal to the same-origin BFF fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "surat-1" }, error: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = await import("@/lib/supabase");
    const controller = new AbortController();
    const result = await supabase
      .rpc("get_surat_monitoring_detail", { p_surat_id: "surat-1" })
      .abortSignal(controller.signal);

    expect(result.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/bff/query");
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});
