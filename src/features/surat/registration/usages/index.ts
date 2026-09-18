import { resolveUsageModuleKey, getUsageModule } from "./usage-registry";
import { assetModule } from "./asset/asset-module";
import { fundModule } from "./fund/fund-module";
import { unitModule } from "./unit/unit-module";
import { nonUnitModule } from "./non-unit/non-unit-module";
import { genericModule } from "./generic/generic-module";
import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";

// Register all modules
export const modules = [assetModule, fundModule, unitModule, nonUnitModule, genericModule];

export { resolveUsageModuleKey, getUsageModule };

export function selectUsage(usage: UsageDetailRecord | null) {
  if (!usage) return null;
  const key = resolveUsageModuleKey(usage);
  if (!key) return null;
  
  return {
    key,
    module: getUsageModule(key),
    category: getUsageModule(key).meta.category
  };
}
