import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkEntryDraft, WorkEntryPatch, WorkEntryRepository } from "../types/work-calendar";
import { WorkEntryConflictError } from "../lib/work-entry-conflict";
import type { WorkCalendarEntryRow } from "./work-entry-row-mapper";
import { mapWorkEntryRow } from "./work-entry-row-mapper";

export interface WorkCalendarDbQueryFilter<TResult = WorkCalendarEntryRow>
  extends PromiseLike<{ data: TResult[] | null; error: { message: string } | null }> {
  eq(column: string, value: string): WorkCalendarDbQueryFilter<TResult>;
  gte(column: string, value: string): WorkCalendarDbQueryFilter<TResult>;
  lte(column: string, value: string): WorkCalendarDbQueryFilter<TResult>;
  is(column: string, value: null): WorkCalendarDbQueryFilter<TResult>;
  order(
    column: string,
    options: { ascending: boolean; nullsFirst?: boolean },
  ): WorkCalendarDbQueryFilter<TResult>;
  range(from: number, to: number): WorkCalendarDbQueryFilter<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarDbQueryFilter<TResult>;
  select(columns: string): WorkCalendarDbQueryFilter<TResult>;
  single(): Promise<{ data: TResult | null; error: { message: string } | null }>;
  maybeSingle(): Promise<{ data: TResult | null; error: { message: string } | null }>;
}

export interface WorkCalendarDbTable {
  select(columns: string): WorkCalendarDbQueryFilter<WorkCalendarEntryRow>;
  insert(values: WorkCalendarEntryInsert): {
    select(columns: string): {
      single(): Promise<{ data: WorkCalendarEntryRow | null; error: { message: string } | null }>;
    };
  };
  update(values: WorkCalendarEntryUpdate): WorkCalendarDbQueryFilter<WorkCalendarEntryRow>;
}

export interface WorkCalendarRpcQuery<TResult = WorkCalendarEntryRow[]>
  extends PromiseLike<{ data: TResult | null; error: { message: string } | null }> {
  range(from: number, to: number): WorkCalendarRpcQuery<TResult>;
  abortSignal?(signal: AbortSignal): WorkCalendarRpcQuery<TResult>;
}

export interface SupabaseWorkCalendarClient {
  from(table: string): WorkCalendarDbTable;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ):
    | WorkCalendarRpcQuery<WorkCalendarEntryRow[]>
    | Promise<{ data: unknown; error: { message: string } | null }>;
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
          let query = client.rpc("list_work_calendar_team_entries", {
            p_start_date: fromDate,
            p_end_date: toDate,
          });

          if ("range" in query && typeof query.range === "function") {
            query = query.range(offset, offset + limit - 1);
          }

          if (signal && "abortSignal" in query && typeof query.abortSignal === "function") {
            query = query.abortSignal(signal);
          }

          return (await query) as { data: WorkCalendarEntryRow[] | null; error: { message: string } | null };
        },
        signal,
        "Gagal memuat data pekerjaan tim.",
      );

      return rows.map(mapWorkEntryRow);
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

      const { data, error } = (await client.rpc("soft_delete_work_calendar_entry", {
        p_entry_id: entryId,
        p_expected_updated_at: expectedUpdatedAt,
      })) as { data: boolean | null; error: { message: string } | null };

      if (error) {
        throw new Error("Gagal menghapus pekerjaan.");
      }
      if (!data) {
        throw new WorkEntryConflictError();
      }
    },
  };
}
