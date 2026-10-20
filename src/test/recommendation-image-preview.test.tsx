import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flattenRecommendationItems, type RecommendationMultiDetail } from "@sigap/shared";
import { RegistrationSummaryDialog, RegistrationSummaryDocument, type RegistrationSummaryData } from "@/components/surat/RegistrationSummaryDialog";

const model: RecommendationMultiDetail = {
  version: 1,
  items: [{
    id: "parent-1", order: 0, status: "recommended", rejection_reason: "",
    applicant_original: { name: "Komputer", quantity: 1, notes: "Operasional" },
    location: "Magelang", pic: "PIC Uji",
    details: [{
      id: "detail-1", order: 0, action: "purchase_new", name: "Komputer kerja", quantity: 1,
      description: "Pembelian baru", description_manually_edited: false, notes: "Spesifikasi lengkap",
      attachments: [
        { id: "image-1", order: 0, source: "paste", storage_path: "https://old-storage.test/storage/v1/object/public/lampiran_surat/drafts/front.png", caption: "Depan" },
        { id: "image-2", order: 1, source: "upload", storage_path: "/storage/v1/object/public/lampiran_surat/drafts/back.png", caption: "Belakang" },
      ], reference_links: [],
    }],
  }],
};
const summary = (rows: unknown[]): RegistrationSummaryData => ({
  noSurat: "UJI/REK/X/2026", title: "Rekomendasi komputer", category: "asset", usageName: "Rekomendasi",
  formName: "FORM REKOMENDASI", requesterName: "Pemohon Uji", departmentName: "PO", officeName: "Kantor Pusat",
  requestPlace: "Magelang", requestDate: "2026-10-20", isRecommendation: true,
  fields: [{ key: "recommendation_items", label: "Rincian rekomendasi", type: "table", value: rows }],
  attachments: [], signers: [],
});

afterEach(() => vi.unstubAllEnvs());

describe("recommendation confirmation image previews", () => {
  it("shows every canonical multi-detail image in the actual confirmation dialog", () => {
    vi.stubEnv("VITE_LEGACY_STORAGE_ORIGINS", "https://old-storage.test");
    const rows = flattenRecommendationItems(model);
    const before = structuredClone(rows);
    render(<RegistrationSummaryDialog open data={summary(rows)} submitting={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    const images = screen.getAllByRole("img", { name: /Lampiran item rekomendasi/ });
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "/storage/v1/object/public/lampiran_surat/drafts/front.png");
    expect(images[1]).toHaveAttribute("src", "/storage/v1/object/public/lampiran_surat/drafts/back.png");
    expect(screen.getByText("Depan")).toBeInTheDocument();
    expect(screen.getByText("Belakang")).toBeInTheDocument();
    expect(screen.getByText("Komputer kerja")).toBeInTheDocument();
    expect(rows).toEqual(before);
  });

  it("preserves legacy single-image previews and does not remap arbitrary third-party origins", () => {
    render(<RegistrationSummaryDocument data={summary([{ nama_barang: "Monitor", recommendation_attachment: { file_url: "https://vendor.test/monitor.png" } }])} />);
    expect(screen.getByRole("img", { name: "Lampiran item rekomendasi 1" })).toHaveAttribute("src", "https://vendor.test/monitor.png");
  });

  it("supports restored nested attachments and ignores records without a file URL", () => {
    render(<RegistrationSummaryDocument data={summary([{ nama_barang: "Monitor", recommendation_attachment: { attachments: [{ storage_path: "/storage/v1/object/public/lampiran_surat/monitor.png", caption: "Monitor lama" }, {}] } }])} />);
    expect(screen.getAllByRole("img", { name: /Lampiran item rekomendasi/ })).toHaveLength(1);
    expect(screen.getByText("Monitor lama")).toBeInTheDocument();
  });

  it("does not resurrect a removed canonical image from a stale legacy reference", () => {
    render(<RegistrationSummaryDocument data={summary([{ nama_barang: "Monitor", attachments: [], recommendation_attachment: { file_url: "https://vendor.test/deleted.png" } }])} />);
    expect(screen.queryByRole("img", { name: /Lampiran item rekomendasi/ })).not.toBeInTheDocument();
  });

  it("keeps a legacy flat URL when the nested legacy attachment only contains metadata", () => {
    render(<RegistrationSummaryDocument data={summary([{ nama_barang: "Monitor", recommendation_attachment: { file_name: "monitor.png" }, recommendation_attachment_url: "/storage/v1/object/public/lampiran_surat/monitor.png" }])} />);
    expect(screen.getByRole("img", { name: "Lampiran item rekomendasi 1" })).toHaveAttribute("src", "/storage/v1/object/public/lampiran_surat/monitor.png");
  });
});
