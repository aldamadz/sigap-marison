import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hasRab: true,
  reviewerLabel: "Mgr. Perencanaan",
  files: [] as Array<{ id: string; stage: string; requirement_key: string; signature_id: string | null }>,
  rpc: vi.fn(async () => ({ data: true, error: null })),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "checker" } } }) },
  rpc: state.rpc,
  from: (table: string) => {
    let stage: string | undefined;
    const builder = {
      select: () => builder,
      eq: (key: string, value: string) => { if (key === "stage") stage = value; return builder; },
      single: async () => ({ error: null, data: table === "surat_signatures" ? {
        surat_id: "document", user_id: null, role_name: "memeriksa", label_jabatan: state.reviewerLabel, action_type: "configured_input",
        input_schema_snapshot: { fields: [{ key: "note", label: "Catatan", type: "text", required: false }] },
        attachment_requirements_snapshot: [{ requirement_key: "rab", label: "RAB", is_required: true, min_files: 1 }],
      } : { judul_surat: "Dana", form_input_data: { request_category: "non_asset", requester_has_rab: state.hasRab },
        location_snapshot: { form: { nomor_form: "FM-UAI.PGD-01-00" } }, data_snapshot: {} } }),
      then: (resolve: (value: { data: typeof state.files; error: null }) => unknown) =>
        Promise.resolve({ data: state.files.filter(file => file.stage === stage), error: null }).then(resolve),
    };
    return builder;
  },
} }));
import { suratService } from "@/services/surat.service";

describe("RAB verification service", () => {
  beforeEach(() => { state.hasRab = true; state.reviewerLabel = "Mgr. Perencanaan"; state.files = []; state.rpc.mockClear(); });
  it("does not require RAB for HRD even with an old RAB requirement snapshot", async () => {
    state.reviewerLabel = "Mgr. HRD & GA";
    await expect(suratService.verifySignature("signature")).resolves.toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("verify_surat_signature_v2", expect.objectContaining({ p_sig_id: "signature" }));
  });
  it("forwards canonical verification without another RAB when requester evidence exists", async () => {
    state.files = [{ id: "file", stage: "initial", requirement_key: "rab", signature_id: null }];
    await expect(suratService.verifySignature("signature")).resolves.toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("verify_surat_signature_v2", expect.objectContaining({ p_sig_id: "signature" }));
  });
  it("does not require RAB even with an old checked claim and no initial file", async () => {
    await expect(suratService.verifySignature("signature")).resolves.toBe(true);
    expect(state.rpc).toHaveBeenCalledOnce();
  });
  it("allows Planning to proceed with an optional checker RAB", async () => {
    state.hasRab = false;
    state.files = [{ id: "file", stage: "initial", requirement_key: "rab", signature_id: null }];
    await expect(suratService.verifySignature("signature")).resolves.toBe(true);
    state.files.push({ id: "checker-file", stage: "approval", requirement_key: "rab", signature_id: "signature" });
    await expect(suratService.verifySignature("signature")).resolves.toBe(true);
  });
});
