/** A: registry fail-closed — tanpa generic/non_unit fallback, tanpa UUID/nama dispatch. */
import { describe, it, expect } from "vitest";
import {
  resolveUsageModuleKey,
  getUsageModule,
  isUsageModuleRegistered,
} from "@/features/surat/registration/usages/usage-registry";
import { UsageConfigurationError } from "@/features/surat/registration/usages/usage-contract";
import { modules } from "@/features/surat/registration/usages";
import { normalizeFormInputData } from "@/services/surat/form-helpers";
import { FORM_USAGES_RAW } from "./surat-form-fixtures";

const base = FORM_USAGES_RAW[0] as unknown as Record<string, unknown>;
const asUsage = (patch: Record<string, unknown>) => ({ ...base, ...patch }) as never;

describe("usage registry fail-closed", () => {
  it("1. key tak terdaftar melempar UsageConfigurationError", () => {
    expect(() => getUsageModule("asset_tak_ada" as never)).toThrow(UsageConfigurationError);
    expect(isUsageModuleRegistered("asset")).toBe(true);
    expect(isUsageModuleRegistered("tak_terdaftar" as never)).toBe(false);
  });

  it("2. kategori kosong → null", () => {
    expect(resolveUsageModuleKey(null)).toBeNull();
    expect(resolveUsageModuleKey(asUsage({ request_category: undefined, request_categories: [] }))).toBeNull();
    expect(resolveUsageModuleKey(asUsage({ request_category: undefined, request_categories: undefined }))).toBeNull();
  });

  it("3. kategori ambigu → null", () => {
    expect(
      resolveUsageModuleKey(asUsage({ request_category: undefined, request_categories: ["asset", "non_unit"] }))
    ).toBeNull();
    expect(
      resolveUsageModuleKey(asUsage({
        request_category: "asset",
        form_usage_steps: [{ action_type: "unit_allocation" }],
      }))
    ).toBeNull();
    expect(resolveUsageModuleKey(asUsage({ request_category: "kegunaan_misterius" }))).toBeNull();
  });

  it("4. tidak ada fallback generic/non_unit", () => {
    expect(modules).toHaveLength(4);
    expect(modules.map(m => m.meta.key).sort()).toEqual(["asset", "non_asset", "non_unit", "unit"]);
    expect(isUsageModuleRegistered("generic" as never)).toBe(false);
    expect(normalizeFormInputData({})).not.toHaveProperty("request_category");
    expect(normalizeFormInputData({ request_mode: "unit" }).request_category).toBe("unit");
    expect(normalizeFormInputData({ is_aset: true }).request_category).toBe("asset");
  });

  it("tidak dispatch berdasarkan UUID/nama/label", () => {
    const a = resolveUsageModuleKey(asUsage({ id: "11111111-1111-4111-8111-111111111111", name: "Nama A" }));
    const b = resolveUsageModuleKey(asUsage({ id: "22222222-2222-4222-8222-222222222222", name: "Nama B" }));
    expect(a).toBe("asset");
    expect(b).toBe("asset");
  });
});
