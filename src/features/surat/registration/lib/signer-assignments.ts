import type {
  SignerAssignment,
  UsageDetailRecord,
  UsageStepConfig,
} from "@/components/surat/form/surat-form-types";

const normalizeRoleName = (
  raw: unknown,
  index: number,
  total: number,
): "membuat" | "memeriksa" | "menyetujui" => {
  const value = String(raw ?? "").toLowerCase().trim();
  if (value === "membuat" || value === "memeriksa" || value === "menyetujui") return value;
  if (
    value.includes("setuju") ||
    value.includes("approve") ||
    value.includes("approval") ||
    value.includes("otoris") ||
    value.includes("final")
  ) {
    return "menyetujui";
  }
  if (
    value.includes("periksa") ||
    value.includes("review") ||
    value.includes("verifikasi") ||
    value.includes("cek") ||
    value.includes("paraf")
  ) {
    return "memeriksa";
  }
  if (
    value.includes("buat") ||
    value.includes("draft") ||
    value.includes("pemohon") ||
    value.includes("request")
  ) {
    return "membuat";
  }
  if (index === 0) return "membuat";
  if (index === total - 1) return "menyetujui";
  return "memeriksa";
};

export const buildSignerAssignments = (detail: UsageDetailRecord): SignerAssignment[] => {
  try {
    const config = typeof detail.ttd_config === "string" ? JSON.parse(detail.ttd_config) : detail.ttd_config;
    if (!Array.isArray(config)) return [];
    const total = config.length;

    return config.map((item: UsageStepConfig, index: number) => ({
      role_name: normalizeRoleName(
        item.roleName || item.role_name || item.labelJabatan || item.label_jabatan || item.jabatan,
        index,
        total,
      ),
      label_jabatan: item.labelJabatan || item.label_jabatan || item.jabatan || `Tahap ${index + 1}`,
      user_id: "",
      step_order: index + 1,
      form_usage_step_id: item.form_usage_step_id,
      action_type: item.action_type || "approval",
      candidate_scope: item.candidate_scope || "manual",
      eligible_user_ids: item.eligible_user_ids || [],
      verifier_user_ids: item.verifier_user_ids || [],
      attachment_requirements: detail.form_usage_attachment_requirements?.filter(
        (rule) => rule.stage_order === index + 1,
      ) || [],
      requires_unit_allocation: item.requires_unit_allocation === true || item.requiresUnitAllocation === true,
    }));
  } catch {
    return [];
  }
};
