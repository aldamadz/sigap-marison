import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: supabaseMock }));

import { suratService } from "@/services/surat.service";

const draft = {
  id: "002a7f70-eaba-4946-9ee9-2bbfe8045ebe",
  reservation_id: "reservation-id",
  revision_event_id: "963b7fab-d4f7-4251-aeb2-5e56a32a66ee",
  created_by: "creator-id",
  no_surat: "003/UAI/MKT.1.TEST-02/IX/2026",
  status: "DRAFT",
  payload: {
    formData: {
      form_usage_id: "d9548653-c84b-44b3-8e20-584bd5e2feb3",
    },
  },
  signer_assignments: [],
  current_section: "form",
  expires_at: "2099-01-01T00:00:00.000Z",
  created_at: "2026-09-22T00:00:00.000Z",
  updated_at: "2026-09-22T00:00:00.000Z",
};

const archivedUsage = {
  id: "d9548653-c84b-44b3-8e20-584bd5e2feb3",
  name: "[UJI STAGING] Pengajuan SPK Unit",
  form_id: "form-id",
  request_category: "unit",
  scope_type: "pusat",
  status: "archived",
  form_usage_departments: [{ department_id: "department-id" }],
  form_usage_steps: [],
  form_usage_attachment_requirements: [],
  master_forms: { id: "form-id", nama_form: "FORM PERMOHONAN BARANG & JASA" },
};

function createDraftQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: draft, error: null }),
  };
}

function createUsageQuery(result = { data: archivedUsage, error: null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
}

function createRevisionQuery(result: { data: {
  id: string; status: string; target_type: string; reason: string;
  changes: Record<string, unknown>;
}; error: null } = {
  data: {
    id: draft.revision_event_id,
    status: "open",
    target_type: "requester",
    reason: "Perbaiki jumlah unit.",
    changes: { external_submission_revision: true, revision_generation: 2 },
  },
  error: null,
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
});

describe("registration draft historical usage", () => {
  it("prepares existing recommendation repair drafts and reloads their rebound photos", async () => {
    const legacy = { ...draft, payload: { formData: { form_usage_id: archivedUsage.id,
      form_input_data: { linked_document_type: "recommendation", recommendation_items: [{ notes: "Saved edit" }] } } } };
    const photo = { id: "new-photo-id", draft_id: draft.id, file_url: "private://original.png" };
    const prepared = { ...legacy, payload: { ...legacy.payload, recommendation_revision_photos_version: 1,
      linkedDocumentContext: { type: "recommendation", taskId: "task-id", parentSuratId: "parent-id" } } };
    supabaseMock.rpc.mockResolvedValue({ data: prepared, error: null });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return { ...createDraftQuery(), single: vi.fn().mockResolvedValue({ data: legacy, error: null }) };
      if (table === "surat_revision_events") return createRevisionQuery({ data: { id: draft.revision_event_id,
        status: "open", target_type: "requester", reason: "Lengkapi spesifikasi.", changes: { requester_edit_required: true } }, error: null });
      if (table === "surat_registration_draft_files") return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [photo], error: null }) };
      if (table === "form_usages") return createUsageQuery();
      throw new Error(`Unexpected table: ${table}`);
    });
    const result = await suratService.getRegistrationDraft(draft.id);
    expect(supabaseMock.rpc).toHaveBeenCalledWith("create_external_submission_revision_draft", { p_revision_event_id: draft.revision_event_id });
    expect(result.payload).toEqual(prepared.payload);
    expect(result.surat_registration_draft_files).toEqual([photo]);
    expect(result.revision_context?.requesterEditRequired).toBe(true);
  });

  it("does not reseed a prepared recommendation draft after intentional photo removal", async () => {
    const prepared = { ...draft, payload: { recommendation_revision_photos_version: 1, formData: {
      form_input_data: { linked_document_type: "recommendation" } } }, surat_registration_draft_files: [] };
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return { ...createDraftQuery(), single: vi.fn().mockResolvedValue({ data: prepared, error: null }) };
      if (table === "surat_revision_events") return createRevisionQuery({ data: { id: draft.revision_event_id,
        status: "open", target_type: "requester", reason: "Lengkapi spesifikasi.", changes: { requester_edit_required: true } }, error: null });
      throw new Error(`Unexpected table: ${table}`);
    });
    const result = await suratService.getRegistrationDraft(draft.id);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(result.surat_registration_draft_files).toEqual([]);
  });
  it.each([
    { requester_edit_required: true },
    { external_submission_revision: true, revision_generation: 2 },
  ])("opens an active requester draft for a canonical revision marker %j", async (changes) => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return createDraftQuery();
      if (table === "surat_revision_events") return createRevisionQuery({
        data: { id: draft.revision_event_id, status: "open", target_type: "requester",
          reason: "Lengkapi spesifikasi dan lampiran.", changes }, error: null,
      });
      if (table === "form_usages") return createUsageQuery();
      throw new Error(`Unexpected table: ${table}`);
    });
    const result = await suratService.getRegistrationDraft(draft.id);
    expect(result.revision_context).toMatchObject({
      eventId: draft.revision_event_id, reason: "Lengkapi spesifikasi dan lampiran.",
      requesterEditRequired: "requester_edit_required" in changes,
    });
    expect(result.usage_configuration).toBe(archivedUsage);
  });

  it.each([
    { status: "resolved", target: "requester", changes: { requester_edit_required: true } },
    { status: "open", target: "signer", changes: { requester_edit_required: true } },
    { status: "open", target: "requester", changes: { requester_edit_required: "true" } },
    { status: "open", target: "requester", changes: { signer_revision_required: true } },
    { status: "open", target: "requester", changes: {} },
  ])("rejects an invalid requester editing event %j", async ({ status, target, changes }) => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return createDraftQuery();
      if (table === "surat_revision_events") return createRevisionQuery({
        data: { id: draft.revision_event_id, status, target_type: target,
          reason: "Lengkapi spesifikasi dan lampiran.", changes }, error: null,
      });
      throw new Error(`Unexpected table: ${table}`);
    });
    await expect(suratService.getRegistrationDraft(draft.id)).rejects.toThrow("Permintaan perbaikan pengajuan tidak tersedia.");
  });

  it("loads the exact stored usage even when its status is archived", async () => {
    const draftQuery = createDraftQuery();
    const usageQuery = createUsageQuery();
    const revisionQuery = createRevisionQuery();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return draftQuery;
      if (table === "surat_revision_events") return revisionQuery;
      if (table === "form_usages") return usageQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await suratService.getRegistrationDraft(draft.id);

    expect(result.usage_configuration).toBe(archivedUsage);
    expect(result.revision_context).toEqual({
      eventId: draft.revision_event_id,
      generation: 2,
      reason: "Perbaiki jumlah unit.",
      requesterEditRequired: false,
    });
    expect(usageQuery.eq).toHaveBeenCalledTimes(1);
    expect(usageQuery.eq).toHaveBeenCalledWith("id", archivedUsage.id);
    expect(usageQuery.eq).not.toHaveBeenCalledWith("status", "active");
  });

  it("preserves the database error object from the historical usage lookup", async () => {
    const usageError = { code: "PGRST301", message: "row is not readable" };
    const draftQuery = createDraftQuery();
    const usageQuery = createUsageQuery({ data: archivedUsage, error: usageError });
    const revisionQuery = createRevisionQuery();
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return draftQuery;
      if (table === "surat_revision_events") return revisionQuery;
      if (table === "form_usages") return usageQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(suratService.getRegistrationDraft(draft.id)).rejects.toBe(usageError);
  });

  it("refuses a linked draft whose revision event is no longer open", async () => {
    const revisionQuery = createRevisionQuery({
      data: {
        id: draft.revision_event_id,
        status: "resolved",
        target_type: "requester",
        reason: "Perbaiki jumlah unit.",
        changes: { external_submission_revision: true, revision_generation: 2 },
      },
      error: null,
    });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "surat_registration_drafts") return createDraftQuery();
      if (table === "surat_revision_events") return revisionQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    await expect(suratService.getRegistrationDraft(draft.id)).rejects.toThrow("Permintaan perbaikan pengajuan tidak tersedia.");
  });
});
