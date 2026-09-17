import type { WorkEntryDraft, WorkEntryPatch, WorkEntryRepository } from "../types/work-calendar";
import { WorkEntryConflictError } from "../lib/work-entry-conflict";
import type { WorkCalendarEntryRow } from "./work-entry-row-mapper";
import { mapWorkEntryRow } from "./work-entry-row-mapper";

export interface WorkCalendarDbQueryFilter<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  eq(column: string, value: unknown): WorkCalendarDbQueryFilter<TResult>;
  gte(column: string, value: unknown): WorkCalendarDbQueryFilter<TResult>;
  lte(column: string, value: unknown): WorkCalendarDbQueryFilter<TResult>;
  is(column: string, value: null): WorkCalendarDbQueryFilter<TResult>;
  order(
    column: string,
    options?: { ascending: boolean; nullsFirst?: boolean },
  ): WorkCalendarDbQueryFilter<TResult>;
  range(from: number, to: number): WorkCalendarDbQueryFilter<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarDbQueryFilter<TResult>;
  select(columns?: string): WorkCalendarDbQueryFilter<TResult>;
  single(): PromiseLike<{ data: TResult | null; error: { message: string } | null }>;
  maybeSingle(): PromiseLike<{ data: TResult | null; error: { message: string } | null }>;
}

export interface WorkCalendarDbTable {
  select(columns?: string): WorkCalendarDbQueryFilter<WorkCalendarEntryRow[] | null>;
  insert(values: unknown): WorkCalendarDbQueryFilter<WorkCalendarEntryRow | null> & {
    select(columns?: string): WorkCalendarDbQueryFilter<WorkCalendarEntryRow | null>;
  };
  update(values: unknown): WorkCalendarDbQueryFilter<WorkCalendarEntryRow | null>;
}

export interface WorkCalendarRpcQuery<TResult = unknown>
  extends PromiseLike<{ data: TResult; error: { message: string } | null }> {
  range(from: number, to: number): WorkCalendarRpcQuery<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarRpcQuery<TResult>;
}

export interface SupabaseWorkCalendarClient {
  from(table: string): WorkCalendarDbTable;
  rpc<TResult = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): WorkCalendarRpcQuery<TResult>;
}

export interface WorkCalendarEntryInsert {
  owner_id: string;
  work_date: string;
  title: string;
  status: string;
  kind: string;
  is_all_day: boolean;
  realization?: string | null;
  notes?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  blocked_reason?: string | null;
}

export interface WorkCalendarEntryUpdate {
  work_date?: string;
  title?: string;
  status?: string;
  kind?: string;
  is_all_day?: boolean;
  realization?: string | null;
  notes?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  blocked_reason?: string | null;
}

const WORK_ENTRY_SELECT_COLUMNS =
  "id, owner_id, work_date, title, realization, notes, location, status, kind, is_all_day, starts_at, ends_at, blocked_reason, completed_at, deleted_at, created_at, updated_at";

/**
 * Bentuk id kolom `work_calendar_entries.id` (uuid). Id yang tidak berbentuk
 * uuid tidak pernah dikirim ke PostgREST: query akan gagal dengan error cast
 * dan itu bukan cara yang benar untuk menangani deep link yang salah ketik.
 */
const WORK_ENTRY_ID_SHAPE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkEntryIdShape(value: string): boolean {
  return WORK_ENTRY_ID_SHAPE_PATTERN.test(value);
}

async function paginateQuery(
  fetchPage: (
    offset: number,
    limit: number,
  ) => Promise<{ data: WorkCalendarEntryRow[] | null; error: { message: string } | null }>,
  signal: AbortSignal | undefined,
  errorMessage: string,
): Promise<WorkCalendarEntryRow[]> {
  const allData: WorkCalendarEntryRow[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    if (signal?.aborted) {
      throw new Error("Pencarian dibatalkan.");
    }
    const { data, error } = await fetchPage(offset, limit);
    if (error) {
      throw new Error(errorMessage);
    }
    if (!data || data.length === 0) {
      break;
    }
    allData.push(...data);
    if (data.length < limit) {
      break;
    }
    offset += limit;
  }
  return allData;
}

export function createSupabaseWorkEntryRepository(
  client: SupabaseWorkCalendarClient,
): WorkEntryRepository {
  return {
    async listEntries({ ownerId, fromDate, toDate, signal }) {
      const rows = await paginateQuery(
        async (offset, limit) => {
          let query = client
            .from("work_calendar_entries")
            .select(WORK_ENTRY_SELECT_COLUMNS)
            .eq("owner_id", ownerId)
            .gte("work_date", fromDate)
            .lte("work_date", toDate)
            .is("deleted_at", null)
            .order("work_date", { ascending: true })
            .order("starts_at", { ascending: true, nullsFirst: true })
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + limit - 1);

          if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
            query = query.abortSignal(signal);
          }

          return (await query) as { data: WorkCalendarEntryRow[] | null; error: { message: string } | null };
        },
        signal,
        "Gagal memuat data pekerjaan.",
      );

      return rows.map(mapWorkEntryRow);
    },

    async listTeamEntries({ fromDate, toDate, signal }) {
      const rows = await paginateQuery(
        async (offset, limit) => {
          let query = client.rpc<WorkCalendarEntryRow[] | null>("list_work_calendar_team_entries", {
            p_start_date: fromDate,
            p_end_date: toDate,
          });

          if ("range" in query && typeof query.range === "function") {
            query = query.range(offset, offset + limit - 1);
          }

          if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
            query = query.abortSignal(signal);
          }

          return await query;
        },
        signal,
        "Gagal memuat data pekerjaan tim.",
      );

      return rows.map(mapWorkEntryRow);
    },

    async getEntryById({ entryId, signal }) {
      // Id non-uuid (mis. hasil tebak URL yang salah) tidak pernah dikirim ke
      // server: cukup dianggap tidak dapat diresolusi.
      if (!isWorkEntryIdShape(entryId)) {
        return null;
      }

      let query = client
        .from("work_calendar_entries")
        .select(WORK_ENTRY_SELECT_COLUMNS)
        .eq("id", entryId)
        .is("deleted_at", null);

      if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
        query = query.abortSignal(signal);
      }

      // RLS yang sudah ada menentukan cakupan: entry sendiri, atau pekerjaan
      // anggota tim yang terotorisasi. Baris di luar cakupan tidak akan
      // dikembalikan (bukan error), sehingga hasilnya konsisten `null`.
      const { data, error } = await query;

      if (error) {
        throw new Error("Gagal memuat detail pekerjaan.");
      }

      // `id` adalah primary key, jadi hasilnya paling banyak satu baris.
      const row = data && data.length > 0 ? data[0] : null;
      return row ? mapWorkEntryRow(row) : null;
    },

    async createEntry(draft: WorkEntryDraft) {
      const payload: WorkCalendarEntryInsert = {
        owner_id: draft.ownerId,
        work_date: draft.workDate,
        title: draft.title,
        status: draft.status,
        kind: draft.kind,
        is_all_day: draft.isAllDay,
        realization: draft.realization ?? null,
        notes: draft.notes ?? null,
        location: draft.location ?? null,
        starts_at: draft.startsAt ?? null,
        ends_at: draft.endsAt ?? null,
        blocked_reason: draft.blockedReason ?? null,
      };

      const { data, error } = await client
        .from("work_calendar_entries")
        .insert(payload)
        .select(WORK_ENTRY_SELECT_COLUMNS)
        .single();

      if (error || !data) {
        throw new Error("Gagal menambahkan pekerjaan baru.");
      }

      return mapWorkEntryRow(data as WorkCalendarEntryRow);
    },

    async updateEntry({ entryId, patch, expectedUpdatedAt }) {
      if (!expectedUpdatedAt) {
        throw new Error("expectedUpdatedAt is required for updateEntry");
      }

      const updates: WorkCalendarEntryUpdate = {};
      if (patch.workDate !== undefined) updates.work_date = patch.workDate;
      if (patch.title !== undefined) updates.title = patch.title;
      if (patch.status !== undefined) updates.status = patch.status;
      if (patch.kind !== undefined) updates.kind = patch.kind;
      if (patch.isAllDay !== undefined) updates.is_all_day = patch.isAllDay;
      if (patch.realization !== undefined) updates.realization = patch.realization ?? null;
      if (patch.notes !== undefined) updates.notes = patch.notes ?? null;
      if (patch.location !== undefined) updates.location = patch.location ?? null;
      if (patch.startsAt !== undefined) updates.starts_at = patch.startsAt ?? null;
      if (patch.endsAt !== undefined) updates.ends_at = patch.endsAt ?? null;
      if (patch.blockedReason !== undefined) updates.blocked_reason = patch.blockedReason ?? null;

      const { data, error } = await client
        .from("work_calendar_entries")
        .update(updates)
        .eq("id", entryId)
        .eq("updated_at", expectedUpdatedAt)
        .is("deleted_at", null)
        .select(WORK_ENTRY_SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        throw new Error("Gagal memperbarui pekerjaan.");
      }

      if (!data) {
        throw new WorkEntryConflictError();
      }

      return mapWorkEntryRow(data as WorkCalendarEntryRow);
    },

    async deleteEntry({ entryId, expectedUpdatedAt }) {
      if (!expectedUpdatedAt) {
        throw new Error("expectedUpdatedAt is required for deleteEntry");
      }

      const { data, error } = await client.rpc<boolean | null>("soft_delete_work_calendar_entry", {
        p_entry_id: entryId,
        p_expected_updated_at: expectedUpdatedAt,
      });

      if (error) {
        throw new Error("Gagal menghapus pekerjaan.");
      }

      if (data !== true) {
        throw new WorkEntryConflictError();
      }
    },
  };
}
