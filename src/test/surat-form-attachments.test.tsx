/** Flow 10: required attachment must persist before summary opens. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, act } from "@testing-library/react";
import {
  setupTestHarness,
  teardownTestHarness,
  serviceMock,
  toastMock,
  allowServiceCalls,
  assertStrictServiceCalls,
} from "./surat-form-harness";
import { MASTER_DATA_DEFAULT, ATTACHMENT_FORM_USAGE_RAW, FORM_USAGES_RAW, UUID } from "./surat-form-fixtures";
import { REQUESTER_ADDITIONAL_ATTACHMENT_KEY } from "@/lib/optional-surat-attachments";
import {
  configureStandardMocks,
  selectLetterType,
  selectEntity,
  selectCategoryAset,
  clickGetNumber,
  mountFormWithUsage,
  fillNamaBarang,
  selectAllSigners,
  goToWizardStep,
  clickConfirmRegistration,
  selectForm,
  selectUsage,
  selectFormAndUsage,
  selectCategory,
  selectCategoryUnit,
  selectCategoryNonUnit
} from "./surat-form-driver";

beforeEach(() => {
  setupTestHarness();
  configureStandardMocks();
  serviceMock.getMasterData.mockResolvedValue(MASTER_DATA_DEFAULT);
  serviceMock.uploadRegistrationDraftFiles.mockResolvedValue([{
    id: UUID.draft_file,
    file_name: "surat-kuasa.pdf",
    file_type: "application/pdf",
    file_size: 12,
    requirement_key: "surat_kuasa",
    requirement_label: "Surat Kuasa",
  }]);
  allowServiceCalls(
    "getMasterData",
    "getActiveRegistrationDrafts",
    "generateNoSurat",
    "createRegistrationDraft",
    "uploadRegistrationDraftFiles",
    "saveRegistrationDraft",
  );
});

afterEach(() => teardownTestHarness());

async function reachReadyAttachmentForm() {
  await mountFormWithUsage(ATTACHMENT_FORM_USAGE_RAW);
  await selectFormAndUsage();
    await selectLetterType();
  await selectEntity();

  await clickGetNumber();
  await fillNamaBarang("Printer Epson");
  await waitFor(() => expect(screen.getByPlaceholderText(/Contoh.*Permohonan/i)).toHaveValue(
    "Pengajuan Aset Dept. Pengembangan Organisasi Kantor Pusat"
  ));
}

describe("Flow 10: Required attachment", () => {
  it("offers optional attachments when a usage has no configured attachment requirement", async () => {
    serviceMock.uploadRegistrationDraftFiles.mockResolvedValueOnce([{
      id: UUID.draft_file,
      file_name: "tambahan.pdf",
      file_type: "application/pdf",
      file_size: 12,
      requirement_key: REQUESTER_ADDITIONAL_ATTACHMENT_KEY,
      requirement_label: "Lampiran tambahan",
    }]);
    await mountFormWithUsage(FORM_USAGES_RAW);
    await selectFormAndUsage();
    await selectLetterType();
    await selectEntity();
    await clickGetNumber();
    expect(screen.getByText("Lampiran tambahan")).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["pdf content"], "tambahan.pdf", { type: "application/pdf" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await waitFor(() => expect(serviceMock.uploadRegistrationDraftFiles).toHaveBeenCalledWith(
      UUID.draft, [file], { key: REQUESTER_ADDITIONAL_ATTACHMENT_KEY, label: "Lampiran tambahan" }, expect.any(Function),
    ));
  });

  it("blocks summary before required attachment is persisted", async () => {
    await reachReadyAttachmentForm();
    await goToWizardStep(3);
    const confirm = screen.getByRole("button", { name: /Konfirmasi Pendaftaran/i });
    await act(async () => { fireEvent.click(confirm); });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Lampiran Wajib" }));
    expect(serviceMock.uploadRegistrationDraftFiles).not.toHaveBeenCalled();
    assertStrictServiceCalls();
  });

  it("uploads with requirement metadata, renders persisted file, then allows summary", async () => {
    await reachReadyAttachmentForm();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(["pdf content"], "surat-kuasa.pdf", { type: "application/pdf" });
    await act(async () => { fireEvent.change(fileInput!, { target: { files: [file] } }); });

    await waitFor(() => expect(serviceMock.uploadRegistrationDraftFiles).toHaveBeenCalled());
    const [draftId, files, metadata] = serviceMock.uploadRegistrationDraftFiles.mock.calls[0];
    expect(draftId).toBe(UUID.draft);
    expect(files).toEqual([file]);
    expect(metadata).toEqual({ key: "surat_kuasa", label: "Surat Kuasa" });
    expect((await screen.findAllByText("surat-kuasa.pdf")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1 dari 3 file tersimpan")).toBeInTheDocument();

    await goToWizardStep(3);
    await clickConfirmRegistration();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("surat-kuasa.pdf");
    expect(dialog).toHaveTextContent("Surat Kuasa");
    assertStrictServiceCalls();
  });
});
