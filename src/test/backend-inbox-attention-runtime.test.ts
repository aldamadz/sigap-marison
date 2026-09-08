import { describe, expect, it } from "vitest";
import {
  createInboxRuntime,
  parseInboxLimit,
  parseInboxCursor,
  parseInboxSearch,
  parseInboxTaskType,
  encodeInboxCursor,
  InboxSupabaseClient
} from "../../backend/src/modules/surat/inbox-runtime.js";
import {
  createAttentionRuntime,
  AttentionSupabaseClient
} from "../../backend/src/modules/attention/attention-runtime.js";

const uuid1 = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const uuid2 = "b1b2c3d4-e5f6-7890-abcd-ef1234567890";
const uuid3 = "c1b2c3d4-e5f6-7890-abcd-ef1234567890";
const uuid = uuid1;
const user = async () => ({ id: "user-1" });

const createFakeInboxSupabase = (overrides: Partial<InboxSupabaseClient> = {}): InboxSupabaseClient => ({
  rpc: async () => ({ data: null, error: null } as never),
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null } as never) }) }) }),
  ...overrides,
});

const createFakeAttentionSupabase = (overrides: Partial<AttentionSupabaseClient> = {}): AttentionSupabaseClient => ({
  rpc: async () => ({ data: null, error: null } as never),
  ...overrides,
});

describe("pure inbox parsers", () => {
  it("limit: empty/default, 1, 50, 0, >50, fractional, negative, nonnumeric", () => {
    expect(parseInboxLimit(null)).toEqual({ error: null, value: 20 });
    expect(parseInboxLimit("")).toEqual({ error: null, value: 20 });
    expect(parseInboxLimit("1").value).toBe(1);
    expect(parseInboxLimit("50").value).toBe(50);
    expect(parseInboxLimit("0").error).toBe("limit minimum 1");
    expect(parseInboxLimit("51").error).toBe("limit maksimum 50");
    expect(parseInboxLimit("1.5").error).toBe("limit harus integer positif");
    expect(parseInboxLimit("-5").error).toBe("limit harus integer positif");
    expect(parseInboxLimit("abc").error).toBe("limit harus integer positif");
  });

  it("cursor: valid, malformed base64/field count, timestamp invalid, task type invalid, UUID invalid", () => {
    const validRaw = encodeInboxCursor({ available_at: "2026-09-08T00:00:00.000Z", task_type: "approval", id: uuid });
    expect(parseInboxCursor(validRaw).value).toEqual({ at: "2026-09-08T00:00:00.000Z", taskType: "approval", id: uuid });

    expect(parseInboxCursor("badbase64!!!").error).toBe("cursor tidak valid");

    const malformedFields = Buffer.from("just|two").toString("base64");
    expect(parseInboxCursor(malformedFields).error).toBe("cursor tidak valid");

    const invalidTimestamp = Buffer.from(`not-a-date|approval|${uuid}`).toString("base64");
    expect(parseInboxCursor(invalidTimestamp).error).toBe("cursor tidak valid");

    const invalidTaskType = Buffer.from(`2026-09-08T00:00:00.000Z|review|${uuid}`).toString("base64");
    expect(parseInboxCursor(invalidTaskType).error).toBe("cursor tidak valid");

    const invalidUUID = Buffer.from(`2026-09-08T00:00:00.000Z|approval|bad-uuid`).toString("base64");
    expect(parseInboxCursor(invalidUUID).error).toBe("cursor tidak valid");
  });

  it("search: trim, 200 accepted, 201 rejected", () => {
    expect(parseInboxSearch("  hello  ").value).toBe("hello");
    expect(parseInboxSearch("x".repeat(200)).value).toBe("x".repeat(200));
    expect(parseInboxSearch("x".repeat(201)).error).toBe("search maksimum 200 karakter");
  });

  it("task_type: approval/verification accepted, other rejected", () => {
    expect(parseInboxTaskType("approval").value).toBe("approval");
    expect(parseInboxTaskType("verification").value).toBe("verification");
    expect(parseInboxTaskType("review").error).toBe("task_type tidak valid");
    expect(parseInboxTaskType(null).value).toBe(null);
  });
});

describe("backend inbox runtime", () => {
  it("uses newest Supabase dependency and skips count after cursor", async () => {
    const calls: string[] = [];
    let supabase = createFakeInboxSupabase({
      rpc: async () => { throw new Error("stale client"); }
    });

    const fresh = createFakeInboxSupabase({
      rpc: async (name: string) => {
        calls.push(name);
        return {
          data: name === "get_compact_inbox" ? [{ id: uuid, available_at: "2026-09-08T00:00:00.000Z", task_type: "approval" }] : 7,
          error: null
        } as never;
      }
    });

    const runtime = createInboxRuntime({ getSupabase: () => supabase, requireSupabaseUser: user });
    supabase = fresh;

    expect((await runtime.getInboxCompact("token", new URL("https://test/api/surat/inbox"))).total).toBe(7);
    expect(calls).toEqual(["get_compact_inbox", "get_compact_inbox_count"]);
    calls.length = 0;
    const cursor = encodeInboxCursor({ id: uuid, available_at: "2026-09-08T00:00:00.000Z", task_type: "approval" });
    await runtime.getInboxCompact("token", new URL(`https://test/api/surat/inbox?cursor=${encodeURIComponent(cursor)}`));
    expect(calls).toEqual(["get_compact_inbox"]);
  });

  it("first page calls list + count; cursor page calls list only; hasMore, pageSize truncation, total, nextCursor exact", async () => {
    const calls: string[] = [];
    const fresh = createFakeInboxSupabase({
      rpc: async (name: string) => {
        calls.push(name);
        if (name === "get_compact_inbox") {
          return {
            data: [
              { id: uuid1, available_at: "2026-09-08T00:00:00.000Z", task_type: "approval" },
              { id: uuid2, available_at: "2026-09-08T00:00:00.000Z", task_type: "approval" },
              { id: uuid3, available_at: "2026-09-08T00:00:00.000Z", task_type: "approval" }
            ],
            error: null
          } as never;
        }
        if (name === "get_compact_inbox_count") {
          return { data: 15, error: null } as never;
        }
        return { data: null, error: null } as never;
      }
    });

    const runtime = createInboxRuntime({ getSupabase: () => fresh, requireSupabaseUser: user });

    let res = await runtime.getInboxCompact("token", new URL("https://test/api/surat/inbox?limit=2"));
    expect(calls).toEqual(["get_compact_inbox", "get_compact_inbox_count"]);
    expect(res.total).toBe(15);
    expect(res.hasMore).toBe(true);
    expect(res.pageSize).toBe(2);
    expect(res.items.length).toBe(2);
    expect(res.items[0].id).toBe(uuid1);
    expect(res.items[1].id).toBe(uuid2);
    expect(res.nextCursor).toBe(encodeInboxCursor({ available_at: "2026-09-08T00:00:00.000Z", task_type: "approval", id: uuid2 }));

    calls.length = 0;

    const cursorStr = encodeInboxCursor({ available_at: "2026-09-08T00:00:00.000Z", task_type: "approval", id: uuid2 });
    res = await runtime.getInboxCompact("token", new URL(`https://test/api/surat/inbox?limit=2&cursor=${encodeURIComponent(cursorStr)}`));
    expect(calls).toEqual(["get_compact_inbox"]);
    expect(res.total).toBeNull();
    expect(res.hasMore).toBe(true);
    expect(res.items.length).toBe(2);
  });

  it("list RPC error and count RPC error forwarded unmodified", async () => {
    const listError = new Error("List Error");
    const countError = new Error("Count Error");

    const runtimeListErr = createInboxRuntime({
      getSupabase: () => createFakeInboxSupabase({
        rpc: async (name: string) => name === "get_compact_inbox" ? { data: null, error: listError } as never : { data: 0, error: null } as never
      }),
      requireSupabaseUser: user
    });
    await expect(runtimeListErr.getInboxCompact("token", new URL("https://test/api/surat/inbox"))).rejects.toBe(listError);

    const runtimeCountErr = createInboxRuntime({
      getSupabase: () => createFakeInboxSupabase({
        rpc: async (name: string) => name === "get_compact_inbox_count" ? { data: null, error: countError } as never : { data: [], error: null } as never
      }),
      requireSupabaseUser: user
    });
    await expect(runtimeCountErr.getInboxCompact("token", new URL("https://test/api/surat/inbox"))).rejects.toBe(countError);
  });

  it("detail UUID invalid stops before Supabase", async () => {
    let calls = 0;
    const runtime = createInboxRuntime({
      getSupabase: () => {
        calls++;
        return createFakeInboxSupabase();
      },
      requireSupabaseUser: user
    });
    await expect(runtime.getInboxDetail("token", "bad-uuid")).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(0);
  });

  it("inactive = 403, missing = 404", async () => {
    const inactive = createInboxRuntime({
      getSupabase: () => createFakeInboxSupabase({
        rpc: async () => ({ data: false, error: null } as never)
      }),
      requireSupabaseUser: user
    });
    await expect(inactive.getInboxDetail("token", uuid)).rejects.toMatchObject({ status: 403 });

    const missing = createInboxRuntime({
      getSupabase: () => createFakeInboxSupabase({
        rpc: async () => ({ data: true, error: null } as never),
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null } as never) }) }) })
      }),
      requireSupabaseUser: user
    });
    await expect(missing.getInboxDetail("token", uuid)).rejects.toMatchObject({ status: 404 });
  });

  it("signatures sorted by step_order; signer wins if both signer and verifier; verifier-only yields verification; neither yields null", async () => {
    const createActiveRuntime = (data: unknown) => createInboxRuntime({
      getSupabase: () => createFakeInboxSupabase({
        rpc: async () => ({ data: true, error: null } as never),
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null } as never) }) }) })
      }),
      requireSupabaseUser: user
    });

    // Signer wins
    const detailSigner = {
      user_id: "user-1",
      verification_required: true,
      verification_status: "pending",
      verifier_snapshot: [{ user_id: "user-1" }],
      surat_registrasi: { surat_signatures: [{ step_order: 3 }, { step_order: 1 }, { step_order: 2 }] }
    };
    const resSigner = await createActiveRuntime(detailSigner).getInboxDetail("token", uuid);
    expect(resSigner.task_type).toBe("approval");
    expect(resSigner.surat_registrasi.surat_signatures.map((s: { step_order: number }) => s.step_order)).toEqual([1, 2, 3]);

    // Verifier-only
    const detailVerifier = {
      user_id: "user-2",
      verification_required: true,
      verification_status: "pending",
      verifier_snapshot: [{ user_id: "user-1" }],
      surat_registrasi: { surat_signatures: [] }
    };
    const resVerifier = await createActiveRuntime(detailVerifier).getInboxDetail("token", uuid);
    expect(resVerifier.task_type).toBe("verification");

    // Neither
    const detailNeither = {
      user_id: "user-2",
      verification_required: true,
      verification_status: "pending",
      verifier_snapshot: [{ user_id: "user-3" }],
      surat_registrasi: { surat_signatures: [] }
    };
    const resNeither = await createActiveRuntime(detailNeither).getInboxDetail("token", uuid);
    expect(resNeither.task_type).toBe(null);
  });

  it("fails closed before Supabase calls when authentication fails", async () => {
    let calls = 0;
    const runtime = createInboxRuntime({
      getSupabase: () => {
        calls += 1;
        return createFakeInboxSupabase();
      },
      requireSupabaseUser: async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); },
    });
    await expect(runtime.getInboxCompact(undefined, new URL("https://test/api/surat/inbox"))).rejects.toMatchObject({ status: 401 });
    await expect(runtime.getInboxDetail(undefined, uuid)).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(0);
  });
});

describe("backend attention runtime", () => {
  it("Error get_attention_state_for_user diteruskan dengan identitas object sama", async () => {
    const expectedError = new Error("RPC Failure 1");
    const runtime = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return { data: null, error: expectedError } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user
    });
    await expect(runtime.getAttentionStateFromRequest("token")).rejects.toBe(expectedError);
  });

  it("Error get_compact_inbox_count diteruskan dengan identitas object sama", async () => {
    const expectedError = new Error("RPC Failure 2");
    const runtime = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return { data: {}, error: null } as never;
          if (name === "get_compact_inbox_count") return { data: null, error: expectedError } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user
    });
    await expect(runtime.getAttentionStateFromRequest("token")).rejects.toBe(expectedError);
  });

  it("Error get_user_active_sla_breach_count diteruskan dengan identitas object sama", async () => {
    const expectedError = new Error("RPC Failure 3");
    const runtime = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return { data: {}, error: null } as never;
          if (name === "get_compact_inbox_count") return { data: 0, error: null } as never;
          if (name === "get_user_active_sla_breach_count") return { data: null, error: expectedError } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user
    });
    await expect(runtime.getAttentionStateFromRequest("token")).rejects.toBe(expectedError);
  });

  it("getAttentionStateForUser('') menghasilkan status 401 dan tidak memanggil RPC", async () => {
    let calls = 0;
    const runtime = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async () => {
          calls++;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user
    });
    await expect(runtime.getAttentionStateForUser("")).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(0);
  });

  it("Late binding Attention", async () => {
    let calls = 0;
    let currentClient = createFakeAttentionSupabase({
      rpc: async () => { throw new Error("Stale client"); }
    });
    const freshClient = createFakeAttentionSupabase({
      rpc: async () => {
        calls++;
        return { data: null, error: null } as never;
      }
    });

    const runtime = createAttentionRuntime({
      getSupabase: () => currentClient,
      requireSupabaseUser: user
    });

    currentClient = freshClient;
    await runtime.getAttentionStateFromRequest("token");
    expect(calls).toBe(3);
  });

  it("Normalisasi seluruh output count", async () => {
    const runtime = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return {
            data: {
              approval_count: "1",
              verification_count: "2",
              revision_count: "3",
              recommendation_count: "4",
              unread_notifications: "6",
              monitoring_count: "7",
              follow_up_count: "8",
              master_office_review_count: "9",
              profile_review_count: "10",
              master_project_review_count: "11"
            },
            error: null
          } as never;
          if (name === "get_compact_inbox_count") return { data: "5", error: null } as never;
          if (name === "get_user_active_sla_breach_count") return { data: "12", error: null } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user,
      now: () => new Date("2026-09-08T12:00:00.000Z")
    });

    const result = await runtime.getAttentionStateFromRequest("token");
    expect(result).toEqual({
      approvalCount: 1,
      verificationCount: 2,
      revisionCount: 3,
      recommendationCount: 4,
      inboxCount: 5,
      unreadNotifications: 6,
      monitoringCount: 7,
      followUpCount: 8,
      masterOfficeReviewCount: 9,
      profileReviewCount: 10,
      masterProjectReviewCount: 11,
      overdueSlaCount: 12,
      generatedAt: "2026-09-08T12:00:00.000Z"
    });
  });

  it("Bentuk row object dan array menghasilkan object output identik", async () => {
    const dataRow = {
      approval_count: "2",
      follow_up_count: "3"
    };

    const runtimeArray = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return { data: [dataRow], error: null } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user,
      now: () => new Date("2026-09-08T12:00:00.000Z")
    });

    const runtimeObject = createAttentionRuntime({
      getSupabase: () => createFakeAttentionSupabase({
        rpc: async (name: string) => {
          if (name === "get_attention_state_for_user") return { data: dataRow, error: null } as never;
          return { data: null, error: null } as never;
        }
      }),
      requireSupabaseUser: user,
      now: () => new Date("2026-09-08T12:00:00.000Z")
    });

    const resArray = await runtimeArray.getAttentionStateFromRequest("token");
    const resObject = await runtimeObject.getAttentionStateFromRequest("token");
    expect(resArray).toEqual(resObject);
  });

  it("Supabase null follows existing error", async () => {
    const runtimeNull = createAttentionRuntime({
      getSupabase: () => null,
      requireSupabaseUser: user
    });
    await expect(runtimeNull.getAttentionStateFromRequest("token")).rejects.toThrow("Supabase server credentials are not configured.");
  });

  it("fails closed before attention RPCs when authentication fails", async () => {
    let calls = 0;
    const runtime = createAttentionRuntime({
      getSupabase: () => {
        calls += 1;
        return createFakeAttentionSupabase();
      },
      requireSupabaseUser: async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); },
    });
    await expect(runtime.getAttentionStateFromRequest(undefined)).rejects.toMatchObject({ status: 401 });
    expect(calls).toBe(0);
  });
});
