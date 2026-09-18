import { resolveUsageModuleKey, getUsageModule } from "./usage-registry";
import { assetModule } from "./asset/asset-module";
import { fundModule } from "./fund/fund-module";
import { unitModule } from "./unit/unit-module";
import { nonUnitModule } from "./non-unit/non-unit-module";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";

// Register all modules (hanya empat kategori canonical; tanpa generic fallback)
export const modules = [assetModule, fundModule, unitModule, nonUnitModule];

export { resolveUsageModuleKey, getUsageModule };

export function selectUsage(usage: UsageDetailRecord | null) {
  if (!usage) return null;
  const key = resolveUsageModuleKey(usage);
  if (!key) return null;

  const module = getUsageModule(key);
  return {
    key,
    module,
    category: module.meta.category
  };
}
