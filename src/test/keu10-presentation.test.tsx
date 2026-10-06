import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Keu10SubmissionEditor } from "@/components/surat/Keu10SubmissionEditor";
import { Keu10SubmissionSummary } from "@/components/surat/Keu10SubmissionSummary";
import { RegistrationSummaryDialog, RegistrationSummaryDocument, type RegistrationSummaryData } from "@/components/surat/RegistrationSummaryDialog";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";
import type { Keu10SubmissionItem } from "@/features/surat/registration/lib/keu10-form";
import { FUND_SUBMISSION_TYPES } from "@/features/surat/registration/usages/fund/fund-types";

const items: Keu10SubmissionItem[] = [{ id: "one", keterangan: "Pengurusan tanah", jumlah: 2, satuan: "dokumen", estimasi_harga_satuan: 150_000, total: 1 }];
const data: RegistrationSummaryData = {
  noSurat: "001/UAI/KEU/X/2026", title: "Pengajuan Dana", category: "non_asset", usageName: "Legal Tanah",
  formName: "FORM PENGAJUAN DANA", formNumber: "FM-UAI.KEU-10-00", requesterName: "Pemohon", departmentName: "Keuangan",
  officeName: "KC. Solo", projectName: "Proyek Solo", requestPlace: "Solo", requestDate: "2026-10-06",
  fields: [
    { key: "keu10_purpose_code", label: "Tujuan Pengajuan", value: "Pengurusan tanah" },
    { key: "items", label: "Rincian", value: items },
    { key: "free_cash_sisa_bulan_lalu", label: "Free Cash", value: 50_000 },
    { key: "fund_amount", label: "Kebutuhan Dana", value: 1 },
    { key: "fund_type", label: "Jenis Dana", value: "operational" },
    { key: "grand_total", label: "Total kiriman", value: 1 },
    { key: "catatan", label: "Catatan", value: "Catatan pemohon" },
  ], attachments: [], signers: [], isRecommendation: false,
};

function Harness() {
  const [rows, setRows] = useState(items);
  return <><Keu10SubmissionEditor value={rows} onChange={setRows} /><output aria-label="Stored total">{rows[0]?.total}</output></>;
}

function expectKeu10Table() {
  expect(screen.getByRole("columnheader", { name: "Keterangan" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Estimasi Harga Satuan" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /^Total$/ })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Nama Barang" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Free Cash|Kebutuhan Dana|Kas Kecil/)).not.toBeInTheDocument();
  expect(within(screen.getByRole("rowheader", { name: "Grand Total" }).parentElement!).getByText("Rp 300.000")).toBeInTheDocument();
}

describe("KEU 10 form-specific presentation", () => {
  it("recomputes line and grand totals when editing quantity and price", () => {
    render(<Harness />);
    expect(screen.getByRole("textbox", { name: "Total item 1" })).toHaveValue("Rp 300.000");
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "3" } });
    expect(screen.getByLabelText("Stored total")).toHaveTextContent("450000");
    const price = screen.getByRole("textbox", { name: "Estimasi harga satuan item 1" });
    fireEvent.change(price, { target: { value: "200000" } });
    fireEvent.blur(price);
    expect(screen.getByRole("textbox", { name: "Total item 1" })).toHaveValue("Rp 600.000");
    expect(screen.getByLabelText("Stored total")).toHaveTextContent("600000");
    expect(screen.getByText("Rp 600.000")).toBeInTheDocument();
    expect(screen.queryByText(/Free Cash|Kebutuhan Dana/)).not.toBeInTheDocument();
  });
  it("adds/removes items without losing the last editable row", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah item" }));
    expect(screen.getAllByLabelText("Keterangan")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Hapus item 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Hapus item 1" }));
    expect(screen.getAllByLabelText("Keterangan")).toHaveLength(1);
    expect(screen.getByLabelText("Keterangan")).toHaveValue("");
  });
  it.each(["FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"])("uses KEU 10 display for %s in detail", (formNumber) => {
    render(<RegistrationSummaryDocument data={{ ...data, formNumber }} />);
    expectKeu10Table();
    expect(screen.getByText("Cabang / Proyek")).toBeInTheDocument();
    expect(screen.getByText("Proyek Solo")).toBeInTheDocument();
    expect(screen.getByText(formNumber)).toBeInTheDocument();
    expect(screen.getByText("Tujuan Pengajuan")).toBeInTheDocument();
    expect(screen.getByText("Catatan pemohon")).toBeInTheDocument();
    expect(screen.queryByText("operational")).not.toBeInTheDocument();
  });
  it("uses the same arithmetic in confirmation", () => {
    render(<RegistrationSummaryDialog open data={data} submitting={false} onOpenChange={() => {}} onConfirm={() => {}} />);
    expectKeu10Table();
    expect(screen.getByText("Proyek Solo")).toBeInTheDocument();
  });
  it("preserves generic PGD columns for non-KEU 10 forms", () => {
    render(<RegistrationSummaryDocument data={{ ...data, formNumber: "FM-UAI.PGD-01-00", fields: [{ key: "items", label: "Barang", value: [{ nama_barang: "Printer", jumlah: 1, sat: "unit", status: "Baru" }] }] }} />);
    expect(screen.getByRole("columnheader", { name: "Nama Barang" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Estimasi Harga Satuan" })).not.toBeInTheDocument();
  });
  it("escapes user descriptions and provides an empty state", () => {
    const { container, rerender } = render(<Keu10SubmissionSummary items={[{ ...items[0], keterangan: '<img src=x onerror="alert(1)">' }]} />);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    rerender(<Keu10SubmissionSummary items={[]} />);
    expect(screen.getByText("Belum ada rincian dana.")).toBeInTheDocument();
  });
  it.each(["FM-UAI.KEU-01-00", "FM-UAI.KEU-10-00", "FM-MBN.KEU-10-00"])("omits internal fund type from persisted summary %s", (formNumber) => {
    const persisted = buildRegistrationSummaryData({
      form_input_data: { request_category: "non_asset", items, fund_type: "marketing_cost" },
      location_snapshot: { form: { nomor_form: formNumber } },
    });
    expect(persisted.fields.find(field => field.key === "fund_type")).toBeUndefined();
    const pgd = buildRegistrationSummaryData({
      form_input_data: { request_category: "non_asset", fund_type: "marketing_cost" },
      location_snapshot: { form: { nomor_form: "FM-UAI.PGD-01-00" } },
    });
    expect(pgd.fields.find(field => field.key === "fund_type")).toMatchObject({ label: "Jenis Pengajuan Dana", value: "Biaya Marketing" });
  });
  it("reads persisted form identity", () => {
    const persisted = buildRegistrationSummaryData({
      no_surat: data.noSurat, form_input_data: { request_category: "non_asset", items },
      location_snapshot: { form: { nama_form: data.formName, nomor_form: data.formNumber }, office: { name: data.officeName }, project: { name: data.projectName } },
    });
    render(<RegistrationSummaryDocument data={persisted} />);
    expectKeu10Table();
    expect(screen.getByText("Proyek Solo")).toBeInTheDocument();
  });
  it.each(FUND_SUBMISSION_TYPES)("hides legacy $label but keeps the frozen purpose in detail and confirmation", ({ value, label }) => {
    const persisted = buildRegistrationSummaryData({
      no_surat: data.noSurat,
      form_input_data: { request_category: "non_asset", items, fund_type: value, keu10_purpose_code: "land", keu10_purpose_label: "Untrusted label" },
      location_snapshot: { form: { nama_form: data.formName, nomor_form: data.formNumber } },
      policy_snapshot: { keu10_config: { version: 1, disposition: "legal_land", purposes: [{ code: "land", label: "Pengurusan tanah" }], approval_threshold: null } },
    });
    const { rerender } = render(<RegistrationSummaryDocument data={persisted} />);
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.getAllByText("Pengurusan tanah")).toHaveLength(2);
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    expect(screen.queryByText("land")).not.toBeInTheDocument();
    expect(screen.queryByText("Untrusted label")).not.toBeInTheDocument();
    expect(screen.queryByText("Jenis Pengajuan Dana")).not.toBeInTheDocument();
    rerender(<RegistrationSummaryDialog open data={persisted} submitting={false} onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.queryByText("Jenis Pengajuan Dana")).not.toBeInTheDocument();
    expectKeu10Table();
  });
  it("does not present an unknown purpose code as a user-facing label", () => {
    const persisted = buildRegistrationSummaryData({
      form_input_data: { items, fund_type: "marketing_cost", keu10_purpose_code: "unknown_purpose" },
      location_snapshot: { form: { nomor_form: data.formNumber } },
      policy_snapshot: { keu10_config: { version: 1, disposition: "legal_land", purposes: [{ code: "land", label: "Pengurusan tanah" }], approval_threshold: null } },
    });
    render(<RegistrationSummaryDocument data={persisted} />);
    expect(screen.queryByText("unknown_purpose")).not.toBeInTheDocument();
    expect(screen.queryByText("Biaya Marketing")).not.toBeInTheDocument();
  });
});
