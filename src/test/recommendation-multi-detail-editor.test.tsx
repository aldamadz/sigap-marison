import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendationMultiDetail } from "@sigap/shared";
import { RecommendationMultiDetailEditor } from "@/components/surat/RecommendationMultiDetailEditor";

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

function Harness({ onUpload = vi.fn() }: { onUpload?: ReturnType<typeof vi.fn> }) {
  const [value, setValue] = useState(model);
  return (
    <RecommendationMultiDetailEditor
      model={value}
      onChange={setValue}
      users={[]}
      offices={[]}
      departments={[]}
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
});
