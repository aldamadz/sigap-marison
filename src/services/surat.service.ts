import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { documentPreviewService } from "./document-preview.service";
import { appStorageService } from "./storage.service";
import {
  buildDynamicSignatureLayout,
  normalizeSignatureLayoutConfig,
  type SignaturePosition,
} from "./signature-layout.service";

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
  status: "waiting" | "claimed" | "submitted" | "cancelled";
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
      const { data: { session } } = await supabase.auth.getSession();
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
      const title = isVerification ? "Verifikasi Data Diperlukan" : "Surat Masuk Baru";
      const message = isVerification
        ? `Surat "${judulSurat}" perlu diverifikasi sebelum ditandatangani`
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
    if (v.includes("periksa") || v.includes("review") || v.includes("verifikasi") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
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
    return value
      .filter((row) => Object.values(row ?? {}).some((cellValue) => String(cellValue ?? "").trim()))
      .map((row, index) => {
        const actionRaw = String(row?.recommendation_action || "").trim();
        const action = actionRaw || (String(row?.service || "").trim() ? "service" : String(row?.ganti || "").trim() ? "ganti" : "");
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
        };
        const hasAttachment = Boolean(String(
          attachmentSource?.draft_file_id || attachmentSource?.file_url || attachmentSource?.file_name || ""
        ).trim());
        const normalized = {
          ...row,
          no: index + 1,
          recommendation_action: action || null,
          nama_barang: String(row?.nama_barang ?? "").trim(),
          no_registrasi: String(row?.no_registrasi ?? "").trim(),
          lokasi_pic: String(row?.lokasi_pic ?? "").trim(),
          kerusakan: String(row?.kerusakan ?? "").trim(),
          service: action === "service" ? "✓" : "",
          ganti: action === "ganti" ? "✓" : "",
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
      delete normalized.requested_project;
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

  parseMoney(value: any) {
    const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
    const amount = Number(cleaned);
    return Number.isFinite(amount) ? amount : 0;
  },

  formatRupiah(value: any) {
    const amount = this.parseMoney(value);
    if (amount === 0) return "";
    return new Intl.NumberFormat("id-ID").format(amount);
  },

  buildProductionCode(unit: any) {
    const detail = unit?.allocation_detail || {};
    const serial = String(detail.production_serial || detail.kode_produksi_nomor || "").trim();
    const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
    const rawDate = String(detail.production_date || detail.kode_produksi_tanggal || "").trim();
    const formattedDate = rawDate
      ? this.formatProductionDate(rawDate)
      : "";
    if (!serial && !block && !formattedDate) return "";
    return `${serial}/UAI/PRC/${block}/${formattedDate}`;
  },

  formatProductionDate(value: string) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
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
      head: [["No", "Kavling", "Struktur Atas", "Struktur Bawah", "Nominal"]],
      body,
      foot: [["TOTAL", "", this.formatRupiah(totalAtas), this.formatRupiah(totalBawah), this.formatRupiah(totalNominal)]],
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
        1: { cellWidth: 35, halign: "center" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section === "foot" && data.column.index === 0) {
          data.cell.colSpan = 2;
          data.cell.styles.halign = "center";
        }
        if (data.section === "foot" && data.column.index === 1) {
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
      head: [["No", "Proyek", "Unit", "Kode Produksi"]],
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
        1: { cellWidth: 58 },
        2: { cellWidth: 25, halign: "center" },
        3: { cellWidth: 84 },
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
        project: context.project,
        department: context.department,
        project_code: context.project?.code ?? null,
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

  writeTableField(workbook: ExcelJS.Workbook, field: TemplateInputField, value: any[]) {
    const config = this.getTableConfig(field);
    if (!config) return;

    const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
    const sheet = workbook.worksheets[sheetIndex] ?? workbook.worksheets[0];
    const rows = Array.isArray(value)
      ? value.filter((row) => Object.values(row ?? {}).some((cellValue) => String(cellValue ?? "").trim()))
      : [];
    const maxRows = Math.max(config.endRow - config.startRow + 1, 0);

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
          horizontal: ["number", "select"].includes(String(column.type || "")) ? "center" : "left",
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

    const shouldWrap = field.wrap === true || field.type === "textarea";
    const shouldShrink = field.shrink === true;
    if (field.horizontal || field.vertical || shouldWrap || shouldShrink) {
      target.alignment = {
        ...(target.alignment || {}),
        ...(field.horizontal ? { horizontal: field.horizontal } : {}),
        ...(field.vertical ? { vertical: field.vertical } : {}),
        ...(shouldWrap ? { wrapText: true } : {}),
        ...(shouldShrink ? { shrinkToFit: true } : {}),
      };
    }
    this.applyGeneratedCellPadding(target, {
      horizontal: field.horizontal || (field.type === "number" || field.type === "currency" ? "right" : "left"),
      vertical: field.vertical || (field.type === "textarea" ? "top" : "middle"),
      wrap: field.wrap !== false,
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
      if (mergeRange && !sheet.getCell(cellAddress).isMerged) {
        sheet.mergeCells(mergeRange);
      }
      const target = sheet.getCell(cellAddress);
      target.value = this.fitTextForBox(text, 115, 4);
      target.font = { ...(target.font || {}), name: field.font_name || field.fontName || "Arial", size: Number(field.font_size || field.fontSize || 11) };
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
      case "project_name": return context.project?.name ?? "";
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");

    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, nik, job_title, email, department_id, office_id, role")
      .eq("id", user.id)
      .single();

    if (profileResult.error) throw profileResult.error;

    const profile = profileResult.data;
    const isAdmin = ["admin", "super_admin"].includes(String(profile?.role || "").toLowerCase());
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
      profile: profileRes.data,
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

    const response = await fetch(templateLink);
    if (!response.ok) throw new Error("Gagal mengambil template Excel.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];

    const inputData = payload.form_input_data ?? {};
    const requestedProject = inputData?.request_mode === "unit" ? inputData?.requested_project : null;
    const isPgdTemplate = String(context.form?.nama_form || "").toUpperCase().includes("PERMINTAAN BARANG");
    if (isPgdTemplate) {
      worksheet.getCell(payload.is_aset ? "B4" : "E4").value = "V";
      worksheet.getCell("D5").value = `: ${payload.no_surat}`;
      if (payload.office_id && context.office?.name !== "Kantor Pusat") {
        worksheet.getCell("L4").value = `: KC. ${context.office?.name || ""}`;
        worksheet.getCell("L5").value = `: ${context.project?.name || ""}`;
      } else if (requestedProject?.name) {
        worksheet.getCell("L4").value = `: ${context.department?.name || ""}`;
        worksheet.getCell("L5").value = `: ${requestedProject.name}`;
      } else {
        worksheet.getCell("L4").value = `: ${context.department?.name || ""}`;
        worksheet.getCell("L5").value = ": -";
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

  async autoApproveRecommendationFirstStep(suratId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
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
    requirement?: { key?: string; label?: string }
  ): Promise<SuratRegistrationDraftFile[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sesi login tidak tersedia.");
    const rows = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `drafts/${draftId}/${crypto.randomUUID()}_${safeName}`;
      const uploaded = await appStorageService.upload({ bucket: "lampiran_surat", path, file });
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
      const { data: { user } } = await supabase.auth.getUser();
      const officeIdClean  = this.cleanUuid(payload.office_id);
      const projectIdClean = this.cleanUuid(payload.project_id);
      const deptIdClean    = this.cleanUuid(payload.dept_id); // ← BARU: untuk partisi nomor per dept

      const [officeRes, deptRes] = await Promise.all([
        supabase.from("master_offices").select("code, kedudukan, parent_id").eq("id", officeIdClean).single(),
        supabase.from("master_departments").select("code, dept_index").eq("id", payload.dept_id).single()
      ]);

      const office  = officeRes.data;
      const isPusat = office?.kedudukan === "Pusat";
      const requestCategory = payload.form_input_data?.request_category;
      if (requestCategory === "unit" || payload.form_input_data?.request_mode === "unit") {
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

      const romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
      const bulan = romawiBulan[new Date().getMonth()];
      const tahun = new Date().getFullYear();

      let middleCode = "";
      if (requestCategory === "unit" && requestedProjectCode) {
        middleCode = `${deptCode}.${tIndex}.${requestedProjectCode}`;
      } else if (isPusat) {
        middleCode = `${deptCode}.${tIndex}`;
      } else {
        const projCode = projectRes.data?.code || "??";
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
    lampiranFiles?: File[] | File | null,
    draftAttachments: SuratRegistrationDraftFile[] = []
  ) {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        throw new Error("Sesi login tidak tersedia. Silakan login ulang.");
      }
      const user = session.user;
      const attachmentFiles = Array.isArray(lampiranFiles)
        ? lampiranFiles
        : lampiranFiles
          ? [lampiranFiles]
          : [];

      const noUrut      = parseInt(payload.no_surat.split("/")[0]);
      const currentYear = new Date().getFullYear();
      const preliminaryInputData = this.normalizeFormInputData(payload.form_input_data);
      payload = { ...payload, form_input_data: preliminaryInputData };
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
      const configuredInitialKeys = new Set(initialRequirements.map((requirement: any) => requirement.requirement_key));
      const unconfiguredAttachment = attachmentFiles.find(file => {
        const key = initialAttachmentMeta[file.name]?.key;
        return !key || !configuredInitialKeys.has(key);
      });
      if (unconfiguredAttachment) {
        throw new Error(`Lampiran ${unconfiguredAttachment.name} tidak memiliki konfigurasi yang valid.`);
      }
      initialRequirements.forEach((requirement: any) => {
        const files = attachmentFiles.filter(file => initialAttachmentMeta[file.name]?.key === requirement.requirement_key);
        const minimum = requirement.is_required
          ? Math.max(1, Number(requirement.min_files || 1))
          : Number(requirement.min_files || 0);
        const maximum = Math.max(minimum, Number(requirement.max_files || 1));
        if (files.length < minimum) {
          throw new Error(`Lampiran pemohon belum lengkap: ${requirement.label || requirement.requirement_key}.`);
        }
        if (files.length > maximum) {
          throw new Error(`Lampiran ${requirement.label || requirement.requirement_key} melebihi batas.`);
        }
        files.forEach(file => {
          const allowedTypes = Array.isArray(requirement.allowed_types) ? requirement.allowed_types : [];
          if (allowedTypes.length > 0 && file.type && !allowedTypes.includes(file.type)) {
            throw new Error(`Tipe file ${file.name} tidak diizinkan.`);
          }
          if (requirement.max_size_bytes && file.size > Number(requirement.max_size_bytes)) {
            throw new Error(`Ukuran file ${file.name} melebihi batas.`);
          }
        });
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
      if (draftAttachments.length > 0) {
        const { data, error } = await supabase
          .from("surat_attachments")
          .insert(draftAttachments.map(attachment => ({
            surat_id: surat.id,
            file_url: attachment.file_url,
            file_name: attachment.file_name,
            file_type: attachment.file_type,
            file_size: attachment.file_size,
            created_by: user.id,
            stage: "initial",
            requirement_key: attachment.requirement_key,
            requirement_label: attachment.requirement_label,
          })))
          .select("*");
        if (error) throw error;
        reusedDraftAttachments = data || [];
      }
      uploadedAttachments.push(...reusedDraftAttachments);
      if (uploadedAttachments[0]?.file_url) {
        await supabase
          .from("surat_registrasi")
          .update({ lampiran_path: uploadedAttachments[0].file_url })
          .eq("id", surat.id);
        surat.lampiran_path = uploadedAttachments[0].file_url;
      }
      surat.surat_attachments = uploadedAttachments;

      const dataSnapshot = this.buildDataSnapshot(context, payload, snapshotSigners, normalizedFormInputData, uploadedAttachments);
      await supabase
        .from("surat_registrasi")
        .update({ data_snapshot: dataSnapshot })
        .eq("id", surat.id);
      surat.data_snapshot = dataSnapshot;

      await supabase.from("surat_reservations")
        .update({ status: "USED" })
        .match({
          no_urut:     noUrut,
          entity_id:   cleanPayload.entity_id,
          year:        currentYear,
          reserved_by: user?.id,
          status:      "PENDING",
        });

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
      console.error("Error in createRegistrasi:", error);
      throw new Error(error.message);
    }
  },

  async cancelRegistration(noSurat: string) {
    const { data: { user } } = await supabase.auth.getUser();
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
    signerJobTitle: string = ""
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
      const now = new Date();
      positions.forEach((pos: any) => {
          const worksheet = workbook.worksheets[Math.max(Number(pos.sheet || 1) - 1, 0)] || workbook.worksheets[0];
          const ttdCell = worksheet.getCell(pos.ttd);
          ttdCell.value = `Approved by System\n✅\n${now.toLocaleDateString("id-ID")}\n${now.toLocaleTimeString("id-ID")} WIB`;
          ttdCell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
          const rowNum = parseInt(pos.ttd.match(/\d+/)?.[0] || "35");
          worksheet.getRow(rowNum).height = 65;
          if (pos.nama)    worksheet.getCell(pos.nama).value    = userName.toUpperCase();
          if (pos.jabatan) worksheet.getCell(pos.jabatan).value = signerJobTitle || pos.signer_job_title || pos.jobTitle || pos.labelJabatan || "";
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
    const { data: { user } } = await supabase.auth.getUser();
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi")
      .select("current_step, file_path, penggunaan_id, form_usage_id, form_input_data, data_snapshot")
      .eq("id", suratId)
      .single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");
    if (suratFresh.current_step !== currentStep) throw new Error("Dokumen sudah diproses. Silakan refresh.");

    const { data: sigInfo } = await supabase
      .from("surat_signatures")
      .select("role_name, requires_unit_allocation, action_type, signature_position_snapshot, attachment_requirements_snapshot, signer_snapshot, verification_required, verification_status")
      .eq("id", signatureId)
      .single();
    if (!sigInfo) throw new Error("Data tanda tangan tidak valid.");
    if ((sigInfo as any).verification_required && (sigInfo as any).verification_status !== "verified") {
      throw new Error("Data pengajuan belum diverifikasi tim pengecek.");
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
    if (!isPreparedByVerifier) {
      approvalRequirements.forEach((requirement: any) => {
        const files = approvalAttachments.filter(item => item.key === requirement.requirement_key);
        const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : Number(requirement.min_files || 0);
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
    if ((sigInfo.requires_unit_allocation || sigInfo.action_type === "unit_allocation") && !isPreparedByVerifier) {
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
        user?.id,
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
        user?.id,
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

    documentPreviewService.enqueuePdf(suratId, { refresh: true, signatureId }).catch((pdfError) => {
      console.error("Gagal enqueue snapshot PDF:", pdfError);
    });

    // Ambil data terbaru untuk notifikasi
    const { data: updatedSurat } = await supabase
      .from("surat_registrasi")
      .select("current_step, status, created_by, judul_surat")
      .eq("id", suratId)
      .single();

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
        await this.notifyInboxStepTasks(
          suratId,
          updatedSurat.current_step,
          updatedSurat.judul_surat,
          "next_inbox"
        );
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
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sigInfo, error: sigError } = await supabase
      .from("surat_signatures")
      .select("surat_id, user_id, step_order, requires_unit_allocation, action_type, attachment_requirements_snapshot")
      .eq("id", signatureId)
      .single();
    if (sigError || !sigInfo) throw new Error("Data verifikasi tidak ditemukan.");

    const suratId = options.suratId || sigInfo.surat_id;
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi")
      .select("file_path, penggunaan_id, judul_surat, form_input_data, data_snapshot")
      .eq("id", suratId)
      .single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");

    let formInputData = suratFresh.form_input_data ?? {};
    let workingFilePath = suratFresh.file_path;
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
      const minimum = requirement.is_required ? Math.max(1, Number(requirement.min_files || 1)) : Number(requirement.min_files || 0);
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
      const units = options.unitAllocation?.units ?? [];
      const requestedProject = formInputData?.requested_project || {};
      const project = requestedProject?.code ? requestedProject : options.unitAllocation?.project;
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

    const { data: allAttachments } = await supabase
      .from("surat_attachments")
      .select("*")
      .eq("surat_id", suratId)
      .order("created_at", { ascending: true });

    const { error: updateError } = await supabase
      .from("surat_registrasi")
      .update({
        file_path: workingFilePath,
        form_input_data: formInputData,
        data_snapshot: {
          ...(suratFresh.data_snapshot || {}),
          input: formInputData,
          requested_project: formInputData?.requested_project ?? null,
          allocated_project: formInputData?.allocated_project ?? null,
          requested_unit_count: formInputData?.requested_unit_count ?? null,
          allocated_units: formInputData?.allocated_units ?? [],
          allocated_unit_count: formInputData?.allocated_unit_count ?? null,
          attachments: allAttachments || [],
        },
      })
      .eq("id", suratId);
    if (updateError) throw updateError;

    const { data, error } = await supabase.rpc("verify_surat_signature", {
      p_sig_id: signatureId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Gagal memverifikasi data.");
    if (sigInfo.user_id) {
      const link = `/surat/inbox?task=${signatureId}`;
      const message = `Surat "${suratFresh.judul_surat}" sudah diverifikasi dan siap ditindaklanjuti`;
      this.sendNotification(
        [sigInfo.user_id],
        "Verifikasi Selesai",
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
    if (!data) throw new Error("Gagal mengembalikan ke tim pengecek.");
    return true;
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
        .eq("verification_status", "pending")
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
      if (!surat || Number(sig.step_order) !== Number(surat.current_step)) return null;
      const key = `${sig.task_type}:${sig.id}`;
      if (seen.has(key)) return null;
      seen.add(key);
      surat.surat_signatures = [...(surat.surat_signatures || [])]
        .sort((a: any, b: any) => Number(a.step_order) - Number(b.step_order));
      return { ...sig, surat_registrasi: surat };
    }).filter(Boolean);
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

    const { data: { session } } = await supabase.auth.getSession();
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
    const res = await Promise.all([
      supabase.from("master_entities").select("*"),
      supabase.from("master_offices").select("*"),
      supabase.from("master_departments").select("*"),
      supabase.from("master_letter_types").select("*"),
      supabase.from("master_dept_letter_types").select("dept_id, letter_type_id, sort_index"),
      supabase.from("profiles").select("id, full_name, job_title, department_id, office_id").eq("is_active", true).order("full_name"),
      supabase.from("master_projects").select("*").order("name"),
      supabase.from("master_penggunaan_detail").select("*").order("created_at", { ascending: false })
    ]);
    const typeDepartmentMap = new Map<string, string[]>();
    const typeSortMap = new Map<string, number>();
    const typeDepartmentSortMap = new Map<string, Record<string, number>>();
    (res[4].data || []).forEach((row: any) => {
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
    const letterTypes = (res[3].data || [])
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
      entities:   res[0].data || [], offices:    res[1].data || [],
      depts:      res[2].data || [], types:      letterTypes,
      users:      res[5].data || [], projects:   res[6].data || [],
      penggunaan: res[7].data || []
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
