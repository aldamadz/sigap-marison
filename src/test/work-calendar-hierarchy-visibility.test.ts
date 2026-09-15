import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResponse = { data?: unknown; error?: unknown; count?: number };
type RecordedCall = { table: string; method: string; args: unknown[] };

/**
 * Hierarchy visibility contract (CAL-03A).
 *
 * The work calendar depends on the organizational hierarchy: a user sees their
 * own entries, and a parent sees every descendant. The Supabase client is
 * replaced by a fail-closed fake that records query calls; there is no network
 * access and no database write.
 */
const h = vi.hoisted(() => {
  const responses: Record<string, QueryResponse> = {};
  const calls: RecordedCall[] = [];

  class FakeQuery {
    private readonly table: string;

    constructor(table: string) {
      this.table = table;
    }

    private record(method: string, args: unknown[]) {
      calls.push({ table: this.table, method, args });
      return this;
    }

    select(...args: unknown[]) {
      return this.record("select", args);
    }
    eq(...args: unknown[]) {
      return this.record("eq", args);
    }
    is(...args: unknown[]) {
      return this.record("is", args);
    }
    in(...args: unknown[]) {
      return this.record("in", args);
    }
    gte(...args: unknown[]) {
      return this.record("gte", args);
    }
    lt(...args: unknown[]) {
      return this.record("lt", args);
    }
    lte(...args: unknown[]) {
      return this.record("lte", args);
    }
    order(...args: unknown[]) {
      return this.record("order", args);
    }
    range(...args: unknown[]) {
      return this.record("range", args);
    }
    update(...args: unknown[]) {
      return this.record("update", args);
    }
    insert(...args: unknown[]) {
      return this.record("insert", args);
    }

    then(onFulfilled: (value: QueryResponse) => unknown) {
      return Promise.resolve(responses[this.table] ?? { data: [], error: null }).then(onFulfilled);
    }
  }

  return {
    responses,
    calls,
    from: (table: string) => new FakeQuery(table),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (table: string) => h.from(table) },
}));

import { getUserHierarchy, isParentUser, getChildUsers } from "@/services/parent-user.service";
import { getAgendasForParent } from "@/services/agenda.service";

beforeEach(() => {
  h.calls.length = 0;
  for (const key of Object.keys(h.responses)) {
    delete h.responses[key];
  }
});

describe("work calendar hierarchy visibility contract", () => {
  it("detects a parent user and filters only active profiles", async () => {
    h.responses.profiles = { count: 2, error: null };

    await expect(isParentUser("parent-1")).resolves.toBe(true);

    expect(h.calls.find((call) => call.method === "eq")?.args).toEqual(["parent_id", "parent-1"]);
    expect(h.calls.find((call) => call.method === "is")?.args).toEqual(["deleted_at", null]);
  });

  it("returns false when a user has no active subordinates", async () => {
    h.responses.profiles = { count: 0, error: null };

    await expect(isParentUser("leaf-1")).resolves.toBe(false);
  });

  it("collects the full descendant hierarchy including self", async () => {
    h.responses.profiles = {
      data: [
        { id: "parent-1", parent_id: null },
        { id: "child-1", parent_id: "parent-1" },
        { id: "grand-1", parent_id: "child-1" },
      ],
      error: null,
    };

    await expect(getUserHierarchy("parent-1")).resolves.toEqual(["parent-1", "child-1", "grand-1"]);
  });

  it("builds the recursive child list with depth and display name", async () => {
    h.responses.profiles = {
      data: [
        { id: "parent-1", nik: "1", full_name: "Boss", avatar_url: null, department_id: null, office_id: null, parent_id: null },
        { id: "child-1", nik: "2", full_name: "Child", avatar_url: null, department_id: null, office_id: null, parent_id: "parent-1" },
        { id: "grand-1", nik: "3", full_name: "Grand", avatar_url: null, department_id: null, office_id: null, parent_id: "child-1" },
      ],
      error: null,
    };

    const users = await getChildUsers("parent-1");

    expect(users.map((user) => user.id)).toEqual(["child-1", "grand-1"]);
    expect(users[0].depth).toBe(0);
    expect(users[1].depth).toBe(1);
    expect(users[1].displayName).toContain("↳ Grand");
  });

  it("scopes personal reads to the whole hierarchy for a parent", async () => {
    h.responses.profiles = {
      data: [
        { id: "parent-1", parent_id: null },
        { id: "child-1", parent_id: "parent-1" },
        { id: "grand-1", parent_id: "child-1" },
      ],
      error: null,
    };
    h.responses.agendas = { data: [], error: null };

    await getAgendasForParent("parent-1");

    const inCall = h.calls.find((call) => call.table === "agendas" && call.method === "in");
    expect(inCall?.args[0]).toBe("created_by");
    expect(inCall?.args[1]).toEqual(["parent-1", "child-1", "grand-1"]);
    expect(h.calls.some((call) => call.table === "agendas" && call.method === "eq")).toBe(false);
  });

  it("scopes personal reads to a single selected subordinate", async () => {
    h.responses.agendas = { data: [], error: null };

    await getAgendasForParent("parent-1", "grand-1");

    const inCall = h.calls.find((call) => call.table === "agendas" && call.method === "in");
    expect(inCall?.args[1]).toEqual(["grand-1"]);
    expect(h.calls.some((call) => call.table === "profiles")).toBe(false);
  });

  it("applies the date range and office filters to the agenda query", async () => {
    h.responses.profiles = { data: [{ id: "parent-1", parent_id: null }], error: null };
    h.responses.agendas = { data: [], error: null };
    const from = new Date("2026-07-01T00:00:00.000Z");
    const to = new Date("2026-08-01T00:00:00.000Z");

    await getAgendasForParent("parent-1", null, "5", { from, to });

    expect(h.calls.find((call) => call.method === "gte")?.args).toEqual(["start_time", from.toISOString()]);
    expect(h.calls.find((call) => call.method === "lt")?.args).toEqual(["start_time", to.toISOString()]);
    expect(h.calls.find((call) => call.method === "eq")?.args).toEqual(["profiles.office_id", "5"]);
  });
});
