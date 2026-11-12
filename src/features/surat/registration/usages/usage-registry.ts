import type { UsageDetailRecord } from "@/components/surat/form/surat-form-types";
import { UsageConfigurationError } from "./usage-contract";
import type { UsageCategory, UsageModule, UsageModuleKey } from "./usage-contract";

const registry = new Map<UsageModuleKey, UsageModule>();

export function registerUsageModule(module: UsageModule) {
  registry.set(module.meta.key, module);
}

/**
 * Fail-closed: key yang tidak terdaftar melempar UsageConfigurationError.
 * Tidak ada fallback generic, tidak ada tebakan non_unit. Orchestrator
 * wajib menangkapnya pada boundary UI dan memblokir nomor/submit.
 */
export function getUsageModule(key: UsageModuleKey): UsageModule {
  const module = registry.get(key);
  if (!module) {
    throw new UsageConfigurationError(
      `Modul kegunaan "${key}" belum terdaftar. Hubungi administrator.`
    );
  }
  return module;
}

export function isUsageModuleRegistered(key: UsageModuleKey): boolean {
  return registry.has(key);
}

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set([
  "asset",
  "unit",
  "non_asset",
  "non_unit",
  "goods",
]);

function isKnownCategory(value: unknown): value is UsageCategory {
  return typeof value === "string" && KNOWN_CATEGORIES.has(value);
}

/**
 * Capability resolver murni (tanpa migration).
 *
 * TIDAK memakai: UUID usage, nama Form, nama Kegunaan, label tampilan.
 * Hanya membaca konfigurasi canonical:
 * - `request_category` / `request_categories` (kategori workflow),
 * - `scope_type` (dipakai saat filtering, bukan dispatch),
 * - `form_usage_steps[].action_type` (sinyal kapabilitas, mis. unit_allocation),
 * - `recommendation_config`, `external_revision_policy`, `input_schema`
 *   (konfigurasi perilaku modul, bukan penentu kategori).
 *
 * Setiap Kegunaan normal wajib menghasilkan TEPAT SATU kategori canonical.
 * Kosong, ambigu, atau tidak dikenal → null (fail closed). Orchestrator
 * wajib menolak nomor dan menampilkan pesan konfigurasi yang aman.
 */
export function resolveUsageModuleKey(usage: UsageDetailRecord | null): UsageModuleKey | null {
  if (!usage) return null;

  const candidates = new Set<UsageCategory>();

  if (isKnownCategory(usage.request_category)) {
    candidates.add(usage.request_category);
  } else if (usage.request_category != null) {
    // Nilai kategori tak dikenal → tidak boleh ditebak.
    return null;
  }

  if (Array.isArray(usage.request_categories)) {
    for (const category of usage.request_categories) {
      if (isKnownCategory(category)) {
        candidates.add(category);
      } else if (category != null) {
        return null;
      }
    }
  }

  // Sinyal kapabilitas: langkah alokasi unit menandakan kategori "unit".
  // Ini sinyal, bukan override — bila bertentangan dengan kategori workflow
  // (mis. asset + unit_allocation), hasilnya ambigu → fail closed.
  const hasUnitAllocation = (usage.form_usage_steps || []).some(
    step => step?.action_type === "unit_allocation"
  );
  if (hasUnitAllocation) candidates.add("unit");

  if (candidates.size !== 1) return null;

  const [category] = [...candidates];
  // Modul wajib terdaftar; handler tak dikenal → fail closed.
  if (!isUsageModuleRegistered(category)) return null;
  return category;
}
