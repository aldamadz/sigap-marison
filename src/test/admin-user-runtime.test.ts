import { describe, expect, it, vi } from "vitest";
import {
  createAdminUserRuntime,
  validateUserInput,
  assertOrganizationPairing,
  type AdminUserAuthAdminPort,
  type AdminUserProfileRepositoryPort,
  type AdminUserDependencies,
  type AdminUserProfileRow,
  type AdminUserDepartmentRow,
  type AdminUserOfficeRow,
} from "../../backend/src/modules/admin-user/admin-user-runtime.js";

const ACTOR_ID = "11111111-1111-1111-8111-111111111111";
const NEW_USER_ID = "22222222-2222-2222-8222-222222222222";
const EXISTING_USER_ID = "33333333-3333-3333-8333-333333333333";
const DEPARTMENT_ID = "44444444-4444-4444-8444-444444444444";
const OFFICE_ID = "55555555-5555-5555-8555-555555555555";
const PARENT_ID = "66666666-6666-6666-8666-666666666666";
const BOOTSTRAP_PASSWORD = "staging-bootstrap-password";

const profile = (overrides: Partial<AdminUserProfileRow> = {}): AdminUserProfileRow => ({
  id: NEW_USER_ID,
  email: "new.user@example.com",
  full_name: "New User",
  nik: "NIK-001",
  job_title: "Staff",
  role: "user",
  is_active: true,
  department_id: null,
  office_id: null,
  parent_id: null,
  phone: null,
  join_date: null,
  resign_date: null,
  deleted_at: null,
  updated_at: null,
  ...overrides,
});

const department = (overrides: Partial<AdminUserDepartmentRow> = {}): AdminUserDepartmentRow => ({
  id: DEPARTMENT_ID,
  name: "Marketing",
  is_active: true,
  ...overrides,
});

const office = (overrides: Partial<AdminUserOfficeRow> = {}): AdminUserOfficeRow => ({
  id: OFFICE_ID,
  name: "Kantor Pusat",
  kedudukan: "Pusat",
  is_active: true,
  ...overrides,
});

type FakeState = {
  authUsers: Map<string, { email: string; password?: string; banned?: string }>;
  profiles: AdminUserProfileRow[];
  audit: Array<{ actorId: string; action: string; recordId: string }>;
  revokedUsers: Set<string>;
};

const createFakePorts = (state: FakeState) => {
  const authAdmin: AdminUserAuthAdminPort = {
    createUser: async (input) => {
      const existing = [...state.authUsers.values()].find((user) => user.email === input.email);
      if (existing) {
        return { data: null, error: { message: "User already registered", code: "user_already_exists" } };
      }
      state.authUsers.set(NEW_USER_ID, { email: input.email, password: input.password });
      return { data: { user: { id: NEW_USER_ID } }, error: null };
    },
    updateUserById: async (uid, input) => {
      const user = state.authUsers.get(uid);
      if (!user) return { data: null, error: { message: "User not found", code: "user_not_found" } };
      if (input.email) user.email = input.email;
      if (input.password) user.password = input.password;
      if (input.ban_duration !== undefined) user.banned = input.ban_duration;
      return { data: { user: { id: uid } }, error: null };
    },
    deleteUser: async (uid) => {
      state.authUsers.delete(uid);
      return { data: { user: { id: uid } }, error: null };
    },
    revokeSessions: async (userId) => {
      state.revokedUsers.add(userId);
      return { revoked: true, error: null };
    },
    inviteUserByEmail: async (email) => {
      const existing = [...state.authUsers.values()].find((user) => user.email === email);
      if (existing) {
        return { data: null, error: { message: "User already registered", code: "user_already_exists" } };
      }
      state.authUsers.set(NEW_USER_ID, { email, password: "invited" });
      return { data: { user: { id: NEW_USER_ID } }, error: null };
    },
    resetPasswordForEmail: async (email) => {
      const existing = [...state.authUsers.values()].find((user) => user.email === email);
      if (!existing) return { error: { message: "Not found" } };
      return { error: null };
    },
  };

  const repository: AdminUserProfileRepositoryPort = {
    findProfileById: async (id) => state.profiles.find((row) => row.id === id) ?? null,
    findProfileByEmail: async (email) =>
      state.profiles.find((row) => row.email?.toLowerCase() === email.toLowerCase()) ?? null,
    findProfileByNik: async (nik) => state.profiles.find((row) => row.nik === nik) ?? null,
    findDepartmentById: async (id) => (id === DEPARTMENT_ID ? department() : null),
    findOfficeById: async (id) => (id === OFFICE_ID ? office() : null),
    upsertProfile: async (row) => {
      const existing = state.profiles.find((item) => item.id === row.id);
      const merged = { ...existing, ...row } as AdminUserProfileRow;
      if (existing) state.profiles[state.profiles.indexOf(existing)] = merged;
      else state.profiles.push(merged);
      return merged;
    },
    updateProfile: async (id, patch) => {
      const existing = state.profiles.find((item) => item.id === id);
      if (!existing) return null;
      const merged = { ...existing, ...patch } as AdminUserProfileRow;
      state.profiles[state.profiles.indexOf(existing)] = merged;
      return merged;
    },
    countActiveAdmins: async (excludeId) =>
      state.profiles.filter((row) => row.role === "admin" && row.is_active !== false && row.id !== excludeId).length,
    listActiveNonAdminsWithNikNotIn: async (activeNiks) =>
      state.profiles.filter(
        (row) =>
          row.is_active !== false &&
          row.role !== "admin" &&
          !row.deleted_at &&
          row.nik !== null &&
          !activeNiks.includes(row.nik),
      ),
    deactivateProfiles: async (ids) => {
      let count = 0;
      for (const row of state.profiles) {
        if (ids.includes(row.id) && row.is_active !== false) {
          row.is_active = false;
          count += 1;
        }
      }
      return count;
    },
    recordAudit: async (entry) => {
      state.audit.push({ actorId: entry.actorId, action: entry.action, recordId: entry.recordId });
    },
  };

  return { authAdmin, repository };
};

const createRuntime = (
  overrides: Partial<AdminUserDependencies> = {},
  stateOverrides: Partial<FakeState> = {},
) => {
  const state: FakeState = {
    authUsers: new Map(),
    profiles: [],
    audit: [],
    revokedUsers: new Set(),
    ...stateOverrides,
  };
  const ports = createFakePorts(state);
  const runtime = createAdminUserRuntime({
    getAuthAdmin: () => ports.authAdmin,
    getProfileRepository: () => ports.repository,
    getBootstrapPassword: () => BOOTSTRAP_PASSWORD,
    getAppPublicUrl: () => "https://app.sigap.com",
    deploymentEnvironment: "staging",
    getBearerToken: () => "token",
    requireAdminUser: async () => ({ id: ACTOR_ID }),
    assertSameOrigin: () => undefined,
    readJsonBody: async () => ({}),
    ...overrides,
  });
  return { runtime, state, ports };
};

const validPayload = {
  email: "New.User@Example.com",
  full_name: "New User",
  nik: "NIK-001",
  role: "user",
  job_title: "Staff",
  phone: "081234567890",
  join_date: "2026-01-01",
  resign_date: null,
  department_id: DEPARTMENT_ID,
  office_id: OFFICE_ID,
  parent_id: PARENT_ID,
};

describe("admin-user validation", () => {
  it("preserves the configured supervisor for Kost instead of applying BM rules", async () => {
    const { runtime, ports } = createRuntime({ readJsonBody: async () => validPayload }, {
      profiles: [profile({ id: PARENT_ID, email: "kost.supervisor@example.test", nik: "KOST-SPV" })],
    });
    vi.spyOn(ports.repository, "findOfficeById").mockResolvedValue(office({ kedudukan: "Kost" }));
    const write = vi.spyOn(ports.repository, "upsertProfile");
    await runtime.createUser({});
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ parent_id: PARENT_ID }));
  });

  it("ignores a stale inactive parent when transferring a branch employee", async () => {
    const { runtime, ports } = createRuntime({
      readJsonBody: async () => ({ ...validPayload, parent_id: PARENT_ID }),
    }, { profiles: [profile({ id: PARENT_ID, is_active: false, email: "old.bm@example.test", nik: "BM-001" })] });
    vi.spyOn(ports.repository, "findDepartmentById").mockResolvedValue(department({ name: "Marketing (Cabang)" }));
    vi.spyOn(ports.repository, "findOfficeById").mockResolvedValue(office({ kedudukan: "KC" }));
    const write = vi.spyOn(ports.repository, "upsertProfile");
    await runtime.createUser({});
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ parent_id: null, office_id: OFFICE_ID }));
  });

  it("normalizes email to lowercase and trims fields", () => {
    const result = validateUserInput(validPayload);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.email).toBe("new.user@example.com");
    expect(result.value.full_name).toBe("New User");
    expect(result.value.nik).toBe("NIK-001");
  });

  it("rejects missing email, full_name, and NIK", () => {
    expect(validateUserInput({ ...validPayload, email: "not-an-email" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, email: "" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, full_name: "" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, nik: "" }).valid).toBe(false);
  });

  it("rejects roles outside user/admin", () => {
    expect(validateUserInput({ ...validPayload, role: "superadmin" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, role: undefined }).valid).toBe(true);
  });

  it("rejects resign_date before join_date", () => {
    const result = validateUserInput({ ...validPayload, join_date: "2026-05-01", resign_date: "2026-01-01" });
    expect(result.valid).toBe(false);
  });

  it("rejects malformed UUIDs for organization references", () => {
    expect(validateUserInput({ ...validPayload, department_id: "not-a-uuid" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, parent_id: "nope" }).valid).toBe(false);
    expect(validateUserInput({ ...validPayload, office_id: "none" }).valid).toBe(true);
  });

  it("enforces Pusat/Cabang department pairing", () => {
    expect(() => assertOrganizationPairing(department(), office({ kedudukan: "KC" }))).toThrow();
    expect(() =>
      assertOrganizationPairing(department({ name: "Marketing (Cabang)" }), office({ kedudukan: "Pusat" })),
    ).toThrow();
    expect(() => assertOrganizationPairing(department(), office({ kedudukan: "Pusat" }))).not.toThrow();
  });
});

describe("admin-user runtime authorization", () => {
  it("returns 401 without a session", async () => {
    const { runtime } = createRuntime({
      requireAdminUser: async () => {
        const error = new Error("Unauthorized") as Error & { status: number };
        error.status = 401;
        throw error;
      },
    });
    await expect(runtime.createUser({})).rejects.toMatchObject({ status: 401 });
  });

  it("returns 403 for non-admin users", async () => {
    const { runtime } = createRuntime({
      requireAdminUser: async () => {
        const error = new Error("Forbidden") as Error & { status: number };
        error.status = 403;
        throw error;
      },
    });
    await expect(runtime.createUser({})).rejects.toMatchObject({ status: 403 });
    await expect(runtime.updateUser({}, NEW_USER_ID)).rejects.toMatchObject({ status: 403 });
    await expect(runtime.resetUserPassword({}, NEW_USER_ID)).rejects.toMatchObject({ status: 403 });
    await expect(runtime.updateUserStatus({}, NEW_USER_ID)).rejects.toMatchObject({ status: 403 });
    await expect(runtime.syncActiveImport({})).rejects.toMatchObject({ status: 403 });
  });
});

describe("admin-user createUser", () => {
  it("creates an Auth user and a complete profile", async () => {
    const readPayload = validPayload;
    const { runtime, state, ports } = createRuntime({
      readJsonBody: async () => readPayload,
    });
    vi.spyOn(ports.repository, "findProfileById").mockImplementation(async (id) =>
      id === PARENT_ID ? profile({ id: PARENT_ID, full_name: "Parent" }) : null,
    );

    const result = await runtime.createUser({});

    expect(state.authUsers.size).toBe(1);
    const authUser = state.authUsers.get(NEW_USER_ID);
    expect(authUser?.email).toBe("new.user@example.com");
    expect(authUser?.password).toBe(BOOTSTRAP_PASSWORD);

    const created = state.profiles.find((row) => row.id === NEW_USER_ID);
    expect(created?.nik).toBe("NIK-001");
    expect(created?.job_title).toBe("Staff");
    expect(created?.phone).toBe("081234567890");
    expect(created?.join_date).toBe("2026-01-01");
    expect(created?.department_id).toBe(DEPARTMENT_ID);
    expect(created?.office_id).toBe(OFFICE_ID);
    expect(created?.parent_id).toBe(PARENT_ID);
    expect(created?.is_active).toBe(true);

    expect(state.audit).toEqual([{ actorId: ACTOR_ID, action: "INSERT", recordId: NEW_USER_ID }]);
    expect(result.user.id).toBe(NEW_USER_ID);
  });

  it("never returns the bootstrap password in the response", async () => {
    const { runtime, ports } = createRuntime({ readJsonBody: async () => validPayload });
    vi.spyOn(ports.repository, "findProfileById").mockImplementation(async (id) =>
      id === PARENT_ID ? profile({ id: PARENT_ID, full_name: "Parent" }) : null,
    );
    const result = await runtime.createUser({});
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(BOOTSTRAP_PASSWORD);
    expect(serialized).not.toContain("password");
    expect(result.user).not.toHaveProperty("nik");
  });

  it("returns 409 on duplicate email without creating an Auth user", async () => {
    const { runtime, state } = createRuntime(
      {
        readJsonBody: async () => validPayload,
        getBootstrapPassword: () => BOOTSTRAP_PASSWORD,
      },
      { profiles: [profile({ id: EXISTING_USER_ID, email: "new.user@example.com" })] },
    );
    await expect(runtime.createUser({})).rejects.toMatchObject({ status: 409 });
    expect(state.authUsers.size).toBe(0);
  });

  it("returns 409 on duplicate NIK without creating an Auth user", async () => {
    const { runtime, state } = createRuntime(
      { readJsonBody: async () => validPayload },
      { profiles: [profile({ id: EXISTING_USER_ID, nik: "NIK-001", email: "other@example.com" })] },
    );
    await expect(runtime.createUser({})).rejects.toMatchObject({ status: 409 });
    expect(state.authUsers.size).toBe(0);
  });

  it("returns 400 for invalid department, office, or parent", async () => {
    const base = { readJsonBody: async () => validPayload };
    const withParent = createRuntime(base);
    vi.spyOn(withParent.ports.repository, "findDepartmentById").mockResolvedValue(null);
    await expect(withParent.runtime.createUser({})).rejects.toMatchObject({ status: 400 });

    const withOffice = createRuntime(base);
    vi.spyOn(withOffice.ports.repository, "findOfficeById").mockResolvedValue(null);
    await expect(withOffice.runtime.createUser({})).rejects.toMatchObject({ status: 400 });

    const withInactiveParent = createRuntime(base);
    vi.spyOn(withInactiveParent.ports.repository, "findProfileById").mockResolvedValue(
      profile({ id: PARENT_ID, is_active: false }),
    );
    await expect(withInactiveParent.runtime.createUser({})).rejects.toMatchObject({ status: 400 });
  });

  it("uses an invite email in production with the correct redirectTo", async () => {
    const { runtime, ports, state } = createRuntime({
      readJsonBody: async () => validPayload,
      deploymentEnvironment: "production",
      getAppPublicUrl: () => "https://app.sigap.com",
    });
    vi.spyOn(ports.repository, "findProfileById").mockImplementation(async (id) =>
      id === PARENT_ID ? profile({ id: PARENT_ID, full_name: "Parent" }) : null,
    );
    vi.spyOn(ports.authAdmin, "inviteUserByEmail");
    vi.spyOn(ports.authAdmin, "createUser");

    const result = await runtime.createUser({});

    expect(ports.authAdmin.inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(ports.authAdmin.inviteUserByEmail).toHaveBeenCalledWith("new.user@example.com", expect.objectContaining({
      redirectTo: "https://app.sigap.com/reset-password",
    }));
    expect(ports.authAdmin.createUser).toHaveBeenCalledTimes(0);
    expect(state.authUsers.get(NEW_USER_ID)?.password).toBe("invited");
    expect(result.user.id).toBe(NEW_USER_ID);
  });

  it("fails closed in production if APP_PUBLIC_URL is missing, invalid, http, or contains credentials", async () => {
    const payloads = [
      { url: null, expectError: "belum dikonfigurasi" },
      { url: "not-a-url", expectError: "tidak valid" },
      { url: "http://app.sigap.com", expectError: "HTTPS" },
      { url: "https://user:pass@app.sigap.com", expectError: "kredensial" },
    ];
    for (const { url, expectError } of payloads) {
      const { runtime } = createRuntime({
        readJsonBody: async () => ({ ...validPayload, parent_id: null }),
        deploymentEnvironment: "production",
        getAppPublicUrl: () => url,
      });
      await expect(runtime.createUser({})).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining(expectError),
      });
    }
  });

  it("succeeds with a warning if the audit log fails", async () => {
    const { runtime, ports } = createRuntime({ readJsonBody: async () => validPayload });
    vi.spyOn(ports.repository, "findProfileById").mockImplementation(async (id) =>
      id === PARENT_ID ? profile({ id: PARENT_ID, full_name: "Parent" }) : null,
    );
    vi.spyOn(ports.repository, "recordAudit").mockRejectedValue(new Error("DB error"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runtime.createUser({});
    expect(result.user.id).toBe(NEW_USER_ID);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("audit log failure"), expect.any(String));
  });

  it("deletes the Auth user when profile completion fails", async () => {
    const { runtime, ports } = createRuntime({ readJsonBody: async () => validPayload });
    vi.spyOn(ports.repository, "findProfileById").mockImplementation(async (id) =>
      id === PARENT_ID ? profile({ id: PARENT_ID, full_name: "Parent" }) : null,
    );
    vi.spyOn(ports.repository, "recordAudit").mockRejectedValue(new Error("DB error"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runtime.createUser({});
    expect(result.user.id).toBe(NEW_USER_ID);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("audit log failure"), expect.any(String));
  });

  it("deletes the Auth user when profile completion fails", async () => {
    const { runtime, state, ports } = createRuntime({ readJsonBody: async () => validPayload });
    vi.spyOn(ports.repository, "findProfileById").mockResolvedValue(profile({ id: PARENT_ID }));
    vi.spyOn(ports.repository, "upsertProfile").mockRejectedValue(new Error("profile write failed"));
    vi.spyOn(ports.authAdmin, "deleteUser");

    await expect(runtime.createUser({})).rejects.toMatchObject({ status: 500 });
    expect(ports.authAdmin.deleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    expect(state.authUsers.size).toBe(0);
  });

  it("fails closed in production if APP_PUBLIC_URL is missing, invalid, http, or contains credentials", async () => {
    const payloads = [
      { url: null, expectError: "belum dikonfigurasi" },
      { url: "not-a-url", expectError: "tidak valid" },
      { url: "http://app.sigap.com", expectError: "HTTPS" },
      { url: "https://user:pass@app.sigap.com", expectError: "kredensial" },
    ];
    for (const { url, expectError } of payloads) {
      const { runtime } = createRuntime(
        { deploymentEnvironment: "production", getAppPublicUrl: () => url },
        { profiles: [profile()] },
      );
      await expect(runtime.resetUserPassword({}, NEW_USER_ID)).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining(expectError),
      });
    }
  });

  it("fails closed when the staging bootstrap password is missing or weak in staging", async () => {
    const missing = createRuntime({ readJsonBody: async () => validPayload, getBootstrapPassword: () => null });
    await expect(missing.runtime.createUser({})).rejects.toMatchObject({ status: 503 });
    expect(missing.state.authUsers.size).toBe(0);

    const weak = createRuntime({ readJsonBody: async () => validPayload, getBootstrapPassword: () => "short" });
    await expect(weak.runtime.createUser({})).rejects.toMatchObject({ status: 503 });
  });
  it("rolls back Auth email and metadata when the profile update fails", async () => {
    const { runtime, ports, state } = createRuntime(
      { readJsonBody: async () => ({ ...validPayload, parent_id: null, email: "new.updated@example.com" }) },
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com", password: "pwd" }]]) }
    );
    vi.spyOn(ports.repository, "updateProfile").mockRejectedValue(new Error("profile write failed"));
    vi.spyOn(ports.authAdmin, "updateUserById");

    await expect(runtime.updateUser({}, NEW_USER_ID)).rejects.toMatchObject({
      status: 500,
      message: "Gagal memperbarui profil; identitas Auth telah dikembalikan.",
    });

    expect(ports.authAdmin.updateUserById).toHaveBeenCalledTimes(2);
    const rollbackCall = vi.mocked(ports.authAdmin.updateUserById).mock.calls[1];
    expect(rollbackCall[0]).toBe(NEW_USER_ID);
    expect(rollbackCall[1].email).toBe("new.user@example.com");
    expect(rollbackCall[1].user_metadata?.full_name).toBe("New User");
    expect(state.authUsers.get(NEW_USER_ID)?.email).toBe("new.user@example.com");
  });

  it("returns a partial-failure error if Auth rollback also fails", async () => {
    const { runtime, ports, state } = createRuntime(
      { readJsonBody: async () => ({ ...validPayload, parent_id: null, email: "new.updated@example.com" }) },
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com", password: "pwd" }]]) }
    );
    vi.spyOn(ports.repository, "updateProfile").mockRejectedValue(new Error("profile write failed"));
    vi.spyOn(ports.authAdmin, "updateUserById").mockImplementationOnce(async (uid, input) => {
      const user = state.authUsers.get(uid);
      if (user && input.email) user.email = input.email;
      return { data: { user: { id: uid } }, error: null };
    }).mockImplementationOnce(async () => {
      return { data: null, error: { message: "Network error" } };
    });

    await expect(runtime.updateUser({}, NEW_USER_ID)).rejects.toMatchObject({
      status: 500,
      message: expect.stringContaining("identitas login tidak dapat dikembalikan"),
    });

    expect(ports.authAdmin.updateUserById).toHaveBeenCalledTimes(2);
    expect(state.authUsers.get(NEW_USER_ID)?.email).toBe("new.updated@example.com"); // Remains changed!
  });
});

describe("admin-user resetPassword", () => {
  it("resets the password, revokes sessions, and never returns the password", async () => {
    const { runtime, state } = createRuntime(
      {},
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com" }]]) },
    );
    const result = await runtime.resetUserPassword({}, NEW_USER_ID);
    expect(state.authUsers.get(NEW_USER_ID)?.password).toBe(BOOTSTRAP_PASSWORD);
    expect(state.revokedUsers.has(NEW_USER_ID)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(BOOTSTRAP_PASSWORD);
  });

  it("returns 404 for an unknown target", async () => {
    const { runtime } = createRuntime();
    await expect(runtime.resetUserPassword({}, NEW_USER_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("sends a recovery email in production with the correct redirectTo", async () => {
    const { runtime, ports } = createRuntime(
      { deploymentEnvironment: "production", getAppPublicUrl: () => "https://app.sigap.com" },
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com" }]]) },
    );
    vi.spyOn(ports.authAdmin, "resetPasswordForEmail");
    vi.spyOn(ports.authAdmin, "updateUserById");

    const result = await runtime.resetUserPassword({}, NEW_USER_ID);

    expect(ports.authAdmin.resetPasswordForEmail).toHaveBeenCalledWith("new.user@example.com", {
      redirectTo: "https://app.sigap.com/reset-password",
    });
    expect(ports.authAdmin.updateUserById).toHaveBeenCalledTimes(0);
    expect(result.recoveryEmailSent).toBe(true);
    expect(result.sessionsRevoked).toBe(true);
  });
});

describe("admin-user updateUserStatus", () => {
  const statusPayload = { readJsonBody: async () => ({ is_active: false }) };

  it("syncs Auth ban duration and profiles.is_active", async () => {
    const { runtime, state } = createRuntime(
      statusPayload,
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com" }]]) },
    );
    const result = await runtime.updateUserStatus({}, NEW_USER_ID);
    expect(state.authUsers.get(NEW_USER_ID)?.banned).not.toBe("none");
    expect(state.profiles[0].is_active).toBe(false);
    expect(result.user.is_active).toBe(false);
  });

  it("forbids an admin from deactivating themselves", async () => {
    const { runtime } = createRuntime(statusPayload, { profiles: [profile({ id: ACTOR_ID, role: "admin" })] });
    await expect(runtime.updateUserStatus({}, ACTOR_ID)).rejects.toMatchObject({ status: 403 });
  });

  it("forbids deactivating the last active admin", async () => {
    const { runtime } = createRuntime(
      statusPayload,
      { profiles: [profile({ id: EXISTING_USER_ID, role: "admin" })] },
    );
    await expect(runtime.updateUserStatus({}, EXISTING_USER_ID)).rejects.toMatchObject({ status: 409 });
  });

  it("rolls back the Auth ban when the profile write fails", async () => {
    const { runtime, state, ports } = createRuntime(
      statusPayload,
      { profiles: [profile()], authUsers: new Map([[NEW_USER_ID, { email: "new.user@example.com" }]]) },
    );
    vi.spyOn(ports.repository, "updateProfile").mockRejectedValue(new Error("write failed"));
    vi.spyOn(ports.authAdmin, "updateUserById");

    await expect(runtime.updateUserStatus({}, NEW_USER_ID)).rejects.toMatchObject({
      status: 500,
    });
    const calls = vi.mocked(ports.authAdmin.updateUserById).mock.calls;
    const lastCall = calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ ban_duration: "none" });
    expect(state.profiles[0].is_active).toBe(true);
  });
});

describe("admin-user syncActiveImport", () => {
  const imported = [profile({ id: "imported-1", nik: "IMP-1" }), profile({ id: "imported-2", nik: "IMP-2" })];
  const stale = profile({ id: "stale-1", nik: "STALE-1" });
  const pending = profile({ id: "pending-1", nik: "PENDING-ABCD1234" });
  const admin = profile({ id: "admin-1", nik: "ADM-1", role: "admin" });

  it("validates every NIK before mutating", async () => {
    const { runtime } = createRuntime({ readJsonBody: async () => ({ active_niks: ["IMP-1", ""] }) });
    await expect(runtime.syncActiveImport({})).rejects.toMatchObject({ status: 400 });
  });

  it("dry run previews candidates without mutating", async () => {
    const { runtime, state } = createRuntime(
      { readJsonBody: async () => ({ active_niks: ["IMP-1", "IMP-2"], dry_run: true }) },
      { profiles: [...imported, stale, pending, admin] },
    );
    const result = await runtime.syncActiveImport({});
    expect(result.dryRun).toBe(true);
    expect(result.deactivated).toBe(0);
    expect(result.wouldDeactivate).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(["stale-1"]);
    expect(state.profiles.every((row) => row.is_active !== false)).toBe(true);
  });

  it("deactivates only in-scope candidates and is idempotent", async () => {
    const { runtime, state } = createRuntime(
      { readJsonBody: async () => ({ active_niks: ["IMP-1", "IMP-2"] }) },
      { profiles: [...imported, stale, pending, admin] },
    );
    const first = await runtime.syncActiveImport({});
    expect(first.deactivated).toBe(1);
    expect(state.profiles.find((row) => row.id === "stale-1")?.is_active).toBe(false);
    expect(state.profiles.find((row) => row.id === "pending-1")?.is_active).toBe(true);
    expect(state.profiles.find((row) => row.id === "admin-1")?.is_active).toBe(true);

    const second = await runtime.syncActiveImport({});
    expect(second.deactivated).toBe(0);
  });
});
