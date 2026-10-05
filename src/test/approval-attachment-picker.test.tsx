import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ApprovalAttachmentPicker,
  type ApprovalAttachmentRequirement,
} from "@/features/surat/inbox/components/ApprovalAttachmentPicker";
import { VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT } from "@/lib/optional-surat-attachments";

const pdf = (name: string) => new File(["%PDF-test"], name, { type: "application/pdf", lastModified: 1 });

function setup({
  requirement = VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT,
  existingFiles = [] as Array<{ id: string; file_name: string }>,
  disabled = false,
}: {
  requirement?: ApprovalAttachmentRequirement;
  existingFiles?: Array<{ id: string; file_name: string }>;
  disabled?: boolean;
} = {}) {
  const error = vi.fn();
  const changed = vi.fn();
  function Harness() {
    const [files, setFiles] = useState<File[]>([]);
    return <ApprovalAttachmentPicker
      requirement={requirement} files={files} existingFiles={existingFiles} disabled={disabled}
      onError={error} onChange={next => { setFiles(next); changed(next); }}
    />;
  }
  render(<Harness />);
  const input = screen.getByLabelText(`Unggah ${requirement.label}`);
  const choose = (...files: File[]) => fireEvent.change(input, { target: { files } });
  return { input, choose, error, changed };
}

describe("approval attachment picker", () => {
  it("retains each file selected one at a time and delivers the entire queue", () => {
    const { choose, changed } = setup();
    const first = pdf("pertama.pdf");
    const second = pdf("kedua.pdf");
    choose(first);
    choose(second);
    expect(screen.getByText(first.name)).toBeInTheDocument();
    expect(screen.getByText(second.name)).toBeInTheDocument();
    expect(changed).toHaveBeenLastCalledWith([first, second]);
    expect(screen.getByText("2 file siap diunggah")).toBeInTheDocument();
  });

  it("appends a multi-file selection to the earlier queue", () => {
    const { choose, changed } = setup();
    const files = [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")];
    choose(files[0]);
    choose(files[1], files[2]);
    expect(changed).toHaveBeenLastCalledWith(files);
  });

  it("preserves optional evidence that was already saved", () => {
    const { choose } = setup({ existingFiles: [{ id: "saved", file_name: "lama.pdf" }] });
    choose(pdf("baru.pdf"));
    expect(screen.getByText("lama.pdf")).toBeInTheDocument();
    expect(screen.getByText("Tersimpan")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hapus lama.pdf" })).not.toBeInTheDocument();
  });

  it("removes one queued file without affecting the others and allows reselecting it", () => {
    const { choose, changed, input } = setup();
    const first = pdf("a.pdf");
    const second = pdf("b.pdf");
    choose(first, second);
    fireEvent.click(screen.getByRole("button", { name: "Hapus a.pdf" }));
    expect(changed).toHaveBeenLastCalledWith([second]);
    expect(screen.queryByText(first.name)).not.toBeInTheDocument();
    choose(first);
    expect(changed).toHaveBeenLastCalledWith([second, first]);
    expect(input).toHaveValue("");
  });

  it("does not queue the same file twice", () => {
    const { choose, changed } = setup();
    const file = pdf("a.pdf");
    choose(file);
    choose(file);
    expect(changed).toHaveBeenLastCalledWith([file]);
    expect(screen.getAllByText(file.name)).toHaveLength(1);
  });

  it("counts both saved and pending optional files toward the limit", () => {
    const { choose, input, changed, error } = setup({ existingFiles: [
      { id: "old-1", file_name: "old-1.pdf" }, { id: "old-2", file_name: "old-2.pdf" },
    ] });
    const files = [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")];
    choose(files[0]);
    choose(files[1]);
    choose(files[2], pdf("too-many.pdf"));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Maksimal 5"));
    expect(changed).toHaveBeenLastCalledWith(files.slice(0, 2));
    choose(files[2]);
    expect(input).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hapus b.pdf" }));
    expect(input).toBeEnabled();
  });

  it.each([
    new File(["bad"], "bad.exe", { type: "application/octet-stream" }),
    new File([], "empty.pdf", { type: "application/pdf" }),
    new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }),
  ])("rejects invalid optional file $name without losing earlier files", invalid => {
    const { choose, changed, error } = setup();
    const original = pdf("good.pdf");
    choose(original);
    choose(invalid);
    expect(error).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
    expect(screen.getByText(original.name)).toBeInTheDocument();
    expect(screen.queryByText(invalid.name)).not.toBeInTheDocument();
  });

  it("keeps selection unchanged if the file chooser is cancelled", () => {
    const { choose, changed } = setup();
    choose(pdf("a.pdf"));
    choose();
    expect(changed).toHaveBeenCalledOnce();
  });

  it("allows configured multi-file evidence to be selected incrementally without changing replacement semantics", () => {
    const { choose, changed } = setup({ requirement: {
      requirement_key: "required", label: "Bukti", max_files: 2, is_required: true,
      allowed_types: ["application/pdf"], max_size_bytes: 100,
    }, existingFiles: [{ id: "old", file_name: "old.pdf" }] });
    const files = [pdf("a.pdf"), pdf("b.pdf")];
    expect(screen.getByText("old.pdf")).toBeInTheDocument();
    choose(files[0]);
    choose(files[1]);
    expect(changed).toHaveBeenLastCalledWith(files);
    expect(screen.queryByText("old.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("2 file siap diunggah; mengganti lampiran lama")).toBeInTheDocument();
  });

  it("retains single-file replacement behavior", () => {
    const { choose, input, changed } = setup({ requirement: {
      requirement_key: "single", label: "Satu bukti", max_files: 1,
    } });
    choose(pdf("a.pdf"));
    expect(input).toBeEnabled();
    const replacement = pdf("b.pdf");
    choose(replacement);
    expect(changed).toHaveBeenLastCalledWith([replacement]);
    expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
  });

  it("disables selection and removal while the task is being processed", () => {
    const changed = vi.fn();
    render(<ApprovalAttachmentPicker
      requirement={VERIFIER_ADDITIONAL_ATTACHMENT_REQUIREMENT} files={[pdf("a.pdf")]}
      existingFiles={[]} disabled onChange={changed} onError={vi.fn()}
    />);
    expect(screen.getByLabelText("Unggah Lampiran tambahan pemeriksaan")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hapus a.pdf" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Hapus a.pdf" }));
    expect(changed).not.toHaveBeenCalled();
  });
});
