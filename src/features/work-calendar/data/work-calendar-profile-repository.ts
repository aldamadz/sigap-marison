import type { WorkEntryOwner } from "../types/work-calendar";

export interface WorkCalendarProfileRow {
  id: string;
  full_name: string | null;
  job_title: string | null;
}

export interface WorkCalendarTeamMemberRow {
  id: string;
  full_name: string | null;
  job_title: string | null;
}

export interface WorkCalendarProfileDbQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  eq(column: string, value: unknown): WorkCalendarProfileDbQuery<TResult>;
  is(column: string, value: null): WorkCalendarProfileDbQuery<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarProfileDbQuery<TResult>;
  maybeSingle(): PromiseLike<{ data: TResult | null; error: { message: string } | null }>;
}

export interface WorkCalendarProfileDbTable {
  select(columns?: string): WorkCalendarProfileDbQuery<WorkCalendarProfileRow | null>;
}

export interface WorkCalendarProfileRpcQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  range(from: number, to: number): WorkCalendarProfileRpcQuery<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarProfileRpcQuery<TResult>;
}

export interface SupabaseWorkCalendarProfileClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
  };
  from(table: string): WorkCalendarProfileDbTable;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): WorkCalendarProfileRpcQuery<WorkCalendarTeamMemberRow[] | null>;
}

export interface WorkCalendarProfileRepository {
  getCurrentProfile(signal?: AbortSignal): Promise<WorkEntryOwner | null>;
  listTeamMembers(signal?: AbortSignal): Promise<readonly WorkEntryOwner[]>;
}

export function mapProfileRowToOwner(row: WorkCalendarProfileRow | WorkCalendarTeamMemberRow): WorkEntryOwner {
  return {
    id: row.id,
    name: row.full_name && row.full_name.trim().length > 0 ? row.full_name.trim() : "Tanpa Nama",
    jobTitle: row.job_title && row.job_title.trim().length > 0 ? row.job_title.trim() : null,
  };
}

async function paginateRpcTeamMembers(
  client: SupabaseWorkCalendarProfileClient,
  signal: AbortSignal | undefined,
): Promise<WorkCalendarTeamMemberRow[]> {
  const allRows: WorkCalendarTeamMemberRow[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    if (signal?.aborted) {
      throw new Error("Pencarian dibatalkan.");
    }

    let query = client.rpc("list_work_calendar_team_members");
    if ("range" in query && typeof query.range === "function") {
      query = query.range(offset, offset + limit - 1);
    }
    if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
      query = query.abortSignal(signal);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error("Gagal memuat daftar anggota tim.");
    }

    if (!data || data.length === 0) {
      break;
    }

    allRows.push(...data);
    if (data.length < limit) {
      break;
    }

    offset += limit;
  }

  return allRows;
}

export function createSupabaseWorkCalendarProfileRepository(
  client: SupabaseWorkCalendarProfileClient,
): WorkCalendarProfileRepository {
  return {
    async getCurrentProfile(signal?: AbortSignal): Promise<WorkEntryOwner | null> {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        return null;
      }

      let query = client
        .from("profiles")
        .select("id, full_name, job_title")
        .eq("id", authData.user.id)
        .eq("is_active", true)
        .is("deleted_at", null);

      if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        return null;
      }

      return mapProfileRowToOwner(data);
    },

    async listTeamMembers(signal?: AbortSignal): Promise<readonly WorkEntryOwner[]> {
      const rows = await paginateRpcTeamMembers(client, signal);
      return rows.map(mapProfileRowToOwner);
    },
  };
}
