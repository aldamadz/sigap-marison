import { mkdir, writeFile } from "node:fs/promises";
import { createPgdPreviewData, normalizePgdDocumentData, renderPgdPdf } from "../pgd-pdf-renderer.mjs";

const preview = createPgdPreviewData({ signature_roles: [1, 2, 2] });
const signatures = preview.signatures.map((signer, index) => ({
  step_order: index + 1, role_name: signer.role,
  signer_snapshot: { full_name: `Pejabat Pengujian ${index + 1}`, job_title: signer.job },
  is_signed: index < 2, status: index < 2 ? "APPROVED" : "PENDING", signed_at: "2026-10-15T03:00:00Z",
}));
const source = {
  no_surat: "051/UAI/MKT.1.SGN/X/2026", request_place: "Magelang", request_date: "2026-10-15",
  form_input_data: { request_mode: "unit", requested_unit_count: 30, catatan: "Catatan pemohon tetap utuh.",
    items: [{ nama_barang: "Permohonan Order Bangun SPK Pembangunan Rumah 30 Unit", jumlah: 30, sat: "Unit", status: "2" }] },
  location_snapshot: { department: { name: "Marketing" }, project: { name: "Marison Sragen" } },
  unit_allocation_history: [{ actor_name: "Lili", created_at: "2026-10-15T03:00:00Z", requested_count: 30,
    allocated_count: 3, remaining_count: 27, note: "Hanya 3 unit yang siap bangun. Sebanyak 27 unit belum siap karena pekerjaan persiapan belum selesai." }],
};
const dir = "tmp/pdfs/unit-examination";
await mkdir(dir, { recursive: true });
for (const scenario of ["short", "long", "pending", "equal", "revised"]) {
  const input = structuredClone(source);
  if (scenario === "long") input.unit_allocation_history[0].note = "Penjelasan pemeriksa: pekerjaan persiapan pada unit lain belum selesai sehingga hanya tiga unit diteruskan.\n".repeat(20) + "AKHIR CATATAN PEMERIKSA";
  if (scenario === "pending") input.unit_allocation_history = [];
  if (scenario === "equal") Object.assign(input.unit_allocation_history[0], { allocated_count: 30, remaining_count: 0, note: "Seluruh unit siap bangun." });
  const data = normalizePgdDocumentData(input, { signatures });
  if (scenario === "revised") data.revisionHistory.push({ title: "Perbaikan oleh Pemohon", actor: "Pemohon Pengujian", at: "2026-10-15T02:00:00Z", reason: "Perbaikan redaksi", note: "Catatan revisi", changes: [{ field: "Nama barang", before: "SPK", after: "Permohonan SPK Unit", action: "Diubah" }] });
  await writeFile(`${dir}/${scenario}.pdf`, await renderPgdPdf(data, { logoPath: "public/logo-marison-regency-group.png" }));
}
console.log(`QA PDFs: ${dir}`);
