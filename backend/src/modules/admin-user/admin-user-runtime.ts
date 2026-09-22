import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin user management runtime.
 *
 * Root cause fixed here: the frontend used to call a Supabase Edge Function
 * named `admin-create-user` that does not exist in the staging project
 * (OPTIONS/POST returned 404 NOT_FOUND), so every admin-user mutation
 * (create, reset password, toggle active, import, sync active import) was
 * dead. Those operations now run server-side through the SIGAP backend,
 * which already holds the service-role key. The frontend never receives or
 * sends a service-role key, and no password is ever returned or logged.
 *
 * Auth Admin + profile repository are injected ports so tests never touch a
 * real Supabase project.
 */

export type AdminUserRole = "user" | "admin";

export type AdminUserDeploymentEnvironment = "staging" | "production";

/** Safe subset returned by every endpoint. Never contains NIK/password/contact. */
export type AdminUserPublicRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AdminUserRole | null;
  is_active: boolean;
  department_id: string | null;
  office_id: string | null;
  parent_id: string | null;
};

export type AdminUserBootstrapPasswordSource = "staging";

export type AdminUserAuthAdminCreateInput = {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, string | null>;
};

export type AdminUserAuthAdminUpdateInput = {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  ban_duration?: string;
  user_metadata?: Record<string, string | null>;
};

export type AdminUserAuthAdminResult = {
  data: { user?: { id?: string } | null } | null;
  error: { message?: string; code?: string } | null;
};

export type AdminUserAuthAdminPort = {
  createUser(input: AdminUserAuthAdminCreateInput): Promise<AdminUserAuthAdminResult>;
  inviteUserByEmail(email: string, options?: { data?: Record<string, string | null> }): Promise<AdminUserAuthAdminResult>;
  updateUserById(uid: string, input: AdminUserAuthAdminUpdateInput): Promise<AdminUserAuthAdminResult>;
  deleteUser(uid: string): Promise<AdminUserAuthAdminResult>;
  resetPasswordForEmail(email: string): Promise<{ error: { message?: string } | null }>;
  /**
   * Revokes a target user's sessions.
   *
   * GoTrue's `/logout` endpoint requires the *target user's* JWT
   * (`requireAuthentication`), and the Auth Admin API exposes no
   * revoke-by-user-id call. An admin-initiated reset cannot mint that JWT,
   * so revocation is a best-effort port: production revokes refresh tokens
   * through the service-role client and reports what happened. The password
   * reset itself still succeeds when revocation is unavailable.
   */
  revokeSessions(userId: string): Promise<{ revoked: boolean; error: string | null }>;
};

export type AdminUserDepartmentRow = {
  id: string;
  name: string;
  is_active: boolean | null;
};

export type AdminUserOfficeRow = {
  id: string;
  name: string;
  kedudukan: string | null;
  is_active: boolean | null;
};

export type AdminUserProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  nik: string | null;
  job_title: string | null;
  role: AdminUserRole | null;
  is_active: boolean | null;
  department_id: string | null;
  office_id: string | null;
  parent_id: string | null;
  phone: string | null;
  join_date: string | null;
  resign_date: string | null;
  deleted_at: string | null;
  updated_at: string | null;
};

export type AdminUserProfileWriteRow = Partial<AdminUserProfileRow> & { id: string };

export type AdminUserProfileRepositoryPort = {
  findProfileById(id: string): Promise<AdminUserProfileRow | null>;
  findProfileByEmail(email: string): Promise<AdminUserProfileRow | null>;
  findProfileByNik(nik: string): Promise<AdminUserProfileRow | null>;
  findDepartmentById(id: string): Promise<AdminUserDepartmentRow | null>;
  findOfficeById(id: string): Promise<AdminUserOfficeRow | null>;
  upsertProfile(row: AdminUserProfileWriteRow): Promise<AdminUserProfileRow | null>;
  updateProfile(id: string, patch: AdminUserProfileWriteRow): Promise<AdminUserProfileRow | null>;
  countActiveAdmins(excludeId?: string): Promise<number>;
  listActiveNonAdminsWithNikNotIn(activeNiks: string[]): Promise<AdminUserProfileRow[]>;
  deactivateProfiles(ids: string[]): Promise<number>;
  recordAudit(entry: AdminUserAuditEntry): Promise<void>;
};

export type AdminUserAuditEntry = {
  actorId: string;
  action: "INSERT" | "UPDATE";
  tableName: string;
  recordId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

export type AdminUserDependencies = {
  getAuthAdmin: () => AdminUserAuthAdminPort;
  getProfileRepository: () => AdminUserProfileRepositoryPort;
  /**
   * Bootstrap password read server-side only. Returns null when unset/weak.
   * Only ever consulted for the staging environment.
   */
  getBootstrapPassword: () => string | null;
  deploymentEnvironment: string;
  getBearerToken: (req: unknown) => string;
  requireAdminUser: (token: string) => Promise<{ id: string }>;
  assertSameOrigin: (req: unknown) => void;
  readJsonBody: (req: unknown, maxBytes?: number) => Promise<unknown>;
};

const errorWithStatus = (message: string, status: number): Error =>
  Object.assign(new Error(message), { status });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** mirrors supabase-js' own "none" unban sentinel */
const AUTH_UNBAN = "none";
/** long enough to be a permanent disable for our purposes */
const AUTH_BAN_DURATION = "876000h";
const MAX_NAME_LENGTH = 200;
const MAX_NIK_LENGTH = 64;
const MAX_JOB_TITLE_LENGTH = 100;
const MAX_PHONE_LENGTH = 32;
const MAX_IMPORT_NIKS = 5000;

export const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return null;
  return trimmed;
};

export const normalizeNik = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_NIK_LENGTH) return null;
  return trimmed;
};

export const normalizeRole = (value: unknown): AdminUserRole | null => {
  if (value === "user" || value === "admin") return value;
  return null;
};

export const normalizeOptionalText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
};

/**
 * Returns the UUID when valid, null when explicitly absent (empty or "none"),
 * and `"invalid"` when a value was supplied that is not a UUID. Callers turn
 * "invalid" into a 400 so malformed references are never silently dropped.
 */
export const normalizeOptionalUuid = (value: unknown): string | null | "invalid" => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;
  if (!UUID_RE.test(trimmed)) return "invalid";
  return trimmed;
};

export const normalizeOptionalDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !DATE_RE.test(trimmed)) return null;
  if (Number.isNaN(Date.parse(trimmed))) return null;
  return trimmed;
};

const hasPendingNik = (profile: { nik?: string | null } | null): boolean =>
  typeof profile?.nik === "string" && profile.nik.startsWith("PENDING");

const publicRow = (profile: AdminUserProfileRow): AdminUserPublicRow => ({
  id: profile.id,
  email: profile.email ?? null,
  full_name: profile.full_name ?? null,
  role: profile.role ?? null,
  is_active: profile.is_active !== false,
  department_id: profile.department_id ?? null,
  office_id: profile.office_id ?? null,
  parent_id: profile.parent_id ?? null,
});

export type CreateUserInput = {
  email: string;
  full_name: string;
  nik: string;
  role: AdminUserRole;
  job_title: string | null;
  phone: string | null;
  join_date: string | null;
  resign_date: string | null;
  department_id: string | null;
  office_id: string | null;
  parent_id: string | null;
};

export type ValidateUserInputResult =
  | { valid: true; value: CreateUserInput }
  | { valid: false; error: string; status: number };

/**
 * Pure validation for the create-user contract. Reference validation
 * (department/office/parent, Pusat/Cabang pairing) is performed separately
 * because it needs the repository.
 */
export const validateUserInput = (payload: unknown): ValidateUserInputResult => {
  if (!isRecord(payload)) return { valid: false, error: "Payload tidak valid.", status: 400 };

  const email = normalizeEmail(payload.email);
  if (!email) return { valid: false, error: "Email wajib diisi dengan format yang valid.", status: 400 };

  const full_name = normalizeOptionalText(payload.full_name ?? payload.fullName, MAX_NAME_LENGTH);
  if (!full_name) return { valid: false, error: "Nama lengkap wajib diisi.", status: 400 };

  const nik = normalizeNik(payload.nik);
  if (!nik) return { valid: false, error: "NIK wajib diisi.", status: 400 };

  const rawRole = payload.role === undefined || payload.role === null ? "user" : payload.role;
  const role = normalizeRole(rawRole);
  if (!role) return { valid: false, error: "Role hanya boleh user atau admin.", status: 400 };

  const job_title = normalizeOptionalText(payload.job_title ?? payload.jobTitle, MAX_JOB_TITLE_LENGTH);
  const phone = normalizeOptionalText(payload.phone, MAX_PHONE_LENGTH);

  const join_date = normalizeOptionalDate(payload.join_date ?? payload.joinDate);
  const resign_date = normalizeOptionalDate(payload.resign_date ?? payload.resignDate);
  if (join_date && resign_date && resign_date < join_date) {
    return { valid: false, error: "Tanggal keluar tidak boleh mendahului tanggal bergabung.", status: 400 };
  }

  const department_id = normalizeOptionalUuid(payload.department_id ?? payload.departmentId);
  const office_id = normalizeOptionalUuid(payload.office_id ?? payload.officeId);
  const parent_id = normalizeOptionalUuid(payload.parent_id ?? payload.parentId);
  if (department_id === "invalid" || office_id === "invalid" || parent_id === "invalid") {
    return { valid: false, error: "ID departemen, kantor, atau atasan harus berupa UUID yang valid.", status: 400 };
  }

  return {
    valid: true,
    value: { email, full_name, nik, role, job_title, phone, join_date, resign_date, department_id, office_id, parent_id },
  };
};

const departmentIsCabang = (name: string): boolean => /\(Cabang\)/i.test(name);
const officeIsCabang = (kedudukan: string | null | undefined): boolean =>
  kedudukan === "KC" || kedudukan === "KCP";

/**
 * Mirrors the AddUserModal Pusat/Cabang rule so server and UI cannot drift:
 * a branch office must pair with a "(Cabang)" department, and a head office
 * (or no office) must pair with a non-branch department.
 */
export const assertOrganizationPairing = (
  department: AdminUserDepartmentRow | null,
  office: AdminUserOfficeRow | null,
): void => {
  if (!department || !office) return;
  if (officeIsCabang(office.kedudukan) && !departmentIsCabang(department.name)) {
    throw errorWithStatus("Kantor cabang hanya boleh memakai departemen cabang.", 400);
  }
  if (!officeIsCabang(office.kedudukan) && departmentIsCabang(department.name)) {
    throw errorWithStatus("Kantor pusat tidak boleh memakai departemen cabang.", 400);
  }
};

export function createAdminUserRuntime(deps: AdminUserDependencies) {
  const assertBootstrapPasswordAvailable = (): string | null => {
    if (deps.deploymentEnvironment !== "staging") {
      return null;
    }
    const password = deps.getBootstrapPassword();
    if (typeof password !== "string" || password.length < 8) {
      throw errorWithStatus("Password default staging belum dikonfigurasi di server.", 503);
    }
    return password;
  };

  /**
   * Resolves and validates organization references. Throws 400/404-style
   * errors with safe messages; never leaks internal ids beyond what the UI
   * already shows.
   */
  const resolveOrganization = async (input: CreateUserInput) => {
    const repository = deps.getProfileRepository();
    let department: AdminUserDepartmentRow | null = null;
    let office: AdminUserOfficeRow | null = null;

    if (input.department_id) {
      department = await repository.findDepartmentById(input.department_id);
      if (!department) throw errorWithStatus("Departemen tidak ditemukan.", 400);
      if (department.is_active === false) throw errorWithStatus("Departemen tidak aktif.", 400);
    }
    if (input.office_id) {
      office = await repository.findOfficeById(input.office_id);
      if (!office) throw errorWithStatus("Kantor tidak ditemukan.", 400);
      if (office.is_active === false) throw errorWithStatus("Kantor tidak aktif.", 400);
    }
    assertOrganizationPairing(department, office);

    if (input.parent_id) {
      const parent = await repository.findProfileById(input.parent_id);
      if (!parent || parent.deleted_at) throw errorWithStatus("Atasan langsung tidak ditemukan.", 400);
      if (parent.is_active === false) throw errorWithStatus("Atasan langsung harus akun aktif.", 400);
    }
    return { department, office };
  };

  const assertNotDuplicate = async (input: CreateUserInput, excludeId?: string) => {
    const repository = deps.getProfileRepository();
    if (excludeId) {
      const self = await repository.findProfileById(excludeId);
      if (self && input.parent_id && self.id === input.parent_id) {
        throw errorWithStatus("Atasan langsung tidak boleh akun itu sendiri.", 400);
      }
    }
    const byEmail = await repository.findProfileByEmail(input.email);
    if (byEmail && byEmail.id !== excludeId) {
      throw errorWithStatus("Email sudah terdaftar. Gunakan email lain.", 409);
    }
    const byNik = await repository.findProfileByNik(input.nik);
    if (byNik && byNik.id !== excludeId) {
      throw errorWithStatus("NIK sudah terdaftar. Gunakan NIK lain.", 409);
    }
  };

  const profileWriteRow = (authUserId: string, input: CreateUserInput): AdminUserProfileWriteRow => ({
    id: authUserId,
    email: input.email,
    full_name: input.full_name,
    nik: input.nik,
    job_title: input.job_title,
    phone: input.phone,
    role: input.role,
    department_id: input.department_id,
    office_id: input.office_id,
    parent_id: input.parent_id,
    join_date: input.join_date,
    resign_date: input.resign_date,
    is_active: true,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  });

  /**
   * POST /api/admin/users
   *
   * Atomicity: the `handle_new_user` trigger only writes a minimum profile,
   * so the server writes the full profile after Auth user creation. If that
   * write fails, the freshly created Auth user is deleted so no half-made
   * account survives. Passwords are never returned or logged.
   */
  const createUser = async (req: unknown): Promise<{ user: AdminUserPublicRow }> => {
    deps.assertSameOrigin(req);
    const actor = await deps.requireAdminUser(deps.getBearerToken(req));
    const rawPayload = await deps.readJsonBody(req, 64 * 1024);
    if (!isRecord(rawPayload)) throw errorWithStatus("Payload tidak valid.", 400);
    const payload = rawPayload as Record<string, unknown>;
    const validation = validateUserInput(payload);
    if (validation.valid === false) throw errorWithStatus(validation.error, validation.status);
    const input = validation.value;

    const password = assertBootstrapPasswordAvailable();
    await assertNotDuplicate(input);
    await resolveOrganization(input);

    const authAdmin = deps.getAuthAdmin();
    const userMetadata = {
      full_name: input.full_name,
      nik: input.nik,
      job_title: input.job_title,
      role: input.role,
      department_id: input.department_id,
      office_id: input.office_id,
      parent_id: input.parent_id,
    };

    let created: AdminUserAuthAdminResult;
    if (password) {
      created = await authAdmin.createUser({
        email: input.email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      });
    } else {
      // Production uses invite link which sends a welcome email.
      created = await authAdmin.inviteUserByEmail(input.email, { data: userMetadata });
    }

    if (created.error || !created.data?.user?.id) {
      const message = String(created.error?.message || "Gagal membuat akun Auth.");
      if (/already registered|already exists|email must be unique/i.test(message)) {
        throw errorWithStatus("Email sudah terdaftar. Gunakan email lain.", 409);
      }
      console.error("[admin-user] createUser failed:", message);
      throw errorWithStatus("Gagal membuat akun Auth.", 502);
    }
    const authUserId = created.data.user.id;

    const repository = deps.getProfileRepository();
    try {
      const profile = await repository.upsertProfile(profileWriteRow(authUserId, input));
      if (!profile) throw new Error("Profile upsert returned no row.");
      await repository.recordAudit({
        actorId: actor.id,
        action: "INSERT",
        tableName: "profiles",
        recordId: authUserId,
        oldValues: null,
        newValues: { full_name: input.full_name, role: input.role, is_active: true },
      });
      return { user: publicRow(profile) };
    } catch (error) {
      // Compensating action: remove the half-created Auth user.
      const removal = await authAdmin.deleteUser(authUserId);
      if (removal.error) console.error("[admin-user] compensating deleteUser failed:", removal.error.message);
      console.error("[admin-user] profile completion failed:", error instanceof Error ? error.message : "unknown");
      throw errorWithStatus("Gagal melengkapi profil; akun Auth telah dihapus.", 500);
    }
  };

  /**
   * PATCH /api/admin/users/:userId
   *
   * Auth identity (email/full name) and the profile are updated through the
   * service-role client. Email changes are confirmed immediately because
   * admins create accounts on behalf of users.
   */
  const updateUser = async (req: unknown, userId: string): Promise<{ user: AdminUserPublicRow }> => {
    deps.assertSameOrigin(req);
    const actor = await deps.requireAdminUser(deps.getBearerToken(req));
    if (!UUID_RE.test(userId)) throw errorWithStatus("ID user tidak valid.", 400);
    const rawPayload = await deps.readJsonBody(req, 64 * 1024);
    if (!isRecord(rawPayload)) throw errorWithStatus("Payload tidak valid.", 400);
    const payload = rawPayload as Record<string, unknown>;
    const validation = validateUserInput({ ...payload, email: payload.email, full_name: payload.full_name });
    if (validation.valid === false) throw errorWithStatus(validation.error, validation.status);
    const input = validation.value;

    const repository = deps.getProfileRepository();
    const current = await repository.findProfileById(userId);
    if (!current || current.deleted_at) throw errorWithStatus("User tidak ditemukan.", 404);

    await assertNotDuplicate(input, userId);
    await resolveOrganization(input);

    const authAdmin = deps.getAuthAdmin();
    const identityChanged = current.email !== input.email || current.full_name !== input.full_name;
    if (identityChanged) {
      const updated = await authAdmin.updateUserById(userId, {
        email: input.email,
        email_confirm: true,
        user_metadata: { full_name: input.full_name, nik: input.nik },
      });
      if (updated.error) {
        const message = String(updated.error.message || "Gagal memperbarui akun Auth.");
        if (/already registered|already exists|email must be unique/i.test(message)) {
          throw errorWithStatus("Email sudah terdaftar. Gunakan email lain.", 409);
        }
        throw errorWithStatus("Gagal memperbarui akun Auth.", 502);
      }
    }

    const profile = await repository.updateProfile(userId, profileWriteRow(userId, input));
    if (!profile) throw errorWithStatus("Gagal memperbarui profil.", 500);
    await repository.recordAudit({
      actorId: actor.id,
      action: "UPDATE",
      tableName: "profiles",
      recordId: userId,
      oldValues: { full_name: current.full_name, role: current.role, is_active: current.is_active },
      newValues: { full_name: input.full_name, role: input.role, is_active: true },
    });
    return { user: publicRow(profile) };
  };

  /**
   * POST /api/admin/users/:userId/reset-password
   *
   * The bootstrap password is read server-side only and never returned.
   * In production, sends a recovery email instead and ignores the payload.
   * Session revocation is best-effort (see AdminUserAuthAdminPort).
   */
  const resetUserPassword = async (
    req: unknown,
    userId: string,
  ): Promise<{ success: true; sessionsRevoked: boolean; recoveryEmailSent: boolean }> => {
    deps.assertSameOrigin(req);
    await deps.requireAdminUser(deps.getBearerToken(req));
    if (!UUID_RE.test(userId)) throw errorWithStatus("ID user tidak valid.", 400);

    const password = assertBootstrapPasswordAvailable();
    const repository = deps.getProfileRepository();
    const target = await repository.findProfileById(userId);
    if (!target || target.deleted_at) throw errorWithStatus("User tidak ditemukan.", 404);

    const authAdmin = deps.getAuthAdmin();
    let recoveryEmailSent = false;
    if (password) {
      const updated = await authAdmin.updateUserById(userId, { password });
      if (updated.error) {
        console.error("[admin-user] reset password failed:", updated.error.message);
        throw errorWithStatus("Gagal mereset password.", 502);
      }
    } else {
      if (!target.email) throw errorWithStatus("User tidak memiliki email.", 400);
      const reset = await authAdmin.resetPasswordForEmail(target.email);
      if (reset.error) {
        console.error("[admin-user] reset password email failed:", reset.error.message);
        throw errorWithStatus("Gagal mengirim email reset password.", 502);
      }
      recoveryEmailSent = true;
    }

    const revocation = await authAdmin.revokeSessions(userId);
    if (!revocation.revoked) {
      console.warn("[admin-user] session revocation unavailable for user:", userId);
    }
    return { success: true, sessionsRevoked: revocation.revoked, recoveryEmailSent };
  };

  /**
   * PATCH /api/admin/users/:userId/status
   *
   * Keeps profiles.is_active and the Auth ban duration in sync. If the
   * profile write fails after the Auth update, the Auth ban is rolled back
   * so the two never disagree without recovery.
   */
  const updateUserStatus = async (
    req: unknown,
    userId: string,
  ): Promise<{ user: AdminUserPublicRow }> => {
    deps.assertSameOrigin(req);
    const actor = await deps.requireAdminUser(deps.getBearerToken(req));
    if (!UUID_RE.test(userId)) throw errorWithStatus("ID user tidak valid.", 400);
    const payload = await deps.readJsonBody(req, 4096);
    if (!isRecord(payload) || typeof payload.is_active !== "boolean") {
      throw errorWithStatus("Status is_active wajib berupa boolean.", 400);
    }
    const nextActive = payload.is_active;

    const repository = deps.getProfileRepository();
    const target = await repository.findProfileById(userId);
    if (!target || target.deleted_at) throw errorWithStatus("User tidak ditemukan.", 404);

    if (!nextActive && actor.id === userId) {
      throw errorWithStatus("Admin tidak boleh menonaktifkan akun sendiri.", 403);
    }
    if (!nextActive && target.role === "admin") {
      const remaining = await repository.countActiveAdmins(userId);
      if (remaining <= 0) throw errorWithStatus("Tidak boleh menonaktifkan admin terakhir.", 409);
    }

    const authAdmin = deps.getAuthAdmin();
    const authUpdate = await authAdmin.updateUserById(userId, {
      ban_duration: nextActive ? AUTH_UNBAN : AUTH_BAN_DURATION,
    });
    if (authUpdate.error) {
      console.error("[admin-user] auth status sync failed:", authUpdate.error.message);
      throw errorWithStatus("Gagal menyinkronkan status Auth.", 502);
    }

    let profile: AdminUserProfileRow | null;
    try {
      profile = await repository.updateProfile(userId, {
        id: userId,
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      });
      if (!profile) throw new Error("Profile update returned no row.");
    } catch (error) {
      const rollback = await authAdmin.updateUserById(userId, {
        ban_duration: target.is_active === false ? AUTH_BAN_DURATION : AUTH_UNBAN,
      });
      if (rollback.error) console.error("[admin-user] status rollback failed:", rollback.error.message);
      console.error("[admin-user] profile status update failed:", error instanceof Error ? error.message : "unknown");
      throw errorWithStatus("Gagal menyinkronkan status profil.", 500);
    }

    await repository.recordAudit({
      actorId: actor.id,
      action: "UPDATE",
      tableName: "profiles",
      recordId: userId,
      oldValues: { is_active: target.is_active },
      newValues: { is_active: nextActive },
    });
    return { user: publicRow(profile) };
  };

  /**
   * POST /api/admin/users/sync-active-import
   *
   * Canonical behavior preserved: deactivate active imported employees whose
   * NIK is absent from the import file. Safety guardrails (also exposed as a
   * dry run): admins, system accounts, soft-deleted accounts, and accounts
   * without a real NIK (e.g. `PENDING-*`) are out of import scope and are
   * never touched. Idempotent because only currently-active rows are
   * selected.
   */
  const syncActiveImport = async (
    req: unknown,
  ): Promise<{
    dryRun: boolean;
    deactivated: number;
    wouldDeactivate: number;
    items: AdminUserPublicRow[];
  }> => {
    deps.assertSameOrigin(req);
    const actor = await deps.requireAdminUser(deps.getBearerToken(req));
    const payload = await deps.readJsonBody(req, 256 * 1024);
    if (!isRecord(payload) || !Array.isArray(payload.active_niks)) {
      throw errorWithStatus("Daftar NIK aktif wajib dikirim.", 400);
    }
    if (payload.active_niks.length === 0) {
      throw errorWithStatus("Daftar NIK aktif tidak boleh kosong.", 400);
    }
    if (payload.active_niks.length > MAX_IMPORT_NIKS) {
      throw errorWithStatus(`Daftar NIK melebihi batas ${MAX_IMPORT_NIKS}.`, 400);
    }

    const normalized = new Set<string>();
    for (const raw of payload.active_niks) {
      const nik = normalizeNik(raw);
      if (!nik) throw errorWithStatus("Semua NIK pada daftar aktif wajib valid.", 400);
      normalized.add(nik);
    }

    const repository = deps.getProfileRepository();
    const candidates = await repository.listActiveNonAdminsWithNikNotIn([...normalized]);
    const safeCandidates = candidates.filter((candidate) => !hasPendingNik(candidate));
    const dryRun = payload.dry_run === true;

    if (dryRun) {
      return {
        dryRun: true,
        deactivated: 0,
        wouldDeactivate: safeCandidates.length,
        items: safeCandidates.map(publicRow),
      };
    }

    const deactivated = await repository.deactivateProfiles(safeCandidates.map((candidate) => candidate.id));
    if (deactivated > 0) {
      await repository.recordAudit({
        actorId: actor.id,
        action: "UPDATE",
        tableName: "profiles",
        recordId: safeCandidates.length === 1 ? safeCandidates[0].id : "bulk",
        oldValues: { is_active: true, count: deactivated },
        newValues: { is_active: false, count: deactivated },
      });
    }
    return { dryRun: false, deactivated, wouldDeactivate: safeCandidates.length, items: [] };
  };

  return { createUser, updateUser, resetUserPassword, updateUserStatus, syncActiveImport };
}

/**
 * Production wiring for the injected ports. Lives here so domain-runtime
 * stays thin and tests can construct fakes from these types.
 */
export const createSupabaseAuthAdminPort = (client: SupabaseClient): AdminUserAuthAdminPort => ({
  createUser: async (input) => {
    const result = await client.auth.admin.createUser(input as never);
    return { data: result.data as never, error: result.error as never };
  },
  inviteUserByEmail: async (email, options) => {
    const result = await client.auth.admin.inviteUserByEmail(email, options);
    return { data: result.data as never, error: result.error as never };
  },
  updateUserById: async (uid, input) => {
    const result = await client.auth.admin.updateUserById(uid, input as never);
    return { data: result.data as never, error: result.error as never };
  },
  deleteUser: async (uid) => {
    const result = await client.auth.admin.deleteUser(uid);
    return { data: result.data as never, error: result.error as never };
  },
  resetPasswordForEmail: async (email) => {
    const result = await client.auth.resetPasswordForEmail(email);
    return { error: result.error as never };
  },
  revokeSessions: async (userId) => {
    try {
      const result = await client
        .schema("auth")
        .from("refresh_tokens")
        .update({ revoked: true })
        .eq("user_id", userId);
      if (result.error) return { revoked: false, error: result.error.message };
      return { revoked: true, error: null };
    } catch (error) {
      return { revoked: false, error: error instanceof Error ? error.message : "unknown" };
    }
  },
});

export const createSupabaseProfileRepositoryPort = (client: SupabaseClient): AdminUserProfileRepositoryPort => ({
  findProfileById: async (id) => {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,nik,job_title,role,is_active,department_id,office_id,parent_id,phone,join_date,resign_date,deleted_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminUserProfileRow | null) ?? null;
  },
  findProfileByEmail: async (email) => {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,nik,job_title,role,is_active,department_id,office_id,parent_id,phone,join_date,resign_date,deleted_at")
      .ilike("email", email)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminUserProfileRow | null) ?? null;
  },
  findProfileByNik: async (nik) => {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,nik,job_title,role,is_active,department_id,office_id,parent_id,phone,join_date,resign_date,deleted_at")
      .eq("nik", nik)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminUserProfileRow | null) ?? null;
  },
  findDepartmentById: async (id) => {
    const { data, error } = await client
      .from("master_departments")
      .select("id,name,is_active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminUserDepartmentRow | null) ?? null;
  },
  findOfficeById: async (id) => {
    const { data, error } = await client
      .from("master_offices")
      .select("id,name,kedudukan,is_active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as AdminUserOfficeRow | null) ?? null;
  },
  upsertProfile: async (row) => {
    const { data, error } = await client.from("profiles").upsert(row, { onConflict: "id" }).select().maybeSingle();
    if (error) throw error;
    return (data as AdminUserProfileRow | null) ?? null;
  },
  updateProfile: async (id, patch) => {
    const { data, error } = await client.from("profiles").update(patch).eq("id", id).select().maybeSingle();
    if (error) throw error;
    return (data as AdminUserProfileRow | null) ?? null;
  },
  countActiveAdmins: async (excludeId) => {
    let query = client.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true).is("deleted_at", null);
    if (excludeId) query = query.neq("id", excludeId);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  },
  listActiveNonAdminsWithNikNotIn: async (activeNiks) => {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,full_name,nik,job_title,role,is_active,department_id,office_id,parent_id,phone,join_date,resign_date,deleted_at")
      .eq("is_active", true)
      .neq("role", "admin")
      .is("deleted_at", null)
      .not("nik", "is", null)
      .not("nik", "in", `(${activeNiks.map((nik) => `"${nik.replace(/"/g, '""')}"`).join(",")})`);
    if (error) throw error;
    return (data as AdminUserProfileRow[] | null) ?? [];
  },
  deactivateProfiles: async (ids) => {
    if (ids.length === 0) return 0;
    const { error } = await client
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
    return ids.length;
  },
  recordAudit: async (entry) => {
    const { error } = await client.from("activity_logs").insert({
      user_id: entry.actorId,
      action: entry.action,
      table_name: entry.tableName,
      record_id: entry.recordId,
      old_values: entry.oldValues,
      new_values: entry.newValues,
    });
    if (error) throw error;
  },
});
