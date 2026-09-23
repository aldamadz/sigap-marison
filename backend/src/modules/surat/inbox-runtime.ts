export const INBOX_DETAIL_SELECT = `
  id, surat_id, user_id, role_name, label_jabatan, step_order, is_signed, action_type,
  requires_unit_allocation, available_at, signer_snapshot,
  input_schema_snapshot, attachment_requirements_snapshot,
  verification_required, verification_status, verified_at, verified_by,
  verification_note, verifier_snapshot,
  surat_registrasi!inner (
    id, no_surat, judul_surat, status, current_step, created_at, updated_at,
    request_date, request_place, policy_snapshot,
    requester_snapshot, location_snapshot, form_input_data, data_snapshot,
    surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id ),
    surat_signatures (
      id, step_order, is_signed, status, role_name, label_jabatan, signed_at, catatan,
      available_at, signer_snapshot, verification_required, verification_status,
      verified_at, verified_by, verification_note, verifier_snapshot,
      profiles:user_id ( full_name, job_title )
    )
  )
`.trim();

export const INBOX_TASK_TYPE_ALLOWLIST = ["approval", "verification"] as const;
export type InboxTaskType = typeof INBOX_TASK_TYPE_ALLOWLIST[number];
export const isInboxTaskType = (value: string): value is InboxTaskType =>
  (INBOX_TASK_TYPE_ALLOWLIST as readonly string[]).includes(value);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const parseInboxLimit = (raw: string | null) => {
  if (!raw) return { error: null, value: 20 };
  if (!/^\d+$/.test(raw)) return { error: "limit harus integer positif", value: null };
  const n = parseInt(raw, 10);
  if (n < 1) return { error: "limit minimum 1", value: null };
  if (n > 50) return { error: "limit maksimum 50", value: null };
  return { error: null, value: n };
};

export const parseInboxCursor = (raw: string | null) => {
  if (!raw) return { error: null, value: null };
  try {
    const [at, taskType, id, ...rest] = Buffer.from(raw, "base64").toString("utf8").split("|");
    if (rest.length || !at || !taskType || !id) throw new Error("format invalid");
    if (!isInboxTaskType(taskType)) throw new Error("task_type tidak valid");
    if (Number.isNaN(new Date(at).getTime())) throw new Error("timestamp tidak valid");
    if (!UUID_RE.test(id)) throw new Error("id bukan UUID valid");
    return { error: null, value: { at, taskType, id } };
  } catch {
    return { error: "cursor tidak valid", value: null };
  }
};

export const parseInboxSearch = (raw: string | null) => {
  if (!raw) return { error: null, value: null };
  const trimmed = raw.trim();
  if (trimmed.length > 200) return { error: "search maksimum 200 karakter", value: null };
  return { error: null, value: trimmed };
};

export const parseInboxTaskType = (raw: string | null) => {
  if (!raw) return { error: null, value: null };
  if (!isInboxTaskType(raw)) return { error: "task_type tidak valid", value: null };
  return { error: null, value: raw };
};

export const encodeInboxCursor = (item: { available_at: string; task_type: string; id: string }) =>
  Buffer.from(`${item.available_at}|${item.task_type}|${item.id}`).toString("base64");

type SupabaseResult<T> = { data: T | null; error: unknown | null };

type InboxCompactRow = {
  id: string;
  available_at: string;
  task_type: string;
};

type VerifierSnapshot = {
  user_id: string;
};

type SignatureSummary = {
  id: string;
  step_order: number;
  is_signed: boolean;
  status: string;
  role_name: string;
  label_jabatan: string;
  signed_at: string;
  catatan: string;
  available_at: string;
  signer_snapshot: unknown;
  verification_required: boolean;
  verification_status: string;
  verified_at: string;
  verified_by: string;
  verification_note: string;
  verifier_snapshot: VerifierSnapshot[];
  profiles: { full_name: string; job_title: string } | null;
};

type SuratAttachment = {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  stage: string;
  requirement_key: string;
  requirement_label: string;
  signature_id: string;
};

type SuratRelation = {
  id: string;
  no_surat: string;
  judul_surat: string;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  request_date: string;
  request_place: string;
  policy_snapshot: unknown;
  requester_snapshot: unknown;
  location_snapshot: unknown;
  form_input_data: unknown;
  data_snapshot: unknown;
  surat_attachments: SuratAttachment[];
  surat_signatures: SignatureSummary[];
};

type InboxDetailRow = {
  id: string;
  surat_id: string;
  user_id: string;
  role_name: string;
  label_jabatan: string;
  step_order: number;
  is_signed: boolean;
  action_type: string;
  requires_unit_allocation: boolean;
  available_at: string;
  signer_snapshot: unknown;
  attachment_requirements_snapshot: unknown;
  input_schema_snapshot: unknown;
  verification_required: boolean;
  verification_status: string;
  verified_at: string;
  verified_by: string;
  verification_note: string;
  verifier_snapshot: VerifierSnapshot[] | null;
  surat_registrasi: SuratRelation | SuratRelation[];
};

export interface InboxSupabaseClient {
  rpc(name: "get_compact_inbox", params: unknown): PromiseLike<SupabaseResult<InboxCompactRow[]>>;
  rpc(name: "get_compact_inbox_count", params: unknown): PromiseLike<SupabaseResult<string | number>>;
  rpc(name: "is_inbox_task_active", params: unknown): PromiseLike<SupabaseResult<boolean>>;
  from(table: "surat_signatures"): {
    select(query: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<SupabaseResult<InboxDetailRow>>;
      };
    };
  };
}

export type InboxRuntimeDependencies = {
  getSupabase: () => InboxSupabaseClient;
  requireSupabaseUser: (token: string | undefined) => Promise<{ id: string }>;
};

export const createInboxRuntime = ({ getSupabase, requireSupabaseUser }: InboxRuntimeDependencies) => {
  const getInboxCompact = async (token: string | undefined, url: URL) => {
    const user = await requireSupabaseUser(token);
    const limitResult = parseInboxLimit(url.searchParams.get("limit") || "20");
    if (limitResult.error) throw statusError(limitResult.error, 400);
    const pageSize = limitResult.value!;
    const cursorResult = parseInboxCursor(url.searchParams.get("cursor"));
    if (cursorResult.error) throw statusError(cursorResult.error, 400);
    const searchResult = parseInboxSearch(url.searchParams.get("search"));
    if (searchResult.error) throw statusError(searchResult.error, 400);
    const taskTypeResult = parseInboxTaskType(url.searchParams.get("task_type"));
    if (taskTypeResult.error) throw statusError(taskTypeResult.error, 400);

    const cursor = cursorResult.value;
    const search = searchResult.value;
    const category = url.searchParams.get("request_category")?.trim() || null;
    const taskType = taskTypeResult.value;
    const rpcParams = { p_user_id: user.id, p_limit: pageSize, p_cursor_at: cursor?.at || null, p_cursor_task_type: cursor?.taskType || null, p_cursor_id: cursor?.id || null, p_search: search, p_request_category: category, p_task_type: taskType };
    const supabase = getSupabase();
    const needsCount = !cursor;
    const queries: Array<PromiseLike<SupabaseResult<unknown>>> = [supabase.rpc("get_compact_inbox", rpcParams)];
    if (needsCount) queries.push(supabase.rpc("get_compact_inbox_count", { p_user_id: user.id, p_search: search, p_request_category: category, p_task_type: taskType }));

    const results = await Promise.all(queries);
    const listRes = results[0] as SupabaseResult<InboxCompactRow[]>;
    const countRes = needsCount ? results[1] as SupabaseResult<string | number> : null;

    if (listRes.error) throw listRes.error;
    if (countRes?.error) throw countRes.error;
    const rows = listRes.data || [];
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const lastItem = items[items.length - 1];
    return { items, total: needsCount ? Number(countRes?.data || 0) : null, hasMore, nextCursor: hasMore && lastItem ? encodeInboxCursor(lastItem) : null, pageSize };
  };

  const getInboxDetail = async (token: string | undefined, signatureId: string | undefined) => {
    const user = await requireSupabaseUser(token);
    if (!signatureId || !UUID_RE.test(signatureId)) throw statusError("signature ID tidak valid", 400);
    const supabase = getSupabase();
    const { data: isActive, error: activeError } = await supabase.rpc("is_inbox_task_active", { p_user_id: user.id, p_signature_id: signatureId });
    if (activeError) throw activeError;
    if (!isActive) throw statusError("Task tidak aktif atau tidak ditemukan untuk user ini", 403);
    const { data, error } = await supabase.from("surat_signatures").select(INBOX_DETAIL_SELECT).eq("id", signatureId).maybeSingle();
    if (error) throw error;
    if (!data) throw statusError("Not found", 404);
    const surat = Array.isArray(data.surat_registrasi) ? data.surat_registrasi[0] : data.surat_registrasi;
    if (surat?.surat_signatures) surat.surat_signatures = [...surat.surat_signatures].sort((a: SignatureSummary, b: SignatureSummary) => Number(a.step_order) - Number(b.step_order));
    const isSigner = data.user_id === user.id;
    const verifierHit = Array.isArray(data.verifier_snapshot) && data.verifier_snapshot.some((v: VerifierSnapshot) => v && v.user_id === user.id);
    const taskType = isSigner ? "approval" : verifierHit && data.verification_required === true && data.verification_status === "pending" ? "verification" : null;
    return { ...data, task_type: taskType, surat_registrasi: surat };
  };

  return { getInboxCompact, getInboxDetail };
};
