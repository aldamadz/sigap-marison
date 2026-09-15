import { describe, expect, it, vi } from "vitest";
import {
  createSupabaseWorkCalendarProfileRepository,
  mapProfileRowToOwner,
  type SupabaseWorkCalendarProfileClient,
  type WorkCalendarProfileDbQuery,
  type WorkCalendarProfileDbTable,
  type WorkCalendarProfileRpcQuery,
  type WorkCalendarProfileRow,
  type WorkCalendarTeamMemberRow,
} from "@/features/work-calendar/data/work-calendar-profile-repository";

describe("WorkCalendarProfileRepository & Mapper (CAL-03 F3)", () => {
  describe("mapProfileRowToOwner", () => {
    it("memetakan row profil lengkap menjadi WorkEntryOwner", () => {
      const row: WorkCalendarProfileRow = {
        id: "u1000000-0000-4000-8000-000000000001",
        full_name: "Budi Santoso",
        job_title: "Staff Operasional",
      };

      const mapped = mapProfileRowToOwner(row);
      expect(mapped).toEqual({
        id: "u1000000-0000-4000-8000-000000000001",
        name: "Budi Santoso",
        jobTitle: "Staff Operasional",
      });
    });

    it("melakukan trimming spasi dan fallback nilai default jika kosong", () => {
      const rowEmpty: WorkCalendarProfileRow = {
        id: "u1000000-0000-4000-8000-000000000002",
        full_name: "   ",
        job_title: "   ",
      };

      const mappedEmpty = mapProfileRowToOwner(rowEmpty);
      expect(mappedEmpty).toEqual({
        id: "u1000000-0000-4000-8000-000000000002",
        name: "Tanpa Nama",
        jobTitle: null,
      });

      const rowNull: WorkCalendarProfileRow = {
        id: "u1000000-0000-4000-8000-000000000003",
        full_name: null,
        job_title: null,
      };

      const mappedNull = mapProfileRowToOwner(rowNull);
      expect(mappedNull).toEqual({
        id: "u1000000-0000-4000-8000-000000000003",
        name: "Tanpa Nama",
        jobTitle: null,
      });
    });
  });

  describe("getCurrentProfile", () => {
    it("mengembalikan null bila auth user tidak tersedia", async () => {
      const mockClient: SupabaseWorkCalendarProfileClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
        from: vi.fn(),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkCalendarProfileRepository(mockClient);
      const profile = await repo.getCurrentProfile();

      expect(profile).toBeNull();
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it("mengambil profil aktif yang tidak terhapus dan memetakan datanya", async () => {
      const mockRow: WorkCalendarProfileRow = {
        id: "u1000000-0000-4000-8000-000000000001",
        full_name: "Ahmad Manager",
        job_title: "Kepala Cabang",
      };

      const mockQueryBuilder: WorkCalendarProfileDbQuery = {
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: mockRow, error: null }).then(onfulfilled, onrejected),
      };

      const mockTable: WorkCalendarProfileDbTable = {
        select: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarProfileClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "u1000000-0000-4000-8000-000000000001" } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkCalendarProfileRepository(mockClient);
      const controller = new AbortController();

      const profile = await repo.getCurrentProfile(controller.signal);

      expect(mockClient.from).toHaveBeenCalledWith("profiles");
      expect(mockTable.select).toHaveBeenCalledWith("id, full_name, job_title");
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("id", "u1000000-0000-4000-8000-000000000001");
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith("is_active", true);
      expect(mockQueryBuilder.is).toHaveBeenCalledWith("deleted_at", null);
      expect(mockQueryBuilder.abortSignal).toHaveBeenCalledWith(controller.signal);

      expect(profile).toEqual({
        id: "u1000000-0000-4000-8000-000000000001",
        name: "Ahmad Manager",
        jobTitle: "Kepala Cabang",
      });
    });

    it("mengembalikan null saat profil tidak ditemukan di database", async () => {
      const mockQueryBuilder: WorkCalendarProfileDbQuery = {
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected),
      };

      const mockTable: WorkCalendarProfileDbTable = {
        select: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      const mockClient: SupabaseWorkCalendarProfileClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: "u1000000-0000-4000-8000-000000000001" } },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue(mockTable),
        rpc: vi.fn(),
      };

      const repo = createSupabaseWorkCalendarProfileRepository(mockClient);
      const profile = await repo.getCurrentProfile();

      expect(profile).toBeNull();
    });
  });

  describe("listTeamMembers", () => {
    it("memanggil RPC list_work_calendar_team_members tanpa argumen dan mendukung pagination > 1000", async () => {
      let callCount = 0;
      const page1: WorkCalendarTeamMemberRow[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `u-sub-${i}`,
        full_name: `Subordinate ${i}`,
        job_title: `Role ${i}`,
      }));
      const page2: WorkCalendarTeamMemberRow[] = [
        {
          id: "u-sub-1000",
          full_name: "Subordinate 1000",
          job_title: "Role 1000",
        },
      ];

      const mockRpcBuilder: WorkCalendarProfileRpcQuery = {
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        then: (onfulfilled, onrejected) => {
          callCount++;
          const payload = callCount === 1 ? { data: page1, error: null } : { data: page2, error: null };
          return Promise.resolve(payload).then(onfulfilled, onrejected);
        },
      };

      const mockClient: SupabaseWorkCalendarProfileClient = {
        auth: { getUser: vi.fn() },
        from: vi.fn(),
        rpc: vi.fn().mockReturnValue(mockRpcBuilder),
      };

      const repo = createSupabaseWorkCalendarProfileRepository(mockClient);
      const controller = new AbortController();

      const members = await repo.listTeamMembers(controller.signal);

      expect(mockClient.rpc).toHaveBeenCalledWith("list_work_calendar_team_members");
      expect(mockRpcBuilder.range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(mockRpcBuilder.range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(mockRpcBuilder.abortSignal).toHaveBeenCalledWith(controller.signal);

      expect(callCount).toBe(2);
      expect(members).toHaveLength(1001);
      expect(members[0]).toEqual({
        id: "u-sub-0",
        name: "Subordinate 0",
        jobTitle: "Role 0",
      });
      expect(members[1000]).toEqual({
        id: "u-sub-1000",
        name: "Subordinate 1000",
        jobTitle: "Role 1000",
      });
    });

    it("melempar error bila RPC gagal", async () => {
      const mockRpcBuilder: WorkCalendarProfileRpcQuery = {
        range: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnThis(),
        then: (onfulfilled, onrejected) =>
          Promise.resolve({ data: null, error: { message: "Database error" } }).then(
            onfulfilled,
            onrejected,
          ),
      };

      const mockClient: SupabaseWorkCalendarProfileClient = {
        auth: { getUser: vi.fn() },
        from: vi.fn(),
        rpc: vi.fn().mockReturnValue(mockRpcBuilder),
      };

      const repo = createSupabaseWorkCalendarProfileRepository(mockClient);
      await expect(repo.listTeamMembers()).rejects.toThrow("Gagal memuat daftar anggota tim.");
    });
  });
});
