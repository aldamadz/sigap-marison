import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NonUnitRequestEditor } from "@/components/surat/NonUnitRequestEditor";

describe("NonUnitRequestEditor", () => {
  it("shows project context, structured fields, and the calculated total", () => {
    render(
      <NonUnitRequestEditor
        rows={[{
          non_unit_id: 12,
          non_unit_name: "Pekerjaan Infrastruktur",
          item_name: "Pembangunan saluran blok A",
          nama_barang: "Pembangunan saluran blok A",
          subtotal: 1_500_000,
          status: "1",
          raw: { id: 12, code: "INFRA", name: "Pekerjaan Infrastruktur" },
        }]}
        options={[]}
        loading={false}
        projectReady
        projectName="Project Seed Sample"
        onChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Project Seed Sample")).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*1\.500\.000/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Nama pekerjaan/)).toHaveValue("Pembangunan saluran blok A");
    expect(screen.getByLabelText(/Nilai pengajuan/)).toHaveValue("1.500.000");
    expect(screen.getByRole("combobox", { name: /Status/ })).toHaveTextContent("1");
  });

  it("explains why a project without Marison mapping cannot load classifications", () => {
    render(
      <NonUnitRequestEditor
        rows={[{}]}
        options={[]}
        loading={false}
        projectReady={false}
        onChange={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Proyek belum terhubung ke Marison")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pilih jenis pekerjaan Non Unit/ })).toBeDisabled();
  });
});
