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
  onUpload = vi.fn<React.ComponentProps<typeof RecommendationMultiDetailEditor>["onUpload"]>(),
  users = [],
  offices = [],
  departments = [],
}: {
  onUpload?: React.ComponentProps<typeof RecommendationMultiDetailEditor>["onUpload"];
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
