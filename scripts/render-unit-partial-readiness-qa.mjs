import { mkdir, writeFile } from "node:fs/promises";
import { createPgdPreviewData, renderPgdPdf } from "../pgd-pdf-renderer.mjs";
import { revisionHistoryEntries } from "../document-revision-notes.mjs";

const data = createPgdPreviewData({ signature_count: 5 });
data.isAsset = false;
data.noSurat = "UJI-STAGING/UNIT/2026";
data.project = "Proyek Uji Perencanaan";
data.placeDate = "Magelang, 15 Oktober 2026";
data.items = [{ no: 1, code: "", name: "Permohonan penerbitan SPK Unit", unit: "Unit", quantity: "30", status: "2", note: "Permintaan awal divisi Marketing" }];
data.notes = "Pengujian tampilan. Bukan dokumen pengajuan.";
data.revisionHistory = revisionHistoryEntries({ unit_allocation_history: [{
  id: "qa-review", actor_name: "Pemeriksa Perencanaan (Tester)", created_at: "2026-10-15T03:00:00Z",
  requested_count: 30, allocated_count: 3, remaining_count: 27,
  note: "Dari 30 unit yang diajukan divisi Marketing, hanya 3 unit yang saat ini siap bangun. Sebanyak 27 unit belum dipenuhi karena pekerjaan persiapan belum selesai. Hanya 3 unit terpilih diteruskan ke persetujuan dan sistem perencanaan. Tidak dibuatkan pengajuan baru otomatis.",
}] });
await mkdir("tmp/pdfs", { recursive: true });
await writeFile("tmp/pdfs/unit-partial-readiness.pdf", await renderPgdPdf(data, { logoPath: "public/logo-marison-regency-group.png" }));
console.log("QA PDF: tmp/pdfs/unit-partial-readiness.pdf");
