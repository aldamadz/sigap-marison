import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RequesterRevisionSummary } from "@/components/surat/RequesterRevisionSummary";
import {
  REQUESTER_REVISION_SUMMARY_LIMITS,
  summarizeRequesterRevision,
  type RequesterRevisionSnapshot,
} from "@/lib/requester-revision-summary";

afterEach(cleanup);

const snapshot = (items: unknown[] = [], formData: Record<string, unknown> = {}): RequesterRevisionSnapshot => ({
  formData: { judul_surat: "Pengajuan", ...formData, form_input_data: { items } }, attachments: [],
});

describe("requester revision summary", () => {
  it("ignores object key order without mutating snapshots", () => {
    const before = snapshot([{ nama_barang: "Kertas", jumlah: 2 }]);
    const after = snapshot([{ jumlah: 2, nama_barang: "Kertas" }]);
    const frozen = JSON.stringify(before);
    expect(summarizeRequesterRevision(before, after).hasChanges).toBe(false);
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it("summarizes redaction-only top-level changes", () => {
    const summary = summarizeRequesterRevision(snapshot(), snapshot([], {
      judul_surat: "Pengajuan baru", request_place: "Magelang", request_date: "2026-10-08",
    }));
    expect(summary.counts.fields).toBe(3);
    expect(summary.fields[0]).toEqual({ field: "judul_surat", label: "Judul surat", before: "Pengajuan", after: "Pengajuan baru" });
    expect(summary.items).toEqual([]);
  });

  it("compares non-item form inputs as well as top-level fields", () => {
    const summary = summarizeRequesterRevision(
      { formData: { form_input_data: { catatan: "Lama", tujuan: { label: "A", value: "a" } } } },
      { formData: { form_input_data: { catatan: "Baru", tujuan: { label: "B", value: "b" } } } },
    );
    expect(summary.counts.fields).toBe(2);
    expect(summary.fields[0].field).toBe("form_input_data.catatan");
    expect(summary.fields[1].after).toContain("B");
  });

  it.each(["nama_barang", "keterangan", "name", "description"])("treats editing %s without an id as a changed row", key => {
    const summary = summarizeRequesterRevision(snapshot([{ [key]: "Lama", nominal: 1000 }]), snapshot([{ [key]: "Baru", nominal: 2500 }]));
    expect(summary.counts).toMatchObject({ itemsAdded: 0, itemsChanged: 1, itemsDeleted: 0 });
    expect(summary.items[0].fields).toContainEqual({ field: "nominal", label: "Nominal", before: "Rp 1.000", after: "Rp 2.500" });
  });

  it("uses existing IDs across reorder and explicitly names added/deleted items", () => {
    const before = snapshot([{ id: "a", keterangan: "Hapus" }, { id: "b", keterangan: "Tetap", jumlah: 1 }]);
    const after = snapshot([{ id: "b", keterangan: "Tetap", jumlah: 2 }, { id: "c", keterangan: "Tambah" }]);
    const summary = summarizeRequesterRevision(before, after);
    expect(summary.counts).toMatchObject({ itemsAdded: 1, itemsChanged: 1, itemsDeleted: 1 });
    expect(summary.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "deleted", name: "Hapus" }),
      expect.objectContaining({ action: "added", name: "Tambah" }),
      expect.objectContaining({ action: "changed", beforeIndex: 1, afterIndex: 0 }),
    ]));
  });

  it("preserves duplicates and identifies a middle deletion without IDs", () => {
    const duplicate = { nama_barang: "Kertas", jumlah: 1 };
    const before = snapshot([duplicate, { nama_barang: "Tinta" }, duplicate]);
    const after = snapshot([duplicate, duplicate]);
    expect(summarizeRequesterRevision(before, after).items).toEqual([
      expect.objectContaining({ action: "deleted", name: "Tinta", beforeIndex: 1 }),
    ]);
    expect(summarizeRequesterRevision(after, snapshot([duplicate])).counts.itemsDeleted).toBe(1);
    expect(summarizeRequesterRevision(after, before).items).toEqual([
      expect.objectContaining({ action: "added", name: "Tinta" }),
    ]);
  });

  it("preserves a duplicate when the other duplicate is edited", () => {
    const before = snapshot([{ name: "Sama", jumlah: 1 }, { name: "Sama", jumlah: 1 }]);
    const after = snapshot([{ name: "Sama", jumlah: 1 }, { name: "Sama", jumlah: 2 }]);
    expect(summarizeRequesterRevision(before, after).counts).toMatchObject({ itemsAdded: 0, itemsDeleted: 0, itemsChanged: 1 });
  });

  it("preserves the same stored file despite renamed metadata and reordered attachments", () => {
    const files = [{ file_url: "storage/a.pdf", file_name: "A.pdf", requirement_key: "rab" }, { file_url: "storage/b.pdf", name: "B.pdf" }];
    expect(summarizeRequesterRevision({ ...snapshot(), attachments: files }, {
      ...snapshot(), attachments: [files[1], { ...files[0], file_name: "Renamed.pdf" }],
    }).hasChanges).toBe(false);
  });

  it("reports replacement of a same-named file and preserves attachment multiplicity", () => {
    const file = { file_url: "storage/old.pdf", name: "RAB.pdf", requirement_key: "rab" };
    const summary = summarizeRequesterRevision({ ...snapshot(), attachments: [file, file] }, {
      ...snapshot(), attachments: [file, { ...file, file_url: "storage/new.pdf" }],
    });
    expect(summary.counts).toMatchObject({ attachmentsAdded: 1, attachmentsRemoved: 1 });
    expect(summary.attachments.map(change => change.name)).toEqual(["RAB.pdf", "RAB.pdf"]);
  });

  it("reports an attachment moving requirement groups", () => {
    const file = { file_url: "storage/a.pdf", requirement_key: "rab" };
    const summary = summarizeRequesterRevision({ ...snapshot(), attachments: [file] }, { ...snapshot(), attachments: [{ ...file, requirement_key: "bukti" }] });
    expect(summary.counts).toMatchObject({ attachmentsAdded: 1, attachmentsRemoved: 1 });
  });

  it("bounds output while retaining accurate counts", () => {
    const after = snapshot(Array.from({ length: 45 }, (_, id) => ({ id, name: "x".repeat(1000) })));
    const summary = summarizeRequesterRevision(snapshot(), after);
    expect(summary.counts.itemsAdded).toBe(45);
    expect(summary.items).toHaveLength(REQUESTER_REVISION_SUMMARY_LIMITS.entriesPerGroup);
    expect(summary.omitted.items).toBe(15);
    expect(summary.items[0].name.length).toBeLessThanOrEqual(REQUESTER_REVISION_SUMMARY_LIMITS.textLength);
  });

  it("renders compact named changes and can show or hide the no-changes note", () => {
    const before = snapshot([{ id: "a", name: "Kursi lama" }]);
    const after = snapshot([{ id: "b", name: "Meja baru" }]);
    const { rerender, container } = render(<RequesterRevisionSummary baseline={before} current={after} />);
    expect(screen.getByRole("region", { name: "Ringkasan perubahan" })).toBeInTheDocument();
    expect(screen.getByText("Dihapus: Kursi lama")).toBeInTheDocument();
    expect(screen.getByText("Ditambahkan: Meja baru")).toBeInTheDocument();
    rerender(<RequesterRevisionSummary baseline={before} current={before} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RequesterRevisionSummary baseline={before} current={before} showNoChanges />);
    expect(screen.getByText("Belum ada perubahan data atau lampiran.")).toBeInTheDocument();
  });
});
