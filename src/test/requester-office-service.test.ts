import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getUser: mocks.getUser } } }));
import { suratService } from "@/services/surat.service";

const profile = { id: "requester", full_name: "Fixture Requester", role: "user", office_id: "magelang", department_id: "tech" };
let actor: Record<string, unknown>;
const queries: Array<{ table: string; eq: ReturnType<typeof vi.fn> }> = [];

beforeEach(() => {
  vi.clearAllMocks();
  actor = { ...profile };
  queries.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: { id: profile.id } } });
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "profiles" ? actor : { id: "record" }, error: null };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result) };
    queries.push({ table, eq: query.eq });
    return query;
  });
});

describe("requester office service authority", () => {
  it("uses the current profile office, not a stale payload or requester name", async () => {
    const context = await suratService.getRegistrationContext({ office_id: "bandung", dept_id: "foreign" });
    expect(context.payload).toMatchObject({ office_id: "magelang", dept_id: "tech" });
    expect(queries.find(q => q.table === "master_offices")?.eq).toHaveBeenCalledWith("id", "magelang");
  });

  it.each(["office_id", "department_id"])("fails closed without the profile %s", async field => {
    actor[field] = null;
    await expect(suratService.getRegistrationContext({ office_id: "bandung", dept_id: "foreign" }))
      .rejects.toThrow("profil akun belum lengkap");
    expect(queries.map(q => q.table)).toEqual(["profiles"]);
  });

  it.each(["no_surat", "draft_id", "reservation_id"])("does not relabel a stale reserved identity with %s", async key => {
    await expect(suratService.getRegistrationContext({ office_id: "bandung", dept_id: "tech", [key]: "existing" }))
      .rejects.toThrow("buat nomor surat baru");
    expect(queries.map(q => q.table)).toEqual(["profiles"]);
  });

  it("rejects stale location before any counter RPC, including head-office and project requests", async () => {
    await expect(suratService.generateNoSurat({ office_id: "bandung", dept_id: "tech", project_id: "project" }))
      .rejects.toThrow("Muat ulang sebelum mengambil nomor surat");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves explicit administrator office selection", async () => {
    actor.role = "admin";
    const payload = { office_id: "bandung", dept_id: "foreign", no_surat: "reserved" };
    const context = await suratService.getRegistrationContext(payload);
    expect(context.payload).toBe(payload);
    expect(queries.find(q => q.table === "master_offices")?.eq).toHaveBeenCalledWith("id", "bandung");
  });

  it("does not infer a different office from a name when the stored profile is Bandung", async () => {
    actor.office_id = "bandung";
    actor.full_name = "Same Name As Another Requester";
    const context = await suratService.getRegistrationContext({ office_id: "magelang", dept_id: "tech" });
    expect(context.payload.office_id).toBe("bandung");
  });
});
