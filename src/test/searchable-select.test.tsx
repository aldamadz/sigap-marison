import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "@/components/ui/searchable-select";

const options = [
  { value: "a", label: "SGN - Marison Sragen", keywords: ["KC Solo"] },
  { value: "b", label: "KWS - Kudus", keywords: ["KC Jepara"] },
  { value: "without-project", label: "Tanpa proyek" },
  { value: "disabled", label: "Belum siap", disabled: true },
];
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  return <SearchableSelect label="Proyek" options={options} value={value} onValueChange={setValue}
    disabled={disabled} searchPlaceholder="Cari proyek" />;
}
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("searchable project selection", () => {
  it("filters name/code/office and persists the selected label when reopened", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Proyek" }));
    fireEvent.change(screen.getByPlaceholderText("Cari proyek"), { target: { value: "solo" } });
    await waitFor(() => expect(screen.queryByRole("option", { name: /Kudus/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /Marison Sragen/ }));
    expect(screen.getByRole("combobox", { name: "Proyek" })).toHaveTextContent("SGN - Marison Sragen");
    fireEvent.click(screen.getByRole("combobox", { name: "Proyek" }));
    expect(screen.getByPlaceholderText("Cari proyek")).toHaveValue("");
    expect(screen.getByRole("option", { name: /Kudus/ })).toBeInTheDocument();
  });
  it("supports no-project, an empty result and keyboard selection", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("combobox", { name: "Proyek" }));
    const search = screen.getByPlaceholderText("Cari proyek");
    fireEvent.change(search, { target: { value: "not-present" } });
    await screen.findByText("Tidak ditemukan.");
    fireEvent.change(search, { target: { value: "Tanpa" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Tanpa proyek" })).toBeInTheDocument());
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("combobox", { name: "Proyek" })).toHaveTextContent("Tanpa proyek");
  });
  it("does not permit disabled choices or a locked numbered project", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<SearchableSelect label="Proyek" value="a" options={options} onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Proyek" }));
    fireEvent.click(screen.getByRole("option", { name: "Belum siap" }));
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(<SearchableSelect label="Proyek" value="a" options={options} onValueChange={onValueChange} disabled />);
    expect(screen.getByRole("combobox", { name: "Proyek" })).toBeDisabled();
    expect(screen.queryByPlaceholderText("Cari...")).not.toBeInTheDocument();
  });
});
