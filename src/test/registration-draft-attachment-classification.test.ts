import { describe, expect, it } from "vitest";
import {
  buildRegistrationAttachmentRows,
  classifyRegistrationDraftAttachments,
  formatCreateRegistrasiError,
  getActiveRecommendationDraftFileIds,
  selectInitialRegistrationDraftAttachments,
  type RegistrationDraftAttachment,
} from "@/lib/registration-draft-attachment-classification";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";
import { suratService } from "@/services/surat.service";

const initialRequirements = [{
  requirement_key: "surat_kuasa",
  label: "Surat Kuasa",
  is_required: true,
  min_files: 1,
  max_files: 3,
  allowed_types: ["application/pdf"],
  max_size_bytes: 2_000_000,
}];

const draftFile = (
  id: string,
  requirementKey: string | null,
  fileName = `${id}.png`,
): RegistrationDraftAttachment => ({
  id,
  draft_id: "draft-1",
  file_url: `draft/${fileName}`,
  file_name: fileName,
  file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/png",
  file_size: 1_000,
  requirement_key: requirementKey,
  requirement_label: requirementKey,
  created_at: "2026-08-06T00:00:00.000Z",
});

const recommendationInput = (...draftFileIds: string[]) => ({
  recommendation_items: draftFileIds.map((draftFileId, index) => ({
    parent_item_id: index < 2 ? "computer-set" : "other-parent",
    parent_item_index: index < 2 ? 1 : 2,
    recommendation_attachment: { draft_file_id: draftFileId },
  })),
});

describe("registration draft attachment classification", () => {
  it("classifies initial, active recommendation, and orphan recommendation files by active draft_file_id", () => {
    const initial = draftFile("initial-1", "surat_kuasa", "surat-kuasa.pdf");
    const active = draftFile("recommendation-active", "recommendation_item_1");
    const orphan = draftFile("recommendation-orphan", "recommendation_item_2");

    const result = classifyRegistrationDraftAttachments({
      files: [initial, active, orphan],
      initialRequirementKeys: new Set(["surat_kuasa"]),
      formInputData: recommendationInput(active.id),
    });

    expect(result.initialAttachments).toEqual([initial]);
    expect(result.activeRecommendationAttachments).toEqual([active]);
    expect(result.orphanRecommendationAttachments).toEqual([orphan]);
    expect(result.attachmentsToCopy).toEqual([initial, active]);
  });

  it("gives an active draft_file_id reference precedence over a stale initial requirement key", () => {
    const active = draftFile("recommendation-active", "surat_kuasa");
    const result = classifyRegistrationDraftAttachments({
      files: [active],
      initialRequirementKeys: new Set(["surat_kuasa"]),
      formInputData: recommendationInput(active.id),
    });

    expect(result.initialAttachments).toEqual([]);
    expect(result.activeRecommendationAttachments).toEqual([active]);
  });

  it("supports multiple recommendation rows sharing one parent without using parent or row index as identity", () => {
    const processor = draftFile("processor-image", "recommendation_item_1");
    const memory = draftFile("memory-image", "recommendation_item_1");
    const duplicateProcessor = { ...processor };

    const ids = getActiveRecommendationDraftFileIds(recommendationInput(processor.id, memory.id));
    expect(ids).toEqual(new Set([processor.id, memory.id]));

    const result = classifyRegistrationDraftAttachments({
      files: [processor, memory, duplicateProcessor],
      initialRequirementKeys: new Set(),
      formInputData: recommendationInput(processor.id, memory.id),
    });

    expect(result.activeRecommendationAttachments).toEqual([processor, memory]);
    expect(result.attachmentsToCopy).toEqual([processor, memory]);
    expect(buildRegistrationAttachmentRows({
      suratId: "surat-1",
      userId: "user-1",
      initialAttachments: [],
      recommendationAttachments: result.activeRecommendationAttachments,
    })).toEqual([
      expect.objectContaining({ file_name: processor.file_name, stage: "recommendation_item" }),
      expect.objectContaining({ file_name: memory.file_name, stage: "recommendation_item" }),
    ]);
  });

  it("keeps flat legacy draft_file_id references compatible", () => {
    const active = draftFile("legacy-active", "recommendation_item_7");
    const result = classifyRegistrationDraftAttachments({
      files: [active],
      initialRequirementKeys: new Set(),
      formInputData: {
        recommendation_items: [{ recommendation_attachment_draft_file_id: active.id }],
      },
    });
    expect(result.activeRecommendationAttachments).toEqual([active]);
  });

  it("collects multiple active attachments from one recommendation component without mixing identities", () => {
    const front = draftFile("component-front", "recommendation_item_1");
    const detail = draftFile("component-detail", "recommendation_item_1");
    const input = {
      recommendation_items: [{
        parent_item_id: "computer-set",
        parent_item_index: 1,
        attachments: [
          { draft_file_id: front.id },
          { draft_file_id: detail.id },
          { draft_file_id: front.id },
        ],
      }],
    };

    expect(getActiveRecommendationDraftFileIds(input)).toEqual(
      new Set([front.id, detail.id]),
    );
    expect(classifyRegistrationDraftAttachments({
      files: [front, detail],
      initialRequirementKeys: new Set(),
      formInputData: input,
    }).activeRecommendationAttachments).toEqual([front, detail]);
  });

  it("collects nested attachments arrays alongside singular and flat legacy references", () => {
    const input = {
      recommendation_items: [{
        recommendation_attachment_draft_file_id: "flat-legacy",
        recommendation_attachment: {
          draft_file_id: "nested-singular",
          attachments: [
            { draft_file_id: "nested-array-1" },
            { draft_file_id: "nested-array-2" },
          ],
        },
      }],
    };

    expect(getActiveRecommendationDraftFileIds(input)).toEqual(new Set([
      "flat-legacy",
      "nested-singular",
      "nested-array-1",
      "nested-array-2",
    ]));
  });

  it("restores multiple canonical attachments by stable detail identity", () => {
    const front = draftFile("canonical-front", "recommendation_detail_detail-cpu");
    const socket = draftFile("canonical-socket", "recommendation_detail_detail-cpu");
    const input = {
      recommendation_multi_detail: {
        version: 1,
        items: [{
          id: "parent-computer",
          details: [{
            id: "detail-cpu",
            attachments: [
              { id: front.id, metadata: { draft_file_id: front.id } },
              { id: socket.id, metadata: { draft_file_id: socket.id } },
            ],
          }],
        }],
      },
    };

    expect(getActiveRecommendationDraftFileIds(input)).toEqual(new Set([front.id, socket.id]));
    expect(classifyRegistrationDraftAttachments({
      files: [front, socket],
      initialRequirementKeys: new Set(),
      formInputData: input,
    }).activeRecommendationAttachments).toEqual([front, socket]);
  });

  it("does not copy hidden canonical attachments from a rejected parent", () => {
    const hidden = draftFile("canonical-rejected", "recommendation_detail_detail-old");
    const input = {
      recommendation_multi_detail: {
        version: 1,
        items: [{
          id: "parent-rejected",
          status: "not_recommended",
          details: [{
            id: "detail-old",
            attachments: [{ id: hidden.id, metadata: { draft_file_id: hidden.id } }],
          }],
        }],
      },
    };

    expect(getActiveRecommendationDraftFileIds(input)).toEqual(new Set());
    expect(classifyRegistrationDraftAttachments({
      files: [hidden],
      initialRequirementKeys: new Set(),
      formInputData: input,
    }).orphanRecommendationAttachments).toEqual([hidden]);
  });

  it("preserves future attachments arrays during recommendation normalization", () => {
    const attachments = [
      { draft_file_id: "component-front" },
      { draft_file_id: "component-detail" },
    ];
    const [normalized] = suratService.normalizeRecommendationItems([{
      nama_barang: "Prosesor",
      recommendation_action: "ganti",
      attachments,
    }]);

    expect(normalized.recommendation_attachment).toEqual({
      draft_file_id: null,
      file_url: null,
      file_name: null,
      file_type: null,
      file_size: null,
      uploaded_at: null,
      source: null,
      attachments,
    });
    expect(getActiveRecommendationDraftFileIds({
      recommendation_items: [normalized],
    })).toEqual(new Set(["component-front", "component-detail"]));
  });

  it.each([null, "unknown_attachment"])(
    "fails closed for unknown or null non-recommendation requirement key %s",
    (requirementKey) => {
      expect(() => classifyRegistrationDraftAttachments({
        files: [draftFile("unknown", requirementKey)],
        initialRequirementKeys: new Set(["surat_kuasa"]),
        formInputData: recommendationInput(),
      })).toThrow("Lampiran unknown.png tidak memiliki konfigurasi yang valid.");
    },
  );

  it("does not let an active recommendation image satisfy an initial requirement", () => {
    const active = draftFile("recommendation-active", "recommendation_item_1");
    const { initialAttachments } = classifyRegistrationDraftAttachments({
      files: [active],
      initialRequirementKeys: new Set(["surat_kuasa"]),
      formInputData: recommendationInput(active.id),
    });

    expect(() => validateInitialRegistrationAttachments({
      requirements: initialRequirements,
      newFiles: [],
      newFileMetadata: {},
      persistedFiles: initialAttachments,
    })).toThrow("Lampiran pemohon belum lengkap: Surat Kuasa.");
  });

  it("returns only stage-zero files for the general attachment summary", () => {
    const initial = draftFile("initial-1", "surat_kuasa", "surat-kuasa.pdf");
    const itemImage = draftFile("recommendation-active", "recommendation_item_1");
    expect(selectInitialRegistrationDraftAttachments(
      [initial, itemImage],
      new Set(["surat_kuasa"]),
      recommendationInput(itemImage.id),
    )).toEqual([initial]);
  });

  it("accepts active recommendation images while validating configured initial attachments only", () => {
    const initial = draftFile("initial-1", "surat_kuasa", "surat-kuasa.pdf");
    const active = draftFile("recommendation-active", "recommendation_item_1");
    const { initialAttachments } = classifyRegistrationDraftAttachments({
      files: [initial, active],
      initialRequirementKeys: new Set(["surat_kuasa"]),
      formInputData: recommendationInput(active.id),
    });

    expect(() => validateInitialRegistrationAttachments({
      requirements: initialRequirements,
      newFiles: [],
      newFileMetadata: {},
      persistedFiles: initialAttachments,
    })).not.toThrow();
  });

  it("keeps ordinary drafts with configured initial attachments compatible", () => {
    const initial = draftFile("initial-1", "surat_kuasa", "surat-kuasa.pdf");
    const result = classifyRegistrationDraftAttachments({
      files: [initial],
      initialRequirementKeys: new Set(["surat_kuasa"]),
      formInputData: { items: [{ nama_barang: "Printer" }] },
    });
    expect(result.initialAttachments).toEqual([initial]);
    expect(result.activeRecommendationAttachments).toEqual([]);
    expect(result.attachmentsToCopy).toEqual([initial]);
  });

  it("formats createRegistrasi diagnostics as an informative console message", () => {
    expect(formatCreateRegistrasiError({
      message: "Lampiran image.png tidak memiliki konfigurasi yang valid.",
      code: "ATTACHMENT_INVALID",
      details: "recommendation_item_1",
    })).toBe(
      "Error in createRegistrasi: Lampiran image.png tidak memiliki konfigurasi yang valid. | ATTACHMENT_INVALID | recommendation_item_1",
    );
    expect(formatCreateRegistrasiError(new Error("Sesi kedaluwarsa"))).toBe(
      "Error in createRegistrasi: Sesi kedaluwarsa",
    );
  });
});
