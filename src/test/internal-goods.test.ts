import { expect, it } from "vitest";
import { selectUsage } from "@/features/surat/registration/usages";
import { goodsModule } from "@/features/surat/registration/usages/goods/goods-module";
import { buildAutoTitle } from "@/features/surat/registration/lib/surat-title-formatters";
it("resolves goods as its own category, never as assets, funds or Non Unit construction", () => {
  const selected = selectUsage({ id: "goods-usage", request_category: "goods", form_usage_steps: [] });
  expect(selected?.module).toBe(goodsModule);
  expect(selected?.category).toBe("goods");
  const input = goodsModule.normalizeInput({ fund_type: "marketing_cost", fund_amount: 10, requires_recommendation: true, items: [] }, {} as never);
  expect(input).toMatchObject({ request_category: "goods", is_aset: false });
  expect(input).not.toHaveProperty("fund_type");
  expect(input).not.toHaveProperty("requires_recommendation");
  expect(buildAutoTitle({ category: "goods", formInputData: { items: [{ nama_barang: "Map dan Form" }] } })).toContain("Permintaan Barang dari Stok GA: Map dan Form");
});
