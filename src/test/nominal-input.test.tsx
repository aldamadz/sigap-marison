import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { NominalInput } from "@/components/surat/NominalInput";

const Harness = ({ initial = "" }: { initial?: string }) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NominalInput value={value} onCommit={setValue} placeholder="1.000.000" ariaLabel="Nominal" />
      <button onClick={() => setValue("2500000")}>Set eksternal</button>
    </>
  );
};

const getInput = () => screen.getByRole("textbox", { name: "Nominal" }) as HTMLInputElement;

describe("NominalInput", () => {
  it("tidak menghapus field saat mengetik nominal digit demi digit (regresi wipe)", () => {
    render(<Harness />);
    const input = getInput();
    const steps = ["1", "10", "100", "1.000", "1.0000", "1.000.000"];
    for (const step of steps) {
      fireEvent.change(input, { target: { value: step } });
      expect(input.value).not.toBe("");
      expect(input.value).toBe(step.replace(/\D/g, ""));
    }
    expect(input.value).toBe("1000000");
  });

  it("menahan bentuk antara yang tidak lolos parser kanonik tanpa mengosongkan field", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "1.0000" } });
    expect(input.value).toBe("10000");
  });

  it("mengirim nilai kanonik saat blur dan menampilkan format titik ribuan", () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "1.000.000" } });
    fireEvent.blur(input);
    expect(input.value).toBe("1.000.000");
  });

  it("mengirim string kosong saat blur dengan draft kosong", () => {
    render(<Harness initial="500000" />);
    const input = getInput();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
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
});
