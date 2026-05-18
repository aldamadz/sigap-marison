# KPI Tim IT / Project Implementation

## Tujuan
Dokumen ini mendefinisikan KPI untuk tim IT dan tim implementasi pada project **SIGAP**. Fokus KPI adalah memastikan sistem berhasil dibangun, stabil digunakan, cepat diperbaiki saat ada masalah, dan memberi dampak nyata terhadap proses persuratan yang sebelumnya masih manual berbasis Excel, kirim file ke kantor pusat, print, dan tanda tangan fisik.

## Kondisi Saat Ini
- Proses persuratan masih manual menggunakan file Excel.
- Dokumen dikirim ke kantor pusat untuk dicetak dan ditandatangani.
- Belum ada monitoring status real-time.
- Belum ada baseline digital untuk uptime, bug aplikasi, waktu respon sistem, atau efektivitas release.

## KPI Utama

| KPI | Parameter | Current | Future Target |
|---|---|---|---|
| Availability Sistem | Persentase uptime aplikasi per bulan | Belum ada sistem terpusat | >= 99.5% |
| Incident Kritis | Jumlah incident severity tinggi per bulan | Belum terukur | 0-1 incident/bulan |
| MTTR Incident | Rata-rata waktu pemulihan gangguan kritis | Belum ada baseline | < 4 jam |
| Bug Produksi | Jumlah bug yang ditemukan di production per bulan | Belum ada baseline | < 10 bug minor/bulan, 0 bug kritikal terbuka > 3 hari |
| Bug Resolution Time | Rata-rata waktu penyelesaian bug | Tidak terukur | Critical < 4 jam, Major < 2 hari, Minor < 7 hari |
| Keberhasilan Release | Persentase release tanpa rollback atau hotfix darurat | Belum ada | >= 90% |
| Kecepatan Delivery Fitur | Waktu dari request disetujui sampai fitur rilis | Perubahan manual dan tidak terstruktur | Minor <= 2 minggu, major <= 1-2 bulan |
| Ketepatan Roadmap | Persentase fitur prioritas yang selesai sesuai target kuartal | Belum ada roadmap delivery terukur | >= 80% |
| Akurasi Workflow | Persentase alur approval/PIC berjalan sesuai rule tanpa intervensi manual | Proses sepenuhnya manual | >= 95% |
| Notifikasi Efektif | Persentase notifikasi yang terkirim dan terbaca tepat waktu | Belum ada notifikasi sistem | >= 80% dibuka dalam 30 menit |
| Integritas Audit Trail | Persentase aktivitas penting yang tercatat di sistem | Hampir tidak ada jejak digital | 100% aktivitas penting tercatat |
| Adopsi User | Persentase surat yang diproses lewat sistem dibanding manual | 0% | >= 80% dalam 3 bulan, >= 95% dalam 12 bulan |
| Pengurangan Proses Manual | Persentase pengurangan langkah manual Excel-print-kirim | 0% | >= 70% proses manual hilang |
| Kepuasan User Internal | Nilai kepuasan user terhadap sistem | Belum terukur | >= 4.2/5 |

## KPI Per Fase Implementasi

### Fase 1: Go-Live Awal (0-3 Bulan)

| KPI | Target |
|---|---|
| Availability Sistem | >= 98.5% |
| Bug Kritis | 0 bug kritikal terbuka > 3 hari |
| Adopsi User | >= 60% surat diproses melalui sistem |
| Monitoring Status | 100% surat bisa dipantau statusnya |
| Pengurangan Lead Time | Minimal turun 30% dibanding proses manual |

### Fase 2: Stabilisasi (3-6 Bulan)

| KPI | Target |
|---|---|
| Availability Sistem | >= 99.5% |
| MTTR Incident | < 4 jam |
| SLA PIC | <= 2 jam kerja untuk respon awal |
| Adopsi User | >= 80% |
| Paperless Rate | >= 70% |

### Fase 3: Optimasi (6-12 Bulan)

| KPI | Target |
|---|---|
| Adopsi User | >= 95% |
| Surat Tepat SLA | >= 90% |
| Error Input | < 3% |
| Pengurangan Biaya Operasional | >= 40% |
| Ketepatan Roadmap | >= 80% fitur prioritas selesai per kuartal |

## Definisi Pengukuran

### 1. Availability Sistem
Rumus:

```text
Uptime (%) = (Total waktu sistem aktif / Total waktu observasi) x 100
```

### 2. MTTR Incident
Rumus:

```text
MTTR = Total durasi penyelesaian incident / Jumlah incident
```

### 3. Keberhasilan Release
Rumus:

```text
Release Success Rate (%) = (Jumlah release tanpa rollback / Total release) x 100
```

### 4. Adopsi User
Rumus:

```text
Adopsi (%) = (Jumlah surat diproses via SIGAP / Total seluruh surat) x 100
```

### 5. Pengurangan Proses Manual
Rumus:

```text
Reduction (%) = ((Jumlah langkah manual awal - langkah manual setelah implementasi) / Jumlah langkah manual awal) x 100
```

## Sumber Data KPI
- Log aplikasi frontend/backend
- Tabel database `surat_registrasi`
- Tabel `surat_signatures`
- Tabel `surat_chats`
- Tabel notifikasi dan activity logs
- Laporan helpdesk / tiket bug
- Survey kepuasan user internal
- Rekap surat manual sebagai baseline pembanding

## Frekuensi Review

| KPI Group | Frekuensi Review |
|---|---|
| Uptime, incident, bug | Mingguan dan bulanan |
| Delivery fitur dan roadmap | Bulanan dan kuartalan |
| Adopsi user dan efisiensi operasional | Bulanan |
| Kepuasan user | Per kuartal |

## Catatan Implementasi
- Nilai `Current` yang masih bersifat kualitatif perlu dikonversi menjadi baseline numerik selama 1-2 bulan sebelum atau saat awal implementasi.
- KPI ini sebaiknya dipakai sebagai KPI gabungan antara tim IT, admin proses, dan PIC bisnis, karena keberhasilan sistem tidak hanya ditentukan oleh aplikasi tetapi juga oleh disiplin penggunaan.
- Setelah go-live, target dapat direvisi berdasarkan volume surat, kompleksitas approval, dan kesiapan tiap departemen.
