import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Keu1SubmissionEditor } from "@/components/surat/Keu1SubmissionEditor";
import { Keu1SubmissionSummary } from "@/components/surat/Keu1SubmissionSummary";
import { RegistrationSummaryDialog, RegistrationSummaryDocument, type RegistrationSummaryData } from "@/components/surat/RegistrationSummaryDialog";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";
import { getKeu1FinancialSummary, type Keu1SubmissionItem } from "@/components/surat/keu1-submission";

const items = [{ id: "one", keterangan: "Listrik kantor", jumlah: 2, satuan: "bulan", estimasi_harga_satuan: 150_000, total: 300_000 }];
const summaryData: RegistrationSummaryData = {
  noSurat: "001/UAI/KEU/IX/2026",
  title: "Pengajuan Kas Kecil : Listrik kantor",
  category: "non_asset",
  usageName: "Pengajuan Kas Kecil",
  formName: "FORM PENGAJUAN KAS KECIL",
  formNumber: "FM-UAI.KEU-01-00",
  requesterName: "Pemohon",
  departmentName: "Keuangan",
  officeName: "KC. Solo",
  requestPlace: "Solo",
  requestDate: "2026-09-30",
  fields: [
    { key: "items", label: "Rincian", type: "table", value: items },
    { key: "free_cash_sisa_bulan_lalu", label: "Free Cash", value: 50_000 },
    { key: "fund_amount", label: "Kebutuhan Dana", value: 250_000 },
    { key: "fund_type", label: "Jenis Dana", value: "operational" },
  ],
  attachments: [],
  signers: [],
  isRecommendation: false,
};

function EditorHarness() {
  const [rows, setRows] = useState<Keu1SubmissionItem[]>(items);
  const [freeCash, setFreeCash] = useState("");
  return <Keu1SubmissionEditor value={rows} freeCashValue={freeCash} onChange={setRows} onFreeCashChange={setFreeCash} />;
}

describe("KEU 1 presentation", () => {
  it("shows an optional project in the KEU 1 identity without changing the financial table", () => {
    render(<RegistrationSummaryDocument data={{ ...summaryData, projectName: "Kuwasen" }} />);
    expect(screen.getByText("Proyek")).toBeInTheDocument();
    expect(screen.getByText("Kuwasen")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Estimasi Harga Satuan" })).toBeInTheDocument();
  });
  it("accepts Free Cash during input and recalculates kebutuhan dana", () => {
    render(<EditorHarness />);
    expect(screen.getAllByText("Rp 300.000")).toHaveLength(2);
    const input = screen.getByRole("textbox", { name: "Free Cash Sisa Bulan Lalu" });
    fireEvent.change(input, { target: { value: "50000" } });
    fireEvent.blur(input);
    expect(screen.getByText("Rp 250.000")).toBeInTheDocument();
    expect(getKeu1FinancialSummary(items, "")).toMatchObject({ hasFreeCash: false, kebutuhanDana: 300_000 });
    expect(getKeu1FinancialSummary(items, 0)).toMatchObject({ hasFreeCash: true, kebutuhanDana: 300_000 });
    expect(getKeu1FinancialSummary([{ ...items[0], total: 1 }], 50_000).kebutuhanDana).toBe(250_000);
  });

  it("uses KEU 1 columns and totals, without PGD status or project", () => {
    render(<RegistrationSummaryDocument data={summaryData} />);
    expect(screen.getByRole("columnheader", { name: "Estimasi Harga Satuan" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Keterangan" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Nama Barang" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.queryByText("Tanpa proyek")).not.toBeInTheDocument();
    expect(screen.getByText("FM-UAI.KEU-01-00")).toBeInTheDocument();
    expect(screen.getByText("Rp 250.000")).toBeInTheDocument();
  });

  it("uses the same KEU 1 summary in the pre-submit confirmation", () => {
    render(<RegistrationSummaryDialog open data={summaryData} submitting={false} onOpenChange={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole("columnheader", { name: "Estimasi Harga Satuan" })).toBeInTheDocument();
    expect(screen.queryByText("operational")).not.toBeInTheDocument();
    expect(screen.getByText("Rp 250.000")).toBeInTheDocument();
  });

  it("omits Free Cash when empty and reads the persisted form number", () => {
    const { rerender } = render(<Keu1SubmissionSummary items={items} freeCashValue="" />);
    expect(screen.queryByText("Free Cash Sisa Bulan Lalu")).not.toBeInTheDocument();
    rerender(<Keu1SubmissionSummary items={items} freeCashValue={0} />);
    expect(screen.getByText("Free Cash Sisa Bulan Lalu")).toBeInTheDocument();

    const persisted = buildRegistrationSummaryData({
      no_surat: summaryData.noSurat,
      form_input_data: { request_category: "non_asset", items, free_cash_sisa_bulan_lalu: 50_000 },
      location_snapshot: { form: { nama_form: summaryData.formName, nomor_form: summaryData.formNumber } },
    });
    expect(persisted.formNumber).toBe("FM-UAI.KEU-01-00");
  });
});
