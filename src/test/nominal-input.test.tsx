import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { NominalInput } from "@/components/surat/NominalInput";
import { FundSubmissionEditor } from "@/components/surat/FundSubmissionEditor";

const Harness = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NominalInput value={value} onCommit={setValue} placeholder="1.000.000" ariaLabel="Nominal" />
      <button onClick={() => setValue("2500000")}>Set eksternal</button>
      <output data-testid="committed">{value}</output>
    </>
  );
};

const getInput = () => screen.getByRole("textbox", { name: "Nominal" }) as HTMLInputElement;

describe("NominalInput", () => {
  it("menampilkan prefiks Rp yang tidak dapat diedit", () => {
    render(<Harness />);
    expect(screen.getByText("Rp")).toBeInTheDocument();
  });

  it("memformat titik ribuan langsung saat mengetik tanpa mengosongkan field", () => {
    render(<Harness />);
    const input = getInput();
    const steps: Array<[string, string]> = [
      ["1", "1"],
      ["10", "10"],
      ["100", "100"],
      ["1000", "1.000"],
      ["10000", "10.000"],
      ["1000000", "1.000.000"],
    ];
    for (const [typed, expected] of steps) {
      fireEvent.change(input, { target: { value: typed } });
      expect(input.value).toBe(expected);
    }
  });

  it("tetap memformat bentuk antara aneh seperti 1.0000 tanpa wipe", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "1.0000" } });
    expect(input.value).toBe("10.000");
  });

  it("mengirim nilai kanonik digit saat blur dan menampilkan format titik ribuan", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "1000000" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("committed").textContent).toBe("1000000");
    expect(input.value).toBe("1.000.000");
  });

  it("mengirim string kosong saat blur dengan draft kosong", () => {
    render(<Harness initial="500000" />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("committed").textContent).toBe("");
    expect(input.value).toBe("");
  });

  it("membuang karakter non-digit saat mengetik", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "abc1,5!x" } });
    expect(input.value).toBe("15");
    fireEvent.blur(input);
    expect(getInput().value).toBe("15");
  });

  it("menampilkan nilai existing dalam format titik ribuan", () => {
    render(<Harness initial="1000000" />);
    expect(getInput().value).toBe("1.000.000");
  });

  it("mengikuti perubahan nilai eksternal saat tidak sedang mengetik", () => {
    render(<Harness initial="1000000" />);
    fireEvent.click(screen.getByRole("button", { name: "Set eksternal" }));
    expect(getInput().value).toBe("2.500.000");
  });

  it("menolak draft yang melebihi MAX_SAFE_INTEGER saat blur", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "99999999999999999999" } });
    fireEvent.blur(input);
    expect(input.value).toBe("");
  });

  it("tidak menggandakan prefiks Rp saat dipakai di rincian fund submission", () => {
    render(
      <FundSubmissionEditor
        value={[{ id: "fund-1", nama_barang: "Sewa kendaraan", jumlah: 1, satuan: "bulan", nominal: 0 }]}
        onChange={() => undefined}
      />,
    );

    expect(screen.getAllByText("Rp")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Nominal item 1" })).toBeInTheDocument();
  });
});
