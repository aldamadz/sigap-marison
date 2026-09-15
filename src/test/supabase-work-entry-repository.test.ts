import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  SupabaseWorkCalendarClient,
  WorkCalendarDbQueryFilter,
  WorkCalendarDbTable,
  WorkCalendarRpcQuery,
} from "@/features/work-calendar/data/supabase-work-entry-repository";
import {
  createSupabaseWorkEntryRepository,
} from "@/features/work-calendar/data/supabase-work-entry-repository";
import {
  WORK_ENTRY_CONFLICT_CODE,
  WorkEntryConflictError,
  isWorkEntryConflictError,
} from "@/features/work-calendar/lib/work-entry-conflict";
import type { WorkCalendarEntryRow } from "@/features/work-calendar/data/work-entry-row-mapper";
import { mapWorkEntryRow } from "@/features/work-calendar/data/work-entry-row-mapper";
import type { WorkEntryDraft } from "@/features/work-calendar/types/work-calendar";

function createMockRow(overrides: Partial<WorkCalendarEntryRow> = {}): WorkCalendarEntryRow {
  return {
    id: "e1000000-0000-4000-8000-000000000001",
    owner_id: "u1000000-0000-4000-8000-000000000001",
    work_date: "2026-09-15",
    title: "Menyiapkan Dokumen Rencana Kerja",
    realization: "Dokumen telah selesai dan diserahkan",
    notes: "Catatan internal",
    location: "Ruang Rapat A",
    status: "completed",
    kind: "work",
    is_all_day: false,
    starts_at: "2026-09-15T09:00:00.000Z",
    ends_at: "2026-09-15T11:00:00.000Z",
    blocked_reason: null,
    completed_at: "2026-09-15T11:00:00.000Z",
    deleted_at: null,
    created_at: "2026-09-15T08:00:00.000Z",
    updated_at: "2026-09-15T11:00:00.000Z",
    ...overrides,
  };
}

describe("SupabaseWorkEntryRepository & Mapper", () => {
  describe("mapWorkEntryRow", () => {
    it("memetakan seluruh field row snake_case ke model WorkEntry camelCase", () => {
      const row = createMockRow();
      const mapped = mapWorkEntryRow(row);

      expect(mapped).toEqual({
        id: "e1000000-0000-4000-8000-000000000001",
        ownerId: "u1000000-0000-4000-8000-000000000001",
        workDate: "2026-09-15",
        title: "Menyiapkan Dokumen Rencana Kerja",
        realization: "Dokumen telah selesai dan diserahkan",
        notes: "Catatan internal",
        location: "Ruang Rapat A",
        status: "completed",
        kind: "work",
        isAllDay: false,
        startsAt: "2026-09-15T09:00:00.000Z",
        endsAt: "2026-09-15T11:00:00.000Z",
        blockedReason: null,
        completedAt: "2026-09-15T11:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-09-15T08:00:00.000Z",
        updatedAt: "2026-09-15T11:00:00.000Z",
      });
    });

    it("menolak row dengan status tidak dikenal dan menghasilkan error stabil", () => {
      const row = createMockRow({ status: "invalid_status" });
      expect(() => mapWorkEntryRow(row)).toThrow(
        'Data pekerjaan tidak valid: status "invalid_status" tidak dikenali.',
      );
    });

    it("menolak row dengan kind tidak dikenal dan menghasilkan error stabil", () => {
      const row = createMockRow({ kind: "invalid_kind" });
      expect(() => mapWorkEntryRow(row)).toThrow(
        'Data pekerjaan tidak valid: jenis "invalid_kind" tidak dikenali.',
      );
    });
  });

  describe("WorkEntryConflictError & helper", () => {
    it("memiliki code WORK_ENTRY_CONFLICT dan dapat dideteksi isWorkEntryConflictError", () => {
      const err = new WorkEntryConflictError();
      expect(err.code).toBe(WORK_ENTRY_CONFLICT_CODE);
      expect(err.name).toBe("WorkEntryConflictError");
      expect(isWorkEntryConflictError(err)).toBe(true);
      expect(isWorkEntryConflictError({ code: "WORK_ENTRY_CONFLICT" })).toBe(true);
      expect(isWorkEntryConflictError(new Error("generic"))).toBe(false);
    });
  });

  describe("listEntries", () => {
    it("membentuk query filter dan urutan deterministic dengan tepat", async () => {
      const row = createMockRow();

      const mockQueryBuilder: WorkCalendarDbQueryFilter = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: [row], error: null }).then(onfulfilled, onrejected),
      };

      const mockTable: WorkCalendarDbTable = {
        select: vi.fn().mockReturnValue(mockQueryBuilder),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
        update: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const controller = new AbortController();

      const result = await repo.listEntries({
        ownerId: "u1000000-0000-4000-8000-000000000001",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        signal: controller.signal,
      });

      expect(mockClient.from).toHaveBeenCalledWith("work_calendar_entries");
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("owner_id", "u1000000-0000-4000-8000-000000000001");
      expect(mockQueryBuilder.gte).toHaveBeenCalledWith("work_date", "2026-09-01");
      expect(mockQueryBuilder.lte).toHaveBeenCalledWith("work_date", "2026-09-30");
      expect(mockQueryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
      expect(mockQueryBuilder.order).toHaveBeenCalledWith("work_date", { ascending: true });
      expect(mockQueryBuilder.order).toHaveBeenCalledWith("starts_at", { ascending: true, nullsFirst: true });
      expect(mockQueryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: true });
      expect(mockQueryBuilder.order).toHaveBeenCalledWith("id", { ascending: true });
      expect(mockQueryBuilder.range).toHaveBeenCalledWith(0, 999);
      expect(mockQueryBuilder.abortSignal).toHaveBeenCalledWith(controller.signal);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(row.id);
    });

    it("menangani pagination otomatis jika baris lebih dari 1000", async () => {
      let callCount = 0;
      const page1 = Array.from({ length: 1000 }, (_, i) =>
        createMockRow({ id: `e-${i}`, title: `Entry ${i}` }),
      );
      const page2 = [createMockRow({ id: "e-1000", title: "Entry 1000" })];

      const mockQueryBuilder: WorkCalendarDbQueryFilter = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled, onrejected) => {
          callCount++;
          const payload = callCount === 1 ? { data: page1, error: null } : { data: page2, error: null };
          return Promise.resolve(payload).then(onfulfilled, onrejected);
        },
      };

      const mockTable: WorkCalendarDbTable = {
        select: vi.fn().mockReturnValue(mockQueryBuilder),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
        update: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const result = await repo.listEntries({
        ownerId: "u1",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
      });

      expect(callCount).toBe(2);
      expect(result).toHaveLength(1001);
      expect(mockQueryBuilder.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(mockQueryBuilder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    });

    it("meneruskan error aplikasi yang stabil saat query gagal", async () => {
      const mockQueryBuilder: WorkCalendarDbQueryFilter = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: null, error: { message: "Internal PG error" } }).then(
            onfulfilled,
            onrejected,
          ),
      };

      const mockTable: WorkCalendarDbTable = {
        select: vi.fn().mockReturnValue(mockQueryBuilder),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
        update: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      await expect(
        repo.listEntries({
          ownerId: "u1",
          fromDate: "2026-09-01",
          toDate: "2026-09-30",
        }),
      ).rejects.toThrow("Gagal memuat data pekerjaan.");
    });
  });

  describe("listTeamEntries", () => {
    it("memanggil RPC list_work_calendar_team_entries tanpa manager ID dan mendukung pagination > 1000", async () => {
      let callCount = 0;
      const page1 = Array.from({ length: 1000 }, (_, i) =>
        createMockRow({ id: `team-entry-${i}`, title: `Team Entry ${i}` }),
      );
      const page2 = [createMockRow({ id: "team-entry-1000", title: "Team Entry 1000" })];

      const mockRpcBuilder: WorkCalendarRpcQuery = {
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        then: (onfulfilled, onrejected) => {
          callCount++;
          const payload = callCount === 1 ? { data: page1, error: null } : { data: page2, error: null };
          return Promise.resolve(payload).then(onfulfilled, onrejected);
        },
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn(),
        rpc: vi.fn().mockReturnValue(mockRpcBuilder),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const controller = new AbortController();

      const result = await repo.listTeamEntries({
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        signal: controller.signal,
      });

      expect(mockClient.rpc).toHaveBeenCalledWith("list_work_calendar_team_entries", {
        p_start_date: "2026-09-01",
        p_end_date: "2026-09-30",
      });
      expect(mockRpcBuilder.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(mockRpcBuilder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(mockRpcBuilder.abortSignal).toHaveBeenCalledWith(controller.signal);
      expect(callCount).toBe(2);
      expect(result).toHaveLength(1001);
      expect(result[0].id).toBe("team-entry-0");
      expect(result[1000].id).toBe("team-entry-1000");
    });

    it("meneruskan error aplikasi tim yang stabil saat query RPC gagal", async () => {
      const mockRpcBuilder: WorkCalendarRpcQuery = {
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: null, error: { message: "RPC failed" } }).then(
            onfulfilled,
            onrejected,
          ),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn(),
        rpc: vi.fn().mockReturnValue(mockRpcBuilder),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      await expect(
        repo.listTeamEntries({
          fromDate: "2026-09-01",
          toDate: "2026-09-30",
        }),
      ).rejects.toThrow("Gagal memuat data pekerjaan tim.");
    });
  });

  describe("createEntry", () => {
    it("mengirim payload whitelisted dengan default null dan mengembalikan canonical row", async () => {
      const row = createMockRow({
        realization: null,
        notes: null,
        location: null,
        starts_at: null,
        ends_at: null,
        blocked_reason: null,
        completed_at: null,
      });

      const mockTable: WorkCalendarDbTable = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: row, error: null }),
          }),
        }),
        update: vi.fn(),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const draft: WorkEntryDraft = {
        ownerId: "u1",
        workDate: "2026-09-15",
        title: "Tugas Baru",
        status: "planned",
        kind: "work",
        isAllDay: true,
      };

      const result = await repo.createEntry(draft);

      expect(mockClient.from).toHaveBeenCalledWith("work_calendar_entries");
      expect(result.id).toBe(row.id);
      expect(result.title).toBe(row.title);
    });
  });

  describe("updateEntry", () => {
    it("hanya memperbarui field whitelist dan memeriksa expectedUpdatedAt", async () => {
      const row = createMockRow({
        title: "Judul Baru",
        updated_at: "2026-09-15T12:00:00.000Z",
      });

      const mockQueryBuilder: WorkCalendarDbQueryFilter = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: [row], error: null }).then(onfulfilled, onrejected),
      };

      const mockUpdateFn = vi.fn().mockReturnValue(mockQueryBuilder);
      const mockTable: WorkCalendarDbTable = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
        update: mockUpdateFn,
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const result = await repo.updateEntry({
        entryId: row.id,
        patch: { title: "Judul Baru" },
        expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
      });

      expect(mockUpdateFn).toHaveBeenCalledWith({ title: "Judul Baru" });
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("id", row.id);
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("updated_at", "2026-09-15T11:00:00.000Z");
      expect(result.title).toBe("Judul Baru");
    });

    it("melemparkan WorkEntryConflictError jika row tidak ditemukan karena perubahan konkuren", async () => {
      const mockQueryBuilder: WorkCalendarDbQueryFilter = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected),
      };

      const mockTable: WorkCalendarDbTable = {
        select: vi.fn(),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn() }) }),
        update: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);

      await expect(
        repo.updateEntry({
          entryId: "e1",
          patch: { title: "Judul Baru" },
          expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
        }),
      ).rejects.toThrow(WorkEntryConflictError);
    });
  });

  describe("deleteEntry", () => {
    it("memanggil soft_delete_work_calendar_entry RPC dengan entryId dan expectedUpdatedAt", async () => {
      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);
      await repo.deleteEntry({
        entryId: "e1",
        expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
      });

      expect(mockClient.rpc).toHaveBeenCalledWith("soft_delete_work_calendar_entry", {
        p_entry_id: "e1",
        p_expected_updated_at: "2026-09-15T11:00:00.000Z",
      });
    });

    it("melemparkan WorkEntryConflictError jika RPC mengembalikan false", async () => {
      const mockClient: SupabaseWorkCalendarClient = {
        from: vi.fn(),
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      };

      const repo = createSupabaseWorkEntryRepository(mockClient);

      await expect(
        repo.deleteEntry({
          entryId: "e1",
          expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
        }),
      ).rejects.toThrow(WorkEntryConflictError);
    });
  });

  describe("boundary assertions for safe typing", () => {
    it("memastikan source data layer dan test repository tidak mengandung unsafe casts atau ignore comments", () => {
      const targetFiles = [
        "src/features/work-calendar/data/supabase-work-entry-repository.ts",
        "src/features/work-calendar/data/work-entry-row-mapper.ts",
        "src/features/work-calendar/lib/work-entry-conflict.ts",
        "src/test/supabase-work-entry-repository.test.ts",
      ];

      const forbiddenPatterns = [
        new RegExp("as" + "\\s+unknown\\s+as", "i"),
        new RegExp("as" + "\\s+any\\s+as", "i"),
        new RegExp(":" + "\\s*any\\b"),
        new RegExp("@" + "ts-ignore"),
        new RegExp("@" + "ts-nocheck"),
      ];

      for (const relativePath of targetFiles) {
        const fullPath = resolve(process.cwd(), relativePath);
        const content = readFileSync(fullPath, "utf8");

        for (const pattern of forbiddenPatterns) {
          expect(
            pattern.test(content),
            `File ${relativePath} tidak boleh mengandung pola terlarang: ${pattern.toString()}`,
          ).toBe(false);
        }
      }
    });
  });
});
