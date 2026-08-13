import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
  onUpload = vi.fn(),
  users = [],
  offices = [],
  departments = [],
}: {
  onUpload?: ReturnType<typeof vi.fn>;
  users?: Array<{ id: string; full_name: string; office_id: string; department_id: string }>;
  offices?: Array<{ id: string; name: string; kedudukan: string }>;
  departments?: Array<{ id: string; name: string }>;
}) {
  const [value, setValue] = useState(model);
  return (
    <RecommendationMultiDetailEditor
      model={value}
      onChange={setValue}
      users={users}
      offices={offices}
      departments={departments}
      uploadingKey={null}
      onUpload={onUpload}
      onDeleteAttachment={vi.fn()}
      onDeleteDetail={vi.fn()}
    />
  );
}

describe("RecommendationMultiDetailEditor", () => {
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
    const onUpload = vi.fn().mockResolvedValue(undefined);
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
});
