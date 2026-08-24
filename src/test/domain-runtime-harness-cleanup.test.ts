// Proves the harness cleanup path restores global.fetch (and does not leak
// the fail-closed mock into the environment). This file deliberately avoids
// the shared beforeEach/afterEach so the stub/unstub cycle is fully explicit.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  stubRuntimeEnv,
  unstubRuntimeEnv,
  fetchCalls,
} from "./harness/domain-runtime-harness";

afterEach(() => {
  // Safety: always restore the global even if a test below fails early.
  unstubRuntimeEnv(vi);
});

describe("harness cleanup restores global.fetch", () => {
  it("before stub, global.fetch is the real global (not mocked)", () => {
    // Fresh test file: fetch must NOT already be stubbed.
    expect((globalThis.fetch as any).mock).toBeFalsy();
  });

  it("after stub, global.fetch is the fail-closed mock that throws", () => {
    stubRuntimeEnv(vi);
    expect((globalThis.fetch as any).mock).toBeTruthy();
    expect(fetchCalls).toEqual([]);
    // The mock throws synchronously (fail-closed), so it is not a Promise
    // rejection — assert the synchronous throw.
    expect(() => globalThis.fetch("https://vendor.invalid/api/probe"))
      .toThrow("FAIL-CLOSED: real fetch attempted");
    expect(fetchCalls).toEqual(["https://vendor.invalid/api/probe"]);
  });

  it("after unstubRuntimeEnv, global.fetch is restored to the real global", () => {
    const realFetch = globalThis.fetch;
    stubRuntimeEnv(vi);
    expect((globalThis.fetch as any).mock).toBeTruthy();
    unstubRuntimeEnv(vi);
    // Restored: no longer the fail-closed mock, and identical to the
    // original global reference captured before stubbing. No real network is
    // attempted (a restored call to a reserved domain would only DNS-fail).
    expect((globalThis.fetch as any).mock).toBeFalsy();
    expect(globalThis.fetch).toBe(realFetch);
  });
});
