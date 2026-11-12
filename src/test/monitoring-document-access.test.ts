import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
const source = readFileSync("backend/src/domain-runtime.ts", "utf8");
const access = source.slice(source.indexOf("const getAuthorizedSurat ="), source.indexOf("const mintAuthorizedFileViewToken ="));
const parent = source.slice(source.indexOf("const canReadActiveRecommendationViaParent ="), source.indexOf("// Ownership comparisons"));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function harness({ direct = false, allowed = false as unknown, error = null as unknown, linked = false } = {}) {
  const doc = { id: "doc", created_by: "requester" };
  const rpc = vi.fn().mockResolvedValue({ data: allowed, error });
  const userClient = vi.fn(() => ({ rpc }));
  const activeUser = vi.fn().mockResolvedValue({ id: "viewer" });
  const recommendation = vi.fn().mockResolvedValue(linked);
  const supabase = { from: vi.fn((table: string) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: doc, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return query;
  }) };
  const run = new AsyncFunction("supabase", "requireSupabaseUser", "canReadSurat", "createUserSupabaseClient", "canReadActiveRecommendationViaParent", `${access};return getAuthorizedSurat('doc','caller-jwt');`);
  return { run: () => run(supabase, activeUser, async () => direct, userClient, recommendation), rpc, userClient, activeUser, recommendation };
}
it("allows authorized monitoring readers using their JWT and the canonical RPC", async () => {
  const h = harness({ allowed: true });
  expect((await h.run()).user.id).toBe("viewer");
  expect(h.userClient).toHaveBeenCalledWith("caller-jwt");
  expect(h.rpc).toHaveBeenCalledWith("can_read_surat", { p_surat_id: "doc" });
  expect(h.recommendation).not.toHaveBeenCalled();
});
it.each([false, null, "true", {}, []])("denies a non-boolean or false scope result %j", async allowed => {
  await expect(harness({ allowed }).run()).rejects.toMatchObject({ status: 403 });
});
it("fails closed on a scope error without falling back to recommendations", async () => {
  const h = harness({ error: { message: "private database failure" }, linked: true });
  await expect(h.run()).rejects.toMatchObject({ status: 503, message: "Akses dokumen belum dapat diverifikasi." });
  expect(h.recommendation).not.toHaveBeenCalled();
});
it("retains active-profile gating and direct participant behavior", async () => {
  const h = harness({ direct: true }); await h.run();
  expect(h.activeUser).toHaveBeenCalledWith("caller-jwt"); expect(h.rpc).not.toHaveBeenCalled();
});
it("keeps the linked-parent fallback scoped to active recommendation links and caller RLS", async () => {
  const scoped = vi.fn().mockResolvedValue({ data: [{ id: "parent" }], error: null });
  const userClient = vi.fn(() => ({ from: () => ({ select: () => ({ in: scoped }) }) }));
  const adminClient = { from: (table: string) => {
    const query = { select: () => query, eq: () => query, in: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "surat_linked_documents" ? [{ parent_surat_id: "parent", status: "active", link_type: "recommendation" }] : [], error: null }).then(resolve) };
    return query;
  } };
  const run = new AsyncFunction("supabase", "activeRecommendationParentIds", "hasDirectSuratAccess", "createUserSupabaseClient", `${parent};return canReadActiveRecommendationViaParent('child','viewer','caller-jwt');`);
  expect(await run(adminClient, () => ["parent"], () => false, userClient)).toBe(true);
  expect(userClient).toHaveBeenCalledWith("caller-jwt"); expect(scoped).toHaveBeenCalledWith("id", ["parent"]);
  expect(parent).toContain('.eq("status", "active")');
});
