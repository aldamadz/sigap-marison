import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";
import type { FundSubmissionItem } from "@/components/surat/fund-submission";

function FundEditorHarness() {
  const [items, setItems] = useState<FundSubmissionItem[]>([{
    id: "fund-1",
    nama_barang: "",
    jumlah: 1,
    satuan: "",
    nominal: 0,
  }]);

  return <FundSubmissionEditor value={items} onChange={setItems} />;
}

describe("FundSubmissionEditor", () => {
  it("retains a space while the user types a multi-word item name", () => {
    render(<FundEditorHarness />);
    const input = screen.getByLabelText("Nama barang/jasa") as HTMLInputElement;

    for (const value of ["S", "Se", "Sewa", "Sewa ", "Sewa a", "Sewa alat"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
  });

  it("retains a space while the user types a multi-word unit", () => {
    render(<FundEditorHarness />);
    const input = screen.getByLabelText("Satuan") as HTMLInputElement;

    for (const value of ["p", "per", "per ", "per orang"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveValue(value);
    }
  });
});
