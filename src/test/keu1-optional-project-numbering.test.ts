import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getUser: mocks.getUser } } }));
import { suratService } from "@/services/surat.service";

const id = (suffix: string) => `10000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const payload = { office_id: id("1"), dept_id: id("2"), entity_id: id("3"),
  letter_type_id: id("4"), form_usage_id: id("5"), project_id: "",
  form_input_data: { request_category: "non_asset", fund_without_project: true } };
let officeKind: string;

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.rpc.mockReset().mockResolvedValue({ data: 2, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: id("6") } } });
  officeKind = "KC";
  const records: Record<string, object> = {
    master_offices: { code: "06", parent_id: id("8") },
    master_departments: { code: "KEU", dept_index: 1 },
    master_entities: { code: "UAI" }, master_dept_letter_types: { sort_index: 1 },
    master_projects: { code: "KWS1" },
  };
  mocks.from.mockImplementation((table: string) => {
    const result = { data: table === "master_offices" ? { ...records[table], kedudukan: officeKind } : records[table], count: 1, error: null };
    const query = { select: () => query, eq: () => query, gt: () => query, not: () => query, is: () => query, single: async () => result,
      then: (resolve: (value: typeof result) => unknown) => resolve(result) };
    return query;
  });
  vi.spyOn(suratService, "getRegistrationContext").mockResolvedValue({
    usage: { request_category: "non_asset" }, form: { nomor_form: "FM-UAI.KEU-01-00" },
    user: { id: id("6") }, profile: { id: id("6") }, office: records.master_offices,
    project: null, department: records.master_departments, entity: records.master_entities, payload,
  });
});

describe("KEU 1 optional project numbering", () => {
  it.each(["KC", "KCP"])("uses -000 for %s without changing the canonical no-project counter", async (kind) => {
    officeKind = kind;
    const result = await suratService.generateNoSurat(payload);
    expect(result.fullNumber).toMatch(kind === "KC"
      ? /^002\/UAI\/06-000\.1\.1\/[IVX]+\/\d{4}$/
      : /^002\/UAI\/06\.06-000\.1\.1\/[IVX]+\/\d{4}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("generate_keu1_branch_letter_number", expect.objectContaining({ p_office_id: id("1") }));
  });
  it("uses the selected project's code and normal branch reservation", async () => {
    const result = await suratService.generateNoSurat({ ...payload, project_id: id("7"),
      form_input_data: { request_category: "non_asset", fund_without_project: false } });
    expect(result.fullNumber).toMatch(/^002\/UAI\/06-KWS1\.1\.1\/[IVX]+\/\d{4}$/);
    expect(mocks.rpc).toHaveBeenCalledWith("generate_new_letter_number", expect.objectContaining({ p_project_id: id("7") }));
  });
});
