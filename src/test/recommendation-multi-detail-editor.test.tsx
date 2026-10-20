import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecommendationMultiDetail } from "@sigap/shared";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";

vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

const model: RecommendationMultiDetail = {
  version: 1,
  items: [{
    id: "parent-computer",
    order: 0,
    status: "recommended",
    rejection_reason: "",
    applicant_original: { name: "Komputer SPV", quantity: 1, notes: "Operasional" },
    location: "Kantor Pusat",
    pic: "Aldama",
    details: [{
      id: "detail-cpu",
      order: 0,
      action: "purchase_new",
      name: "Komputer SPV",
      quantity: 1,
      description: "Pembelian baru",
      description_manually_edited: false,
      notes: "Spesifikasi baru",
      attachments: [],
      reference_links: [],
    }],
  }],
};

function Harness({
  initialModel = model,
  onUpload = vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onUpload"]>(),
  users = [],
  offices = [],
  departments = [],
}: {
  initialModel?: RecommendationMultiDetail;
  onUpload?: React.ComponentProps<typeof RecommendationMultiDetailEditor>["onUpload"];
  users?: Array<{ id: string; full_name: string; office_id: string; department_id: string }>;
  offices?: Array<{ id: string; name: string; kedudukan: string }>;
  departments?: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(initialModel);
  return (
    <RecommendationMultiDetailEditor
      model={value}
      onChange={setValue}
      users={users}
      offices={offices}
      departments={departments}
      uploadingKey={null}
      onUpload={onUpload}
      onDeleteAttachment={vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onDeleteAttachment"]>()}
      onDeleteDetail={vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onDeleteDetail"]>()}
    />
  );
}

function TwoItemHarness() {
  const [value, setValue] = useState<RecommendationMultiDetail>({
    ...model,
    items: [
      model.items[0],
      {
        ...model.items[0],
        id: "parent-chair",
        order: 1,
        applicant_original: { name: "Kursi Gaming", quantity: 2, notes: "" },
        details: [{ ...model.items[0].details[0], id: "detail-chair", name: "Kursi Gaming", quantity: 2 }],
      },
    ],
  });
  return (
    <>
      <RecommendationMultiDetailEditor
        model={value}
        onChange={setValue}
        users={[]}
        offices={[]}
        departments={[]}
        uploadingKey={null}
        onUpload={vi.fn()}
        onDeleteAttachment={vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onDeleteAttachment"]>()}
        onDeleteDetail={vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onDeleteDetail"]>()}
      />
      <output data-testid="quantities">{value.items.map((item) => item.details[0].quantity).join(",")}</output>
    </>
  );
}

afterEach(() => vi.unstubAllEnvs());

describe("RecommendationMultiDetailEditor", () => {
  it("uses the configured same-origin storage gateway for saved pasted-image previews without changing the model", () => {
    vi.stubEnv("VITE_LEGACY_STORAGE_ORIGINS", "https://old-storage.test");
    const saved = structuredClone(model);
    saved.items[0].details[0].attachments = [{ id: "image-paste", order: 0, source: "paste", storage_path: "https://old-storage.test/storage/v1/object/public/lampiran_surat/drafts/photo.png" }];
    const before = structuredClone(saved);
    render(<Harness initialModel={saved} />);
    expect(screen.getByAltText("Lampiran gambar rekomendasi item 1")).toHaveAttribute("src", "/storage/v1/object/public/lampiran_surat/drafts/photo.png");
    expect(saved).toEqual(before);
  });

  it("accepts clipboard item files when the browser leaves clipboard files empty and does not duplicate them", () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<Harness onUpload={onUpload} />);
    const zone = container.querySelector('input[type="file"]')!.parentElement!;
    expect(zone).toHaveAttribute("tabindex", "0");
    const image = new File(["image"], "clipboard.png", { type: "image/png" });
    const items = [{ kind: "file", type: "image/png", getAsFile: () => image }];
    fireEvent.paste(zone, { clipboardData: { files: [], items } });
    expect(onUpload).toHaveBeenCalledExactlyOnceWith("parent-computer", "detail-cpu", [image], "paste");
    onUpload.mockClear();
    fireEvent.paste(zone, { clipboardData: { files: [image], items } });
    expect(onUpload).toHaveBeenCalledExactlyOnceWith("parent-computer", "detail-cpu", [image], "paste");
  });

  it("orders the responsible person before location and uses accessible section headings", () => {
    render(<Harness />);
    const pic = screen.getByText("PIC *");
    const location = screen.getByText("Lokasi *");
    expect(pic.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Detail Rekomendasi per Item" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Komputer SPV" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Detail rekomendasi" })).toBeInTheDocument();
    expect(screen.getByLabelText("Catatan item *")).toHaveValue("Spesifikasi baru");
    expect(screen.getByText("Hanya untuk item ini.")).toBeInTheDocument();
  });

  it("keeps notes isolated when switching applicant items", () => {
    render(<TwoItemHarness />);
    fireEvent.change(screen.getByLabelText("Catatan item *"), { target: { value: "Catatan komputer" } });
    fireEvent.click(screen.getByRole("button", { name: /Kursi Gaming/ }));
    expect(screen.getByLabelText("Catatan item *")).toHaveValue("Spesifikasi baru");
    fireEvent.click(screen.getByRole("button", { name: /Komputer SPV/ }));
    expect(screen.getByLabelText("Catatan item *")).toHaveValue("Catatan komputer");
  });
  it("splits one applicant item into stable numbered details", () => {
    render(<Harness />);
    expect(screen.getByText("1.1")).toBeInTheDocument();
    expect(screen.queryByText(/Estimasi harga/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tambah detail untuk item 1" }));

    expect(screen.getByText("1.2")).toBeInTheDocument();
    expect(screen.getAllByText("Detail rekomendasi")).toHaveLength(2);
  });

  it("shows rejection reason and hides recommended details when parent is rejected", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Tidak Direkomendasikan" }));

    expect(screen.getByPlaceholderText(/Jelaskan alasan/i)).toBeInTheDocument();
    expect(screen.queryByText("1.1")).not.toBeInTheDocument();
  });

  it("stays rendered when rejection is reversed and another detail is added", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Tidak Direkomendasikan" }));
    expect(screen.getByTestId("recommendation-multi-detail-editor")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Jelaskan alasan/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Direkomendasikan" }));
    expect(screen.getByTestId("recommendation-multi-detail-editor")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tambah detail untuk item 1" }));

    expect(screen.getByTestId("recommendation-multi-detail-editor")).toBeInTheDocument();
    expect(screen.getByText("1.2")).toBeInTheDocument();
  });

  it("passes every selected image in one upload action without blanking the editor", () => {
    const onUpload = vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onUpload"]>().mockResolvedValue(undefined);
    const { container } = render(<Harness onUpload={onUpload} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const files = [
      new File(["front"], "front.png", { type: "image/png" }),
      new File(["back"], "back.jpg", { type: "image/jpeg" }),
    ];

    fireEvent.change(input!, { target: { files } });

    expect(onUpload).toHaveBeenCalledWith("parent-computer", "detail-cpu", files, "upload");
    expect(screen.getByTestId("recommendation-multi-detail-editor")).toBeInTheDocument();
  });

  it("uses department as the head-office recommendation location", () => {
    render(<Harness
      users={[{ id: "user-andreas", full_name: "Andreas Bayu Darmawan", office_id: "office-pusat", department_id: "dept-marketing" }]}
      offices={[{ id: "office-pusat", name: "Kantor Pusat", kedudukan: "Pusat" }]}
      departments={[{ id: "dept-marketing", name: "Marketing" }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Aldama" }));
    fireEvent.click(screen.getByText("Andreas Bayu Darmawan"));

    expect(screen.getByPlaceholderText(/Contoh: Kantor Pusat/i)).toHaveValue("Marketing");
    expect(screen.getByRole("button", { name: "Andreas Bayu Darmawan" })).toBeInTheDocument();
  });

  it("edits quantity only on the visibly active parent item", () => {
    render(<TwoItemHarness />);

    fireEvent.click(screen.getByRole("button", { name: /Komputer SPV/ }));
    fireEvent.change(screen.getByLabelText("Jumlah detail 1.1"), { target: { value: "1" } });
    expect(screen.getByTestId("quantities")).toHaveTextContent("1,2");

    fireEvent.click(screen.getByRole("button", { name: /Kursi Gaming/ }));
    expect(screen.getByText("Item permohonan 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah detail 2.1")).toHaveValue(2);
    expect(screen.getByTestId("quantities")).toHaveTextContent("1,2");
  });
});
