import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseRupiahInteger, formatRupiah as formatRupiahCanonical } from "@/lib/rupiah";
import { buildProductionCode } from "@/lib/production-code";
import { validateInitialRegistrationAttachments } from "@/lib/registration-attachment-validation";
import {
  buildRegistrationAttachmentRows,
  classifyRegistrationDraftAttachments,
  formatCreateRegistrasiError,
} from "@/lib/registration-draft-attachment-classification";
import { documentPreviewService } from "./document-preview.service";
import { appStorageService } from "./storage.service";
import {
  buildDynamicSignatureLayout,
  normalizeSignatureLayoutConfig,
  type SignaturePosition,
} from "./signature-layout.service";
import {
  normalizeGoodsServicesWorksheet,
  resolveTableHorizontalAlignment,
} from "../../document-layout-rules.mjs";

type TableInputColumn = {
  key: string;
  label: string;
  column: string;
  required?: boolean;
  type?: "text" | "number" | "date" | "select";
  options?: Array<{ label?: string; value: string | number } | string | number>;
  helper_text?: string;
};

type TemplateInputField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "currency" | "table" | "external_select";
  required?: boolean;
  cell?: string;
  sheet?: number;
  defaultSource?: string;
  default_source?: string;
  merge_range?: string;
  mergeRange?: string;
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "middle" | "bottom";
  wrap?: boolean;
  shrink?: boolean;
  font_name?: string;
  fontName?: string;
  font_size?: number;
  fontSize?: number;
  row_height?: number;
  rowHeight?: number;
  prefix?: string;
  suffix?: string;
  table_config?: {
    start_row: number;
    end_row: number;
    no_column?: string;
    columns: TableInputColumn[];
  };
  tableConfig?: {
    startRow: number;
    endRow: number;
    noColumn?: string;
    columns: TableInputColumn[];
  };
};

const formatSignatureStampDateTime = (value?: string | null) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date).replace(".", ":");
};

export interface SuratRegistrasi {
  id: string;
  no_surat: string | null;
  judul_surat: string;
  file_path: string | null;
  status: string;
  current_step: number;
  created_at: string;
  updated_at: string;
  entity_id?: string;
  office_id?: string;
  project_id?: string;
  dept_id?: string;
  letter_type_id?: string;
  penggunaan_id?: string;
  form_usage_id?: string;
  surat_signatures?: Array<{
    id: string;
    role_name: string;
    step_order: number;
    is_signed: boolean;
    signed_at: string | null;
    profiles?: { full_name: string };
  }>;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    stage?: string | null;
    requirement_key?: string | null;
    requirement_label?: string | null;
    signature_id?: string | null;
  }>;
}

export interface SuratRegistrationDraft {
  id: string;
  reservation_id: string;
  created_by: string;
  no_surat: string;
  status: "DRAFT" | "SUBMITTED" | "VOID" | "EXPIRED";
  payload: Record<string, any>;
  signer_assignments: any[];
  current_section: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  surat_registration_draft_files?: SuratRegistrationDraftFile[];
}

export interface RecommendationTask {
  id: string;
  parent_surat_id: string;
  submitted_surat_id: string | null;
  no_surat: string;
  status: "waiting" | "claimed" | "revision_requested" | "submitted" | "cancelled";
  required_before_step: number;
  claimed_by: string | null;
  claimed_by_name: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
  candidate_snapshot: Array<{ user_id?: string; full_name?: string; job_title?: string }> | unknown;
  draft_id: string | null;
  parent_no_surat: string | null;
  parent_judul_surat: string | null;
  parent_status: string | null;
  parent_created_at: string | null;
  parent_requester_name: string | null;
}

export interface RecommendationParentSummary {
  task_id: string;
  parent_surat_id: string;
  no_surat: string | null;
  judul_surat: string | null;
  requester_name: string | null;
  requester_job_title: string | null;
  department_name: string | null;
  department_code: string | null;
  office_name: string | null;
  office_kedudukan: string | null;
  project_name: string | null;
  request_place: string | null;
  request_date: string | null;
  request_category: string | null;
  form_input_data: Record<string, unknown>;
  attachments: Array<{
    id: string;
    file_name: string | null;
    file_type: string | null;
    file_size: number | null;
    requirement_label: string | null;
  }>;
}

export interface LinkedSuratDocument {
  id: string;
  parent_surat_id: string;
  child_surat_id: string;
  link_type: "recommendation";
  status: "active" | "cancelled";
  required_before_step: number | null;
  created_at: string;
  child_no_surat: string | null;
  child_judul_surat: string | null;
  child_status: string | null;
  child_current_step: number | null;
  child_file_path: string | null;
  child_pdf_path: string | null;
  child_created_at: string | null;
  child_created_by: string | null;
}

export interface SuratRegistrationDraftFile {
  id: string;
  draft_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  requirement_key: string | null;
  requirement_label: string | null;
  created_at: string;
}

export interface RegistrationDraftUploadProgress {
  phase: "uploading" | "saving";
  fileName: string;
  fileIndex: number;
  fileCount: number;
  loaded: number;
  total: number;
  percent: number;
}

export const suratService = {
  getUnitConfigFromForm(form: any) {
    const raw = form?.unit_config;
    const parsed = typeof raw === "string" ? (() => {
      try { return JSON.parse(raw || "{}"); } catch { return {}; }
    })() : (raw || {});
    return {
      request_sentence_cell: String(parsed.request_sentence_cell || "C11").trim().toUpperCase(),
    };
  },

  async sendNotification(userIds: string[], title: string, message: string, link?: string, meta: Record<string, any> = {}) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession({ force: true });
      if (!session?.access_token) return;
      const response = await fetch("/api/notifications/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_ids: ids, title, message, link, ...meta }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Gagal mengirim notifikasi.");
      }
    } catch (error) {
      console.error("Notification error:", error);
    }
  },

  getVerifierIdsFromSnapshot(snapshot: any): string[] {
    const rows = Array.isArray(snapshot) ? snapshot : [];
    return [...new Set(rows.map((item: any) => item?.user_id).filter(Boolean))];
  },

  async notifyInboxStepTasks(
    suratId: string,
    stepOrder: number,
    judulSurat: string,
    eventType: string
  ) {
    const { data: signatures, error } = await supabase
      .from("surat_signatures")
      .select("id, user_id, verification_required, verification_status, verifier_snapshot")
      .eq("surat_id", suratId)
      .eq("step_order", stepOrder)
      .eq("is_signed", false);

    if (error) {
      console.error("Failed to load inbox notification targets:", error);
      return;
    }

    for (const signature of signatures || []) {
      const verifierIds = signature.verification_required && signature.verification_status !== "verified"
        ? this.getVerifierIdsFromSnapshot(signature.verifier_snapshot)
        : [];
      const targetIds = verifierIds.length > 0 ? verifierIds : [signature.user_id].filter(Boolean);
      if (targetIds.length === 0) continue;

      const isVerification = verifierIds.length > 0;
      const title = isVerification ? "Pemeriksaan Data Diperlukan" : "Surat Masuk Baru";
      const message = isVerification
        ? `Surat "${judulSurat}" perlu diperiksa sebelum ditandatangani`
        : `Surat "${judulSurat}" memerlukan tindakan Anda`;
      const link = `/surat/inbox?task=${signature.id}`;

      this.sendNotification(
        targetIds,
        title,
        message,
        link,
        { surat_id: suratId, signature_id: signature.id, event_type: eventType }
      );
    }
  },

  cleanUuid(id: any) {
    if (!id || id === "" || id === "pusat" || id === "undefined" || id === "null") return null;
    return id;
  },

  normalizeRoleName(raw: any, stepOrder: number, totalSteps: number): "membuat" | "memeriksa" | "menyetujui" {
    const v = String(raw ?? "").toLowerCase().trim();
    if (v === "membuat" || v === "memeriksa" || v === "menyetujui") return v as any;
    if (v.includes("setuju") || v.includes("approve") || v.includes("approval") || v.includes("otoris") || v.includes("final")) return "menyetujui";
    if (v.includes("periksa") || v.includes("review") || v.includes("pemeriksaan") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
    if (v.includes("buat") || v.includes("draft") || v.includes("pemohon") || v.includes("request")) return "membuat";
    if (stepOrder === 1) return "membuat";
    if (stepOrder === totalSteps) return "menyetujui";
    return "memeriksa";
  },

  getRelativePath(url: string): string {
    if (!url) return "";
    const parts = url.split("/dokumen_surat/");
    const path = parts.length < 2 ? url : parts[1];
    return decodeURIComponent(path.split("?")[0]);
  },

  async downloadStorageFile(pathOrUrl: string, bucket = "dokumen_surat") {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const response = await fetch(pathOrUrl);
      if (!response.ok) throw new Error("Gagal download file.");
      return response.blob();
    }
    const relativePath = this.getRelativePath(pathOrUrl);
    const { data, error } = await supabase.storage.from(bucket).download(relativePath);
    if (error || !data) throw new Error(error?.message || "Gagal download file.");
    return data;
  },

  resolveStampPositions(usageDetail: any, roleName: string, stepOrder: number): any[] {
    try {
      const config = typeof usageDetail.ttd_config === "string"
        ? JSON.parse(usageDetail.ttd_config) : usageDetail.ttd_config;
      if (!Array.isArray(config)) return [];
      const matched = config.filter((_item: any, index: number) => (index + 1) === Number(stepOrder));
      console.log(`Stamp Match Found for Step ${stepOrder}:`, matched);
      return matched;
    } catch (e) {
      console.error("Error parsing ttd_config:", e);
      return [];
    }
  },

  parseInputSchema(schema: any): TemplateInputField[] {
    if (!schema) return [];
    if (Array.isArray(schema)) return schema;
    if (typeof schema === "string") {
      try {
        const parsed = JSON.parse(schema || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  },

  formatDateForDocument(value: string | Date | null | undefined): string {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  },

  formatInputValue(value: any, type?: string): any {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) {
      return value.map((item) => this.formatInputValue(item, type)).filter(Boolean).join(", ");
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      return value.label ?? value.name ?? value.code ?? value.value ?? "";
    }
    if (type === "date") return this.formatDateForDocument(value);
    if (type === "currency") {
      const n = Number(value);
      if (Number.isNaN(n)) return value;
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
    }
    return value;
  },

  getTableConfig(field: TemplateInputField) {
    const raw = field.table_config || field.tableConfig;
    if (!raw) return null;
    return {
      startRow: Number((raw as any).start_row || (raw as any).startRow || 1),
      endRow: Number((raw as any).end_row || (raw as any).endRow || 1),
      noColumn: (raw as any).no_column || (raw as any).noColumn || "A",
      columns: Array.isArray((raw as any).columns) ? (raw as any).columns : [],
    };
  },

  normalizeRecommendationItems(value: any[]) {
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
  },

  normalizeFormInputData(inputData: any, context?: { requesterDepartmentCode?: string | null; requesterDepartmentName?: string | null }) {
    const normalized = { ...(inputData ?? {}) };
    if (!normalized.request_category) {
      normalized.request_category = normalized.request_mode === "unit"
        ? "unit"
        : normalized.is_aset === true
          ? "asset"
          : "non_unit";
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
        status: "2",
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
    const requesterDepartmentCode = String(context?.requesterDepartmentCode || "").trim().toUpperCase();
    const requesterDepartmentName = String(context?.requesterDepartmentName || "").trim().toLowerCase();
    const canUseRecommendation = requesterDepartmentCode === "PBO" ||
      requesterDepartmentName === "pengembangan organisasi" ||
      requesterDepartmentName === "po";
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
    if (Array.isArray(normalized.recommendation_items)) {
      normalized.recommendation_items = this.normalizeRecommendationItems(normalized.recommendation_items);
    }
    return normalized;
  },

  isUnitTemplateField(field: TemplateInputField) {
    return [
      "unit",
      "requested_project",
      "requested_unit_count",
      "unit_request_sentence",
      "unit_config_snapshot",
      "allocated_project",
      "allocated_units",
      "allocated_unit_count",
    ].includes(field.key);
  },

  getUnitCode(unit: any) {
    return String(
      unit?.raw?.code ||
      unit?.raw?.unit_code ||
      unit?.raw?.kode ||
      unit?.code ||
      unit?.value ||
      unit?.label ||
      "-"
    ).trim();
  },

  getUnitType(unit: any) {
    return String(
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
  },

  parseMoney(value: any) {
    return parseRupiahInteger(value);
  },

  formatRupiah(value: any) {
    const amount = this.parseMoney(value);
    if (amount === 0) return "Rp 0";
    return formatRupiahCanonical(amount);
  },

  buildProductionCode(unit: any) {
    const detail = unit?.allocation_detail || {};
    const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
    const rawDate = String(detail.production_date || detail.kode_produksi_tanggal || "").trim();
    const formattedDate = rawDate
      ? this.formatProductionDate(rawDate)
      : "";
    return buildProductionCode({
      serial: detail.production_serial || detail.kode_produksi_nomor,
      block,
      date: formattedDate,
    });
  },

  formatProductionDate(value: string) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
  },

  async ensureUnitAllocationPersisted(suratId: string, formInputData: any) {
    if (!Array.isArray(formInputData?.allocated_units) || formInputData.allocated_units.length === 0) return;

    const { data: current } = await supabase
      .from("surat_registrasi")
      .select("data_snapshot")
      .eq("id", suratId)
      .maybeSingle();

    const { data: attachments } = await supabase
      .from("surat_attachments")
      .select("*")
      .eq("surat_id", suratId)
      .order("created_at", { ascending: true });

    const { error } = await supabase
      .from("surat_registrasi")
      .update({
        form_input_data: formInputData,
        data_snapshot: {
          ...(current?.data_snapshot || {}),
          input: formInputData,
          requested_project: formInputData?.requested_project ?? null,
          allocated_project: formInputData?.allocated_project ?? null,
          requested_unit_count: formInputData?.requested_unit_count ?? null,
          allocated_units: formInputData?.allocated_units ?? [],
          allocated_unit_count: formInputData?.allocated_unit_count ?? null,
          attachments: attachments || current?.data_snapshot?.attachments || [],
        },
      })
      .eq("id", suratId);

    if (error) throw error;
  },

  createUnitRecapAttachment(project: any, units: any[]) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15;
    let totalAtas = 0;
    let totalBawah = 0;
    const body = units.map((unit, index) => {
      const atas = this.parseMoney(unit?.allocation_detail?.struktur_atas);
      const bawah = this.parseMoney(unit?.allocation_detail?.struktur_bawah);
      totalAtas += atas;
      totalBawah += bawah;
      return [
        String(index + 1),
        this.getUnitCode(unit),
        this.getUnitType(unit),
        this.formatRupiah(atas),
        this.formatRupiah(bawah),
        this.formatRupiah(atas + bawah),
      ];
    });

    const totalNominal = totalAtas + totalBawah;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("REKAP ADENDUM UNIT", margin, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Proyek: ${project?.name || project?.label || "-"}`, margin, 24);
    doc.text(`Cabang: ${project?.branch?.name || "-"}`, margin, 29);

    autoTable(doc, {
      startY: 36,
      margin: { left: margin, right: margin },
      head: [["No", "Kavling", "Tipe", "Struktur Atas", "Struktur Bawah", "Nominal"]],
      body,
      foot: [["TOTAL", "", "", this.formatRupiah(totalAtas), this.formatRupiah(totalBawah), this.formatRupiah(totalNominal)]],
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
      },
      footStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 13, halign: "center" },
        1: { cellWidth: 28, halign: "center" },
        2: { cellWidth: 28 },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index === 0) {
          data.cell.colSpan = 3;
          data.cell.styles.halign = "center";
        }
        if (data.section === "foot" && data.column.index === 1) {
          data.cell.text = [];
        }
        if (data.section === "foot" && data.column.index === 2) {
          data.cell.text = [];
        }
      },
    });

    const safeProject = String(project?.code || project?.name || "unit").replace(/[^\w.-]+/g, "_");
    return new File(
      [doc.output("blob")],
      `Rekap_Adendum_Unit_${safeProject}_${Date.now()}.pdf`,
      { type: "application/pdf" }
    );
  },

  createProductionCodeAttachment(project: any, units: any[]) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const margin = 15;
    const body = units.map((unit, index) => [
      String(index + 1),
      project?.name || project?.label || "-",
      this.getUnitCode(unit),
      this.getUnitType(unit),
      this.buildProductionCode(unit) || "-",
    ]);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("KODE PRODUKSI UNIT", margin, 17);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Proyek: ${project?.name || project?.label || "-"}`, margin, 24);

    autoTable(doc, {
      startY: 35,
      margin: { left: margin, right: margin },
      head: [["No", "Proyek", "Unit", "Tipe", "Kode Produksi"]],
      body,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 9,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.15,
        cellPadding: 2,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 13, halign: "center" },
        1: { cellWidth: 42 },
        2: { cellWidth: 24, halign: "center" },
        3: { cellWidth: 27 },
        4: { cellWidth: 74 },
      },
    });

    const safeProject = String(project?.code || project?.name || "unit").replace(/[^\w.-]+/g, "_");
    return new File(
      [doc.output("blob")],
      `Kode_Produksi_Unit_${safeProject}_${Date.now()}.pdf`,
      { type: "application/pdf" }
    );
  },

  async getSignerSnapshots(signers: any[]) {
    const userIds = signers.map((s) => s.user_id).filter(Boolean);
    if (userIds.length === 0) return {};

    const [{ data }, { data: overrides }] = await Promise.all([
      supabase
      .from("profiles")
      .select("id, full_name, nik, job_title, email, department_id, office_id")
        .in("id", userIds),
      supabase
        .from("job_title_display_overrides")
        .select("source_job_title, display_label")
        .eq("is_active", true),
    ]);

    const overrideMap = new Map(
      (overrides || []).map((row: any) => [
        String(row.source_job_title || "").toLowerCase().trim(),
        String(row.display_label || "").trim(),
      ])
    );

    return Object.fromEntries((data || []).map((profile: any) => {
      const jobTitle = String(profile.job_title || "").trim();
      return [profile.id, {
        ...profile,
        job_title_display: overrideMap.get(jobTitle.toLowerCase()) || jobTitle,
      }];
    }));
  },

  buildDataSnapshot(context: any, payload: any, signers: any[], formInputData: any, attachments: any[] = []) {
    const place = String(payload.request_place ?? "").trim();
    const date = this.formatDateForDocument(payload.request_date);
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
  },

  applyGeneratedCellPadding(cell: ExcelJS.Cell, options: { horizontal?: "left" | "center" | "right"; vertical?: "top" | "middle" | "bottom"; wrap?: boolean } = {}) {
    const horizontal = options.horizontal || (cell.alignment?.horizontal as "left" | "center" | "right" | undefined) || "left";
    cell.alignment = {
      ...(cell.alignment || {}),
      horizontal,
      vertical: options.vertical || (cell.alignment?.vertical as "top" | "middle" | "bottom" | undefined) || "middle",
      wrapText: options.wrap ?? cell.alignment?.wrapText ?? true,
      shrinkToFit: cell.alignment?.shrinkToFit ?? false,
      ...(horizontal === "left" ? { indent: Math.max(Number(cell.alignment?.indent || 0), 1) } : {}),
    };
  },

  normalizeRecommendationTemplate(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet) {
    // Excel "Place in Cell" images are stored as a #VALUE! fallback that LibreOffice
    // cannot render. Replace that fallback with the embedded PNG as a normal image.
    worksheet.getCell("A1").value = null;
    if (worksheet.getImages().length > 0) return;

    const workbookMedia = (workbook as ExcelJS.Workbook & { media: ExcelJS.Media[] }).media || [];
    const embeddedLogo = workbookMedia.find((media) =>
      media.type === "image" && media.extension.toLowerCase() === "png" && media.buffer
    );
    if (!embeddedLogo) return;

    const imageId = workbook.addImage({
      buffer: embeddedLogo.buffer,
      extension: "png",
    });
    worksheet.addImage(imageId, {
      tl: { col: 0.1, row: 0.12 },
      ext: { width: 170, height: 60 },
      editAs: "oneCell",
    });
  },

  writeTableField(workbook: ExcelJS.Workbook, field: TemplateInputField, value: any[]) {
    const config = this.getTableConfig(field);
    if (!config) return;

    const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
    const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
    const rows = Array.isArray(value)
      ? value.filter((row) => Object.values(row ?? {}).some((cellValue) => String(cellValue ?? "").trim()))
      : [];
    const maxRows = Math.max(config.endRow - config.startRow + 1, 0);

    for (let index = 0; index < maxRows; index += 1) {
      const excelRow = config.startRow + index;
      if (config.noColumn) {
        sheet.getCell(`${config.noColumn}${excelRow}`).value = null;
      }
      config.columns.forEach((column: TableInputColumn) => {
        sheet.getCell(`${column.column}${excelRow}`).value = null;
      });
    }

    rows.slice(0, maxRows).forEach((row, index) => {
      const excelRow = config.startRow + index;
      if (config.noColumn) {
        const noCell = sheet.getCell(`${config.noColumn}${excelRow}`);
        noCell.value = index + 1;
        this.applyGeneratedCellPadding(noCell, { horizontal: "center", vertical: "middle", wrap: true });
      }
      config.columns.forEach((column: TableInputColumn) => {
        const rawValue = row?.[column.key];
        const cell = sheet.getCell(`${column.column}${excelRow}`);
        cell.value = this.formatInputValue(rawValue, column.type);
        this.applyGeneratedCellPadding(cell, {
          horizontal: resolveTableHorizontalAlignment(column.key, column.type),
          vertical: "middle",
          wrap: true,
        });
      });
      const rowRef = sheet.getRow(excelRow);
      rowRef.height = Math.max(Number(rowRef.height || 0), 28);
    });
  },

  fitTextForBox(value: any, maxCharsPerLine = 115, maxLines = 5) {
    const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const chunks = word.length > maxCharsPerLine
        ? word.match(new RegExp(`.{1,${maxCharsPerLine}}`, "g")) || [word]
        : [word];

      for (const chunk of chunks) {
        const next = current ? `${current} ${chunk}` : chunk;
        if (next.length > maxCharsPerLine) {
          if (current) lines.push(current);
          current = chunk;
        } else {
          current = next;
        }

        if (lines.length >= maxLines) break;
      }

      if (lines.length >= maxLines) break;
    }

    if (current && lines.length < maxLines) lines.push(current);
    const original = String(value ?? "").trim();
    let fitted = lines.slice(0, maxLines).join("\n");
    if (fitted.length < original.length && fitted) {
      fitted = `${fitted.slice(0, Math.max(fitted.length - 3, 0))}...`;
    }
    return fitted;
  },

  getTopLeftCell(range: string, fallback: string) {
    return String(range || fallback || "").split(":")[0].trim().toUpperCase();
  },

  getRowsForField(field: TemplateInputField, range: string) {
    const source = range || field.cell || "";
    const rowNumbers = String(source).match(/\d+/g)?.map(Number).filter(Boolean) || [];
    if (rowNumbers.length >= 2) {
      const start = Math.min(rowNumbers[0], rowNumbers[1]);
      const end = Math.max(rowNumbers[0], rowNumbers[1]);
      return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
    }
    return rowNumbers.length === 1 ? [rowNumbers[0]] : [];
  },

  applyFieldFormatting(sheet: ExcelJS.Worksheet, field: TemplateInputField, target: ExcelJS.Cell, range: string) {
    const fontName = field.font_name || field.fontName;
    const fontSize = Number(field.font_size || field.fontSize || 0);
    if (fontName || fontSize > 0) {
      target.font = {
        ...(target.font || {}),
        ...(fontName ? { name: fontName } : {}),
        ...(fontSize > 0 ? { size: fontSize } : {}),
      };
    }

    const source = String(field.default_source || field.defaultSource || "").trim().toLowerCase();
    const isPlaceDateField = field.key === "request_place_date" || source === "request_place_date";
    const horizontal = isPlaceDateField
      ? "left"
      : field.horizontal || (field.type === "number" || field.type === "currency" ? "right" : "left");
    const shouldWrap = field.wrap === true || field.type === "textarea" || isPlaceDateField;
    const shouldShrink = field.shrink === true;
    if (horizontal || field.vertical || shouldWrap || shouldShrink) {
      target.alignment = {
        ...(target.alignment || {}),
        horizontal,
        ...(field.vertical ? { vertical: field.vertical } : {}),
        ...(shouldWrap ? { wrapText: true } : {}),
        ...(shouldShrink ? { shrinkToFit: true } : {}),
      };
    }
    this.applyGeneratedCellPadding(target, {
      horizontal,
      vertical: field.vertical || (field.type === "textarea" ? "top" : "middle"),
      wrap: isPlaceDateField ? true : field.wrap !== false,
    });

    const rowHeight = Number(field.row_height || field.rowHeight || 0);
    if (rowHeight > 0) {
      this.getRowsForField(field, range).forEach((rowNumber) => {
        sheet.getRow(rowNumber).height = rowHeight;
      });
    }
  },

  writeWrappedField(sheet: ExcelJS.Worksheet, field: TemplateInputField, value: any) {
    const formatted = this.formatInputValue(value, field.type);
    const baseText = String(formatted ?? "");
    const text = baseText
      ? `${field.prefix || ""}${baseText}${field.suffix || ""}`
      : "";
    const configuredRange = String(field.merge_range || field.mergeRange || "").trim().toUpperCase();
    const mergeRange = configuredRange;
    const cellAddress = this.getTopLeftCell(mergeRange, field.cell || "");
    if (!cellAddress) return;

    if (field.key === "catatan") {
      const [configuredStartAddress, configuredEndAddress] = mergeRange.split(":");
      const configuredStart = configuredStartAddress ? sheet.getCell(configuredStartAddress) : null;
      const configuredEnd = configuredEndAddress ? sheet.getCell(configuredEndAddress) : configuredStart;
      const rowWiseMerges = configuredStart && configuredEnd
        ? ((sheet.model as { merges?: string[] }).merges || [])
            .map((rangeValue) => {
              const [startAddress, endAddress] = rangeValue.split(":");
              const start = sheet.getCell(startAddress);
              const end = sheet.getCell(endAddress || startAddress);
              return { rangeValue, start, end };
            })
            .filter(({ start, end }) =>
              start.row === end.row &&
              start.col === configuredStart.col &&
              end.col === configuredEnd.col &&
              Number(start.row) >= Number(configuredStart.row) &&
              Number(end.row) <= Number(configuredEnd.row)
            )
            .sort((left, right) => Number(left.start.row) - Number(right.start.row))
        : [];
      const hasCompleteRowWiseMerges = Boolean(
        configuredStart &&
        configuredEnd &&
        rowWiseMerges.length === Number(configuredEnd.row) - Number(configuredStart.row) + 1
      );

      if (hasCompleteRowWiseMerges) {
        const lines = this.fitTextForBox(text, 115, rowWiseMerges.length).split("\n");
        rowWiseMerges.forEach(({ start }, index) => {
          start.value = lines[index] || null;
          start.font = {
            ...(start.font || {}),
            name: field.font_name || field.fontName || "Arial",
            size: Number(field.font_size || field.fontSize || 11),
          };
          start.alignment = {
            ...(start.alignment || {}),
            wrapText: false,
            shrinkToFit: false,
            vertical: "middle",
            horizontal: field.horizontal || "left",
            indent: Math.max(Number(start.alignment?.indent || 0), 1),
          };
          const rowHeight = Number(field.row_height || field.rowHeight || 15);
          sheet.getRow(Number(start.row)).height = rowHeight;
        });
        return;
      }

      if (mergeRange) {
        const [startAddress, endAddress] = mergeRange.split(":");
        const startCell = sheet.getCell(startAddress);
        const endCell = sheet.getCell(endAddress || startAddress);
        for (let row = startCell.row; row <= endCell.row; row += 1) {
          for (let col = startCell.col; col <= endCell.col; col += 1) {
            const cell = sheet.getCell(row, col);
            if (cell.isMerged) {
              try {
                sheet.unMergeCells(cell.master.address);
              } catch {
                // Some templates merge the note area row by row. Ignore already-unmerged cells.
              }
            }
          }
        }
        sheet.mergeCells(mergeRange);
      }
      const target = sheet.getCell(cellAddress);
      target.value = this.fitTextForBox(text, 115, 4);
      target.font = { ...(target.font || {}), name: field.font_name || field.fontName || "Arial", size: Number(field.font_size || field.fontSize || 11) };
      target.border = {
        ...(target.border || {}),
        top: target.border?.top || { style: "thin", color: { argb: "FF000000" } },
        left: target.border?.left || { style: "thin", color: { argb: "FF000000" } },
        right: target.border?.right || { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
      };
      target.alignment = {
        ...(target.alignment || {}),
        wrapText: field.wrap !== false,
        shrinkToFit: field.shrink !== false,
        vertical: field.vertical || "top",
        horizontal: field.horizontal || "left",
        indent: Math.max(Number(target.alignment?.indent || 0), 1),
      };
      const rowHeight = Number(field.row_height || field.rowHeight || 15);
      this.getRowsForField(field, mergeRange).forEach((rowNumber) => {
        sheet.getRow(rowNumber).height = rowHeight;
      });
      return;
    }

    if (mergeRange && !sheet.getCell(cellAddress).isMerged) {
      sheet.mergeCells(mergeRange);
    }

    const cell = sheet.getCell(cellAddress);
    cell.value = text;
    this.applyFieldFormatting(sheet, field, cell, mergeRange);
    if (field.type === "textarea") {
      cell.alignment = { ...(cell.alignment || {}), wrapText: true, vertical: "top" };
      const rowNumber = Number(String(cellAddress).match(/\d+/)?.[0] || 0);
      if (rowNumber > 0 && !field.row_height && !field.rowHeight) sheet.getRow(rowNumber).height = Math.max(sheet.getRow(rowNumber).height || 15, 45);
    }
  },

  getSystemFieldValue(source: string, context: any) {
    switch (source) {
      case "requester_name": return context.profile?.full_name ?? "";
      case "requester_nik": return context.profile?.nik ?? "";
      case "requester_job_title": return context.profile?.job_title ?? "";
      case "department_name": return context.department?.name ?? "";
      case "office_name": return context.office?.name ?? "";
      case "project_name": return context.project?.name ?? context.payload?.form_input_data?.project_name ?? "";
      case "entity_name": return context.entity?.name ?? "";
      case "letter_number": return context.payload?.no_surat ?? "";
      case "letter_title": return context.payload?.judul_surat ?? "";
      case "request_place": return context.payload?.request_place ?? "";
      case "request_date": return this.formatDateForDocument(context.payload?.request_date);
      case "request_place_date": {
        const place = String(context.payload?.request_place ?? "").trim();
        const date = this.formatDateForDocument(context.payload?.request_date);
        return [place, date].filter(Boolean).join(", ");
      }
      default: return undefined;
    }
  },

  hasPlaceDateMapping(schema: TemplateInputField[]) {
    const mappedSources = new Set(
      schema
        .filter((field) => !!String(field.cell || field.merge_range || field.mergeRange || "").trim())
        .map((field) => field.default_source || field.defaultSource || "manual")
    );
    return mappedSources.has("request_place_date") ||
      (mappedSources.has("request_place") && mappedSources.has("request_date"));
  },

  async getTemplateContext(payload: any) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!user) throw new Error("Tidak terautentikasi");

    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, nik, job_title, email, department_id, office_id, role")
      .eq("id", user.id)
      .single();

    if (profileResult.error) throw profileResult.error;

    const profile = profileResult.data;
    const isAdmin = ["admin", "super_admin"].includes(String(profile?.role || "").toLowerCase());
    const requesterProfile = isAdmin && payload?._requester_profile_override
      ? { ...profile, ...payload._requester_profile_override }
      : profile;
    const effectivePayload = isAdmin
      ? payload
      : {
          ...payload,
          office_id: profile?.office_id || payload.office_id,
          dept_id: profile?.department_id || payload.dept_id,
        };

    const [profileRes, officeRes, projectRes, deptRes, entityRes, usageRes] = await Promise.all([
      Promise.resolve(profileResult),
      effectivePayload.office_id ? supabase.from("master_offices").select("id, name, code, kedudukan").eq("id", effectivePayload.office_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.project_id ? supabase.from("master_projects").select("id, name, code, office_id, entity_id").eq("id", effectivePayload.project_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.dept_id ? supabase.from("master_departments").select("id, name, code, dept_index").eq("id", effectivePayload.dept_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.entity_id ? supabase.from("master_entities").select("id, name, code").eq("id", effectivePayload.entity_id).maybeSingle() : Promise.resolve({ data: null }),
      effectivePayload.form_usage_id
        ? supabase
            .from("form_usages")
            .select(`
              *,
              form_usage_departments(department_id),
              form_usage_steps(
                id, step_order, role_name, label, action_type, signer_department_id,
                form_usage_step_users(user_id)
              ),
              form_usage_attachment_requirements(*),
              master_forms(id, nama_form, nomor_form, link_form, input_schema, unit_config, department_id, signature_layout)
            `)
            .eq("id", effectivePayload.form_usage_id)
            .single()
        : effectivePayload.penggunaan_id
        ? supabase
            .from("master_penggunaan_detail")
            .select("*, workflow_allowed_departments(department_id), master_forms!fk_master_forms(id, nama_form, nomor_form, link_form, input_schema, unit_config, department_id)")
            .eq("id", effectivePayload.penggunaan_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if ("error" in usageRes && usageRes.error) throw usageRes.error;

    const rawUsage = usageRes.data as any;
    const usage = rawUsage
      ? {
          ...rawUsage,
          workflow_allowed_departments: Array.isArray(rawUsage.form_usage_departments)
            ? rawUsage.form_usage_departments
            : rawUsage.workflow_allowed_departments || [],
          request_categories: rawUsage.request_category
            ? [rawUsage.request_category]
            : rawUsage.request_categories || [],
        }
      : null;

    return {
      user,
      profile: requesterProfile,
      office: officeRes.data,
      project: projectRes.data,
      department: deptRes.data,
      entity: entityRes.data,
      usage,
      form: usage?.master_forms ?? null,
      payload: effectivePayload,
    };
  },

  async buildFilledTemplateFile(payload: any): Promise<{ publicUrl: string; context: any; signaturePositions: SignaturePosition[] }> {
    const context = await this.getTemplateContext(payload);
    const templateLink = context.form?.link_form;
    if (!templateLink) throw new Error("Template Excel belum tersedia untuk matrix ini.");

    const templateUrl = `${templateLink}${templateLink.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const response = await fetch(templateUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Gagal mengambil template Excel.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];

    const isRecommendationTemplate = String(context.form?.nama_form || "").toUpperCase().includes("REKOMENDASI");
    if (isRecommendationTemplate) {
      this.normalizeRecommendationTemplate(workbook, worksheet);
    }

    const inputData = payload.form_input_data ?? {};
    const requestedProject = inputData?.request_mode === "unit" ? inputData?.requested_project : null;
    const isPgdTemplate = String(context.form?.nama_form || "").toUpperCase().includes("PERMINTAAN BARANG");
    if (isPgdTemplate) {
      worksheet.getCell(payload.is_aset ? "B4" : "E4").value = "V";
      worksheet.getCell("D5").value = `: ${payload.no_surat}`;
      worksheet.getCell("L4").value = ":";
      worksheet.getCell("L5").value = ":";
      if (payload.office_id && context.office?.name !== "Kantor Pusat") {
        worksheet.getCell("M4").value = `KC. ${context.office?.name || ""}`;
        worksheet.getCell("M5").value = context.project?.name || inputData.project_name || "";
      } else if (requestedProject?.name) {
        worksheet.getCell("M4").value = context.department?.name || "";
        worksheet.getCell("M5").value = requestedProject.name;
      } else {
        worksheet.getCell("M4").value = context.department?.name || "";
        worksheet.getCell("M5").value = inputData.project_name || "-";
      }
    }

    const schema = this.parseInputSchema(context.form?.input_schema);
    if (!this.hasPlaceDateMapping(schema)) {
      throw new Error("Template belum memiliki mapping cell untuk Tempat, Tanggal.");
    }
    schema.forEach((field) => {
      if (inputData.request_mode !== "unit" && this.isUnitTemplateField(field)) return;
      if (field.type === "table") {
        this.writeTableField(workbook, field, inputData[field.key]);
        return;
      }
      if (!field.cell && !(field.merge_range || field.mergeRange)) return;
      const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
      const sheet = workbook.worksheets[sheetIndex] ?? worksheet;
      const source = field.default_source || field.defaultSource || "manual";
      const systemValue = this.getSystemFieldValue(source, context);
      const rawValue = systemValue !== undefined ? systemValue : inputData[field.key];
      this.writeWrappedField(sheet, field, rawValue);
    });
    const signaturePositions = buildDynamicSignatureLayout(
      workbook,
      normalizeSignatureLayoutConfig(context.form?.signature_layout),
      Array.isArray(payload.signature_steps) ? payload.signature_steps : [],
      {
        requestPlaceDate: [
          String(payload.request_place || "").trim(),
          this.formatDateForDocument(payload.request_date),
        ].filter(Boolean).join(", "),
      }
    );
    if (isPgdTemplate) normalizeGoodsServicesWorksheet(worksheet);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeNumber = String(payload.no_surat ?? "draft").replace(/[^\w-]+/g, "_");
    const path = `dokumen/system_${safeNumber}_${Date.now()}.xlsx`;
    const uploaded = await appStorageService.upload({
      bucket: "dokumen_surat",
      path,
      file: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      upsert: true,
    });
    return { publicUrl: uploaded.publicUrl, context, signaturePositions };
  },

  async getActiveRegistrationDrafts(): Promise<SuratRegistrationDraft[]> {
    const { data, error } = await supabase
      .from("surat_registration_drafts")
      .select("*, surat_registration_draft_files(*)")
      .eq("status", "DRAFT")
      .gt("expires_at", new Date().toISOString())
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []) as SuratRegistrationDraft[];
  },

  async getRegistrationDraft(id: string): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase
      .from("surat_registration_drafts")
      .select("*, surat_registration_draft_files(*)")
      .eq("id", id)
      .eq("status", "DRAFT")
      .gt("expires_at", new Date().toISOString())
      .single();
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async createRegistrationDraft(args: {
    noUrut: number;
    noSurat: string;
    payload: Record<string, any>;
    signerAssignments: any[];
  }): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase.rpc("create_surat_registration_draft", {
      p_no_urut: args.noUrut,
      p_no_surat: args.noSurat,
      p_payload: args.payload,
      p_signer_assignments: args.signerAssignments,
    });
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async saveRegistrationDraft(
    id: string,
    payload: Record<string, any>,
    signerAssignments: any[],
    currentSection = "details"
  ): Promise<void> {
    const { error } = await supabase
      .from("surat_registration_drafts")
      .update({
        payload,
        signer_assignments: signerAssignments,
        current_section: currentSection,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", id)
      .eq("status", "DRAFT");
    if (error) throw error;
  },

  async finishRegistrationDraft(id: string, status: "SUBMITTED" | "VOID"): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("surat_registration_drafts")
      .update({
        status,
        submitted_at: status === "SUBMITTED" ? now : null,
        voided_at: status === "VOID" ? now : null,
      })
      .eq("id", id)
      .eq("status", "DRAFT");
    if (error) throw error;
  },

  async voidRegistrationDraft(id: string): Promise<void> {
    const { error } = await supabase.rpc("void_surat_registration_draft", { p_draft_id: id });
    if (error) throw error;
  },

  async getMyRecommendationTasks(): Promise<RecommendationTask[]> {
    const { data, error } = await supabase.rpc("get_my_recommendation_tasks");
    if (error) throw error;
    return (data || []) as RecommendationTask[];
  },

  async getRecommendationParentSummary(taskId: string): Promise<RecommendationParentSummary> {
    const { data, error } = await supabase.rpc("get_recommendation_parent_summary", {
      p_task_id: taskId,
    });
    if (error) throw error;
    if (!data || typeof data !== "object") {
      throw new Error("Ringkasan pengajuan induk tidak tersedia.");
    }
    return data as RecommendationParentSummary;
  },

  async claimRecommendationTask(taskId: string): Promise<SuratRegistrationDraft> {
    const { data, error } = await supabase.rpc("claim_recommendation_task", {
      p_task_id: taskId,
    });
    if (error) throw error;
    return data as SuratRegistrationDraft;
  },

  async completeRecommendationTask(taskId: string, childSuratId: string): Promise<void> {
    const { error } = await supabase.rpc("complete_recommendation_task", {
      p_task_id: taskId,
      p_child_surat_id: childSuratId,
    });
    if (error) throw error;
  },

  async finalizeRecommendationRevisionIfNeeded(childSuratId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc("finalize_recommendation_revision_if_needed", {
      p_child_surat_id: childSuratId,
    });
    if (error) throw error;
    return Boolean(data);
  },

  async autoApproveRecommendationFirstStep(suratId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!user) throw new Error("Sesi login tidak tersedia.");

    const { data: signature, error: signatureError } = await supabase
      .from("surat_signatures")
      .select("id, surat_id, step_order, user_id, is_signed, surat_registrasi!inner(current_step)")
      .eq("surat_id", suratId)
      .eq("step_order", 1)
      .eq("user_id", user.id)
      .eq("is_signed", false)
      .maybeSingle();

    if (signatureError) throw signatureError;
    if (!signature) throw new Error("Signer pertama rekomendasi tidak ditemukan untuk akun ini.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    await this.approveSurat(
      signature.id,
      suratId,
      1,
      profile?.full_name || user.email || "Pembuat Rekomendasi",
      "Dikonfirmasi oleh pembuat rekomendasi"
    );
  },

  async uploadRegistrationDraftFiles(
    draftId: string,
    files: File[],
    requirement?: { key?: string; label?: string },
    onProgress?: (progress: RegistrationDraftUploadProgress) => void,
  ): Promise<SuratRegistrationDraftFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak tersedia.");
    const rows = [];
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;

    for (const [index, file] of files.entries()) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `drafts/${draftId}/${crypto.randomUUID()}_${safeName}`;
      const uploaded = await appStorageService.upload({
        bucket: "lampiran_surat",
        path,
        file,
        onProgress: ({ loaded }) => {
          const aggregateLoaded = completedBytes + Math.min(loaded, file.size);
          onProgress?.({
            phase: "uploading",
            fileName: file.name,
            fileIndex: index + 1,
            fileCount: files.length,
            loaded: aggregateLoaded,
            total: totalBytes,
            percent: totalBytes > 0
              ? Math.min(Math.round((aggregateLoaded / totalBytes) * 100), 100)
              : 100,
          });
        },
      });
      completedBytes += file.size;
      rows.push({
        draft_id: draftId,
        created_by: user.id,
        file_url: uploaded.publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        requirement_key: requirement?.key || null,
        requirement_label: requirement?.label || null,
      });
    }
    if (rows.length === 0) return [];
    onProgress?.({
      phase: "saving",
      fileName: files.at(-1)?.name || "",
      fileIndex: files.length,
      fileCount: files.length,
      loaded: totalBytes,
      total: totalBytes,
      percent: 100,
    });
    const { data, error } = await supabase
      .from("surat_registration_draft_files")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return (data || []) as SuratRegistrationDraftFile[];
  },

  async deleteRegistrationDraftFile(id: string): Promise<void> {
    const { error } = await supabase.from("surat_registration_draft_files").delete().eq("id", id);
    if (error) throw error;
  },

  async generateNoSurat(payload: any): Promise<{ fullNumber: string; noUrut: number }> {
    try {
      const { data: { user } } = await supabase.auth.getUser({ force: true });
      const officeIdClean  = this.cleanUuid(payload.office_id);
      const projectIdClean = this.cleanUuid(payload.project_id);
      const deptIdClean    = this.cleanUuid(payload.dept_id); // ← BARU: untuk partisi nomor per dept

      const [officeRes, deptRes] = await Promise.all([
        supabase.from("master_offices").select("code, kedudukan, parent_id").eq("id", officeIdClean).single(),
        supabase.from("master_departments").select("code, dept_index").eq("id", payload.dept_id).single()
      ]);

      if (officeRes.error || !officeRes.data) throw new Error("Kantor penerbit tidak ditemukan.");
      if (deptRes.error || !deptRes.data) throw new Error("Departemen pengaju tidak ditemukan.");

      const office  = officeRes.data;
      const isPusat = office?.kedudukan === "Pusat";
      const requestCategory = payload.form_input_data?.request_category;
      const isUnitRequest = requestCategory === "unit" || payload.form_input_data?.request_mode === "unit";
      if (isUnitRequest) {
        const context = await this.getTemplateContext(payload);
        const actorDepartmentId = context.profile?.department_id;
        const allowedDepartments = Array.isArray(context.usage?.workflow_allowed_departments)
          ? context.usage.workflow_allowed_departments
          : [];
        if (!actorDepartmentId || !allowedDepartments.some(
          (permission: { department_id?: string }) => permission.department_id === actorDepartmentId
        )) {
          throw new Error("Departemen akun Anda tidak diizinkan membuat permohonan Unit pada matrix ini.");
        }
      }

      if (!isPusat && !isUnitRequest && !projectIdClean) {
        const { count, error: projectCountError } = await supabase
          .from("master_projects")
          .select("id", { count: "exact", head: true })
          .eq("office_id", officeIdClean);
        if (projectCountError) throw new Error("Gagal memeriksa proyek cabang.");
        if ((count ?? 0) > 0) {
          throw new Error("Pilih proyek cabang untuk kantor ini.");
        }
      }

      // PERUBAHAN UTAMA: tambah p_dept_id agar nomor urut dimulai dari 001 per dept/project
      const { data: nextNumber, error: rpcError } = await supabase.rpc("generate_new_letter_number", {
        p_entity_id:  payload.entity_id,
        p_type_id:    payload.letter_type_id,
        p_office_id:  officeIdClean,
        p_project_id: projectIdClean,
        p_user_id:    user?.id,
        p_dept_id:    deptIdClean,
      });

      if (rpcError) throw new Error("Gagal menerbitkan nomor urut.");

      const [entityRes, projectRes, typeRes] = await Promise.all([
        supabase.from("master_entities").select("code").eq("id", payload.entity_id).single(),
        projectIdClean
          ? supabase.from("master_projects").select("code").eq("id", projectIdClean).single()
          : Promise.resolve({ data: null }),
        supabase.from("master_dept_letter_types")
          .select("sort_index")
          .eq("dept_id", deptIdClean)
          .eq("letter_type_id", payload.letter_type_id)
          .single()
      ]);

      if (typeRes.error || !typeRes.data) {
        throw new Error("Jenis surat tidak tersedia untuk departemen pengaju.");
      }

      const noUrutStr  = String(nextNumber).padStart(3, "0");
      const entityCode = entityRes.data?.code || "??";
      const deptCode   = deptRes.data?.code   || "";
      const dIndex     = deptRes.data?.dept_index  || "0";
      const tIndex     = typeRes.data?.sort_index  || "0";
      const requestedProjectCode = String(payload.form_input_data?.requested_project?.code || "").trim();
      const defaultProjectCode = String(payload.form_input_data?.project_code || "").trim();

      const romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
      const bulan = romawiBulan[new Date().getMonth()];
      const tahun = new Date().getFullYear();

      let middleCode = "";
      if (requestCategory === "unit" && requestedProjectCode) {
        middleCode = `${deptCode}.${tIndex}.${requestedProjectCode}`;
      } else if (isPusat) {
        middleCode = `${deptCode}.${tIndex}`;
      } else {
        const projCode = projectRes.data?.code || defaultProjectCode || "000";
        if (office?.kedudukan === "KC") {
          middleCode = `${office.code}-${projCode}.${dIndex}.${tIndex}`;
        } else {
          const { data: parent } = await supabase
            .from("master_offices").select("code").eq("id", office?.parent_id).single();
          const parentCode = parent?.code || "??";
          middleCode = `${parentCode}.${office?.code}-${projCode}.${dIndex}.${tIndex}`;
        }
      }

      return {
        fullNumber: `${noUrutStr}/${entityCode}/${middleCode}/${bulan}/${tahun}`,
        noUrut: nextNumber
      };
    } catch (error: any) {
      console.error("Error generating number:", error);
      throw error;
    }
  },

  async createRegistrasi(
    payload: any,
    signers: any[],
    file: File | null,
    lampiranFiles?: File[] | File | null
  ) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession({ force: true });
      if (sessionError) {
        throw new Error(`Gagal memeriksa sesi login: ${sessionError.message}`);
      }
      if (!session?.user) {
        throw new Error("Sesi login tidak tersedia saat submit. Silakan login ulang di alamat aplikasi yang sedang dipakai.");
      }
      const user = session.user;
      const attachmentFiles = Array.isArray(lampiranFiles)
        ? lampiranFiles
        : lampiranFiles
          ? [lampiranFiles]
          : [];
      const payloadDraftId = this.cleanUuid(payload.draft_id);
      let persistedDraftAttachments: SuratRegistrationDraftFile[] = [];
      if (payloadDraftId) {
        const { data, error } = await supabase
          .from("surat_registration_draft_files")
          .select("id, draft_id, file_url, file_name, file_type, file_size, requirement_key, requirement_label, created_at")
          .eq("draft_id", payloadDraftId);
        if (error) throw error;
        persistedDraftAttachments = (data || []) as SuratRegistrationDraftFile[];
      }

      const noUrut      = parseInt(payload.no_surat.split("/")[0]);
      const currentYear = new Date().getFullYear();
      // Recommendation authorization depends on the requester's department.
      // Normalize only after getTemplateContext has resolved that trusted context.
      const configContext = await this.getTemplateContext(payload);
      const normalizedFormInputData = this.normalizeFormInputData(configContext.payload.form_input_data, {
        requesterDepartmentCode: configContext.department?.code,
        requesterDepartmentName: configContext.department?.name,
      });
      payload = { ...configContext.payload, form_input_data: normalizedFormInputData };
      const unitConfig = this.getUnitConfigFromForm(configContext.form);
      const isUnitMode = normalizedFormInputData?.request_mode === "unit";
      if (isUnitMode) {
        const workflowCategories = Array.isArray(configContext.usage?.request_categories)
          ? configContext.usage.request_categories
          : [];
        if (!workflowCategories.includes("unit")) {
          throw new Error("Matrix yang dipilih tidak mendukung registrasi Unit.");
        }
        const actorDepartmentId = configContext.profile?.department_id;
        const allowedDepartments = Array.isArray(configContext.usage?.workflow_allowed_departments)
          ? configContext.usage.workflow_allowed_departments
          : [];
        if (!actorDepartmentId || !allowedDepartments.some(
          (permission: { department_id?: string }) => permission.department_id === actorDepartmentId
        )) {
          throw new Error("Departemen akun Anda tidak diizinkan membuat permohonan Unit pada matrix ini.");
        }
        normalizedFormInputData.unit_config_snapshot = unitConfig;
        payload = { ...payload, form_input_data: normalizedFormInputData };
      }

      const initialRequirements = (configContext.usage?.form_usage_attachment_requirements || [])
        .filter((requirement: any) => Number(requirement.stage_order) === 0);
      const initialAttachmentMeta = payload.initial_attachment_meta || {};
      const classifiedDraftAttachments = classifyRegistrationDraftAttachments({
        files: persistedDraftAttachments,
        initialRequirementKeys: new Set(
          initialRequirements.map((requirement: any) => String(requirement.requirement_key)),
        ),
        formInputData: normalizedFormInputData,
      });
      validateInitialRegistrationAttachments({
        requirements: initialRequirements,
        newFiles: attachmentFiles,
        newFileMetadata: initialAttachmentMeta,
        persistedFiles: classifiedDraftAttachments.initialAttachments,
      });

      const activeSigners = signers.filter(s => s.user_id);
      if (activeSigners.length < 2 || activeSigners.length > 8) {
        throw new Error("Penandatangan harus berjumlah 2 sampai 8 tahap.");
      }
      const signerSnapshots = await this.getSignerSnapshots(activeSigners);
      const totalSteps = activeSigners.length;
      const snapshotSigners = activeSigners.map((s, idx) => {
        const profile = signerSnapshots[s.user_id] ?? {};
        return {
          user_id: s.user_id,
          full_name: profile.full_name ?? null,
          nik: profile.nik ?? null,
          job_title: profile.job_title ?? null,
          job_title_display: profile.job_title_display ?? profile.job_title ?? null,
          email: profile.email ?? null,
          role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
          label_jabatan: s.label_jabatan ?? null,
          step_order: Number(s.step_order || idx + 1),
          status: "PENDING",
          is_signed: false,
        };
      });
      const signatureSteps = snapshotSigners.map(signer => ({
        step_order: signer.step_order,
        role_name: signer.role_name,
        label: signer.label_jabatan || signer.role_name,
        user_name: signer.full_name || "",
        job_title: signer.job_title_display || signer.job_title || "",
      }));
      payload = { ...payload, signature_steps: signatureSteps };

      let payloadReservationId = this.cleanUuid(payload.reservation_id);
      if (!payloadReservationId && payloadDraftId) {
        const { data: draftReservation, error: draftReservationError } = await supabase
          .from("surat_registration_drafts")
          .select("reservation_id")
          .eq("id", payloadDraftId)
          .maybeSingle();
        if (draftReservationError) throw draftReservationError;
        payloadReservationId = this.cleanUuid(draftReservation?.reservation_id);
      }

      if (payload.form_usage_id) {
        const { data: validation, error: validationError } = await supabase.rpc(
          "validate_form_usage_for_actor",
          {
            p_usage_id: payload.form_usage_id,
            p_requested_department_id: payload.dept_id || null,
          }
        );
        if (validationError) throw validationError;
        const configuredSteps = [...(configContext.usage?.form_usage_steps || [])]
          .sort((a: any, b: any) => a.step_order - b.step_order);
        if (configuredSteps.length !== activeSigners.length) {
          throw new Error("Jumlah penandatangan tidak sesuai konfigurasi kegunaan.");
        }
        configuredSteps.forEach((step: any, index: number) => {
          const assignment = activeSigners[index];
          const eligibleIds = (step.form_usage_step_users || []).map((item: any) => item.user_id);
          if (assignment.form_usage_step_id !== step.id || !eligibleIds.includes(assignment.user_id)) {
            throw new Error(`Penandatangan tahap ${step.step_order} tidak sesuai konfigurasi.`);
          }
        });
        payload.policy_validation = validation;
      }

      const generated = file ? null : await this.buildFilledTemplateFile(payload);
      const context = generated?.context ?? configContext;
      const signaturePositions = generated?.signaturePositions || [];

      const cleanPayload = {
        ...payload,
        reservation_id: payloadReservationId,
        draft_id: payloadDraftId,
        entity_id:      this.cleanUuid(payload.entity_id),
        office_id:      this.cleanUuid(payload.office_id),
        project_id:     this.cleanUuid(payload.project_id),
        dept_id:        this.cleanUuid(payload.dept_id),
        letter_type_id: this.cleanUuid(payload.letter_type_id),
        penggunaan_id:  this.cleanUuid(payload.penggunaan_id),
        form_usage_id:   this.cleanUuid(payload.form_usage_id),
        created_by:     user.id,
        represented_department_id: payload.policy_validation?.requester_department_id || null,
        represented_by_admin: payload.policy_validation?.represented_by_admin || null,
        policy_snapshot: payload.form_usage_id ? {
          usage_id: payload.form_usage_id,
          usage_name: configContext.usage?.name || null,
          form_id: configContext.form?.id || null,
          request_category: configContext.usage?.request_category || null,
          recommendation_config: configContext.usage?.recommendation_config || {},
          requester_department_id: payload.policy_validation?.requester_department_id || null,
          steps: snapshotSigners,
          attachment_requirements: configContext.usage?.form_usage_attachment_requirements || [],
          captured_at: new Date().toISOString(),
        } : {},
        requester_nik: context.profile?.nik ?? null,
        request_place: payload.request_place ?? null,
        request_date: payload.request_date ?? null,
        form_input_data: normalizedFormInputData,
        requester_snapshot: {
          id: context.profile?.id ?? user?.id,
          full_name: context.profile?.full_name ?? null,
          nik: context.profile?.nik ?? null,
          job_title: context.profile?.job_title ?? null,
          email: context.profile?.email ?? user?.email ?? null,
        },
        location_snapshot: {
          entity: context.entity,
          office: context.office,
          project: context.project,
          department: context.department,
          form: context.form ? {
            id: context.form.id,
            nama_form: context.form.nama_form,
            nomor_form: context.form.nomor_form,
          } : null,
        },
        data_snapshot: this.buildDataSnapshot(context, payload, snapshotSigners, normalizedFormInputData),
      };

      if (file)         cleanPayload.file_path     = await this.uploadFile(file);
      if (!file)        cleanPayload.file_path     = generated?.publicUrl;

      const { data: surat, error: suratError } = await supabase
        .rpc("create_surat_registrasi", { p_payload: cleanPayload });

      if (suratError) throw suratError;
      if (!surat?.id) throw new Error("Surat gagal dibuat.");

      const uploadedAttachments = await this.uploadAttachmentFiles(surat.id, attachmentFiles, user?.id, {
        stage: "initial",
        requirements: payload.initial_attachment_meta || {},
      });
      let reusedDraftAttachments: any[] = [];
      const draftAttachmentRows = buildRegistrationAttachmentRows({
        suratId: surat.id,
        userId: user.id,
        initialAttachments: classifiedDraftAttachments.initialAttachments,
        recommendationAttachments: classifiedDraftAttachments.activeRecommendationAttachments,
      });
      if (draftAttachmentRows.length > 0) {
        const { data, error } = await supabase
          .from("surat_attachments")
          .insert(draftAttachmentRows)
          .select("*");
        if (error) throw error;
        reusedDraftAttachments = data || [];
      }
      uploadedAttachments.push(...reusedDraftAttachments);
      const primaryInitialAttachment = uploadedAttachments.find(
        (attachment) => attachment.stage !== "recommendation_item",
      );
      if (primaryInitialAttachment?.file_url) {
        await supabase
          .from("surat_registrasi")
          .update({ lampiran_path: primaryInitialAttachment.file_url })
          .eq("id", surat.id);
        surat.lampiran_path = primaryInitialAttachment.file_url;
      }
      surat.surat_attachments = uploadedAttachments;

      const dataSnapshot = this.buildDataSnapshot(context, payload, snapshotSigners, normalizedFormInputData, uploadedAttachments);
      await supabase
        .from("surat_registrasi")
        .update({ data_snapshot: dataSnapshot })
        .eq("id", surat.id);
      surat.data_snapshot = dataSnapshot;

      if (!cleanPayload.reservation_id) {
        await supabase.from("surat_reservations")
          .update({ status: "USED" })
          .match({
            no_urut:     noUrut,
            entity_id:   cleanPayload.entity_id,
            year:        currentYear,
            reserved_by: user?.id,
            status:      "PENDING",
          });
      }

      const firstStepOrder = Math.min(...activeSigners.map((s: any, idx: number) => Number(s.step_order || idx + 1)));
      const firstAvailableAt = new Date().toISOString();
      const signerPayload = activeSigners.map((s, idx) => ({
        surat_id: surat.id,
        user_id: s.user_id,
        role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
        label_jabatan: s.label_jabatan ?? null,
        step_order: s.step_order,
        is_signed: false,
        available_at: Number(s.step_order || idx + 1) === firstStepOrder ? firstAvailableAt : null,
        requires_unit_allocation: s.requires_unit_allocation === true,
        form_usage_step_id: this.cleanUuid(s.form_usage_step_id),
        action_type: s.action_type || (s.requires_unit_allocation ? "unit_allocation" : "approval"),
        attachment_requirements_snapshot: s.attachment_requirements || [],
        signature_position_snapshot: signaturePositions.find(position =>
          position.step_order === Number(s.step_order || idx + 1)
        ) || {},
        signer_snapshot: signerSnapshots[s.user_id] ?? {},
      }));

      if (signerPayload.length > 0) {
        const { error: signerInsertError } = await supabase.from("surat_signatures").insert(signerPayload);
        if (signerInsertError) {
          await supabase.from("surat_registrasi").delete().eq("id", surat.id);
          throw signerInsertError;
        }
        
        const firstStepOrd = Math.min(...signerPayload.map((s: any) => s.step_order));
        await this.notifyInboxStepTasks(
          surat.id,
          firstStepOrd,
          cleanPayload.judul_surat,
          "new_inbox"
        );
      }

      documentPreviewService.enqueuePdf(surat.id).catch((pdfError) => {
        console.error("Gagal enqueue PDF awal:", pdfError);
      });

      return surat;
    } catch (error: any) {
      const message = String(error?.message || error?.error || "Gagal menyimpan surat.");
      console.error(formatCreateRegistrasiError(error));
      throw new Error(message);
    }
  },

  async cancelRegistration(noSurat: string) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    if (!noSurat) return false;
    const noUrut      = parseInt(noSurat.split("/")[0]);
    const currentYear = new Date().getFullYear();
    const { error } = await supabase.from("surat_reservations")
      .update({ status: "VOID" })
      .match({ no_urut: noUrut, reserved_by: user?.id, year: currentYear, status: "PENDING" });
    if (error) throw error;
    return true;
  },

  async stampApprovalExcel(
    suratId: string,
    currentFilePath: string,
    userName: string,
    roleName: string,
    usageId: string | null,
    stepOrder: number,
    positionSnapshot?: Record<string, any> | null,
    signerJobTitle: string = "",
    signedAt?: string | null
  ): Promise<string> {
    const { data: usageDetail } = usageId
      ? await supabase.from("master_penggunaan_detail").select("*").eq("id", usageId).maybeSingle()
      : { data: null };

    const fileData = await this.downloadStorageFile(currentFilePath, "dokumen_surat");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await fileData.arrayBuffer());
    const positions = positionSnapshot?.ttd
      ? [{
          ...positionSnapshot,
          labelJabatan: positionSnapshot.job_title || positionSnapshot.label || positionSnapshot.role_name || roleName,
          sheet: Number(positionSnapshot.sheet || 1),
        }]
      : usageDetail
        ? this.resolveStampPositions(usageDetail, roleName, stepOrder)
        : [];

    if (positions && positions.length > 0) {
      positions.forEach((pos: any) => {
          const worksheet = workbook.worksheets[Math.max(Number(pos.sheet || 1) - 1, 0)] || workbook.worksheets[0];
          const ttdCell = worksheet.getCell(pos.ttd);
          ttdCell.value = `DISETUJUI SISTEM\n${formatSignatureStampDateTime(signedAt)} WIB`;
          ttdCell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
          const rowNum = parseInt(pos.ttd.match(/\d+/)?.[0] || "35");
          worksheet.getRow(rowNum).height = 65;
          if (pos.nama) {
            const nameCell = worksheet.getCell(pos.nama);
            nameCell.value = userName.toUpperCase();
            nameCell.alignment = {
              ...(nameCell.alignment || {}),
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
          }
          if (pos.jabatan) {
            const jobCell = worksheet.getCell(pos.jabatan);
            jobCell.value = signerJobTitle || pos.signer_job_title || pos.jobTitle || pos.labelJabatan || "";
            jobCell.alignment = {
              ...(jobCell.alignment || {}),
              horizontal: "center",
              vertical: "middle",
              wrapText: true,
            };
          }
      });
      const buffer  = await workbook.xlsx.writeBuffer();
      const newPath = `dokumen/signed_${suratId}_step${stepOrder}_${Date.now()}.xlsx`;
      const uploaded = await appStorageService.upload({
        bucket: "dokumen_surat",
        path: newPath,
        file: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        upsert: true,
      });
      return uploaded.publicUrl;
    }
    return currentFilePath;
  },

  async rebuildDocumentSource(suratId: string): Promise<string> {
    const { data: actor } = await supabase.auth.getUser({ force: true });
    if (!actor.user) throw new Error("Tidak terautentikasi.");
    const { data: actorProfile, error: actorError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", actor.user.id)
      .single();
    if (actorError) throw actorError;
    if (!["admin", "super_admin"].includes(String(actorProfile?.role || "").toLowerCase())) {
      throw new Error("Hanya admin yang dapat membangun ulang sumber dokumen.");
    }

    const { data: surat, error } = await supabase
      .from("surat_registrasi")
      .select(`
        *,
        surat_signatures (
          id, user_id, step_order, role_name, label_jabatan, is_signed, signed_at,
          signer_snapshot, signature_position_snapshot,
          profiles:user_id (full_name, job_title)
        )
      `)
      .eq("id", suratId)
      .single();
    if (error || !surat) throw error || new Error("Surat tidak ditemukan.");
    const { data: requesterProfile, error: requesterError } = surat.created_by
      ? await supabase
          .from("profiles")
          .select("id, full_name, nik, job_title, email, department_id, office_id")
          .eq("id", surat.created_by)
          .maybeSingle()
      : { data: null, error: null };
    if (requesterError) throw requesterError;

    const signatures = [...(surat.surat_signatures || [])].sort(
      (left: any, right: any) => Number(left.step_order) - Number(right.step_order)
    );
    const signatureSteps = signatures.map((signature: any) => ({
      step_order: Number(signature.step_order),
      role_name: signature.role_name,
      label: signature.label_jabatan || signature.signer_snapshot?.job_title || signature.profiles?.job_title || "",
      job_title: signature.signer_snapshot?.job_title_display || signature.signer_snapshot?.job_title || signature.profiles?.job_title || signature.label_jabatan || "",
      user_name: signature.signer_snapshot?.full_name || signature.profiles?.full_name || "",
    }));
    const generated = await this.buildFilledTemplateFile({
      ...surat,
      dept_id: surat.dept_id,
      penggunaan_id: surat.penggunaan_id,
      form_usage_id: surat.form_usage_id,
      form_input_data: surat.form_input_data || {},
      signature_steps: signatureSteps,
      _requester_profile_override: requesterProfile || surat.requester_snapshot || {},
    });

    let rebuiltPath = generated.publicUrl;
    for (const signature of signatures) {
      const position = generated.signaturePositions.find(
        item => item.step_order === Number(signature.step_order)
      ) || {};
      const { error: positionError } = await supabase
        .from("surat_signatures")
        .update({ signature_position_snapshot: position })
        .eq("id", signature.id);
      if (positionError) throw positionError;
      if (!signature.is_signed) continue;
      rebuiltPath = await this.stampApprovalExcel(
        surat.id,
        rebuiltPath,
        signature.signer_snapshot?.full_name || signature.profiles?.full_name || "",
        signature.role_name,
        surat.penggunaan_id,
        Number(signature.step_order),
        position,
        signature.signer_snapshot?.job_title_display || signature.signer_snapshot?.job_title || signature.profiles?.job_title || signature.label_jabatan || "",
        signature.signed_at
      );
    }

    const { error: updateError } = await supabase
      .from("surat_registrasi")
      .update({ file_path: rebuiltPath, pdf_path: null })
      .eq("id", suratId);
    if (updateError) throw updateError;
    return rebuiltPath;
  },

  async applyFormInputDataToExcel(currentFilePath: string, usageId: string, formInputData: any): Promise<string> {
    const { data: usageDetail } = await supabase
      .from("master_penggunaan_detail")
      .select("*, master_forms!fk_master_forms(input_schema, unit_config)")
      .eq("id", usageId)
      .single();
    const schema = this.parseInputSchema((usageDetail as any)?.master_forms?.input_schema);
    if (!usageDetail || schema.length === 0) return currentFilePath;

    const fileData = await this.downloadStorageFile(currentFilePath, "dokumen_surat");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await fileData.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (formInputData?.request_mode === "unit" && formInputData?.requested_project?.name) {
      worksheet.getCell("L5").value = `: ${formInputData.requested_project.name}`;
    }

    schema.forEach((field) => {
      const source = field.default_source || field.defaultSource || "manual";
      if (source !== "manual") return;
      if (formInputData?.request_mode !== "unit" && this.isUnitTemplateField(field)) return;
      if (field.type === "table") {
        this.writeTableField(workbook, field, formInputData?.[field.key]);
        return;
      }
      if (!field.cell && !(field.merge_range || field.mergeRange)) return;
      const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
      const sheet = workbook.worksheets[sheetIndex] ?? worksheet;
      this.writeWrappedField(sheet, field, formInputData?.[field.key]);
    });
    const isGoodsServicesSheet =
      String(worksheet.getCell("C9").value || "").toUpperCase().includes("NAMA BARANG") &&
      String(worksheet.getCell("J9").value || "").toUpperCase().includes("SAT");
    if (isGoodsServicesSheet) normalizeGoodsServicesWorksheet(worksheet);
    const buffer = await workbook.xlsx.writeBuffer();
    const path = `dokumen/updated_input_${Date.now()}.xlsx`;
    const uploaded = await appStorageService.upload({
      bucket: "dokumen_surat",
      path,
      file: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      upsert: true,
    });
    return uploaded.publicUrl;
  },

  async approveSurat(
    signatureId: string,
    suratId: string,
    currentStep: number,
    userName: string,
    note: string = "",
    options: {
      unitAllocation?: { project?: any; units: any[] };
      approvalAttachments?: Array<{ key: string; label: string; file: File }>;
    } = {}
  ): Promise<{ success: boolean }> {
    const [suratResult, signatureResult] = await Promise.all([
      supabase
        .from("surat_registrasi")
        .select("current_step, file_path, penggunaan_id, form_usage_id, form_input_data, data_snapshot")
        .eq("id", suratId)
        .single(),
      supabase
        .from("surat_signatures")
        .select("role_name, requires_unit_allocation, action_type, signature_position_snapshot, attachment_requirements_snapshot, signer_snapshot, verification_required, verification_status")
        .eq("id", signatureId)
        .single(),
    ]);
    const { data: suratFresh, error: suratErr } = suratResult;
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");
    if (suratFresh.current_step !== currentStep) throw new Error("Dokumen sudah diproses. Silakan refresh.");

    const { data: sigInfo } = signatureResult;
    if (!sigInfo) throw new Error("Data tanda tangan tidak valid.");
    if ((sigInfo as any).verification_required && (sigInfo as any).verification_status !== "verified") {
      throw new Error("Data pengajuan belum diperiksa tim pemeriksa.");
    }
    const signerJobTitle = String(
      (sigInfo as any).signer_snapshot?.job_title_display ||
      (sigInfo as any).signer_snapshot?.job_title ||
      ""
    ).trim();

    let workingFilePath = suratFresh.file_path;
    let formInputData = suratFresh.form_input_data ?? {};
    let uploadedAllocationAttachments: any[] = [];
    const approvalRequirements = Array.isArray(sigInfo.attachment_requirements_snapshot)
      ? sigInfo.attachment_requirements_snapshot
      : [];
    const approvalAttachments = options.approvalAttachments || [];
    const isPreparedByVerifier = (sigInfo as any).verification_required && (sigInfo as any).verification_status === "verified";
    const existingAllocatedUnits = Array.isArray(formInputData?.allocated_units) ? formInputData.allocated_units : [];
    const hasExistingUnitAllocation = existingAllocatedUnits.length > 0;
    const hasIncomingUnitAllocation = Array.isArray(options.unitAllocation?.units) && options.unitAllocation.units.length > 0;
    let uploaderId: string | undefined;
    let uploaderResolved = false;
    const getUploaderId = async () => {
      if (uploaderResolved) return uploaderId;
      const { data: { user } } = await supabase.auth.getUser();
      uploaderId = user?.id;
      uploaderResolved = true;
      return uploaderId;
    };
    if (!isPreparedByVerifier) {
      approvalRequirements.forEach((requirement: any) => {
        const files = approvalAttachments.filter(item => item.key === requirement.requirement_key);
        const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : 0;
        if (files.length < minimum) {
          throw new Error(`Lampiran approval belum lengkap: ${requirement.label || requirement.requirement_key}.`);
        }
        if (files.length > Number(requirement.max_files || 1)) {
          throw new Error(`Lampiran ${requirement.label || requirement.requirement_key} melebihi batas.`);
        }
        files.forEach(item => {
          const allowedTypes = Array.isArray(requirement.allowed_types) ? requirement.allowed_types : [];
          if (allowedTypes.length > 0 && item.file.type && !allowedTypes.includes(item.file.type)) {
            throw new Error(`Tipe file ${item.file.name} tidak diizinkan.`);
          }
          if (requirement.max_size_bytes && item.file.size > Number(requirement.max_size_bytes)) {
            throw new Error(`Ukuran file ${item.file.name} melebihi batas.`);
          }
        });
      });
    }
    if (
      (sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation") &&
      !isPreparedByVerifier &&
      !(hasExistingUnitAllocation && !hasIncomingUnitAllocation)
    ) {
      const units = options.unitAllocation?.units ?? [];
      const requestedProject = formInputData?.requested_project || {};
      const project = requestedProject?.code ? requestedProject : options.unitAllocation?.project;
      const requestedCount = Number(formInputData?.requested_unit_count || 0);
      if (formInputData?.request_mode !== "unit") throw new Error("Dokumen ini bukan pengajuan unit.");
      if (!Number.isFinite(requestedCount) || requestedCount < 1) throw new Error("Jumlah unit pengajuan tidak valid.");
      if (!project?.code) throw new Error("Project unit wajib dipilih.");
      if (options.unitAllocation?.project?.code && requestedProject?.code && options.unitAllocation.project.code !== requestedProject.code) {
        throw new Error("Proyek unit tidak boleh diubah. Buat pengajuan baru jika proyek salah.");
      }
      if (!Array.isArray(units) || units.length < 1) {
        throw new Error("Pilih minimal 1 unit.");
      }

      formInputData = {
        ...formInputData,
        allocated_project: project,
        allocated_units: units,
        allocated_unit_count: units.length,
        allocated_by_signature_id: signatureId,
        allocated_at: new Date().toISOString(),
      };

      const { error: updateInputError } = await supabase
        .from("surat_registrasi")
        .update({ form_input_data: formInputData })
        .eq("id", suratId);
      if (updateInputError) throw updateInputError;

      const unitRecapAttachment = this.createUnitRecapAttachment(project, units);
      const productionCodeAttachment = this.createProductionCodeAttachment(project, units);
      uploadedAllocationAttachments = await this.uploadAttachmentFiles(
        suratId,
        [
          unitRecapAttachment,
          productionCodeAttachment,
        ],
        await getUploaderId(),
        {
          stage: "unit_allocation",
          signature_id: signatureId,
          requirements: {
            [unitRecapAttachment.name]: {
              key: "rekap_adendum_unit",
              label: "Rekap Adendum Unit",
            },
            [productionCodeAttachment.name]: {
              key: "kode_produksi_unit",
              label: "Kode Produksi Unit",
            },
          },
        }
      );

      const { data: allAttachments } = await supabase
        .from("surat_attachments")
        .select("*")
        .eq("surat_id", suratId)
        .order("created_at", { ascending: true });
      await supabase
        .from("surat_registrasi")
        .update({
          data_snapshot: {
            ...(suratFresh.data_snapshot || {}),
            input: formInputData,
            requested_project: formInputData?.requested_project ?? null,
            allocated_project: formInputData?.allocated_project ?? null,
            requested_unit_count: formInputData?.requested_unit_count ?? null,
            allocated_units: formInputData?.allocated_units ?? [],
            allocated_unit_count: formInputData?.allocated_unit_count ?? null,
            attachments: allAttachments || uploadedAllocationAttachments,
          },
        })
        .eq("id", suratId);

      if (workingFilePath?.split("?")[0].toLowerCase().endsWith(".xlsx") && suratFresh.penggunaan_id) {
        workingFilePath = await this.applyFormInputDataToExcel(workingFilePath, suratFresh.penggunaan_id, formInputData);
      }
    }

    if (approvalAttachments.length > 0) {
      await this.uploadAttachmentFiles(
        suratId,
        approvalAttachments.map(item => item.file),
        await getUploaderId(),
        {
          stage: "approval",
          signature_id: signatureId,
          requirements: Object.fromEntries(approvalAttachments.map(item => [
            item.file.name,
            { key: item.key, label: item.label },
          ])),
        }
      );
    }

    let finalUrl = workingFilePath ?? "";
    if (workingFilePath?.split("?")[0].toLowerCase().endsWith(".xlsx")) {
      finalUrl = await this.stampApprovalExcel(
        suratId,
        workingFilePath,
        userName,
        sigInfo.role_name,
        suratFresh.penggunaan_id,
        currentStep,
        sigInfo.signature_position_snapshot,
        signerJobTitle
      );
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc("handle_approve_surat_v2", {
      p_sig_id: signatureId, p_surat_id: suratId, p_note: note, p_file_path: finalUrl
    });
    if (rpcError) throw new Error(rpcError.message);
    if (!rpcResult?.success) throw new Error("Gagal memproses persetujuan.");

    const [updatedSuratResult] = await Promise.all([
      supabase
        .from("surat_registrasi")
        .select("current_step, status, created_by, judul_surat")
        .eq("id", suratId)
        .single(),
      this.ensureUnitAllocationPersisted(suratId, formInputData),
    ]);

    documentPreviewService.enqueuePdf(suratId, { refresh: true, signatureId }).catch((pdfError) => {
      console.error("Gagal enqueue snapshot PDF:", pdfError);
    });

    const { data: updatedSurat } = updatedSuratResult;

    if (updatedSurat) {
      // 1. Notif ke pembuat surat (yang mengajukan surat)
      if (updatedSurat.created_by) {
        this.sendNotification(
          [updatedSurat.created_by],
          'Surat Ditandatangani',
          `Surat "${updatedSurat.judul_surat}" telah ditandatangani oleh ${userName}`,
          "/surat/monitoring",
          { surat_id: suratId, event_type: "signed", type: "success" }
        );
      }

      // 2. Notif ke next signer jika masih diproses dan step bertambah
      if (updatedSurat.status === 'PROSES' && updatedSurat.current_step > currentStep) {
        void this.notifyInboxStepTasks(
          suratId,
          updatedSurat.current_step,
          updatedSurat.judul_surat,
          "next_inbox"
        ).catch((notificationError) => {
          console.error("Gagal menyiapkan notifikasi inbox berikutnya:", notificationError);
        });
      }

      if (['SELESAI', 'DONE'].includes(updatedSurat.status)) {
        await this.finalizeRecommendationRevisionIfNeeded(suratId);
      }
    }

    return { success: true };
  },

  async rejectSurat(signatureId: string, suratId: string, note: string) {
    const { data: rejected, error: rejectError } = await supabase.rpc("handle_reject_surat_v2", {
      p_sig_id: signatureId,
      p_surat_id: suratId,
      p_note: note,
    });
    if (rejectError) throw new Error(rejectError.message);
    if (!rejected) throw new Error("Gagal memproses penolakan.");

    // Notif ke pembuat surat
    const { data: suratInfo } = await supabase.from('surat_registrasi').select('created_by, judul_surat').eq('id', suratId).single();
    if (suratInfo?.created_by) {
       this.sendNotification(
         [suratInfo.created_by],
         'Surat Ditolak',
         `Surat "${suratInfo.judul_surat}" telah ditolak. Catatan: ${note}`,
         "/surat/monitoring",
         { surat_id: suratId, event_type: "rejected", type: "error" }
       );
    }

    return true;
  },

  async verifySignature(
    signatureId: string,
    note: string = "",
    options: {
      suratId?: string;
      unitAllocation?: { project?: any; units: any[] };
      approvalAttachments?: Array<{ key: string; label: string; file: File }>;
    } = {}
  ) {
    const { data: { user } } = await supabase.auth.getUser({ force: true });
    const { data: sigInfo, error: sigError } = await supabase
      .from("surat_signatures")
      .select("surat_id, user_id, step_order, requires_unit_allocation, action_type, attachment_requirements_snapshot, verification_status")
      .eq("id", signatureId)
      .single();
    if (sigError || !sigInfo) throw new Error("Data pemeriksaan tidak ditemukan.");

    const suratId = options.suratId || sigInfo.surat_id;
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi")
      .select("file_path, penggunaan_id, judul_surat, form_input_data, data_snapshot, status")
      .eq("id", suratId)
      .single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");

    let formInputData = suratFresh.form_input_data ?? {};
    let workingFilePath = suratFresh.file_path;
    const persistedVerificationDraft =
      (suratFresh.data_snapshot as any)?.verification_drafts?.[signatureId]?.input || {};
    const approvalRequirements = Array.isArray(sigInfo.attachment_requirements_snapshot)
      ? sigInfo.attachment_requirements_snapshot
      : [];
    const approvalAttachments = options.approvalAttachments || [];
    const { data: existingApprovalAttachments, error: existingApprovalError } = await supabase
      .from("surat_attachments")
      .select("id, requirement_key")
      .eq("surat_id", suratId)
      .eq("signature_id", signatureId)
      .eq("stage", "approval");
    if (existingApprovalError) throw existingApprovalError;

    approvalRequirements.forEach((requirement: any) => {
      const files = approvalAttachments.filter(item => item.key === requirement.requirement_key);
      const existingCount = (existingApprovalAttachments || []).filter(item => item.requirement_key === requirement.requirement_key).length;
      const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : 0;
      if (Math.max(files.length, existingCount) < minimum) {
        throw new Error(`Lampiran approval belum lengkap: ${requirement.label || requirement.requirement_key}.`);
      }
      if (files.length > Number(requirement.max_files || 1)) {
        throw new Error(`Lampiran ${requirement.label || requirement.requirement_key} melebihi batas.`);
      }
      files.forEach(item => {
        const allowedTypes = Array.isArray(requirement.allowed_types) ? requirement.allowed_types : [];
        if (allowedTypes.length > 0 && item.file.type && !allowedTypes.includes(item.file.type)) {
          throw new Error(`Tipe file ${item.file.name} tidak diizinkan.`);
        }
        if (requirement.max_size_bytes && item.file.size > Number(requirement.max_size_bytes)) {
          throw new Error(`Ukuran file ${item.file.name} melebihi batas.`);
        }
      });
    });

    if (approvalAttachments.length > 0) {
      await this.replaceSignatureAttachmentFiles(
        suratId,
        signatureId,
        "approval",
        approvalAttachments
      );
    }

    if (sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation") {
      const incomingUnits = options.unitAllocation?.units ?? [];
      const units = incomingUnits.length > 0
        ? incomingUnits
        : Array.isArray(persistedVerificationDraft?.allocated_units)
          ? persistedVerificationDraft.allocated_units
          : [];
      const requestedProject = formInputData?.requested_project || {};
      const project = requestedProject?.code
        ? requestedProject
        : options.unitAllocation?.project || persistedVerificationDraft?.allocated_project;
      if (formInputData?.request_mode !== "unit") throw new Error("Dokumen ini bukan pengajuan unit.");
      if (!project?.code) throw new Error("Project unit wajib dipilih.");
      if (options.unitAllocation?.project?.code && requestedProject?.code && options.unitAllocation.project.code !== requestedProject.code) {
        throw new Error("Proyek unit tidak boleh diubah. Buat pengajuan baru jika proyek salah.");
      }
      if (!Array.isArray(units) || units.length < 1) throw new Error("Pilih minimal 1 unit.");

      formInputData = {
        ...formInputData,
        allocated_project: project,
        allocated_units: units,
        allocated_unit_count: units.length,
        allocated_by_signature_id: signatureId,
        allocated_at: new Date().toISOString(),
      };

      const unitRecapAttachment = this.createUnitRecapAttachment(project, units);
      const productionCodeAttachment = this.createProductionCodeAttachment(project, units);
      await this.replaceSignatureAttachmentFiles(
        suratId,
        signatureId,
        "unit_allocation",
        [
          { key: "rekap_adendum_unit", label: "Rekap Adendum Unit", file: unitRecapAttachment },
          { key: "kode_produksi_unit", label: "Kode Produksi Unit", file: productionCodeAttachment },
        ]
      );

      if (workingFilePath?.split("?")[0].toLowerCase().endsWith(".xlsx") && suratFresh.penggunaan_id) {
        workingFilePath = await this.applyFormInputDataToExcel(workingFilePath, suratFresh.penggunaan_id, formInputData);
      }
    }

    const rpcPayload =
      sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation"
        ? {
            allocated_project: formInputData?.allocated_project,
            allocated_units: formInputData?.allocated_units ?? [],
            allocated_unit_count: formInputData?.allocated_unit_count,
          }
        : {};

    const { data, error } = await supabase.rpc("verify_surat_signature_v2", {
      p_sig_id: signatureId,
      p_note: note,
      p_payload: rpcPayload,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal menyimpan pemeriksaan data.");
    if (sigInfo.user_id) {
      const link = `/surat/inbox?task=${signatureId}`;
      const message = `Surat "${suratFresh.judul_surat}" sudah diperiksa dan siap ditindaklanjuti`;
      this.sendNotification(
        [sigInfo.user_id],
        "Pemeriksaan Selesai",
        message,
        link,
        { surat_id: suratId, signature_id: signatureId, event_type: "verification_done", type: "info" }
      );
    }
    return true;
  },

  async requestVerificationRevision(signatureId: string, note: string) {
    const { data, error } = await supabase.rpc("request_surat_signature_verification_revision", {
      p_sig_id: signatureId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal mengembalikan ke tim pemeriksa.");
    return true;
  },

  async saveVerificationDraft(signatureId: string, payload: Record<string, any>, note?: string) {
    const { data, error } = await supabase.rpc("save_surat_verification_draft", {
      p_sig_id: signatureId,
      p_payload: payload || {},
      p_note: note || "",
    });
    if (error) throw new Error(error.message);
    return data;
  },

  async requestProcessRevision(input: {
    suratId: string;
    signatureId?: string | null;
    targetType: "requester" | "checker" | "signer" | "recommendation";
    targetStep?: number | null;
    reason: string;
    changes?: Record<string, any>;
  }) {
    const { data, error } = await supabase.rpc("request_surat_process_revision", {
      p_surat_id: input.suratId,
      p_sig_id: input.signatureId || null,
      p_target_type: input.targetType,
      p_target_step: input.targetStep ?? null,
      p_reason: input.reason,
      p_changes: input.changes || {},
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal mengembalikan proses.");
    return data as string;
  },

  async resolveProcessRevision(eventId: string, note: string = "") {
    const { data, error } = await supabase.rpc("resolve_surat_process_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal menyelesaikan perbaikan.");
    return true;
  },

  async acceptProcessRevision(eventId: string, note: string = "") {
    const { data, error } = await supabase.rpc("accept_surat_process_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal melanjutkan pengajuan setelah perbaikan.");
    return true;
  },

  async cancelAfterRevision(eventId: string, note: string) {
    const { data, error } = await supabase.rpc("cancel_surat_after_revision", {
      p_event_id: eventId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal membatalkan pengajuan.");
    return true;
  },

  async getRevisionHistory(suratId: string) {
    const { data, error } = await supabase.rpc("get_surat_revision_history", {
      p_surat_id: suratId,
    });
    if (error) {
      if (error.code === "42883" || error.code === "42P01") return [];
      throw new Error(error.message);
    }
    return data || [];
  },

  async getMyInbox(userId: string) {
    const selectQuery = `
        id, role_name, label_jabatan, step_order, is_signed, surat_id, user_id, requires_unit_allocation, action_type,
        attachment_requirements_snapshot, signature_position_snapshot, available_at, signer_snapshot,
        verification_required, verification_status, verified_at, verified_by, verification_note, verifier_snapshot,
        surat_registrasi!inner (
          *,
          surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id ),
          surat_signatures (
            id, step_order, is_signed, status, role_name, label_jabatan, signed_at, catatan,
            available_at, signer_snapshot, verification_required, verification_status, verified_at, verified_by, verification_note, verifier_snapshot,
            profiles:user_id ( full_name, job_title )
          )
        )
      `;
    const [signerRes, verifierRes] = await Promise.all([
      supabase
      .from("surat_signatures").select(`
        ${selectQuery}
      `)
      .eq("user_id", userId).eq("is_signed", false),
      supabase
        .from("surat_signatures")
        .select(selectQuery)
        .eq("is_signed", false)
        .eq("verification_required", true)
        .filter("verifier_snapshot", "cs", JSON.stringify([{ user_id: userId }])),
    ]);
    if (signerRes.error) throw signerRes.error;
    if (verifierRes.error) throw verifierRes.error;

    const rows = [
      ...((signerRes.data || []) as any[]).map((item) => ({ ...item, task_type: "approval" })),
      ...((verifierRes.data || []) as any[]).map((item) => ({ ...item, task_type: "verification" })),
    ];
    const seen = new Set<string>();
    return rows.map((sig: any) => {
      const surat = Array.isArray(sig.surat_registrasi) ? sig.surat_registrasi[0] : sig.surat_registrasi;
      if (!surat) return null;
      const suratStatus = String(surat.status || "").toUpperCase();
      const activeRevision = surat?.data_snapshot?.revision || {};
      const revisionTargetIds = Array.isArray(activeRevision.target_user_ids) ? activeRevision.target_user_ids : [];
      const isRevisionCheckerTask = suratStatus === "MENUNGGU_PERBAIKAN" &&
        activeRevision.target_type === "checker" &&
        revisionTargetIds.includes(userId) &&
        sig.task_type === "verification" &&
        Number(sig.step_order) === Number(activeRevision.target_step || sig.step_order);
      const isRevisionSignerTask = suratStatus === "MENUNGGU_PERBAIKAN" &&
        activeRevision.target_type === "signer" &&
        revisionTargetIds.includes(userId) &&
        sig.user_id === userId &&
        Number(sig.step_order) === Number(activeRevision.target_step || sig.step_order);
      if (suratStatus === "MENUNGGU_PERBAIKAN") {
        if (!isRevisionCheckerTask && !isRevisionSignerTask) return null;
      } else if (Number(sig.step_order) !== Number(surat.current_step)) {
        return null;
      } else if (sig.task_type === "verification" && sig.verification_status === "verified") {
        return null;
      }
      const key = `${sig.task_type}:${sig.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      surat.surat_signatures = [...(surat.surat_signatures || [])]
        .sort((a: any, b: any) => Number(a.step_order) - Number(b.step_order));
      return { ...sig, surat_registrasi: surat };
    }).filter(Boolean);
  },

  async getMyInboxCompact(params: { limit?: number; cursor?: string; search?: string; request_category?: string; task_type?: string } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Unauthorized");
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    if (params.search) qs.set("search", params.search);
    if (params.request_category) qs.set("request_category", params.request_category);
    if (params.task_type) qs.set("task_type", params.task_type);
    const response = await fetch(`/api/surat/inbox?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || "Gagal memuat inbox."));
    return payload as {
      items: any[];
      total: number;
      hasMore: boolean;
      nextCursor: string | null;
      pageSize: number;
    };
  },

  async getMyInboxDetail(signatureId: string) {
    if (!signatureId) throw new Error("signature ID wajib diisi");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Unauthorized");
    const response = await fetch(`/api/surat/inbox/${encodeURIComponent(signatureId)}/detail`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(payload?.error || "Gagal memuat detail task."));
    return payload as any;
  },

  async getLinkedDocuments(parentSuratId: string): Promise<LinkedSuratDocument[]> {
    if (!parentSuratId) return [];
    const { data, error } = await supabase.rpc("get_surat_linked_documents", {
      p_parent_surat_id: parentSuratId,
    });
    if (error) throw new Error(error.message);
    return (data || []) as LinkedSuratDocument[];
  },

  async linkRecommendationDocument(
    parentSuratId: string,
    childSuratId: string,
    requiredBeforeStep?: number | null
  ): Promise<LinkedSuratDocument> {
    const { data, error } = await supabase.rpc("link_surat_recommendation", {
      p_parent_surat_id: parentSuratId,
      p_child_surat_id: childSuratId,
      p_required_before_step: requiredBeforeStep ?? null,
    });
    if (error) throw new Error(error.message);
    return data as LinkedSuratDocument;
  },

  async uploadFile(file: File) {
    const filePath = `dokumen/${Date.now()}_${file.name}`;
    const uploaded = await appStorageService.upload({ bucket: "dokumen_surat", path: filePath, file });
    return uploaded.publicUrl;
  },

  async replaceSignatureAttachmentFiles(
    suratId: string,
    signatureId: string,
    stage: string,
    attachments: Array<{ key: string; label?: string; file: File }>
  ) {
    if (attachments.length === 0) return [];

    const { data: { session } } = await supabase.auth.getSession({ force: true });
    if (!session) throw new Error("Tidak terautentikasi");

    const formData = new FormData();
    formData.set("suratId", suratId);
    formData.set("signatureId", signatureId);
    formData.set("stage", stage);
    formData.set("metadata", JSON.stringify(attachments.map(item => ({
      fileName: item.file.name,
      key: item.key,
      label: item.label || item.key,
    }))));
    attachments.forEach(item => formData.append("files", item.file));

    let response: Response;
    try {
      response = await fetch("/api/surat/attachments/replace", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });
    } catch (error: any) {
      throw new Error(
        error?.message === "Failed to fetch" || error?.message === "fetch failed"
          ? "Server lampiran tidak bisa dihubungi."
          : error?.message || "Gagal mengganti lampiran."
      );
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Gagal mengganti lampiran.");
    return payload || [];
  },

  async uploadAttachmentFiles(
    suratId: string,
    files: File[],
    userId?: string,
    meta: {
      stage?: string;
      signature_id?: string;
      requirements?: Record<string, { key?: string; label?: string }>;
    } = {}
  ) {
    const rows = [];

    for (const file of files) {
      if (!file) continue;
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const filePath = `lampiran_${suratId}/${Date.now()}_${safeName}`;
      const uploaded = await appStorageService.upload({ bucket: "lampiran_surat", path: filePath, file });
      const requirement = meta.requirements?.[file.name] || {};
      rows.push({
        surat_id: suratId,
        file_url: uploaded.publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        file_size: file.size,
        created_by: userId ?? null,
        stage: meta.stage || "initial",
        requirement_key: requirement.key || null,
        requirement_label: requirement.label || null,
        signature_id: meta.signature_id || null,
      });
    }

    if (rows.length === 0) return [];

    const { data, error } = await supabase
      .from("surat_attachments")
      .insert(rows)
      .select("*");
    if (error) throw error;
    return data || [];
  },

  async getAllSurat(userId?: string): Promise<SuratRegistrasi[]> {
    let query = supabase.from("surat_registrasi")
      .select(`*, surat_signatures (*, profiles:user_id (full_name)), surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id )`).order("created_at", { ascending: false });
    if (userId) query = query.eq("created_by", userId);
    const { data } = await query;
    return (data || []).map((s: any) => ({
      ...s, surat_signatures: s.surat_signatures?.sort((a: any, b: any) => a.step_order - b.step_order) || []
    })) as SuratRegistrasi[];
  },

  async getMasterData() {
    const response = await fetch("/api/surat/master-data", {
      credentials: "same-origin",
      headers: { "X-SIGAP-Client": "web" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.error || payload?.message || "Gagal memuat data awal permohonan."));
    }
    const departmentLetterTypes = Array.isArray(payload.departmentLetterTypes)
      ? payload.departmentLetterTypes
      : [];
    const typeDepartmentMap = new Map<string, string[]>();
    const typeSortMap = new Map<string, number>();
    const typeDepartmentSortMap = new Map<string, Record<string, number>>();
    departmentLetterTypes.forEach((row: any) => {
      if (!row.letter_type_id || !row.dept_id) return;
      const ids = typeDepartmentMap.get(row.letter_type_id) || [];
      ids.push(row.dept_id);
      typeDepartmentMap.set(row.letter_type_id, ids);
      if (!typeSortMap.has(row.letter_type_id)) typeSortMap.set(row.letter_type_id, row.sort_index ?? 999);
      typeDepartmentSortMap.set(row.letter_type_id, {
        ...(typeDepartmentSortMap.get(row.letter_type_id) || {}),
        [row.dept_id]: row.sort_index ?? 999,
      });
    });
    const letterTypes = (Array.isArray(payload.letterTypes) ? payload.letterTypes : [])
      .map((type: any) => ({
        ...type,
        departmentIds: typeDepartmentMap.get(type.id) || [],
        dept_ids: typeDepartmentMap.get(type.id) || [],
        departmentSortIndexes: typeDepartmentSortMap.get(type.id) || {},
        dept_sort_indexes: typeDepartmentSortMap.get(type.id) || {},
        department_sort_index: typeSortMap.get(type.id) ?? type.type_index ?? 999,
      }))
      .sort((a: any, b: any) => (a.department_sort_index ?? 999) - (b.department_sort_index ?? 999) || String(a.name || "").localeCompare(String(b.name || ""), "id"));
    return {
      entities: Array.isArray(payload.entities) ? payload.entities : [],
      offices: Array.isArray(payload.offices) ? payload.offices : [],
      depts: Array.isArray(payload.departments) ? payload.departments : [],
      types: letterTypes,
      users: Array.isArray(payload.users) ? payload.users : [],
      projects: Array.isArray(payload.projects) ? payload.projects : [],
      penggunaan: Array.isArray(payload.usages) ? payload.usages : [],
    };
  },

  async downloadFilledTemplate(payload: any, templateLink: string) {
    const [officeRes, projectRes, deptRes] = await Promise.all([
      payload.office_id  ? supabase.from("master_offices").select("name").eq("id", payload.office_id).maybeSingle()  : Promise.resolve({ data: null }),
      payload.project_id ? supabase.from("master_projects").select("name").eq("id", payload.project_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("master_departments").select("name").eq("id", payload.dept_id).maybeSingle()
    ]);
    const response = await fetch(templateLink);
    const workbook  = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    worksheet.getCell(payload.is_aset ? "B4" : "E4").value = "V";
    worksheet.getCell("D5").value = `: ${payload.no_surat}`;
    if (payload.office_id && officeRes?.data?.name !== "Kantor Pusat") {
      worksheet.getCell("L4").value = `: KC. ${officeRes?.data?.name || ""}`;
      worksheet.getCell("L5").value = `: ${projectRes?.data?.name || ""}`;
    } else {
      worksheet.getCell("L4").value = `: ${deptRes?.data?.name || ""}`;
      worksheet.getCell("L5").value = ": -";
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = window.URL.createObjectURL(new Blob([buffer]));
    a.download = `Form_${payload.no_surat?.replace(/\//g, "_")}.xlsx`;
    a.click();
    return true;
  },

  getPreviewUrl(publicUrl: string) {
    if (!publicUrl) return "";
    const stripped = publicUrl.split("?")[0];
    const decoded  = decodeURIComponent(stripped);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(decoded)}&wdPrint=0&wdEmbedCode=0`;
  },
};
