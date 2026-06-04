import { supabase } from "@/lib/supabase";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { notificationService } from "./notification.service";
import { documentPreviewService } from "./document-preview.service";
import { appStorageService } from "./storage.service";

type TableInputColumn = {
  key: string;
  label: string;
  column: string;
  required?: boolean;
  type?: "text" | "number";
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

export const suratService = {
  getUnitConfigFromForm(form: any) {
    const raw = form?.unit_config;
    const parsed = typeof raw === "string" ? (() => {
      try { return JSON.parse(raw || "{}"); } catch { return {}; }
    })() : (raw || {});
    return {
      enabled: parsed.enabled === true,
      request_sentence_cell: String(parsed.request_sentence_cell || "C11").trim().toUpperCase(),
      allowed_department_ids: Array.isArray(parsed.allowed_department_ids) ? parsed.allowed_department_ids : [],
      initial_attachment_required: parsed.initial_attachment_required === true,
      allocation_attachment_requirements: Array.isArray(parsed.allocation_attachment_requirements)
        ? parsed.allocation_attachment_requirements
        : [],
    };
  },

  async sendEmailNotification(userIds: string[], title: string, message: string, link?: string) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (ids.length === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch("/api/notifications/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_ids: ids, title, message, link }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Gagal mengirim email.");
      }
    } catch (error) {
      console.error("Email notification error:", error);
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

  normalizeFormInputData(inputData: any) {
    const normalized = { ...(inputData ?? {}) };
    if (Array.isArray(normalized.items)) {
      normalized.items = normalized.items.filter((row: any) =>
        Object.values(row ?? {}).some((value) => String(value ?? "").trim())
      );
    }
    return normalized;
  },

  createUnitCodesAttachment(project: any, units: any[]) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const gap = 4;
    const columns = 3;
    const boxWidth = (pageWidth - (margin * 2) - (gap * (columns - 1))) / columns;
    const boxHeight = 16;
    let x = margin;
    let y = 35;

    const renderHeader = () => {
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("DAFTAR KODE UNIT", margin, 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Proyek: ${project?.name || project?.label || "-"}`, margin, 24);
      doc.text(`Cabang: ${project?.branch?.name || "-"}`, margin, 29);
    };

    renderHeader();
    units.forEach((unit, index) => {
      if (y + boxHeight > 285) {
        doc.addPage();
        renderHeader();
        x = margin;
        y = 35;
      }

      const code = String(
        unit?.raw?.code ||
        unit?.raw?.unit_code ||
        unit?.raw?.kode ||
        unit?.code ||
        unit?.value ||
        unit?.label ||
        "-"
      ).trim();
      doc.setFillColor(255, 235, 59);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.rect(x, y, boxWidth, boxHeight, "FD");
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(code, x + (boxWidth / 2), y + 9.5, { align: "center", maxWidth: boxWidth - 4 });

      if ((index + 1) % columns === 0) {
        x = margin;
        y += boxHeight + gap;
      } else {
        x += boxWidth + gap;
      }
    });

    const safeProject = String(project?.code || project?.name || "unit").replace(/[^\w.-]+/g, "_");
    return new File(
      [doc.output("blob")],
      `Daftar_Kode_Unit_${safeProject}_${Date.now()}.pdf`,
      { type: "application/pdf" }
    );
  },

  async getSignerSnapshots(signers: any[]) {
    const userIds = signers.map((s) => s.user_id).filter(Boolean);
    if (userIds.length === 0) return {};

    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, nik, job_title, email, department_id, office_id")
      .in("id", userIds);

    return Object.fromEntries((data || []).map((profile: any) => [profile.id, profile]));
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
      requested_project: formInputData?.requested_project ?? null,
      requested_unit_count: formInputData?.requested_unit_count ?? null,
      allocated_units: formInputData?.allocated_units ?? [],
      allocated_unit_count: formInputData?.allocated_unit_count ?? null,
      catatan: formInputData?.catatan ?? null,
      signers,
      attachments,
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
      if (config.noColumn) sheet.getCell(`${config.noColumn}${excelRow}`).value = index + 1;
      config.columns.forEach((column: TableInputColumn) => {
        const rawValue = row?.[column.key];
        sheet.getCell(`${column.column}${excelRow}`).value = this.formatInputValue(rawValue, column.type);
      });
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

    const rowHeight = Number(field.row_height || field.rowHeight || 0);
    if (rowHeight > 0) {
      this.getRowsForField(field, range).forEach((rowNumber) => {
        sheet.getRow(rowNumber).height = rowHeight;
      });
    }
  },

  writeWrappedField(sheet: ExcelJS.Worksheet, field: TemplateInputField, value: any) {
    const text = this.formatInputValue(value, field.type);
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

    const [profileRes, officeRes, projectRes, deptRes, entityRes, usageRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, nik, job_title, email, department_id, office_id").eq("id", user.id).single(),
      payload.office_id ? supabase.from("master_offices").select("id, name, code, kedudukan").eq("id", payload.office_id).maybeSingle() : Promise.resolve({ data: null }),
      payload.project_id ? supabase.from("master_projects").select("id, name, code, office_id, entity_id").eq("id", payload.project_id).maybeSingle() : Promise.resolve({ data: null }),
      payload.dept_id ? supabase.from("master_departments").select("id, name, code, dept_index").eq("id", payload.dept_id).maybeSingle() : Promise.resolve({ data: null }),
      payload.entity_id ? supabase.from("master_entities").select("id, name, code").eq("id", payload.entity_id).maybeSingle() : Promise.resolve({ data: null }),
      payload.penggunaan_id
        ? supabase
            .from("master_penggunaan_detail")
            .select("*, master_forms!fk_master_forms(id, nama_form, nomor_form, link_form, input_schema, unit_config, department_id)")
            .eq("id", payload.penggunaan_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    if (profileRes.error) throw profileRes.error;

    return {
      user,
      profile: profileRes.data,
      office: officeRes.data,
      project: projectRes.data,
      department: deptRes.data,
      entity: entityRes.data,
      usage: usageRes.data,
      form: (usageRes.data as any)?.master_forms ?? null,
      payload,
    };
  },

  async buildFilledTemplateFile(payload: any): Promise<{ publicUrl: string; context: any }> {
    const context = await this.getTemplateContext(payload);
    const templateLink = context.form?.link_form;
    if (!templateLink) throw new Error("Template Excel belum tersedia untuk matrix ini.");

    const response = await fetch(templateLink);
    if (!response.ok) throw new Error("Gagal mengambil template Excel.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];

    worksheet.getCell(payload.is_aset ? "B4" : "E4").value = "V";
    worksheet.getCell("D5").value = `: ${payload.no_surat}`;
    if (payload.office_id && context.office?.name !== "Kantor Pusat") {
      worksheet.getCell("L4").value = `: KC. ${context.office?.name || ""}`;
      worksheet.getCell("L5").value = `: ${context.project?.name || ""}`;
    } else {
      worksheet.getCell("L4").value = `: ${context.department?.name || ""}`;
      worksheet.getCell("L5").value = ": -";
    }

    const inputData = payload.form_input_data ?? {};
    const schema = this.parseInputSchema(context.form?.input_schema);
    if (!this.hasPlaceDateMapping(schema)) {
      throw new Error("Template belum memiliki mapping cell untuk Tempat, Tanggal.");
    }
    schema.forEach((field) => {
      if (field.key === "requested_unit_count" && inputData.request_mode !== "unit") return;
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
    if (inputData.request_mode === "unit") {
      const unitConfig = this.getUnitConfigFromForm(context.form);
      const sentence = String(inputData.unit_request_sentence || "").trim();
      if (unitConfig.request_sentence_cell && sentence) {
        worksheet.getCell(unitConfig.request_sentence_cell).value = sentence;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeNumber = String(payload.no_surat ?? "draft").replace(/[^\w-]+/g, "_");
    const path = `dokumen/system_${safeNumber}_${Date.now()}.xlsx`;
    const uploaded = await appStorageService.upload({
      bucket: "dokumen_surat",
      path,
      file: new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      upsert: true,
    });
    return { publicUrl: uploaded.publicUrl, context };
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
        // Ambil type_index langsung dari master_letter_types (bukan mapping yang kosong)
        supabase.from("master_letter_types")
          .select("type_index")
          .eq("id", payload.letter_type_id)
          .single()
      ]);

      const noUrutStr  = String(nextNumber).padStart(3, "0");
      const entityCode = entityRes.data?.code || "??";
      const deptCode   = deptRes.data?.code   || "";
      const dIndex     = deptRes.data?.dept_index  || "0";
      const tIndex     = typeRes.data?.type_index  || "0";

      const romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
      const bulan = romawiBulan[new Date().getMonth()];
      const tahun = new Date().getFullYear();

      let middleCode = "";
      if (isPusat) {
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

  async createRegistrasi(payload: any, signers: any[], file: File | null, lampiranFiles?: File[] | File | null) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const attachmentFiles = Array.isArray(lampiranFiles)
        ? lampiranFiles
        : lampiranFiles
          ? [lampiranFiles]
          : [];

      const noUrut      = parseInt(payload.no_surat.split("/")[0]);
      const currentYear = new Date().getFullYear();
      const normalizedFormInputData = this.normalizeFormInputData(payload.form_input_data);
      payload = { ...payload, form_input_data: normalizedFormInputData };
      const configContext = await this.getTemplateContext(payload);
      const unitConfig = this.getUnitConfigFromForm(configContext.form);
      const isUnitMode = normalizedFormInputData?.request_mode === "unit";
      if (isUnitMode) {
        normalizedFormInputData.unit_config_snapshot = unitConfig;
        payload = { ...payload, form_input_data: normalizedFormInputData };
      }

      if (attachmentFiles.length === 0 && (!isUnitMode || unitConfig.initial_attachment_required)) {
        throw new Error("Minimal satu lampiran wajib diunggah.");
      }

      const generated = file ? null : await this.buildFilledTemplateFile(payload);
      const context = generated?.context ?? configContext;
      const activeSigners = signers.filter(s => s.user_id);
      const signerSnapshots = await this.getSignerSnapshots(activeSigners);
      const totalSteps = activeSigners.length;
      const snapshotSigners = activeSigners.map((s, idx) => {
        const profile = signerSnapshots[s.user_id] ?? {};
        return {
          user_id: s.user_id,
          full_name: profile.full_name ?? null,
          nik: profile.nik ?? null,
          job_title: profile.job_title ?? null,
          email: profile.email ?? null,
          role_name: this.normalizeRoleName(s.role_name, Number(s.step_order || idx + 1), totalSteps),
          label_jabatan: s.label_jabatan ?? null,
          step_order: Number(s.step_order || idx + 1),
          status: "PENDING",
          is_signed: false,
        };
      });

      const cleanPayload = {
        ...payload,
        entity_id:      this.cleanUuid(payload.entity_id),
        office_id:      this.cleanUuid(payload.office_id),
        project_id:     this.cleanUuid(payload.project_id),
        dept_id:        this.cleanUuid(payload.dept_id),
        letter_type_id: this.cleanUuid(payload.letter_type_id),
        penggunaan_id:  this.cleanUuid(payload.penggunaan_id),
        created_by:     user?.id,
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
        .from("surat_registrasi").insert(cleanPayload).select().single();

      if (suratError) throw suratError;

      const uploadedAttachments = await this.uploadAttachmentFiles(surat.id, attachmentFiles, user?.id, { stage: "initial" });
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
        signer_snapshot: signerSnapshots[s.user_id] ?? {},
      }));

      if (signerPayload.length > 0) {
        await supabase.from("surat_signatures").insert(signerPayload);
        
        // Notifikasi ke step pertama
        const firstStepOrd = Math.min(...signerPayload.map((s: any) => s.step_order));
        const firstSigners = signerPayload.filter((s: any) => s.step_order === firstStepOrd);
        
        const notificationResults = await Promise.allSettled(
          firstSigners.map((s: any) =>
            notificationService.createNotification(
              s.user_id,
              'Surat Masuk Baru',
              `Surat "${cleanPayload.judul_surat}" telah diajukan dan memerlukan tindakan Anda`,
              'info',
              `/surat/inbox`
            )
          )
        );
        this.sendEmailNotification(
          firstSigners.map((s: any) => s.user_id),
          "Surat Masuk Baru",
          `Surat "${cleanPayload.judul_surat}" telah diajukan dan memerlukan tindakan Anda`,
          "/surat/inbox"
        );

        notificationResults.forEach((result) => {
          if (result.status === 'rejected') console.error("Notif error:", result.reason);
        });
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
      .update({ status: "CANCELLED" })
      .match({ no_urut: noUrut, reserved_by: user?.id, year: currentYear, status: "PENDING" });
    if (error) throw error;
    return true;
  },

  async stampApprovalExcel(suratId: string, currentFilePath: string, userName: string, roleName: string, usageId: string, stepOrder: number): Promise<string> {
    const { data: usageDetail } = await supabase.from("master_penggunaan_detail").select("*").eq("id", usageId).single();
    if (!usageDetail) return currentFilePath;

    const fileData = await this.downloadStorageFile(currentFilePath, "dokumen_surat");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await fileData.arrayBuffer());
    const positions = this.resolveStampPositions(usageDetail, roleName, stepOrder);

    if (positions && positions.length > 0) {
      const now = new Date();
      workbook.worksheets.forEach(worksheet => {
        positions.forEach((pos: any) => {
          const ttdCell = worksheet.getCell(pos.ttd);
          ttdCell.value = `Approved by System\n✅\n${now.toLocaleDateString("id-ID")}\n${now.toLocaleTimeString("id-ID")} WIB`;
          ttdCell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
          const rowNum = parseInt(pos.ttd.match(/\d+/)?.[0] || "35");
          worksheet.getRow(rowNum).height = 65;
          if (pos.nama)    worksheet.getCell(pos.nama).value    = userName.toUpperCase();
          if (pos.jabatan) worksheet.getCell(pos.jabatan).value = pos.labelJabatan || "";
        });
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

    schema.forEach((field) => {
      const source = field.default_source || field.defaultSource || "manual";
      if (source !== "manual") return;
      if (field.key === "requested_unit_count" && formInputData?.request_mode !== "unit") return;
      if (field.type === "table") {
        this.writeTableField(workbook, field, formInputData?.[field.key]);
        return;
      }
      if (!field.cell && !(field.merge_range || field.mergeRange)) return;
      const sheetIndex = Math.max(Number(field.sheet || 1) - 1, 0);
      const sheet = workbook.worksheets[sheetIndex] ?? worksheet;
      this.writeWrappedField(sheet, field, formInputData?.[field.key]);
    });
    if (formInputData?.request_mode === "unit") {
      const unitConfig = this.getUnitConfigFromForm((usageDetail as any)?.master_forms);
      const sentence = String(formInputData?.unit_request_sentence || "").trim();
      if (unitConfig.request_sentence_cell && sentence) {
        worksheet.getCell(unitConfig.request_sentence_cell).value = sentence;
      }
    }

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
    options: { unitAllocation?: { project?: any; units: any[]; attachments?: Array<{ key: string; label: string; file: File }> } } = {}
  ): Promise<{ success: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: suratFresh, error: suratErr } = await supabase
      .from("surat_registrasi")
      .select("current_step, file_path, penggunaan_id, form_input_data, data_snapshot")
      .eq("id", suratId)
      .single();
    if (suratErr || !suratFresh) throw new Error("Dokumen tidak ditemukan.");
    if (suratFresh.current_step !== currentStep) throw new Error("Dokumen sudah diproses. Silakan refresh.");

    const { data: sigInfo } = await supabase.from("surat_signatures").select("role_name, requires_unit_allocation").eq("id", signatureId).single();
    if (!sigInfo) throw new Error("Data tanda tangan tidak valid.");

    let workingFilePath = suratFresh.file_path;
    let formInputData = suratFresh.form_input_data ?? {};
    let uploadedAllocationAttachments: any[] = [];
    if (sigInfo.requires_unit_allocation) {
      const units = options.unitAllocation?.units ?? [];
      const project = options.unitAllocation?.project;
      const allocationAttachments = options.unitAllocation?.attachments ?? [];
      const requestedCount = Number(formInputData?.requested_unit_count || 0);
      if (formInputData?.request_mode !== "unit") throw new Error("Dokumen ini bukan pengajuan unit.");
      if (!Number.isFinite(requestedCount) || requestedCount < 1) throw new Error("Jumlah unit pengajuan tidak valid.");
      if (!project?.code) throw new Error("Project unit wajib dipilih.");
      if (!Array.isArray(units) || units.length < requestedCount) {
        throw new Error(`Unit terpilih kurang. Minimal ${requestedCount} unit.`);
      }

      const { data: usageDetail } = await supabase
        .from("master_penggunaan_detail")
        .select("master_forms!fk_master_forms(unit_config)")
        .eq("id", suratFresh.penggunaan_id)
        .single();
      const unitConfig = this.getUnitConfigFromForm((usageDetail as any)?.master_forms);
      const requirements = unitConfig.allocation_attachment_requirements || [];
      const requiredRequirements = requirements.filter((requirement: any) => requirement.required !== false);
      const attachedKeys = new Set(allocationAttachments.filter((item) => item.file).map((item) => item.key));
      const missingRequirements = requiredRequirements.filter((requirement: any) => !attachedKeys.has(requirement.key));
      if (missingRequirements.length > 0) {
        throw new Error(`Lampiran unit belum lengkap: ${missingRequirements.map((item: any) => item.label || item.key).join(", ")}.`);
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

      const unitCodesAttachment = this.createUnitCodesAttachment(project, units);
      uploadedAllocationAttachments = await this.uploadAttachmentFiles(
        suratId,
        [
          ...allocationAttachments.map((item) => item.file),
          unitCodesAttachment,
        ],
        user?.id,
        {
          stage: "unit_allocation",
          signature_id: signatureId,
          requirements: {
            ...Object.fromEntries(allocationAttachments.map((item) => [
              item.file.name,
              { key: item.key, label: item.label },
            ])),
            [unitCodesAttachment.name]: {
              key: "unit_codes",
              label: "Daftar Kode Unit",
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

    let finalUrl = workingFilePath ?? "";
    if (workingFilePath?.split("?")[0].toLowerCase().endsWith(".xlsx") && suratFresh.penggunaan_id) {
      finalUrl = await this.stampApprovalExcel(suratId, workingFilePath, userName, sigInfo.role_name, suratFresh.penggunaan_id, currentStep);
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
        notificationService.createNotification(
          updatedSurat.created_by,
          'Surat Ditandatangani',
          `Surat "${updatedSurat.judul_surat}" telah ditandatangani oleh ${userName}`,
          'success',
          `/surat/monitoring`
        ).catch(e => console.error(e));
        this.sendEmailNotification(
          [updatedSurat.created_by],
          "Surat Ditandatangani",
          `Surat "${updatedSurat.judul_surat}" telah ditandatangani oleh ${userName}`,
          "/surat/monitoring"
        );
      }

      // 2. Notif ke next signer jika masih diproses dan step bertambah
      if (updatedSurat.status === 'PROSES' && updatedSurat.current_step > currentStep) {
        await supabase
          .from("surat_signatures")
          .update({ available_at: new Date().toISOString() })
          .eq("surat_id", suratId)
          .eq("step_order", updatedSurat.current_step)
          .is("available_at", null);

        const { data: nextSigners } = await supabase
          .from("surat_signatures")
          .select("user_id")
          .eq("surat_id", suratId)
          .eq("step_order", updatedSurat.current_step);
          
        if (nextSigners && nextSigners.length > 0) {
          const notificationResults = await Promise.allSettled(
            nextSigners.map((ns: any) =>
              notificationService.createNotification(
                ns.user_id,
                'Surat Masuk Baru',
                `Surat "${updatedSurat.judul_surat}" memerlukan tindakan Anda`,
                'info',
                `/surat/inbox`
              )
            )
          );

          notificationResults.forEach((result) => {
            if (result.status === 'rejected') console.error("Notif error:", result.reason);
          });
          this.sendEmailNotification(
            nextSigners.map((ns: any) => ns.user_id),
            "Surat Masuk Baru",
            `Surat "${updatedSurat.judul_surat}" memerlukan tindakan Anda`,
            "/surat/inbox"
          );
        }
      }
    }

    return { success: true };
  },

  async rejectSurat(signatureId: string, suratId: string, note: string) {
    const { error: sigError } = await supabase.from("surat_signatures")
      .update({ is_signed: true, signed_at: new Date().toISOString(), catatan: note, status: "REJECTED" })
      .eq("id", signatureId);
    if (sigError) throw sigError;
    const { error: suratError } = await supabase.from("surat_registrasi").update({ status: "REJECTED" }).eq("id", suratId);
    if (suratError) throw suratError;

    // Notif ke pembuat surat
    const { data: suratInfo } = await supabase.from('surat_registrasi').select('created_by, judul_surat').eq('id', suratId).single();
    if (suratInfo?.created_by) {
       notificationService.createNotification(
         suratInfo.created_by,
         'Surat Ditolak',
         `Surat "${suratInfo.judul_surat}" telah ditolak. Catatan: ${note}`,
         'error',
         `/surat/monitoring`
       ).catch(e => console.error(e));
       this.sendEmailNotification(
         [suratInfo.created_by],
         "Surat Ditolak",
         `Surat "${suratInfo.judul_surat}" telah ditolak. Catatan: ${note}`,
         "/surat/monitoring"
       );
    }

    return true;
  },

  async getMyInbox(userId: string) {
    const { data, error } = await supabase
      .from("surat_signatures").select(`
        id, role_name, step_order, is_signed, surat_id, requires_unit_allocation,
        surat_registrasi!inner (
          *,
          surat_attachments ( id, file_url, file_name, file_type, file_size, stage, requirement_key, requirement_label, signature_id )
        )
      `)
      .eq("user_id", userId).eq("is_signed", false);
    if (error) return [];
    return data.map((sig: any) => {
      const surat = Array.isArray(sig.surat_registrasi) ? sig.surat_registrasi[0] : sig.surat_registrasi;
      if (!surat || Number(sig.step_order) !== Number(surat.current_step)) return null;
      return { ...sig, surat_registrasi: surat };
    }).filter(Boolean);
  },

  async uploadFile(file: File) {
    const filePath = `dokumen/${Date.now()}_${file.name}`;
    const uploaded = await appStorageService.upload({ bucket: "dokumen_surat", path: filePath, file });
    return uploaded.publicUrl;
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
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("master_projects").select("*").order("name"),
      supabase.from("master_penggunaan_detail").select("*").order("created_at", { ascending: false })
    ]);
    return {
      entities:   res[0].data || [], offices:    res[1].data || [],
      depts:      res[2].data || [], types:      res[3].data || [],
      users:      res[4].data || [], projects:   res[5].data || [],
      penggunaan: res[6].data || []
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
