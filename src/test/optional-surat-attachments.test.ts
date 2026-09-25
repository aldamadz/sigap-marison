import { describe, expect, it } from "vitest";
import {
  REQUESTER_ADDITIONAL_ATTACHMENT_KEY,
  REQUESTER_ADDITIONAL_ATTACHMENT_REQUIREMENT,
  validateOptionalAttachmentFiles,
  withOptionalRequesterAttachmentRequirement,
  withOptionalVerifierAttachmentRequirement,
} from "@/lib/optional-surat-attachments";
import { classifyRegistrationDraftAttachments } from "@/lib/registration-draft-attachment-classification";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";

const file = (name: string, type = "application/pdf", size = 12) => ({ name, type, size });

describe("optional surat attachments", () => {
  it("classifies and validates an optional requester file without configured requirements", () => {
    const draftFile = {
      id: "draft-file", draft_id: "draft", file_url: "draft/file.pdf", file_name: "file.pdf",
      file_type: "application/pdf", file_size: 12, requirement_key: REQUESTER_ADDITIONAL_ATTACHMENT_KEY,
      requirement_label: "Lampiran tambahan", created_at: "2026-09-25T00:00:00Z",
    };
    const classified = classifyRegistrationDraftAttachments({
      files: [draftFile],
      initialRequirementKeys: new Set([REQUESTER_ADDITIONAL_ATTACHMENT_KEY]),
      formInputData: {},
    });
    expect(classified.initialAttachments).toEqual([draftFile]);
    validateInitialRegistrationAttachments({
      requirements: [REQUESTER_ADDITIONAL_ATTACHMENT_REQUIREMENT],
      newFiles: [], newFileMetadata: {}, persistedFiles: classified.initialAttachments,
    });
  });

  it("keeps optional uploads bounded by count, MIME and size", () => {
    expect(() => validateOptionalAttachmentFiles([])).not.toThrow();
    expect(() => validateOptionalAttachmentFiles(Array.from({ length: 6 }, (_, index) => file(`${index}.pdf`)))).toThrow(/Maksimal 5/);
    expect(() => validateOptionalAttachmentFiles([file("file.exe", "application/x-msdownload")])).toThrow(/Tipe file/);
    expect(() => validateOptionalAttachmentFiles([file("file.pdf", "application/pdf", 5 * 1024 * 1024)])).toThrow(/4 MB/);
  });

  it("offers optional checker files only during verification, including a stage with no configured requirement", () => {
    expect(withOptionalVerifierAttachmentRequirement([], false)).toEqual([]);
    expect(withOptionalVerifierAttachmentRequirement([], true)).toEqual([
      expect.objectContaining({ requirement_key: "verifier_additional", is_required: false }),
    ]);
    const configured = [{ requirement_key: "rab", label: "RAB" }];
    expect(withOptionalVerifierAttachmentRequirement(configured, true).map(item => item.requirement_key)).toEqual(["rab", "verifier_additional"]);
  });

  it("preserves a configured requester requirement even when its key collides with the optional key", () => {
    const configured = [{ requirement_key: REQUESTER_ADDITIONAL_ATTACHMENT_KEY, label: "Lampiran wajib", is_required: true }];
    expect(withOptionalRequesterAttachmentRequirement(configured)).toEqual(configured);
    expect(withOptionalRequesterAttachmentRequirement([])).toEqual([REQUESTER_ADDITIONAL_ATTACHMENT_REQUIREMENT]);
  });
});
