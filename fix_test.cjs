const fs = require('fs');

let testCode = fs.readFileSync('src/test/backend-inbox-attention-runtime.test.ts', 'utf8');

// Fix the getAttentionStateForUser("") test
testCode = testCode.replace(
  `  it("getAttentionStateForUser('') menghasilkan status 401 dan tidak memanggil RPC", async () => {
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
  });`,
  `  it("getAttentionStateForUser('') menghasilkan status 401 dan tidak memanggil RPC", async () => {
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
  });`
);

fs.writeFileSync('src/test/backend-inbox-attention-runtime.test.ts', testCode);
