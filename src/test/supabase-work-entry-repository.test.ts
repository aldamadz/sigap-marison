import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  WorkEntryConflictError,
  createSupabaseWorkEntryRepository,
} from "@/features/work-calendar/data/supabase-work-entry-repository";
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
  });

  describe("listEntries", () => {
    it("membentuk query filter dan urutan deterministic dengan tepat", async () => {
      const row = createMockRow();
      const mockQueryBuilder: Record<string, any> = {};

      mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.gte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.lte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.is = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.range = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.abortSignal = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.then = (resolve: any) => resolve({ data: [row], error: null });

      const mockClient = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      } as unknown as SupabaseClient;

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

      const mockQueryBuilder: Record<string, any> = {};
      mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.gte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.lte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.is = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.range = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.then = (resolve: any) => {
        callCount++;
        if (callCount === 1) {
          resolve({ data: page1, error: null });
        } else {
          resolve({ data: page2, error: null });
        }
      };

      const mockClient = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      } as unknown as SupabaseClient;

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
      const mockQueryBuilder: Record<string, any> = {};
      mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.gte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.lte = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.is = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.order = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.range = vi.fn().mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.then = (resolve: any) => resolve({ data: null, error: { message: "Internal PG error" } });

      const mockClient = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      } as unknown as SupabaseClient;

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
    it("memanggil RPC list_work_calendar_team_entries tanpa manager ID di parameter", async () => {
      const row = createMockRow();
      const mockRpcBuilder: Record<string, any> = {};
      mockRpcBuilder.abortSignal = vi.fn().mockReturnValue(mockRpcBuilder);
      mockRpcBuilder.then = (resolve: any) => resolve({ data: [row], error: null });

      const mockClient = {
        rpc: vi.fn().mockReturnValue(mockRpcBuilder),
      } as unknown as SupabaseClient;

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const controller = new AbortController();

      const result = await repo.listTeamEntries({
        managerId: "asserted-manager-id",
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        signal: controller.signal,
      });

      expect(mockClient.rpc).toHaveBeenCalledWith("list_work_calendar_team_entries", {
        p_start_date: "2026-09-01",
        p_end_date: "2026-09-30",
      });
      expect(mockRpcBuilder.abortSignal).toHaveBeenCalledWith(controller.signal);
      expect(result).toHaveLength(1);
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

      const mockInsertBuilder: Record<string, any> = {};
      mockInsertBuilder.select = vi.fn().mockReturnValue(mockInsertBuilder);
      mockInsertBuilder.single = vi.fn().mockResolvedValue({ data: row, error: null });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue(mockInsertBuilder),
        }),
      } as unknown as SupabaseClient;

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

      const mockUpdateBuilder: Record<string, any> = {};
      mockUpdateBuilder.eq = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.select = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });

      const mockInsertMock = vi.fn().mockReturnValue(mockUpdateBuilder);
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: mockInsertMock,
        }),
      } as unknown as SupabaseClient;

      const repo = createSupabaseWorkEntryRepository(mockClient);
      const result = await repo.updateEntry({
        entryId: row.id,
        patch: { title: "Judul Baru" },
        expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
      });

      expect(mockInsertMock).toHaveBeenCalledWith({ title: "Judul Baru" });
      expect(mockUpdateBuilder.eq).toHaveBeenCalledWith("id", row.id);
      expect(mockUpdateBuilder.eq).toHaveBeenCalledWith("updated_at", "2026-09-15T11:00:00.000Z");
      expect(result.title).toBe("Judul Baru");
    });

    it("melemparkan WorkEntryConflictError jika row tidak ditemukan karena perubahan konkuren", async () => {
      const mockUpdateBuilder: Record<string, any> = {};
      mockUpdateBuilder.eq = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.select = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue(mockUpdateBuilder),
        }),
      } as unknown as SupabaseClient;

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
    it("melakukan soft delete dengan mengisi deleted_at dan memeriksa expectedUpdatedAt", async () => {
      const mockUpdateBuilder: Record<string, any> = {};
      mockUpdateBuilder.eq = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.select = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });

      const mockUpdateMock = vi.fn().mockReturnValue(mockUpdateBuilder);
      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: mockUpdateMock,
        }),
      } as unknown as SupabaseClient;

      const repo = createSupabaseWorkEntryRepository(mockClient);
      await repo.deleteEntry({
        entryId: "e1",
        expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
      });

      expect(mockUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) }),
      );
      expect(mockUpdateBuilder.eq).toHaveBeenCalledWith("id", "e1");
      expect(mockUpdateBuilder.eq).toHaveBeenCalledWith("updated_at", "2026-09-15T11:00:00.000Z");
    });

    it("melemparkan WorkEntryConflictError jika soft delete gagal menemukan row", async () => {
      const mockUpdateBuilder: Record<string, any> = {};
      mockUpdateBuilder.eq = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.select = vi.fn().mockReturnValue(mockUpdateBuilder);
      mockUpdateBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

      const mockClient = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue(mockUpdateBuilder),
        }),
      } as unknown as SupabaseClient;

      const repo = createSupabaseWorkEntryRepository(mockClient);

      await expect(
        repo.deleteEntry({
          entryId: "e1",
          expectedUpdatedAt: "2026-09-15T11:00:00.000Z",
        }),
      ).rejects.toThrow(WorkEntryConflictError);
    });
  });
});
