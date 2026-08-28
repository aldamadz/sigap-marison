import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";
import {
  getUnitCode,
  getUnitType,
  parseMoney,
  formatRupiah,
  buildProductionCode,
} from "./form-helpers";

/**
 * PDF attachment builders extracted from suratService.
 *
 * These methods produce File blobs that are uploaded as part of the
 * unit-allocation flow. They depend on form-helpers but not on the
 * suratService instance, so they live in a separate module.
 */

const SAFE_PROJECT_RE = /[^\w.-]+/g;
const safeProjectName = (project: any) =>
  String(project?.code || project?.name || "unit").replace(SAFE_PROJECT_RE, "_");

export const createUnitRecapAttachment = (project: any, units: any[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  let totalAtas = 0;
  let totalBawah = 0;
  const body = units.map((unit, index) => {
    const atas = parseMoney(unit?.allocation_detail?.struktur_atas);
    const bawah = parseMoney(unit?.allocation_detail?.struktur_bawah);
    totalAtas += atas;
    totalBawah += bawah;
    return [
      String(index + 1),
      getUnitCode(unit),
      getUnitType(unit),
      formatRupiah(atas),
      formatRupiah(bawah),
      formatRupiah(atas + bawah),
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
    foot: [["TOTAL", "", "", formatRupiah(totalAtas), formatRupiah(totalBawah), formatRupiah(totalNominal)]],
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

  return new File(
    [doc.output("blob")],
    `Rekap_Adendum_Unit_${safeProjectName(project)}_${Date.now()}.pdf`,
    { type: "application/pdf" }
  );
};

export const createProductionCodeAttachment = (project: any, units: any[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const body = units.map((unit, index) => [
    String(index + 1),
    project?.name || project?.label || "-",
    getUnitCode(unit),
    getUnitType(unit),
    buildProductionCode(unit) || "-",
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

  return new File(
    [doc.output("blob")],
    `Kode_Produksi_Unit_${safeProjectName(project)}_${Date.now()}.pdf`,
    { type: "application/pdf" }
  );
};

/**
 * Fetches signer profile snapshots for the given signers, including any
 * job-title display overrides. No `this` dependency.
 */
export const getSignerSnapshots = async (signers: any[]) => {
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
};
