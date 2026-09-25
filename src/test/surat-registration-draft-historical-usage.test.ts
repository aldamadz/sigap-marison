import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
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

function createRevisionQuery(result = {
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
});

describe("registration draft historical usage", () => {
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
