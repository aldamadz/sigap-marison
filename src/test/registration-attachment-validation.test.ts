import { describe, expect, it } from "vitest";
import {
  validateInitialRegistrationAttachments,
  type InitialAttachmentRequirement,
  type PersistedInitialAttachment,
} from "@/lib/registration-attachment-validation";

const requirement: InitialAttachmentRequirement = {
  requirement_key: "lampiran",
  label: "Lampiran",
  is_required: true,
  min_files: 1,
  max_files: 10,
  allowed_types: ["application/pdf"],
  max_size_bytes: 2_000_000,
};

const persistedFile = (
  overrides: Partial<PersistedInitialAttachment> = {},
): PersistedInitialAttachment => ({
  file_name: "lampiran.pdf",
  file_type: "application/pdf",
  file_size: 1_000,
  requirement_key: "lampiran",
  ...overrides,
});

describe("initial registration attachment validation", () => {
  it("accepts a required attachment that is already persisted on the draft", () => {
    expect(() =>
      validateInitialRegistrationAttachments({
        requirements: [requirement],
        newFiles: [],
        newFileMetadata: {},
        persistedFiles: [persistedFile()],
      }),
    ).not.toThrow();
  });

  it("counts new and persisted files together against the maximum", () => {
    const newFiles = Array.from(
      { length: 10 },
      (_, index) => new File(["pdf"], `baru-${index}.pdf`, { type: "application/pdf" }),
    );
    const newFileMetadata = Object.fromEntries(
      newFiles.map((file) => [file.name, { key: "lampiran", label: "Lampiran" }]),
    );

    expect(() =>
      validateInitialRegistrationAttachments({
        requirements: [requirement],
        newFiles,
        newFileMetadata,
        persistedFiles: [persistedFile()],
      }),
    ).toThrow("Lampiran Lampiran melebihi batas.");
  });

  it("rejects persisted files without a configured requirement key", () => {
    expect(() =>
      validateInitialRegistrationAttachments({
        requirements: [requirement],
        newFiles: [],
        newFileMetadata: {},
        persistedFiles: [persistedFile({ requirement_key: null })],
      }),
    ).toThrow("Lampiran lampiran.pdf tidak memiliki konfigurasi yang valid.");
  });

  it("validates type and size metadata for persisted draft files", () => {
    expect(() =>
      validateInitialRegistrationAttachments({
        requirements: [requirement],
        newFiles: [],
        newFileMetadata: {},
        persistedFiles: [
          persistedFile({
            file_name: "lampiran.exe",
            file_type: "application/octet-stream",
          }),
        ],
      }),
    ).toThrow("Tipe file lampiran.exe tidak diizinkan.");

    expect(() =>
      validateInitialRegistrationAttachments({
        requirements: [requirement],
        newFiles: [],
        newFileMetadata: {},
        persistedFiles: [persistedFile({ file_size: 2_000_001 })],
      }),
    ).toThrow("Ukuran file lampiran.pdf melebihi batas.");
  });
});
