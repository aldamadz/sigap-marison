import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_DOCS, getDocsEntrySections } from "../pages/docs/docsContent";

const content = (id: string) => {
  const entry = ALL_DOCS.find((item) => item.id === id);
  if (!entry) throw new Error(`Missing docs topic: ${id}`);
  return JSON.stringify({ entry, sections: getDocsEntrySections(entry) });
};

describe("issue 509 documentation contracts", () => {
  it("distinguishes requester corrections, signer proposals and same-number internal resume", () => {
    for (const id of ["approval-inbox", "follow-up"]) {
      const text = content(id);
      expect(text).toContain("Minta Perbaikan Pemohon");
      expect(text).toContain("Revisi oleh Penandatangan");
      expect(text).toContain("Nomor surat tetap sama");
      expect(text).not.toContain("semua signer meninjau dan tanda tangan ulang dari awal");
      expect(text).not.toContain("tanda tangan dimulai ulang dari tahap 1");
    }
    expect(content("follow-up")).toContain("tahap yang meminta perbaikan");
    expect(content("documents-attachments")).toContain("PDF penolakan permanen");
    expect(content("documents-attachments")).toContain("PDF lama diinvalidasi");
  });

  it("documents optional RAB for both departments and a non-destructive exemption intent", () => {
    for (const id of ["surat-registration", "approval-inbox", "admin-form-usages"]) {
      const text = content(id);
      expect(text.toLowerCase()).not.toContain("kandidat #509");
      expect(text).toContain("Dana Perencanaan");
      expect(text).toContain("Dana HRD");
      expect(text.match(/Lampiran RAB opsional/g)?.length).toBeGreaterThanOrEqual(2);
      expect(text.toLowerCase()).toContain("tim perencanaan boleh menambahkan rab jika pemohon belum melampirkannya");
      expect(text).toContain("Minta Perbaikan Pemohon");
      expect(text).toContain("RAB/perbaikan redaksi");
      expect(text).toContain("tidak otomatis memblokir atau menolak");
      expect(text).toContain("Tidak memerlukan RAB");
      expect(text).toContain("servis AC/kendaraan");
      expect(text).toContain("Tidak menghapus file yang sudah ada");
      expect(text).toContain("tidak wajib");
      expect(text).not.toContain("Ada RAB");
      expect(text).not.toContain("RAB pemeriksa wajib");
      expect(text).not.toContain("RAB awal pemohon wajib");
      expect(text).not.toContain("Pemeriksa wajib melengkapi RAB");
      expect(text).toMatch(/KEU 1\s*\/\s*KEU 10/);
    }
    expect(content("admin-form-usages")).toContain("Nol orang terpilih");
    expect(content("admin-form-usages")).toContain("per kegunaan dan tahap");
    expect(content("admin-form-usages")).toContain("Usman/Tri bukan pilihan otomatis");
    expect(content("admin-form-usages")).toContain("rab_not_required");
  });

  it("keeps external Unit revision ownership, identity, capacity and cleared allocations explicit", () => {
    const text = content("follow-up");
    expect(text).toContain("Hanya pemilik revisi Unit eksternal yang masih terbuka");
    expect(text).toContain("Nomor dan identitas surat lama tidak diganti");
    expect(text).toContain("kapasitas terbaru");
    expect(text).toContain("alokasi lama dikosongkan");
    expect(text).toContain("Kapasitas diperiksa server, bukan dipercaya dari browser");
    expect(text).toContain("Receipt kapasitas hanya berlaku sekali");
    expect(text).toContain("pemilik, revisi terbuka, draft aktif, proyek dan jumlah yang cocok");
    expect(text).toContain("receipt kedaluwarsa atau sudah dipakai tidak dapat dikirim ulang");
    expect(text).toContain("aturan tahap peminta revisi internal tidak menggantikan alur ini");
    expect(content("request-categories")).not.toContain("Proyek Unit tidak dapat diganti");
    expect(content("admin-projects")).toContain("kapasitas terbaru");
  });

  it("documents dynamic KCP reporting and HQ without an automatic parent", () => {
    const text = content("admin-hierarchy");
    expect(text).toContain("BM KC terkait");
    expect(text).toContain("BM > Assistant Branch Manager (ABM) > SPV");
    expect(text).toContain("tidak membuat parent otomatis");
    expect(text).toContain("Relasi HQ yang memang dikonfigurasi tetap dipertahankan");
  });

  it("records verified release evidence separately from historical snapshots", () => {
    const map = readFileSync("docs/FEATURE_RELEASE_MAP.md", "utf8");
    expect(map).toContain("Released Issue #509");
    expect(map).toContain("production `080b02f721`");
    expect(map).toContain("`b0994ef9`");
    expect(map).toContain("uji dua akun/burst live belum dijalankan");
    expect(map).toContain("`main` `019d243`");
    expect(map).toContain("`staging` `075fb545`");
    expect(map).toContain("PR #497 dan #507");
    expect(map).toContain("Snapshot Environment Historis (2026-08-04)");
    expect(map).toContain("`xuhyodtmgwteyslhrkfx`");
    expect(map).toContain("`wrufczusfopgvwvxsmjk`");
    for (const id of ["SUR-03B", "CAL-03", "CAL-04"]) {
      expect(map.split("\n").find((line) => line.startsWith(`| ${id} |`)))
        .toContain("Production + Staging");
    }
    const deploy = content("deploy-production");
    expect(deploy).toContain("Proxmox LXC 104");
    expect(deploy).toContain("Worker PDF, sync, dan outbound tetap Ubuntu");
    expect(deploy).toContain("hanya target rollback");
  });

  it("records optional RAB, private receipts and generic login without claiming live two-session testing", () => {
    const map = readFileSync("docs/FEATURE_RELEASE_MAP.md", "utf8");
    const candidate = map.split("## Snapshot Rilis Terverifikasi")[0];
    expect(candidate).toContain("lampiran RAB opsional pada Dana");
    expect(candidate).toContain("HRD dan Perencanaan");
    expect(candidate).toContain("Tidak memerlukan RAB");
    expect(candidate).toContain("rab_not_required");
    expect(candidate).not.toContain("Ada RAB");
    expect(candidate).not.toContain("RAB pemeriksa wajib");
    expect(candidate).toContain("tabel privat baru `unit_revision_availability_receipts`");
    expect(candidate).toContain("Receipt dikonsumsi sekali dalam transaksi");
    expect(candidate).toContain("receipt basi, tidak cocok atau replay ditolak");
    expect(candidate).toContain("langsung browser ditutup");
    expect(candidate).toContain("placeholder login generik");
    expect(candidate).toContain("nama@perusahaan.com");
    expect(candidate).toContain("Masukkan password Anda");
    expect(candidate).toContain("`RealtimeSync`");
    for (const key of ["surat-inbox-compact", "surat-inbox-kpi", "surat-inbox-detail"]) {
      expect(candidate).toContain(key);
    }
    expect(candidate).toContain("tanpa refetch duplikat");
    expect(candidate).toContain("event revisi/rekomendasi juga mereset cursor");
    expect(candidate).toContain("uji dua sesi lintas akun live tetap belum dibuktikan");
  });
});
