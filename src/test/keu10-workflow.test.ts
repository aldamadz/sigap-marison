import { describe, expect, it } from "vitest";
import { isKeu10FinalCandidate } from "@/features/surat/registration/lib/keu10-workflow";
import { normalizeRoleName } from "@/services/surat/form-helpers";
import { buildSignerAssignments } from "@/features/surat/registration/lib/signer-assignments";
import { buildAutoTitle } from "@/features/surat/registration/lib/surat-title-formatters";

const config = { version: 1, disposition: "tactical_land", purposes: [{ code: "pengondisian_lahan", label: "Pengondisian lahan" }], approval_threshold: 2_000_000 };
const directorI = { job_title: "Direktur I", is_active: true };
const utama = { job_title: "Direktur Utama", is_active: true };
const items = (price: number) => [{ keterangan: "Pengamanan lahan", jumlah: 2, satuan: "Paket", estimasi_harga_satuan: price, total: 1 }];

describe("KEU10 conditional approval", () => {
  it("uses computed quantity times price at the exact threshold, not submitted total", () => {
    expect(isKeu10FinalCandidate(directorI, config, items(1_000_000))).toBe(true);
    expect(isKeu10FinalCandidate(utama, config, items(1_000_000))).toBe(false);
    expect(isKeu10FinalCandidate(utama, config, items(1_000_001))).toBe(true);
    expect(isKeu10FinalCandidate(directorI, config, items(1_000_001))).toBe(false);
  });
  it("fails closed on incomplete items, inactive candidate and unknown config", () => {
    expect(isKeu10FinalCandidate(directorI, config, [])).toBe(false);
    expect(isKeu10FinalCandidate({ ...utama, is_active: false }, config, items(3_000_000))).toBe(false);
    expect(isKeu10FinalCandidate(utama, null, items(3_000_000))).toBe(false);
  });
  it("other groups always use Director Utama", () => {
    expect(isKeu10FinalCandidate(utama, { ...config, disposition: "legal_land", approval_threshold: null }, items(10))).toBe(true);
    expect(isKeu10FinalCandidate(directorI, { ...config, disposition: "village_equipment", approval_threshold: null }, items(10))).toBe(false);
  });
  it("retains the formal signed verifier role through snapshot and assignments", () => {
    expect(normalizeRoleName("verifikator", 4, 5)).toBe("verifikator");
    expect(buildSignerAssignments({ id: "keu10", ttd_config: [{ role_name: "verifikator", label_jabatan: "Mgr. Keuangan" }] })[0].role_name).toBe("verifikator");
  });
  it("uses a form-specific title and summarizes many items", () => {
    expect(buildAutoTitle({ category: "non_asset", formNumber: "FM-MBN.KEU-10-00", formInputData: { items: [...items(1), ...items(2), ...items(3)] } })).toContain("Pengajuan Biaya Tanah dan Izin: Pengamanan lahan dan 2 item lainnya");
  });
});
