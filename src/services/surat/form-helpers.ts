import { parseRupiahInteger, formatRupiah as formatRupiahCanonical } from "@/lib/rupiah";
import { buildProductionCode as buildProductionCodeLib } from "@/lib/production-code";
import { canUseAssetRecommendation } from "@/lib/asset-recommendation-policy";
import { getPgdUnitStatus } from "@/components/surat/pgd-item-status";
import {
  flattenRecommendationItems,
  withoutRecommendationEstimatedPrices,
  type RecommendationMultiDetail,
} from "@sigap/shared";

/**
 * Pure helpers extracted from suratService.
 *
 * These functions have no dependency on the suratService instance
 * (`this`-free) so they can be unit-tested in isolation and reused by
 * either the legacy facade (`suratService.*`) or future call sites.
 *
 * Phase 2 refactor scope: behaviour-preserving extraction only.
 */

export const cleanUuid = (id: any) => {
  if (!id || id === "" || id === "pusat" || id === "undefined" || id === "null") return null;
  return id;
};

export const normalizeRoleName = (
  raw: any,
  stepOrder: number,
  totalSteps: number,
): "membuat" | "memeriksa" | "verifikator" | "menyetujui" => {
  const v = String(raw ?? "").toLowerCase().trim();
  if (v === "membuat" || v === "memeriksa" || v === "verifikator" || v === "menyetujui") return v;
  if (
    v.includes("setuju") ||
    v.includes("approve") ||
    v.includes("approval") ||
    v.includes("otoris") ||
    v.includes("final")
  ) {
    return "menyetujui";
  }
  if (
    v.includes("periksa") ||
    v.includes("review") ||
    v.includes("pemeriksaan") ||
    v.includes("cek") ||
    v.includes("paraf")
  ) {
    return "memeriksa";
  }
  if (
    v.includes("buat") ||
    v.includes("draft") ||
    v.includes("pemohon") ||
    v.includes("request")
  ) {
    return "membuat";
  }
  if (stepOrder === 1) return "membuat";
  if (stepOrder === totalSteps) return "menyetujui";
  return "memeriksa";
};

export const formatDateForDocument = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
};

export const normalizeRecommendationItems = (value: any[]) => {
  if (!Array.isArray(value)) return [];
  const allowedActions = new Set(["service", "ganti", "beli_baru", "tidak_direkomendasikan"]);
  return value
    .filter((row) => Object.values(row ?? {}).some((cellValue) => String(cellValue ?? "").trim()))
    .map((row, index) => {
      const actionRaw = String(row?.recommendation_action || "").trim();
      const fallbackAction = String(row?.service || "").trim()
        ? "service"
        : String(row?.ganti || "").trim()
          ? "ganti"
          : String(row?.beli_baru || "").trim()
            ? "beli_baru"
            : String(row?.tidak_direkomendasikan || "").trim()
              ? "tidak_direkomendasikan"
              : "";
      const action = allowedActions.has(actionRaw) ? actionRaw : fallbackAction;
      const nestedAttachment = row?.recommendation_attachment &&
        typeof row.recommendation_attachment === "object" &&
        !Array.isArray(row.recommendation_attachment)
        ? row.recommendation_attachment
        : null;
      const attachmentSource = nestedAttachment || {
        draft_file_id: row?.recommendation_attachment_draft_file_id,
        file_url: row?.recommendation_attachment_url,
        file_name: row?.recommendation_attachment_file_name,
        file_type: row?.recommendation_attachment_file_type,
        file_size: row?.recommendation_attachment_file_size,
        uploaded_at: row?.recommendation_attachment_uploaded_at,
        source: row?.recommendation_attachment_source,
        attachments: Array.isArray(row?.attachments) ? row.attachments : undefined,
      };
      const hasAttachment = Boolean(String(
        attachmentSource?.draft_file_id || attachmentSource?.file_url || attachmentSource?.file_name || ""
      ).trim()) || (Array.isArray(attachmentSource?.attachments) && attachmentSource.attachments.length > 0);
      const normalized = {
        ...row,
        no: index + 1,
        recommendation_action: action || null,
        is_recommended: action !== "tidak_direkomendasikan",
        nama_barang: String(row?.nama_barang ?? "").trim(),
        no_registrasi: String(row?.no_registrasi ?? "").trim(),
        lokasi_pic: String(row?.lokasi_pic ?? "").trim(),
        kerusakan: String(row?.kerusakan ?? "").trim(),
        service: action === "service" ? "✓" : "",
        ganti: action === "ganti" ? "✓" : "",
        beli_baru: action === "beli_baru" ? "✓" : "",
        tidak_direkomendasikan: action === "tidak_direkomendasikan" ? "✓" : "",
        uraian: String(row?.uraian ?? "").trim(),
        keterangan: String(row?.keterangan ?? "").trim(),
        reference_link: String(row?.reference_link ?? row?.link ?? "").trim(),
        recommendation_attachment: hasAttachment
          ? {
              draft_file_id: String(attachmentSource.draft_file_id || "").trim() || null,
              file_url: String(attachmentSource.file_url || "").trim() || null,
              file_name: String(attachmentSource.file_name || "").trim() || null,
              file_type: attachmentSource.file_type || null,
              file_size: Number(attachmentSource.file_size || 0) || null,
              uploaded_at: String(attachmentSource.uploaded_at || "").trim() || null,
              source: String(attachmentSource.source || "").trim() || null,
              attachments: Array.isArray(attachmentSource.attachments)
                ? attachmentSource.attachments
                : undefined,
            }
          : null,
      };
      delete normalized.recommendation_attachment_draft_file_id;
      delete normalized.recommendation_attachment_url;
      delete normalized.recommendation_attachment_file_name;
      delete normalized.recommendation_attachment_file_type;
      delete normalized.recommendation_attachment_file_size;
      delete normalized.recommendation_attachment_uploaded_at;
      delete normalized.recommendation_attachment_source;
      return normalized;
    });
};

export const normalizeFormInputData = (
  inputData: any,
  context?: { requesterDepartmentCode?: string | null; requesterDepartmentName?: string | null },
) => {
  const normalized = { ...(inputData ?? {}) };
  // Fail closed: kategori kosong/ambigu TIDAK boleh ditebak diam-diam.
  // Kategori wajib diturunkan eksplisit dari resolver Kegunaan
  // (applySelectedUsage). Di sini hanya pulihkan dua sinyal eksplisit:
  // request_mode "unit" → "unit", dan flag legacy is_aset → "asset".
  // Selain itu kategori dibiarkan kosong agar validasi menolak nomor.
  if (!normalized.request_category) {
    if (normalized.request_mode === "unit") {
      normalized.request_category = "unit";
    } else if (normalized.is_aset === true) {
      normalized.request_category = "asset";
    }
  }
  if (normalized.request_category === "unit") {
    normalized.request_mode = "unit";
    const count = Number(normalized.requested_unit_count || 0);
    const unitLabel = Number.isFinite(count) && count > 0 ? count : "";
    normalized.items = [{
      kode: "",
      kode_barang: "",
      nama_barang: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      nama: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      barang: `Permohonan Order Bangun SPK Pembangunan Rumah ${unitLabel} Unit`,
      sat: "Unit",
      satuan: "Unit",
      jumlah: unitLabel,
      status: getPgdUnitStatus(normalized),
      keterangan: "",
    }];
  } else {
    normalized.request_mode = "barang";
    if (normalized.request_category !== "non_unit") {
      delete normalized.requested_project;
    }
    delete normalized.requested_unit_count;
    delete normalized.unit_request_sentence;
    delete normalized.unit_config_snapshot;
    delete normalized.allocated_project;
    delete normalized.allocated_units;
    delete normalized.allocated_unit_count;
  }
  const canUseRecommendation = canUseAssetRecommendation({
    code: context?.requesterDepartmentCode,
    name: context?.requesterDepartmentName,
  });
  if (normalized.request_category === "asset" && canUseRecommendation) {
    normalized.requires_recommendation = normalized.requires_recommendation === true;
    normalized.recommendation_template_name = normalized.recommendation_template_name || "Rekomendasi Peremajaan Alat";
    normalized.recommendation_attachment_note = normalized.recommendation_attachment_note ||
      (normalized.requires_recommendation
        ? "Pemohon membutuhkan lampiran rekomendasi untuk permohonan aset ini."
        : "Pemohon tidak membutuhkan lampiran rekomendasi untuk permohonan aset ini.");
  } else {
    delete normalized.requires_recommendation;
    delete normalized.recommendation_template_name;
    delete normalized.recommendation_attachment_note;
  }
  if (Array.isArray(normalized.items)) {
    normalized.items = normalized.items.filter((row: any) =>
      Object.values(row ?? {}).some((value) => String(value ?? "").trim())
    );
  }
  if (
    normalized.recommendation_multi_detail?.version === 1
    && Array.isArray(normalized.recommendation_multi_detail?.items)
  ) {
    normalized.recommendation_multi_detail = withoutRecommendationEstimatedPrices(
      normalized.recommendation_multi_detail as RecommendationMultiDetail,
    );
    normalized.recommendation_items = flattenRecommendationItems(
      normalized.recommendation_multi_detail as RecommendationMultiDetail,
    );
  } else if (Array.isArray(normalized.recommendation_items)) {
    normalized.recommendation_items = normalizeRecommendationItems(normalized.recommendation_items);
  }
  return normalized;
};

export const getUnitCode = (unit: any) =>
  String(
    unit?.raw?.code ||
    unit?.raw?.unit_code ||
    unit?.raw?.kode ||
    unit?.code ||
    unit?.value ||
    unit?.label ||
    "-"
  ).trim();

export const getUnitType = (unit: any) =>
  String(
    unit?.allocation_detail?.unit_type ||
    unit?.allocation_detail?.type ||
    unit?.allocation_detail?.tipe ||
    unit?.unit_type ||
    unit?.raw?.unit_type ||
    unit?.raw?.type ||
    unit?.raw?.tipe ||
    unit?.raw?.house_type ||
    "-"
  ).trim();

export const parseMoney = (value: any) => parseRupiahInteger(value);

export const formatRupiah = (value: any) => {
  const amount = parseMoney(value);
  if (amount === 0) return "Rp 0";
  return formatRupiahCanonical(amount);
};

export const formatProductionDate = (value: string) => {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const buildProductionCode = (unit: any) => {
  const detail = unit?.allocation_detail || {};
  const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
  const rawDate = String(detail.production_date || detail.kode_produksi_tanggal || "").trim();
  const formattedDate = rawDate
    ? formatProductionDate(rawDate)
    : "";
  return buildProductionCodeLib({
    serial: detail.production_serial || detail.kode_produksi_nomor,
    block,
    date: formattedDate,
  });
};

export const getVerifierIdsFromSnapshot = (snapshot: any): string[] => {
  const rows = Array.isArray(snapshot) ? snapshot : [];
  return [...new Set(rows.map((item: any) => item?.user_id).filter(Boolean))];
};

export const buildDataSnapshot = (
  context: any,
  payload: any,
  signers: any[],
  formInputData: any,
  attachments: any[] = [],
) => {
  const place = String(payload.request_place ?? "").trim();
  const date = formatDateForDocument(payload.request_date);
  const virtualProject = formInputData?.project_is_default === true
    ? {
        id: null,
        code: String(formInputData.project_code || "000").trim() || "000",
        name: String(formInputData.project_name || "Tanpa proyek").trim() || "Tanpa proyek",
        is_default: true,
      }
    : null;
  const snapshotProject = context.project ?? virtualProject;

  return {
    surat: {
      no_surat: payload.no_surat ?? null,
      judul_surat: payload.judul_surat ?? null,
      is_aset: !!payload.is_aset,
      request_place: payload.request_place ?? null,
      request_date: payload.request_date ?? null,
      request_place_date: [place, date].filter(Boolean).join(", "),
      request_category: formInputData?.request_category ?? null,
    },
    requester: {
      id: context.profile?.id ?? context.user?.id,
      full_name: context.profile?.full_name ?? null,
      nik: context.profile?.nik ?? null,
      job_title: context.profile?.job_title ?? null,
      email: context.profile?.email ?? context.user?.email ?? null,
    },
    location: {
      entity: context.entity,
      office: context.office,
      project: snapshotProject,
      department: context.department,
      project_code: snapshotProject?.code ?? null,
      department_code: context.department?.code ?? null,
    },
    form: context.form ? {
      id: context.form.id,
      nama_form: context.form.nama_form,
      nomor_form: context.form.nomor_form,
    } : null,
    input: formInputData,
    detail_barang: formInputData?.items ?? [],
    request_category: formInputData?.request_category ?? null,
    requested_project: formInputData?.requested_project ?? null,
    requested_unit_count: formInputData?.requested_unit_count ?? null,
    allocated_units: formInputData?.allocated_units ?? [],
    allocated_unit_count: formInputData?.allocated_unit_count ?? null,
    catatan: formInputData?.catatan ?? null,
    signers,
    attachments,
  };
};
