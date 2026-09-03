import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  executeRecommendationPostSubmit,
  type RecommendationPostSubmitCommand,
} from "@/features/surat/recommendation/services/recommendation-post-submit";

describe("recommendation-post-submit orchestration (Pass K2C1)", () => {
  let completeTaskMock: ReturnType<typeof vi.fn>;
  let linkDocumentMock: ReturnType<typeof vi.fn>;
  let autoApproveMock: ReturnType<typeof vi.fn>;
  let deps: any;

  beforeEach(() => {
    completeTaskMock = vi.fn().mockResolvedValue(undefined);
    linkDocumentMock = vi.fn().mockResolvedValue(undefined);
    autoApproveMock = vi.fn().mockResolvedValue(undefined);
    deps = {
      completeTask: completeTaskMock,
      linkDocument: linkDocumentMock,
      autoApprove: autoApproveMock,
    };
  });

  it("1. Context null tidak memanggil dependency", async () => {
    const warning = await executeRecommendationPostSubmit(
      { linkedDocumentContext: null, recommendationSuratId: "S-1" },
      deps
    );
    expect(warning).toBe("");
    expect(completeTaskMock).not.toHaveBeenCalled();
    expect(linkDocumentMock).not.toHaveBeenCalled();
    expect(autoApproveMock).not.toHaveBeenCalled();
  });

  it("2. Context non-recommendation tidak memanggil dependency", async () => {
    const warning = await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "other", parentSuratId: "P-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(warning).toBe("");
    expect(linkDocumentMock).not.toHaveBeenCalled();
  });

  it("3. Recommendation tanpa parentSuratId tidak memanggil dependency", async () => {
    const warning = await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: null },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(warning).toBe("");
    expect(linkDocumentMock).not.toHaveBeenCalled();
  });

  it("4. taskId memanggil complete tepat sekali", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", taskId: "T-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(completeTaskMock).toHaveBeenCalledTimes(1);
    expect(completeTaskMock).toHaveBeenCalledWith("T-1", "S-1");
  });

  it("5. taskId tidak memanggil link", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", taskId: "T-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(linkDocumentMock).not.toHaveBeenCalled();
  });

  it("6. Tanpa taskId memanggil link tepat sekali", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", taskId: null },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(linkDocumentMock).toHaveBeenCalledTimes(1);
    expect(completeTaskMock).not.toHaveBeenCalled();
  });

  it("7. requiredBeforeStep diteruskan verbatim", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", requiredBeforeStep: 3 },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(linkDocumentMock).toHaveBeenCalledWith("P-1", "S-1", 3);
  });

  it("8. Undefined requiredBeforeStep menjadi null", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", requiredBeforeStep: undefined },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(linkDocumentMock).toHaveBeenCalledWith("P-1", "S-1", null);
  });

  it("9. recommendationSuratId diteruskan tepat", async () => {
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
        recommendationSuratId: "S-XYZ",
      },
      deps
    );
    expect(linkDocumentMock).toHaveBeenCalledWith("P-1", "S-XYZ", null);
  });

  it("10. Auto-approve berjalan setelah complete", async () => {
    const callOrder: string[] = [];
    completeTaskMock.mockImplementation(async () => { callOrder.push("complete"); });
    autoApproveMock.mockImplementation(async () => { callOrder.push("approve"); });

    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", taskId: "T-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(callOrder).toEqual(["complete", "approve"]);
  });

  it("11. Auto-approve berjalan setelah link", async () => {
    const callOrder: string[] = [];
    linkDocumentMock.mockImplementation(async () => { callOrder.push("link"); });
    autoApproveMock.mockImplementation(async () => { callOrder.push("approve"); });

    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(callOrder).toEqual(["link", "approve"]);
  });

  it("12. Error complete tetap reject dan auto-approve tidak dipanggil", async () => {
    completeTaskMock.mockRejectedValue(new Error("Complete failed"));
    await expect(
      executeRecommendationPostSubmit(
        {
          linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1", taskId: "T-1" },
          recommendationSuratId: "S-1",
        },
        deps
      )
    ).rejects.toThrow("Complete failed");
    expect(autoApproveMock).not.toHaveBeenCalled();
  });

  it("13. Error link tetap reject dan auto-approve tidak dipanggil", async () => {
    linkDocumentMock.mockRejectedValue(new Error("Link failed"));
    await expect(
      executeRecommendationPostSubmit(
        {
          linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
          recommendationSuratId: "S-1",
        },
        deps
      )
    ).rejects.toThrow("Link failed");
    expect(autoApproveMock).not.toHaveBeenCalled();
  });

  it("14. Error auto-approve bertipe Error menghasilkan warning identik", async () => {
    autoApproveMock.mockRejectedValue(new Error("Missing template"));
    const warning = await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(warning).toBe(" Tanda tangan otomatis belum berhasil: Missing template");
  });

  it("15. Error auto-approve non-Error menghasilkan fallback identik", async () => {
    autoApproveMock.mockRejectedValue("String error fallback");
    const warning = await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(warning).toBe(" Tanda tangan otomatis belum berhasil.");
  });

  it("16. Auto-approve sukses menghasilkan warning kosong", async () => {
    autoApproveMock.mockResolvedValue(undefined);
    const warning = await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: { type: "recommendation", parentSuratId: "P-1" },
        recommendationSuratId: "S-1",
      },
      deps
    );
    expect(warning).toBe("");
  });

  it("17. Input/context tidak dimutasi", async () => {
    const context = { type: "recommendation", parentSuratId: "P-1", taskId: "T-1" };
    const contextClone = JSON.parse(JSON.stringify(context));
    
    await executeRecommendationPostSubmit(
      {
        linkedDocumentContext: context,
        recommendationSuratId: "S-1",
      },
      deps
    );
    
    expect(context).toEqual(contextClone);
  });
});
