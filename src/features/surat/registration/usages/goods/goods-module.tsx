import type { UsageModule } from "../usage-contract";
import { registerUsageModule } from "../usage-registry";

export const goodsModule: UsageModule = {
  meta: { key: "goods", category: "goods", label: "Permintaan Barang dari Stok GA", description: "Pemenuhan barang dari stok GA, tanpa pencairan dana" },
  requirements: { requiresProject: false, allowsFundWithoutProject: false, requiresUnitAllocation: false,
    requiresRecommendationChoice: false, allowsLinkedRecommendation: false, requiresMasterProjectMapping: false },
  renderContextPanel: () => null,
  validateNumberContext: () => [],
  cleanup: () => ({ inputKeysToDelete: ["requires_recommendation", "fund_type", "fund_amount", "fund_without_project"], resetSelection: [] }),
  normalizeInput(input) {
    const next: Record<string, unknown> = { ...input, request_category: "goods", request_mode: "barang", is_aset: false };
    delete next.fund_type; delete next.fund_amount; delete next.fund_without_project;
    delete next.requires_recommendation;
    return next;
  },
};
registerUsageModule(goodsModule);
