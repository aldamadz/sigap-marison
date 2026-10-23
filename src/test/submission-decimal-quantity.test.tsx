import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { itemQuantityTotal, parseItemQuantity } from "../../shared/src/item-quantity";
import { NonAsetItemEditor, getNonAsetItemRowTotal } from "@/components/surat/NonAsetItemEditor";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import { getKeu1FinancialSummary, validateKeu1SubmissionItems } from "@/components/surat/keu1-submission";
import { toMarisonFundSubmissionItems, validateFundSubmissionItems } from "@/components/surat/fund-submission";
import { getKeu10SubmissionAmount } from "@/features/surat/registration/lib/keu10-form";
import { getRevisionItemChanges } from "@/components/surat/revision-utils";
import { signerRevisionNotes } from "../../document-revision-notes.mjs";

describe("decimal item measurements", () => {
  it("keeps revision UI and PDF line totals identical to the canonical whole-Rupiah amount", () => {
    const row = { id: "a", keterangan: "Sewa", jumlah: 1, satuan: "Hari", estimasi_harga_satuan: 1001 };
    const revision = { reason: "Sesuaikan volume", changes: { keu10_finance_proposal: true,
      keu10_base: { document_snapshot: { form_input_data: { items: [row] } } },
      confirmed_input: { items: [{ ...row, jumlah: 1.5 }] } } };
    const ui = getRevisionItemChanges(revision);
    expect(ui[0].nilai_disetujui).toContain("Total: Rp 1.502");
    const pdf = signerRevisionNotes({ data_snapshot: { revision } }).join("\n");
    expect(pdf).toContain("Total: Rp 1.502");
    expect(pdf).not.toContain("1501.5");
  });
  it.each([[0.5, 0.5], ["1,5", 1.5], ["12.75", 12.75], ["0.000001", 0.000001], [2, 2]])("preserves %s", (input, expected) => {
    expect(parseItemQuantity(input)).toBe(expected);
  });
  it.each([0, -1, null, true, {}, [], "", "1e2", "1.2.3", "1,234.5", "0.0000001", Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])("rejects malformed quantity %s", value => {
    expect(parseItemQuantity(value)).toBeNull();
  });
  it("does not turn 1.5 or 1,5 into fifteen and rounds extended prices once", () => {
    for (const amount of ["1.5", "1,5"]) {
      expect(getNonAsetItemRowTotal({ jumlah: amount, nominal: 1001 }, { qtyKey: "jumlah", nominalKey: "nominal" })).toBe(1502);
      expect(itemQuantityTotal(amount, 1001)).toBe(1502);
    }
    expect(itemQuantityTotal("0.123456", 1_000_000)).toBe(123456);
    expect(itemQuantityTotal(Number.MAX_SAFE_INTEGER, 2)).toBeNull();
  });
  it("survives draft JSON round trips, Fund serialization and KEU totals", () => {
    const fund = JSON.parse(JSON.stringify([{ nama_barang: "Pasir", jumlah: "0.5", satuan: "m3", nominal: 100001, status: "2" }]));
    expect(validateFundSubmissionItems(fund)).toEqual([]);
    expect(toMarisonFundSubmissionItems(fund)[0].jumlah).toBe(0.5);
    const keu = [{ keterangan: "Sewa", jumlah: "1.5", satuan: "hari", estimasi_harga_satuan: 1001 }];
    expect(validateKeu1SubmissionItems(keu)).toEqual([]);
    expect(getKeu1FinancialSummary(keu, 2)).toMatchObject({ grandTotal: 1502, kebutuhanDana: 1500 });
    expect(getKeu10SubmissionAmount(keu)).toBe(1502);
  });
  it("allows fractional inputs below one without browser step mismatch", () => {
    function Harness() {
      const [rows, setRows] = useState([{ nama_barang: "Pasir", jumlah: "1", sat: "m3", nominal: 1000 }]);
      return <NonAsetItemEditor rows={rows} columns={[{ key: "nama_barang" }, { key: "jumlah" }, { key: "sat" }, { key: "nominal" }]} onChange={value => setRows(value as typeof rows)} />;
    }
    render(<Harness />);
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Jumlah barang/jasa 1" });
    expect(input).toHaveAttribute("step", "any");
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(input).toHaveValue(0.5);
    expect(input.checkValidity()).toBe(true);
    expect(screen.getAllByText("Rp 500")).toHaveLength(2);
  });
  it("Fund input permits positive fractions", () => {
    render(<FundSubmissionEditor value={[{ nama_barang: "Sewa", jumlah: 0.5, satuan: "hari", nominal: 1000, status: "2" }]} onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>("Jumlah");
    expect(input).toHaveAttribute("step", "any");
    expect(input.checkValidity()).toBe(true);
  });
});
