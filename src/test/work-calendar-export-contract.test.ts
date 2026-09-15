import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Export field contract (CAL-03A).
 *
 * The work calendar keeps an Excel/PDF export with the same report columns.
 * Heavy renderers (ExcelJS, jsPDF, autotable, file-saver) are replaced by
 * fail-closed fakes that capture the produced payload; nothing is written to
 * disk and no network is used.
 */
const h = vi.hoisted(() => {
  type Cell = { font: Record<string, unknown> };
  type Row = { getCell: (key: string) => Cell };
  type Worksheet = {
    columns: Array<{ header: string; key: string; width: number }>;
    rows: Array<Record<string, unknown>>;
    getRow: (index: number) => Row;
    addRow: (values: Record<string, unknown>) => Row;
  };

  const row = (): Row => {
    const cell: Cell = { font: {} };
    return { getCell: () => cell };
  };
  const worksheet: Worksheet = {
    columns: [],
    rows: [],
    getRow: () => row(),
    addRow: (values) => {
      worksheet.rows.push(values);
      return row();
    },
  };

  return {
    worksheet,
    autoTable: { head: undefined as unknown[][] | undefined, body: undefined as unknown[][] | undefined },
    saveAs: vi.fn(),
    docSave: vi.fn(),
  };
});

vi.mock("exceljs", () => {
  class Workbook {
    addWorksheet(name: string) {
      void name;
      return h.worksheet;
    }
    xlsx = { writeBuffer: async () => new ArrayBuffer(8) };
  }
  return { default: { Workbook } };
});

vi.mock("jspdf", () => {
  class JsPDF {
    setFontSize(value: number) {
      void value;
    }
    text(value: string, x: number, y: number) {
      void value;
      void x;
      void y;
    }
    save(name: string) {
      h.docSave(name);
    }
  }
  return { default: JsPDF };
});

vi.mock("jspdf-autotable", () => ({
  default: (_doc: unknown, options: { head?: unknown[][]; body?: unknown[][] }) => {
    h.autoTable.head = options.head;
    h.autoTable.body = options.body;
  },
}));

vi.mock("file-saver", () => ({ saveAs: h.saveAs }));

import { exportCalendarData } from "@/services/export.service";
import type { Agenda } from "@/types/agenda";

const REPORT_COLUMNS = ["TANGGAL", "AGENDA", "DESKRIPSI", "MULAI", "SELESAI", "DURASI", "STATUS"];

const agenda: Agenda = {
  id: 1,
  title: "Rapat tim",
  description: "Hasil rapat",
  location: "Ruang rapat",
  status: "Completed",
  startTime: "2026-07-30T01:00:00.000Z",
  endTime: "2026-07-30T02:30:00.000Z",
  createdBy: "user-1",
};

beforeEach(() => {
  h.worksheet.columns.length = 0;
  h.worksheet.rows.length = 0;
  h.autoTable.head = undefined;
  h.autoTable.body = undefined;
  h.saveAs.mockClear();
  h.docSave.mockClear();
});

describe("work calendar export field contract", () => {
  it("keeps the Excel report columns and row mapping", async () => {
    await exportCalendarData([agenda], "excel", "Budi");

    expect(h.worksheet.columns.map((column) => column.header)).toEqual(REPORT_COLUMNS);
    expect(h.worksheet.rows).toHaveLength(1);
    expect(h.worksheet.rows[0].title).toBe("Rapat tim");
    expect(h.worksheet.rows[0].desc).toBe("Hasil rapat");
    expect(h.worksheet.rows[0].dur).toBe("1j 30m");
    expect(h.worksheet.rows[0].status).toBe("COMPLETED");
    expect(h.saveAs).toHaveBeenCalledTimes(1);
    expect(h.saveAs).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^Agenda_Budi_\d{8}\.xlsx$/),
    );
  });

  it("keeps the PDF report columns and row mapping", async () => {
    await exportCalendarData([agenda], "pdf", "Budi");

    expect(h.autoTable.head?.[0]).toEqual(REPORT_COLUMNS);
    expect(h.autoTable.body?.[0]?.[1]).toBe("Rapat tim");
    expect(h.autoTable.body?.[0]?.[2]).toBe("Hasil rapat");
    expect(h.autoTable.body?.[0]?.[5]).toBe("1j 30m");
    expect(h.autoTable.body?.[0]?.[6]).toBe("COMPLETED");
    expect(h.docSave).toHaveBeenCalledWith(expect.stringMatching(/^Agenda_Budi_\d{8}\.pdf$/));
  });
});
