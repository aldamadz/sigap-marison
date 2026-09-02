import { describe, expect, it } from "vitest";
import {
  buildInitialAttachmentMeta,
  buildRegistrationSubmitPayload,
  type AttachmentRequirementInput,
  type AttachmentFileInput,
} from "@/features/surat/registration/lib/surat-submit-command";

describe("surat-submit-command", () => {
  describe("buildInitialAttachmentMeta", () => {
    it("1. requirements kosong menghasilkan object kosong", () => {
      const result = buildInitialAttachmentMeta([], { req1: [{ name: "file.pdf" }] });
      expect(result).toEqual({});
    });

    it("2. requirement tanpa file diabaikan", () => {
      const requirements: AttachmentRequirementInput[] = [{ requirement_key: "req1", label: "Label 1" }];
      const result = buildInitialAttachmentMeta(requirements, {});
      expect(result).toEqual({});
    });

    it("3. satu file menghasilkan metadata key/label yang tepat", () => {
      const requirements: AttachmentRequirementInput[] = [{ requirement_key: "req1", label: "Label 1" }];
      const files: Record<string, AttachmentFileInput[]> = {
        req1: [{ name: "test.pdf" }],
      };
      const result = buildInitialAttachmentMeta(requirements, files);
      expect(result).toEqual({
        "test.pdf": { key: "req1", label: "Label 1" },
      });
    });

    it("4. beberapa file pada requirement sama menghasilkan entry masing-masing", () => {
      const requirements: AttachmentRequirementInput[] = [{ requirement_key: "req1", label: "Label 1" }];
      const files: Record<string, AttachmentFileInput[]> = {
        req1: [{ name: "test1.pdf" }, { name: "test2.pdf" }],
      };
      const result = buildInitialAttachmentMeta(requirements, files);
      expect(result).toEqual({
        "test1.pdf": { key: "req1", label: "Label 1" },
        "test2.pdf": { key: "req1", label: "Label 1" },
      });
    });

    it("5. beberapa requirement tidak tertukar", () => {
      const requirements: AttachmentRequirementInput[] = [
        { requirement_key: "req1", label: "Label 1" },
        { requirement_key: "req2", label: "Label 2" },
      ];
      const files: Record<string, AttachmentFileInput[]> = {
        req1: [{ name: "test1.pdf" }],
        req2: [{ name: "test2.pdf" }],
      };
      const result = buildInitialAttachmentMeta(requirements, files);
      expect(result).toEqual({
        "test1.pdf": { key: "req1", label: "Label 1" },
        "test2.pdf": { key: "req2", label: "Label 2" },
      });
    });

    it("6. nama file dan label dipertahankan verbatim", () => {
      const requirements: AttachmentRequirementInput[] = [
        { requirement_key: "req1", label: "  Label with Spaces & Symbols!  " },
      ];
      const files: Record<string, AttachmentFileInput[]> = {
        req1: [{ name: "  FILE Name.pdf  " }],
      };
      const result = buildInitialAttachmentMeta(requirements, files);
      expect(result).toEqual({
        "  FILE Name.pdf  ": { key: "req1", label: "  Label with Spaces & Symbols!  " },
      });
    });

    it("7. duplicate filename mempertahankan behavior Object.fromEntries existing (entry terakhir menang)", () => {
      const requirements: AttachmentRequirementInput[] = [
        { requirement_key: "req1", label: "Label 1" },
        { requirement_key: "req2", label: "Label 2" },
      ];
      const files: Record<string, AttachmentFileInput[]> = {
        req1: [{ name: "duplicate.pdf" }],
        req2: [{ name: "duplicate.pdf" }],
      };
      const result = buildInitialAttachmentMeta(requirements, files);
      // Since req2 comes after req1 in the requirements array, its entry overrides req1's
      expect(result).toEqual({
        "duplicate.pdf": { key: "req2", label: "Label 2" },
      });
    });

    it("8. input requirements dan files tidak dimutasi", () => {
      const requirements = [{ requirement_key: "req1", label: "Label 1" }];
      const files = { req1: [{ name: "test.pdf" }] };
      const reqClone = JSON.parse(JSON.stringify(requirements));
      const filesClone = JSON.parse(JSON.stringify(files));

      buildInitialAttachmentMeta(requirements, files);

      expect(requirements).toEqual(reqClone);
      expect(files).toEqual(filesClone);
    });
  });

  describe("buildRegistrationSubmitPayload", () => {
    it("9. Payload mempertahankan semua effectiveFormData", () => {
      const formData = { field1: "value1", field2: "value2" };
      const result = buildRegistrationSubmitPayload(formData, undefined, undefined, undefined, {});
      expect(result).toMatchObject({ field1: "value1", field2: "value2" });
    });

    it("10. no_surat mengoverride nilai konflik di effectiveFormData", () => {
      const formData = { no_surat: "OLD" };
      const result = buildRegistrationSubmitPayload(formData, "NEW", undefined, undefined, {});
      expect(result.no_surat).toBe("NEW");
    });

    it("11. reservation_id mengoverride nilai konflik", () => {
      const formData = { reservation_id: "OLD" };
      const result = buildRegistrationSubmitPayload(formData, undefined, "NEW", undefined, {});
      expect(result.reservation_id).toBe("NEW");
    });

    it("12. draft_id mengoverride nilai konflik", () => {
      const formData = { draft_id: "OLD" };
      const result = buildRegistrationSubmitPayload(formData, undefined, undefined, "NEW", {});
      expect(result.draft_id).toBe("NEW");
    });

    it("13. initial_attachment_meta mengoverride nilai konflik", () => {
      const formData = { initial_attachment_meta: { old: true } };
      const meta = { newKey: { key: "new", label: "new" } };
      const result = buildRegistrationSubmitPayload(formData, undefined, undefined, undefined, meta);
      expect(result.initial_attachment_meta).toBe(meta);
    });

    it("14. Nilai null/undefined dipertahankan", () => {
      const result = buildRegistrationSubmitPayload({}, undefined, null, undefined, {});
      expect(result.no_surat).toBe(undefined);
      expect(result.reservation_id).toBe(null);
      expect(result.draft_id).toBe(undefined);
    });

    it("15. Builder tidak memutasi effectiveFormData", () => {
      const formData = { no_surat: "OLD", field: "value" };
      const clone = { ...formData };
      buildRegistrationSubmitPayload(formData, "NEW", "RES", "DRAFT", {});
      expect(formData).toEqual(clone);
    });
  });
});
