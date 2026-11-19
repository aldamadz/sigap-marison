import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegistrationSummaryDocument } from "@/components/surat/RegistrationSummaryDialog";
import { buildRegistrationSummaryData } from "@/components/surat/registration-summary-data";

afterEach(cleanup);

const laptop = { nama_barang: "Laptop operasional", recommendation_action: "beli_baru" };
const assetForm = { request_category: "asset", requires_recommendation: false };

describe("recommendation choice in registration details", () => {
  it("omits the Asset choice from a recommendation detail but keeps its item and document badge", () => {
    const data = buildRegistrationSummaryData({
      form_input_data: {
        ...assetForm,
        linked_document_type: "recommendation",
        recommendation_items: [laptop],
      },
      policy_snapshot: { request_category: "asset" },
    });
    render(<RegistrationSummaryDocument data={data} />);
    expect(screen.getByText("Dokumen Rekomendasi")).toBeInTheDocument();
    expect(screen.getByText("Laptop operasional")).toBeInTheDocument();
    expect(screen.queryByText("Perlu Rekomendasi")).not.toBeInTheDocument();
  });

  it.each([
    { data_snapshot: { input: { linked_document_type: "recommendation" } } },
    { location_snapshot: { form: { nomor_form: "fm-uai.hrd-30-00" } } },
  ])("hides a historical choice when a recommendation is identified by its snapshot or form number", (metadata) => {
    const data = buildRegistrationSummaryData({ ...metadata, form_input_data: assetForm });
    expect(data.isRecommendation).toBe(true);
    expect(data.fields).not.toContainEqual(expect.objectContaining({ key: "requires_recommendation" }));
  });

  it.each(["unit", "non_unit", "non_asset", "goods"])("does not show a residual recommendation answer on %s", (category) => {
    const data = buildRegistrationSummaryData({ form_input_data: { ...assetForm, request_category: category } });
    expect(data.fields).not.toContainEqual(expect.objectContaining({ key: "requires_recommendation" }));
  });

  it.each([true, false])("preserves the actual answer %s on an eligible Asset request", (answer) => {
    const data = buildRegistrationSummaryData({
      form_input_data: { ...assetForm, requires_recommendation: answer },
      data_snapshot: { recommendation_decisions: [{ status: "recommended" }] },
    });
    render(<RegistrationSummaryDocument data={data} />);
    expect(screen.getByText("Perlu Rekomendasi")).toBeInTheDocument();
    expect(screen.getByText(answer ? "Ya" : "Tidak", { exact: true })).toBeInTheDocument();
  });

  it("uses the registered usage category to hide an answer copied from an incompatible form", () => {
    const data = buildRegistrationSummaryData({
      form_input_data: assetForm,
      policy_snapshot: { request_category: "non_asset" },
    });
    expect(data.fields).not.toContainEqual(expect.objectContaining({ key: "requires_recommendation" }));
  });
});
