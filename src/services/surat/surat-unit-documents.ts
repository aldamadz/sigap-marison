import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { parseRupiahInteger } from "@/lib/rupiah";

export const getUnitCode = (unit: any) => String(
  unit?.raw?.code ||
  unit?.raw?.unit_code ||
  unit?.raw?.kode ||
  unit?.code ||
  unit?.value ||
  unit?.label ||
  "-"
).trim();

export const parseMoney = (value: any) => parseRupiahInteger(value);

export const formatRupiah = (value: any) => {
  const amount = parseMoney(value);
  if (amount === 0) return "";
  return new Intl.NumberFormat("id-ID").format(amount);
};

export const formatProductionDate = (value: string) => {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const buildProductionCode = (unit: any) => {
  const detail = unit?.allocation_detail || {};
  const serial = String(detail.production_serial || detail.kode_produksi_nomor || "").trim();
  const block = String(detail.production_block || detail.kode_produksi_blok || "").trim();
  const rawDate = String(detail.production_date || detail.kode_produksi_tanggal || "").trim();
  const formattedDate = rawDate ? formatProductionDate(rawDate) : "";
  if (!serial && !block && !formattedDate) return "";
  return `${serial}/UAI/PRC/${block}/${formattedDate}`;
};

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
    head: [["No", "Kavling", "Struktur Atas", "Struktur Bawah", "Nominal"]],
    body,
    foot: [["TOTAL", "", formatRupiah(totalAtas), formatRupiah(totalBawah), formatRupiah(totalNominal)]],
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
};

export const createProductionCodeAttachment = (project: any, units: any[]) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 15;
  const body = units.map((unit, index) => [
    String(index + 1),
    project?.name || project?.label || "-",
    getUnitCode(unit),
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
};
