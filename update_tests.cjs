const fs = require('fs');

const testCode = `describe("backend attention runtime", () => {
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
      getSupabase: () => {
        calls++;
        return createFakeAttentionSupabase();
      },
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
});`;

let file = fs.readFileSync('src/test/backend-inbox-attention-runtime.test.ts', 'utf8');
file = file.replace(/describe\("backend attention runtime", \(\) => \{[\s\S]*\}\);/, testCode);
fs.writeFileSync('src/test/backend-inbox-attention-runtime.test.ts', file);
