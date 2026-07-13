import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import path from "node:path";
import {
  buildDynamicSignatureLayout,
  parseSignatureRegion,
} from "@/services/signature-layout.service";

describe("dynamic signature layout", () => {
  it("parses merged ranges and normalizes direction", () => {
    expect(parseSignatureRegion("N45:B33")).toEqual({
      startCol: 2,
      startRow: 33,
      endCol: 14,
      endRow: 45,
    });
  });

  it("creates one row for four signers", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Form");
    worksheet.mergeCells("B33:N45");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "adaptive",
      sheet: 1,
      region: "B33:N45",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, Array.from({ length: 4 }, (_item, index) => ({
      step_order: index + 1,
      role_name: index === 0 ? "membuat" : "menyetujui",
      label: `Signer ${index + 1}`,
      job_title: index === 0 ? "Mgr. PO" : "Direktur",
    })), { requestPlaceDate: "Magelang, 20 Juli 2026" });

    expect(positions).toHaveLength(4);
    expect(worksheet.getCell("B33").value).toBe("Magelang, 20 Juli 2026");
    expect(worksheet.getCell("B33").alignment.horizontal).toBe("left");
    expect(worksheet.getCell("B33").alignment.indent).toBe(1);
    expect(positions[0].header_range).toBe("B34:D34");
    expect(positions[0].job_title).toBe("Mgr. PO");
    expect(worksheet.getCell("B45").value).toBe("Mgr. PO");
    expect(positions[3].header_range).toBe("E34:N34");
    expect(worksheet.getCell("E34").value).toBe("Menyetujui");
  });

  it("creates two rows for eight signers", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Form");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "adaptive",
      sheet: 1,
      region: "B20:N35",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, Array.from({ length: 8 }, (_item, index) => ({
      step_order: index + 1,
      role_name: "memeriksa",
      label: `Signer ${index + 1}`,
    })));

    expect(positions).toHaveLength(8);
    expect(positions[4].header_range).toBe("B28:N28");
    expect(positions[7].job_range).toBe("K35:N35");
  });

  it("keeps second row signer boxes aligned to first row slots", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Form");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "adaptive",
      sheet: 1,
      region: "B20:N35",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, Array.from({ length: 5 }, (_item, index) => ({
      step_order: index + 1,
      role_name: "memeriksa",
      label: `Signer ${index + 1}`,
    })));

    expect(positions[0].header_range).toBe("B21:N21");
    expect(positions[4].header_range).toBe("F28:N28");
    expect(positions[4].ttd_range).toBe("J29:N33");
  });

  it("merges adjacent headers when the approval role is the same", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Form");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "adaptive",
      sheet: 1,
      region: "B20:N32",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, [
      { step_order: 1, role_name: "membuat", label: "Staff Admin" },
      { step_order: 2, role_name: "membuat", label: "Supervisor Admin" },
      { step_order: 3, role_name: "menyetujui", label: "Direktur" },
    ]);

    expect(positions[0].header_range).toBe("B21:I21");
    expect(positions[1].header_range).toBe("B21:I21");
    expect(positions[2].header_range).toBe("J21:N21");
    expect(worksheet.getCell("B21").value).toBe("Membuat");
    expect(worksheet.getCell("J21").value).toBe("Menyetujui");
  });

  it("matches the PGD five-step template with one Membuat signer", () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Form");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "pgd",
      sheet: 1,
      region: "D33:N45",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, [
      { step_order: 1, role_name: "membuat", label: "Signer 1" },
      { step_order: 2, role_name: "memeriksa", label: "Signer 2" },
      { step_order: 3, role_name: "memeriksa", label: "Signer 3" },
      { step_order: 4, role_name: "menyetujui", label: "Signer 4" },
      { step_order: 5, role_name: "menyetujui", label: "Signer 5" },
    ], { requestPlaceDate: "Magelang, 10 Juni 2026" });

    expect(positions.map(position => position.ttd_range)).toEqual([
      "H35:J37",
      "K35:M37",
      "N35:N37",
      "K41:M43",
      "N41:N43",
    ]);
    expect(positions.map(position => position.header_range)).toEqual([
      "H34:J34",
      "K34:N34",
      "K34:N34",
      "K40:N40",
      "K40:N40",
    ]);
    expect(worksheet.getCell("H33").value).toBe("Magelang, 10 Juni 2026");
    expect(worksheet.getCell("H33").alignment.horizontal).toBe("center");
    expect(worksheet.getCell("H33").border.bottom?.style).toBe("thin");
  });

  it("matches the PGD six-step template with a three plus three layout", () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Form");
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "pgd",
      sheet: 1,
      region: "D33:N45",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, [
      { step_order: 1, role_name: "membuat", label: "Signer 1" },
      { step_order: 2, role_name: "membuat", label: "Signer 2" },
      { step_order: 3, role_name: "memeriksa", label: "Signer 3" },
      { step_order: 4, role_name: "memeriksa", label: "Signer 4" },
      { step_order: 5, role_name: "menyetujui", label: "Signer 5" },
      { step_order: 6, role_name: "menyetujui", label: "Signer 6" },
    ]);

    expect(positions.map(position => position.ttd_range)).toEqual([
      "H35:J37",
      "K35:M37",
      "N35:N37",
      "H41:J43",
      "K41:M43",
      "N41:N43",
    ]);
    expect(positions[0].header_range).toBe("H34:M34");
    expect(positions[2].header_range).toBe("N34:N34");
    expect(positions[4].header_range).toBe("K40:N40");
  });

  it("rebuilds the real four-box PGD workbook using its reference pattern", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(
      process.cwd(),
      "public",
      "template excel",
      "Form PGD 4 Kotak 2 membuat.xlsx"
    ));
    const worksheet = workbook.worksheets[0];
    const positions = buildDynamicSignatureLayout(workbook, {
      enabled: true,
      preset: "pgd",
      sheet: 1,
      region: "D33:N45",
      max_per_row: 4,
      show_role: true,
      show_name: true,
      show_job_title: true,
    }, [
      { step_order: 1, role_name: "membuat", label: "Staff 1" },
      { step_order: 2, role_name: "membuat", label: "Staff 2" },
      { step_order: 3, role_name: "memeriksa", label: "Manager" },
      { step_order: 4, role_name: "menyetujui", label: "Direktur" },
    ], { requestPlaceDate: "Magelang, 10 Juni 2026" });

    expect(positions.map(position => position.ttd_range)).toEqual([
      "G35:G37",
      "H35:J37",
      "K35:M37",
      "N35:N37",
    ]);
    expect(positions.map(position => position.header_range)).toEqual([
      "G34:J34",
      "G34:J34",
      "K34:M34",
      "N34:N34",
    ]);
    expect(worksheet.getCell("G33").value).toBe("Magelang, 10 Juni 2026");
    expect(worksheet.getCell("G35").border.left?.style).toBe("thin");
    expect(worksheet.getCell("G35").border.top?.style).toBe("thin");
    expect(worksheet.getCell("G35").border.bottom?.style).toBe("thin");
    expect(worksheet.getCell("G38").border.bottom?.style).toBe("thin");

    const saved = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(saved);
    const reopenedSheet = reopened.worksheets[0];
    expect(reopenedSheet.getCell("G33").value).toBe("Magelang, 10 Juni 2026");
    expect(reopenedSheet.getCell("G35").border.left?.style).toBe("thin");
    expect(reopenedSheet.getCell("G35").border.bottom?.style).toBe("thin");
    expect((reopenedSheet.model as { merges?: string[] }).merges).toEqual(expect.arrayContaining([
      "G33:N33",
      "G34:J34",
      "K34:M34",
      "G35:G37",
      "H35:J37",
      "K35:M37",
      "N35:N37",
    ]));
  });
});
