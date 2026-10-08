import { beforeEach, describe, expect, it, vi } from "vitest";
import { isRelatedBranchManager } from "@/features/surat/registration/lib/branch-manager-candidates";
import type { MakerCandidate, MakerOffice } from "@/features/surat/registration/lib/first-maker-candidates";

const mocks = vi.hoisted(() => ({ from: vi.fn(), createClient: vi.fn() }));
vi.mock("../../backend/src/lib/supabase.js", () => ({ createUserSupabaseClient: mocks.createClient, adminSupabase: null }));
import { loadSuratMasterData } from "../../backend/src/services/surat.service";

type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let pageError: { message: string } | null;
let endless = false;
const calls: Array<{ table: string; filters: Array<[string, unknown]>; orders: string[]; range?: number[] }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  rows = {};
  pageError = null;
  endless = false;
  calls.length = 0;
  mocks.createClient.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation((table: string) => {
    const call = { table, filters: [] as Array<[string, unknown]>, orders: [] as string[], range: undefined as number[] | undefined };
    calls.push(call);
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
      is: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
      order: (key: string) => { call.orders.push(key); return query; },
      range: (from: number, to: number) => { call.range = [from, to]; return query; },
      then: (resolve: (result: { data: Row[] | null; error: typeof pageError }) => unknown) => {
        if (pageError && table === "profiles" && call.range?.[0] === 500) return resolve({ data: null, error: pageError });
        if (endless && table === "profiles") return resolve({ data: Array.from({ length: 500 }, (_, i) => ({ id: `user-${i}` })), error: null });
        const eligible = (rows[table] || []).filter(row => call.filters.every(([key, value]) => row[key] === value));
        const data = call.range ? eligible.slice(call.range[0], call.range[1] + 1) : eligible;
        return resolve({ data, error: null });
      },
    };
    return query;
  });
});

describe("complete RLS office hierarchy and active BM candidates", () => {
  it("finds the parent KC BM beyond the first page without widening to another office", async () => {
    const child = { id: "kcp", kedudukan: "KCP", parent_id: "kc" };
    const branch = { id: "kc", kedudukan: "KC", parent_id: "hq" };
    const bm = { id: "bm", office_id: "kc", job_title: "Branch Manager", is_active: true, deleted_at: null };
    rows.master_offices = [child, ...Array.from({ length: 999 }, (_, i) => ({ id: `office-${i}`, kedudukan: "KC" })), branch];
    rows.profiles = [...Array.from({ length: 1000 }, (_, i) => ({ id: `user-${i}`, office_id: "other", job_title: "BM", is_active: true, deleted_at: null })),
      bm, { ...bm, id: "inactive", is_active: false }, { ...bm, id: "deleted", deleted_at: "today" }];
    const result = await loadSuratMasterData("fixture-token");
    expect(result.offices).toHaveLength(1001);
    expect(result.users).toHaveLength(1001);
    expect((result.users as MakerCandidate[]).filter(user => isRelatedBranchManager(user, "kcp", result.offices as MakerOffice[])))
      .toEqual([bm]);
    const profileCalls = calls.filter(call => call.table === "profiles");
    expect(profileCalls.map(call => call.range)).toEqual([[0, 499], [500, 999], [1000, 1499]]);
    for (const call of profileCalls) {
      expect(call.filters).toEqual([["is_active", true], ["deleted_at", null]]);
      expect(call.orders).toEqual(["full_name", "id"]);
    }
    expect(calls.filter(call => call.table === "master_offices").every(call => call.orders[0] === "id")).toBe(true);
    expect(mocks.createClient).toHaveBeenCalledWith("fixture-token");
  });

  it("fails the entire load on a later-page query error, not a partial candidate fallback", async () => {
    rows.profiles = Array.from({ length: 500 }, (_, i) => ({ id: `user-${i}`, is_active: true, deleted_at: null }));
    pageError = { message: "fixture page failure" };
    await expect(loadSuratMasterData("fixture-token")).rejects.toThrow("fixture page failure");
  });

  it("bounds repeated pages and fails closed rather than returning truncated candidates", async () => {
    endless = true;
    await expect(loadSuratMasterData("fixture-token")).rejects.toThrow("melebihi batas pemuatan");
    expect(calls.filter(call => call.table === "profiles")).toHaveLength(100);
  });
});
