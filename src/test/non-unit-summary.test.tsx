import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RegistrationSummaryDocument } from "@/components/surat/RegistrationSummaryDialog";

describe("Non Unit registration summary", () => {
  it("renders the structured work table and total instead of generic goods columns", () => {
    render(
      <RegistrationSummaryDocument
        data={{
          noSurat: "001/UAI/KC-PRJ.1.1/VII/2026",
          title: "Permohonan Non Unit : Pembangunan saluran",
          category: "non_unit",
          usageName: "Permohonan Teknik Cabang",
          formName: "FORM PERMINTAAN BARANG & JASA",
          requesterName: "Pemohon Staging",
          departmentName: "Teknik (Cabang)",
          officeName: "KC. Sample",
          projectName: "Project Seed Sample",
          requestPlace: "Sample",
          requestDate: "2026-07-30",
          fields: [{
            key: "items",
            label: "Daftar Pekerjaan Non Unit",
            type: "table",
            value: [{
              non_unit_id: 12,
              non_unit_name: "Pekerjaan Infrastruktur",
              item_name: "Pembangunan saluran blok A",
              nama_barang: "Pembangunan saluran blok A",
              subtotal: 1_500_000,
              planning_notes: "Termasuk material",
              raw: { id: 12, code: "INFRA", name: "Pekerjaan Infrastruktur" },
            }],
          }],
          attachments: [],
          signers: [],
          isRecommendation: false,
        }}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Jenis Pekerjaan" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Nilai Pengajuan" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Satuan" })).not.toBeInTheDocument();
    expect(screen.getByText("Total pengajuan")).toBeInTheDocument();
    expect(screen.getAllByText(/Rp\s*1\.500\.000/).length).toBeGreaterThan(0);
  });
});
