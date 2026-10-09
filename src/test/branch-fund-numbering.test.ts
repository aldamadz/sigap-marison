import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { suratService } from "@/services/surat.service";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const payload = { office_id: id(1), dept_id: id(2), entity_id: id(3), letter_type_id: id(4),
  form_usage_id: id(5), project_id: "", form_input_data: { request_category: "non_asset", fund_without_project: true } };
let formCode: string;
let category: string;
let officeKind: string;

beforeEach(() => {
  vi.restoreAllMocks();
  formCode = "FM-UAI.PGD-01-00";
  category = "non_asset";
  officeKind = "KCP";
  mocks.rpc.mockReset().mockResolvedValue({ data: 2, error: null });
  mocks.from.mockImplementation((table: string) => {
    const records: Record<string, object> = {
      master_offices: { code: "02", kedudukan: officeKind, parent_id: id(8) },
      master_departments: { code: "KEU", dept_index: 1 }, master_entities: { code: "UAI" },
      master_dept_letter_types: { sort_index: 1 }, master_projects: { code: "KWS1" },
    };
    const result = { data: records[table], count: 1, error: null };
    const query = { select: () => query, eq: () => query, single: async () => result,
      then: (resolve: (value: typeof result) => unknown) => resolve(result) };
    return query;
  });
  vi.spyOn(suratService, "getRegistrationContext").mockImplementation(async () => ({
    usage: { request_category: category }, form: { nomor_form: formCode }, user: { id: id(6) },
    profile: { id: id(6) }, office: {}, department: {}, project: null, entity: {}, payload,
  }));
});

describe("branch PGD Fund numbering", () => {
  it.each(["KC", "KCP"])("allocates Dana Umum without project for %s", async (kind) => {
    officeKind = kind;
    const result = await suratService.generateNoSurat(payload);
    expect(result.noUrut).toBe(2);
    expect(result.fullNumber).not.toContain("-000");
    expect(mocks.rpc).toHaveBeenCalledWith("generate_fund_branch_letter_number", {
      p_entity_id: id(3), p_type_id: id(4), p_office_id: id(1), p_user_id: id(6),
      p_dept_id: id(2), p_form_usage_id: id(5),
    });
  });
  it("keeps the project allocator when a project is selected", async () => {
    await suratService.generateNoSurat({ ...payload, project_id: id(7),
      form_input_data: { request_category: "non_asset", fund_without_project: false } });
    expect(mocks.rpc).toHaveBeenCalledWith("generate_new_letter_number", expect.objectContaining({ p_project_id: id(7) }));
  });
  it.each(["FM-UAI.KEU-10-00", "unknown"])("does not exempt %s", async (code) => {
    formCode = code;
    await expect(suratService.generateNoSurat(payload)).rejects.toThrow("Pilih proyek cabang");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not exempt Non Unit by trusting browser category", async () => {
    category = "non_unit";
    await expect(suratService.generateNoSurat(payload)).rejects.toThrow("Pilih proyek cabang");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("requires the explicit no-project choice", async () => {
    await expect(suratService.generateNoSurat({ ...payload,
      form_input_data: { request_category: "non_asset", fund_without_project: false } })).rejects.toThrow("Pilih proyek cabang");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
