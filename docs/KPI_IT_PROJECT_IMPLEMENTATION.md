# KPI Tim IT / Project Implementation

## Tujuan
Dokumen ini mendefinisikan KPI untuk project **SIGAP** berdasarkan tahapan implementasi:
- `Development`
- `Staging / UAT`
- `Production`

Fokus KPI mencakup 2 sisi:
- KPI delivery project: kecepatan build, kualitas release, bug, stabilitas, dan kesiapan deployment.
- KPI target sistem: dampak proses bisnis persuratan pada tiap tahap implementasi.

## Latar Belakang
Saat ini proses bisnis masih manual:
- data diisi dalam file Excel
- file dikirim ke kantor pusat
- dokumen dicetak
- dokumen ditandatangani manual
- status proses belum termonitor real-time

Karena itu, `current state` project masih berada pada tahap `development`, belum pada tahap pemakaian penuh oleh operasional bisnis.

## Ringkasan Target per Tahap

| Tahap | Fokus Utama | Target Waktu | Output Utama |
|---|---|---|---|
| Development | Build fitur inti dan stabilisasi modul | 0-3 bulan | Fitur inti siap diuji end-to-end |
| Staging / UAT | Validasi proses bisnis, UAT, dan hardening | 3-5 bulan | Sistem lolos uji user dan siap go-live |
| Production | Adopsi, stabilitas, dan dampak operasional | 6-12 bulan | Sistem dipakai nyata dan menggantikan proses manual |

## KPI Tahap Development

### Tujuan Tahap
- Menyelesaikan fitur inti persuratan, approval, monitoring, dan notifikasi.
- Memastikan alur utama berjalan dari draft sampai approval dan monitoring.
- Menurunkan bug blocking sebelum masuk staging.

### KPI Development

| KPI | Parameter | Current | Target Development | Target Waktu |
|---|---|---|---|---|
| Penyelesaian Fitur Inti | Persentase fitur core selesai dibanding scope MVP | Masih development | >= 90% fitur MVP selesai | Bulan 1-3 |
| Kecepatan Delivery Fitur | Lama pengerjaan dari task disetujui sampai selesai dev | Belum terukur | Minor <= 5 hari kerja, major <= 15 hari kerja | Bulan 1-3 |
| Bug Blocking | Jumlah bug blocker/open issue yang menghentikan flow utama | Masih ada risiko perubahan cepat | 0 bug blocker pada flow utama | Akhir bulan 3 |
| Bug Major | Jumlah bug major di modul inti | Belum ada baseline | < 5 bug major aktif | Akhir bulan 3 |
| Regression Rate | Persentase fitur lama rusak setelah perubahan baru | Belum terukur | < 10% dari total change set | Bulan 2-3 |
| Build Success Rate | Persentase build berhasil | Belum stabil | >= 95% build berhasil | Bulan 2-3 |
| Waktu Fix Bug | Rata-rata waktu penyelesaian bug | Belum terukur | Critical < 1 hari, major < 3 hari, minor < 7 hari | Bulan 1-3 |
| Kesiapan Database | Persentase schema, RLS, trigger, RPC yang sudah stabil | Masih berubah | >= 95% object inti stabil | Akhir bulan 3 |
| Kesiapan Realtime | Persentase notifikasi/badge/realtime sync berfungsi sesuai skenario | Belum penuh | >= 90% skenario realtime lolos | Akhir bulan 3 |
| Dokumentasi Teknis | Persentase flow penting yang terdokumentasi | Parsial | >= 80% modul inti terdokumentasi | Akhir bulan 3 |

### Target Sistem pada Tahap Development

| Area Sistem | Target |
|---|---|
| Registrasi surat | User dapat membuat surat end-to-end tanpa proses manual internal sistem |
| Approval | Workflow tanda tangan berjalan sesuai urutan |
| Monitoring | Status surat dapat dipantau di sistem |
| Approval Akhir | Surat berstatus `DONE` setelah seluruh penandatangan menyetujui |
| Notification | Notifikasi approval dan review muncul real-time |
| Data Integrity | Tidak ada duplikasi nomor surat, step approval, atau konflik status utama |

## KPI Tahap Staging / UAT

### Tujuan Tahap
- Menguji sistem dengan user internal dalam skenario mendekati kondisi nyata.
- Memastikan seluruh proses bisnis valid sebelum go-live.
- Menutup gap antara implementasi teknis dan kebutuhan operasional.

### KPI Staging / UAT

| KPI | Parameter | Current | Target Staging/UAT | Target Waktu |
|---|---|---|---|---|
| UAT Pass Rate | Persentase test case UAT yang lulus | Belum masuk UAT | >= 95% test case lulus | Bulan 4-5 |
| Bug Kritis UAT | Jumlah bug kritis yang ditemukan user tester | Belum ada baseline | 0 bug kritis sebelum go-live | Bulan 4-5 |
| Bug Major UAT | Jumlah bug major tersisa | Belum ada baseline | <= 3 bug major dengan workaround jelas | Akhir bulan 5 |
| Akurasi Workflow | Persentase alur bisnis berjalan sesuai SOP | Belum divalidasi | >= 95% akurat | Bulan 4-5 |
| Kesiapan Hak Akses | Persentase role, policy, dan visibilitas data sesuai kebutuhan | Masih adjustment | 100% role utama tervalidasi | Bulan 4-5 |
| Kinerja Respons Halaman | Waktu load halaman utama/modul inti | Belum distandarkan | <= 3 detik untuk halaman inti | Bulan 4-5 |
| Keberhasilan Integrasi File | Persentase upload/download/open file berhasil | Belum penuh | >= 98% berhasil | Bulan 4-5 |
| Data Migration Readiness | Kesiapan master data user, departemen, form, dan matrix | Belum final | 100% data master inti siap | Akhir bulan 5 |
| User Training Readiness | Persentase user target yang sudah mendapat pelatihan | Belum dimulai | >= 80% user pilot trained | Akhir bulan 5 |
| Go-Live Readiness | Checklist kesiapan operasional | Belum ada | >= 95% checklist selesai | Akhir bulan 5 |

### Target Sistem pada Tahap Staging / UAT

| Area Sistem | Target |
|---|---|
| End-to-end flow | Flow dari pembuatan surat sampai final status lolos uji |
| Role access | Creator, approver, admin, dan external client hanya melihat data yang semestinya |
| Realtime | Badge, notifikasi, dan perubahan status sinkron |
| Audit trail | Aktivitas penting tercatat dan dapat ditelusuri |
| Error handling | Error tampil jelas dan tidak menghentikan proses user tanpa feedback |
| Operational readiness | User internal dapat menjalankan skenario harian tanpa bantuan intensif developer |

## KPI Tahap Production

### Tujuan Tahap
- Menjalankan sistem untuk operasional nyata.
- Meningkatkan adopsi user dan menurunkan ketergantungan pada Excel, print, dan tanda tangan manual.
- Menjaga stabilitas sistem dan mendorong continuous improvement.

### KPI Production

| KPI | Parameter | Current | Target Production | Target Waktu |
|---|---|---|---|---|
| Availability Sistem | Persentase uptime bulanan | Belum production | >= 99.5% | Bulan 6-12 |
| Incident Kritis | Jumlah incident kritis per bulan | Belum ada baseline production | 0-1 incident/bulan | Bulan 6-12 |
| MTTR Incident | Waktu pemulihan rata-rata untuk incident kritis | Belum terukur | < 4 jam | Bulan 6-12 |
| Surat Diproses via Sistem | Persentase surat yang diproses di SIGAP vs manual | 0% | >= 80% pada 3 bulan pertama production, >= 95% pada bulan ke-12 | Bulan 6-12 |
| Pengurangan Proses Manual | Penurunan ketergantungan pada Excel/print/kirim fisik | 0% | >= 70% | Bulan 6-12 |
| Lead Time Surat | Rata-rata waktu dari draft sampai approval final | 2-7 hari kerja secara manual | <= 1 hari kerja untuk surat normal | Bulan 6-12 |
| SLA Approval | Waktu respons penandatangan aktif | Tidak terukur | <= 2 jam kerja | Bulan 6-12 |
| Surat Tepat SLA | Persentase surat selesai sesuai target SLA | Tidak terukur | >= 90% | Bulan 6-12 |
| Error Input / Revisi | Persentase surat yang perlu revisi karena kesalahan data | Tinggi pada proses manual | < 3% | Bulan 6-12 |
| Paperless Rate | Persentase surat yang tidak perlu print selama proses | Hampir 0% | >= 85% | Bulan 6-12 |
| Kepuasan User | Nilai kepuasan user internal | Belum terukur | >= 4.2/5 | Bulan 9-12 |
| Efisiensi Operasional | Penurunan biaya print, kurir, rework | Tinggi pada proses manual | >= 40% lebih efisien | Bulan 9-12 |

### Target Sistem pada Tahap Production

| Area Sistem | Target |
|---|---|
| Sistem stabil | Modul inti dapat digunakan harian tanpa gangguan besar |
| Persuratan digital | Proses surat berpindah dari Excel manual ke sistem terpusat |
| Approval transparan | Semua step approval dapat dipantau statusnya |
| Approval aktif | Seluruh proses tanda tangan berjalan dan tercatat dalam sistem |
| Audit & kontrol | Aktivitas user, status, dan histori proses terdokumentasi |
| Skala operasional | Sistem siap dipakai lintas departemen/cabang tanpa bottleneck manual |

## KPI Lintas Tahap

| KPI Lintas Tahap | Development | Staging / UAT | Production |
|---|---|---|---|
| Fokus | Delivery fitur | Validasi bisnis | Stabilitas dan adopsi |
| Quality Gate | 0 blocker flow utama | 0 bug kritis UAT | 0 incident kritis berulang |
| Delivery Speed | Cepat dan iteratif | Terkontrol | Stabil dan terukur |
| User Involvement | Internal tim | User pilot | User operasional penuh |
| Nilai Bisnis | Proof of concept | Proof of process | Proof of impact |

## Rekomendasi Timeline

### Bulan 1-3
- Selesaikan MVP fitur inti
- Stabilkan database, RLS, realtime, dan workflow approval
- Tutup bug blocker dan major utama

### Bulan 4-5
- Jalankan UAT dengan user bisnis
- Validasi role access, monitoring, dan approval flow
- Pastikan data master dan SOP go-live siap

### Bulan 6-12
- Go-live bertahap
- Ukur adopsi, SLA, uptime, bug, dan dampak operasional
- Lakukan improvement berkala berdasarkan penggunaan nyata

## Sumber Data KPI
- Log aplikasi frontend/backend
- Tabel `surat_registrasi`
- Tabel `surat_signatures`
- Tabel `surat_signatures`
- Tabel notifikasi dan activity logs
- Rekap issue / bug / incident
- Hasil UAT dan checklist go-live
- Survey user internal
- Baseline proses manual sebelum implementasi

## Catatan
- `Current` pada dokumen ini merepresentasikan kondisi project yang masih berada di tahap development dan kondisi proses bisnis yang masih manual.
- KPI dapat direvisi setelah baseline numerik terkumpul dari sprint development, UAT, dan 1-3 bulan pertama production.
- Untuk pengukuran yang lebih kuat, KPI sebaiknya direview bulanan oleh tim IT dan owner bisnis.
