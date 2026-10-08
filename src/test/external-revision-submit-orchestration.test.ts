import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  executeExternalRevisionSubmit,
  getExternalRevisionSuccessDescription,
  type ExternalRevisionSubmitCommand,
} from "@/features/surat/registration/services/external-revision-submit";

describe("external-revision-submit orchestration (Pass K2B)", () => {
  let submitRevisionMock: ReturnType<typeof vi.fn>;
  let autoApproveMock: ReturnType<typeof vi.fn>;
  let deps: any;

  beforeEach(() => {
    submitRevisionMock = vi.fn();
    autoApproveMock = vi.fn().mockResolvedValue(undefined);
    deps = { submitRevision: submitRevisionMock, autoApprove: autoApproveMock };
    // Clear console.error to keep test output clean, and restore it later.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("executeExternalRevisionSubmit", () => {
    it("keeps the requesting signer pending after an internal correction", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "requesting_step" });
      await executeExternalRevisionSubmit({ revisionEventId: "EV-1", draftId: "D-1", formData: {} }, deps);
      expect(autoApproveMock).not.toHaveBeenCalled();
    });
    it("1. Command mempertahankan revisionEventId", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "done" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-123",
        draftId: "D-123",
        formData: {},
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(submitRevisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ revisionEventId: "EV-123" })
      );
    });

    it("2. Command mempertahankan draftId dan formData", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "done" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-123",
        draftId: "D-999",
        formData: { custom: "data" },
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(submitRevisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: "D-999", formData: { custom: "data" } })
      );
    });

    it("3. requesterNote di-trim identik", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "done" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-123",
        draftId: "D-1",
        formData: {},
        requesterNote: "   notes inside   ",
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(submitRevisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ requesterNote: "notes inside" })
      );
    });

    it("4. Empty/null requester note menjadi string kosong", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "done" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-123",
        draftId: "D-1",
        formData: {},
        requesterNote: null,
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(submitRevisionMock).toHaveBeenCalledWith(
        expect.objectContaining({ requesterNote: "" })
      );
    });

    it("5. submitExternalSubmissionRevision dipanggil tepat sekali", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "done" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(submitRevisionMock).toHaveBeenCalledTimes(1);
    });

    it("6. recommendation tidak memanggil auto-approve", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-1", next_step: "recommendation" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(autoApproveMock).not.toHaveBeenCalled();
    });

    it("7. unit_allocation_or_approval memanggil auto-approve dengan surat_id", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-123", next_step: "unit_allocation_or_approval" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(autoApproveMock).toHaveBeenCalledTimes(1);
      expect(autoApproveMock).toHaveBeenCalledWith("S-123");
    });

    it("8. approval/default next step memanggil auto-approve", async () => {
      submitRevisionMock.mockResolvedValue({ surat_id: "S-456", next_step: "approval" });
      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      await executeExternalRevisionSubmit(cmd, deps);
      expect(autoApproveMock).toHaveBeenCalledTimes(1);
      expect(autoApproveMock).toHaveBeenCalledWith("S-456");
    });

    it("9. Auto-approve sukses tidak mengubah result", async () => {
      const mockResult = { surat_id: "S-1", next_step: "approval" };
      submitRevisionMock.mockResolvedValue(mockResult);
      autoApproveMock.mockResolvedValue(undefined); // Success

      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      const result = await executeExternalRevisionSubmit(cmd, deps);
      expect(result).toBe(mockResult); // Returns exact reference
    });

    it("10. Auto-approve gagal di-log dan submit tetap resolve", async () => {
      const mockResult = { surat_id: "S-1", next_step: "approval" };
      submitRevisionMock.mockResolvedValue(mockResult);
      autoApproveMock.mockRejectedValue(new Error("Network Error"));

      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      const result = await executeExternalRevisionSubmit(cmd, deps);
      expect(result).toBe(mockResult); // Resolves normally despite auto-approve throw
      expect(console.error).toHaveBeenCalledWith(
        "Gagal melanjutkan auto-approval revisi pemohon:",
        expect.any(Error)
      );
    });

    it("11. Error submit revision tetap reject ke outer handler", async () => {
      const submitError = new Error("Submit failed");
      submitRevisionMock.mockRejectedValue(submitError);

      const cmd: ExternalRevisionSubmitCommand = {
        revisionEventId: "EV-1",
        draftId: "D-1",
        formData: {},
      };
      await expect(executeExternalRevisionSubmit(cmd, deps)).rejects.toThrow("Submit failed");
      expect(autoApproveMock).not.toHaveBeenCalled();
    });
  });

  describe("getExternalRevisionSuccessDescription", () => {
    it("12a. recommendation description identik", () => {
      const result = getExternalRevisionSuccessDescription("recommendation");
      expect(result).toBe("Rekomendasi lama dibuka kembali dan menunggu penyesuaian tim rekomendasi.");
    });

    it("12b. unit_allocation_or_approval description identik", () => {
      const result = getExternalRevisionSuccessDescription("unit_allocation_or_approval");
      expect(result).toBe("Jumlah unit diperbarui. Alokasi akan diperiksa kembali sebelum approval.");
    });

    it("12c. default (lainnya) description identik", () => {
      const result = getExternalRevisionSuccessDescription("approval");
      expect(result).toBe("Approval dimulai ulang menggunakan data revisi terbaru.");

      const resultEmpty = getExternalRevisionSuccessDescription("");
      expect(resultEmpty).toBe("Approval dimulai ulang menggunakan data revisi terbaru.");
    });
  });
});
