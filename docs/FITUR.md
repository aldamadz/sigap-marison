# Fitur SIGAP

Tanggal pembaruan: 2026-06-11
Status dokumen: living document untuk fitur fungsional dan non-fungsional.

Dokumen ini menjadi pusat inventaris fitur SIGAP. README cukup memuat garis besar dan tautan, sedangkan detail fitur fungsional dan non-fungsional dicatat di file ini.

## Prinsip Dokumentasi

- Semua fitur yang punya halaman, route, atau proses bisnis utama harus masuk dokumen ini.
- Setiap fitur dicatat dari dua sisi: fungsional dan non-fungsional.
- Jika implementasi berubah, dokumen ini ikut diperbarui pada perubahan yang sama.
- Dokumen teknis khusus seperti API, KPI project, dan KPI server boleh tetap terpisah, tetapi garis besar fiturnya tetap tercatat di sini.

## Peta Route Aplikasi

| Area | Route | Fitur |
|---|---|---|
| Public | `/` | Login |
| Core | `/dashboard` | Dashboard |
| Core | `/calendar` | Kalender |
| Core | `/agenda` | Agenda |
| Core | `/settings` | Settings |
| Admin | `/audit-logs` | Audit Log |
| Surat | `/surat/registrasi` | Buat Surat |
| Surat | `/surat/inbox` | Inbox Persetujuan |
| Surat | `/surat/monitoring` | Status Pengajuan |
| Surat | `/surat/riwayat` | Riwayat Terlibat |
| Admin | `/admin/users` | User Organization |
| Admin | `/admin/users/hierarchy` | Hirarki Organisasi |
| Admin | `/admin/departments` | Master Departemen |
| Admin | `/admin/entities` | Master Entitas |
| Admin | `/admin/letter-types` | Master Jenis Surat |
| Admin | `/admin/offices` | Master Kantor Cabang |
| Admin | `/admin/master-projects` | Master Proyek |
| Admin | `/admin/monitoring` | All Status Monitoring |
| Admin | `/admin/kpi-departments` | SLA Departemen |
| Admin | `/admin/configuration/forms` | Configuration: Form & Template |
| Admin | `/admin/configuration/workflows` | Configuration: Dokumentasi Matrix Lama |
| Admin | `/admin/configuration/form-usages` | Configuration: Kegunaan Form |
| Admin | `/admin/configuration/kpi` | Configuration: SLA Departemen |
| Admin | `/admin/configuration/job-title-labels` | Configuration: Label Jabatan |
| Admin | `/admin/configuration/email` | Configuration: Email Notification |

## 1. Autentikasi dan Sesi

### Fungsional

- User login untuk mengakses aplikasi.
- User yang sudah login diarahkan ke dashboard.
- User yang belum login diarahkan ke halaman login.
- Sesi digunakan untuk membatasi akses data, dokumen, lampiran, API internal, dan halaman protected.
- Saat surat dibuat, database menetapkan `created_by` dari identitas JWT aktif; nilai pembuat tidak dipercaya dari input klien.

### Non-Fungsional

- Token session tidak boleh ditulis ke log atau dokumen.
- Route protected harus menolak user tanpa session.
- Error akses harus tampil jelas ke user, bukan hanya di console.
- Multiple client/session warning perlu dijaga agar tidak menyebabkan perilaku auth tidak stabil.

## 2. Dashboard

### Fungsional

- Menampilkan ringkasan aktivitas dan status operasional user.
- Menjadi halaman awal setelah login.
- Menyediakan pintasan ke modul utama seperti surat, agenda, dan monitoring.

### Non-Fungsional

- Data dashboard harus cepat dimuat.
- Ringkasan harus mengikuti hak akses user.
- Dashboard tidak boleh menampilkan data departemen/cabang yang tidak boleh dibaca user.

## 3. Agenda

### Fungsional

- User mengelola agenda kegiatan.
- Agenda dapat dilihat sebagai daftar.
- Agenda menjadi bagian dari pencatatan aktivitas organisasi.

### Non-Fungsional

- Perubahan agenda harus tersimpan konsisten.
- Data agenda harus bisa difilter dan dicari dengan responsif.
- Agenda perlu siap diaudit jika dikaitkan dengan aktivitas persuratan.

## 4. Kalender

### Fungsional

- Menampilkan agenda dalam tampilan kalender.
- Membantu user melihat jadwal berdasarkan tanggal.

### Non-Fungsional

- Kalender harus sinkron dengan data agenda.
- Tampilan kalender harus tetap terbaca pada desktop dan mobile.
- Perubahan data agenda tidak boleh membuat kalender menampilkan data lama terlalu lama.

## 5. Persuratan Digital

### Fungsional

- User membuat surat dari template yang dikonfigurasi admin.
- Sistem menghasilkan nomor surat.
- Sistem mengisi template dari input user dan data sistem.
- User mengisi tempat dan tanggal melalui sistem.
- User mengisi input template seperti tabel barang, catatan, atau field lain sesuai preset form.
- Admin dapat memilih preset konfigurasi template saat upload Excel agar mapping input, kode form, departemen, dan area tanda tangan terisi otomatis.
- Template `Rekomendasi Peremajaan Barang / Alat Kerja` tersedia sebagai form rekomendasi/prasyarat dengan nomor dokumen, tabel rekomendasi, catatan, tempat/tanggal, dan tanda tangan dinamis.
- Nomor dokumen rekomendasi memakai penomoran sistem dan mengikuti departemen pembuat/checker dokumen agar melanjutkan counter departemen yang sama.
- Lampiran dapat diwajibkan, opsional, atau multiple sesuai aturan form.
- Preview dokumen menggunakan PDF.
- Surat berjalan mengikuti matrix tanda tangan.
- Riwayat dan monitoring surat tersedia untuk pembuat, penandatangan, dan admin sesuai akses.
- Setelah seluruh tanda tangan selesai, proses SIGAP berakhir pada status `DONE`.

### Non-Fungsional

- Nomor surat tidak boleh duplikat.
- Dokumen dan lampiran harus bisa diaudit.
- Data input surat harus tersimpan terstruktur di database untuk konsumsi sistem lain.
- Akses file harus melalui endpoint aplikasi, bukan direct public storage URL.
- Preview PDF diproses background agar UI tidak terkunci.
- Cache preview tidak boleh menampilkan tanda tangan lama setelah approval baru.

## 6. Buat Surat

### Fungsional

- User memilih entitas, kantor/cabang, departemen, jenis surat, lalu klasifikasi `Aset`, `Unit`, `Non Aset`, atau `Non Unit`.
- Sistem menyaring matrix alur berdasarkan klasifikasi, scope kantor, dan departemen.
- User mendapatkan nomor surat.
- Setelah nomor dipesan, sistem membuat draft registrasi dan menyimpan perubahan form otomatis ke database.
- Draft aktif dapat dilanjutkan melalui URL `?draft=<draftId>`; jika hanya ada satu draft, halaman membukanya otomatis, sedangkan beberapa draft ditampilkan sebagai pilihan.
- Lampiran yang dipilih setelah nomor dipesan langsung diunggah dan dikaitkan ke draft. Saat draft dibuka kembali, file tetap tersedia dan digunakan pada registrasi final tanpa unggah ulang.
- Draft dan reservation nomor aktif selama tujuh hari. Draft yang dibatalkan menjadi `VOID` dan nomornya tidak digunakan ulang.
- User mengisi detail template berdasarkan Master Form.
- Jika user memilih `Aset` atau `Non Unit`, field teknis Unit tidak ditampilkan dan tidak ditulis ke dokumen.
- User memilih pejabat penandatangan berdasarkan matrix.
- User mengunggah lampiran awal jika diwajibkan.

### Non-Fungsional

- Form harus menampilkan field sesuai konfigurasi, bukan hardcode.
- Input sistem seperti NIK, departemen, cabang, proyek, tempat, tanggal, dan detail isi surat harus terekam.
- Validasi harus tampil sebagai feedback UI yang jelas.
- Mode unit tidak boleh memaksa user mengisi tabel barang.
- Form yang mendukung Unit tetap harus berperilaku sebagai form biasa ketika kategori yang dipilih bukan `Unit`.
- Draft hanya dapat dibaca dan diubah oleh pembuatnya; admin memiliki akses baca untuk kebutuhan audit.
- Form yang sudah tersimpan tidak menampilkan peringatan saat tab ditutup. Peringatan hanya muncul ketika perubahan terakhir masih disimpan atau gagal disimpan.

## 7. Workflow Approval

### Fungsional

- Approver melihat antrean di Inbox Persetujuan.
- Inbox menggunakan detail approval full-width dengan task switcher di header untuk memilih antrean lain.
- Task switcher berisi pencarian, filter kategori/KPI/tindakan, dan daftar approval ringkas tanpa panel antrean permanen.
- Antrean diurutkan berdasarkan KPI departemen: terlambat, mendekati SLA, lalu waktu tunggu terlama.
- Antrean dapat dicari berdasarkan nomor, judul, pengaju, atau departemen serta difilter berdasarkan kategori, KPI, dan jenis tindakan.
- Pengajuan aktif disimpan pada query parameter `task` agar pilihan konsisten setelah refresh dan realtime update.
- Setiap antrean menampilkan ringkasan pengajuan langsung: pengaju, jabatan, departemen, kantor, proyek, kategori, tempat-tanggal, daftar barang/unit, catatan, dan field input tambahan.
- Detail menampilkan progres penandatangan, panel dokumen, tugas khusus step aktif, catatan, dan action bar yang selalu terlihat.
- Approver membuka preview utama dan lampiran.
- Approver dapat menyetujui atau menolak surat.
- Persetujuan dan penolakan menggunakan dialog reusable; penolakan mewajibkan alasan minimal lima karakter.
- Tombol persetujuan menjelaskan persyaratan yang belum lengkap, termasuk proyek, unit, kode produksi, dan lampiran.
- Setelah tindakan berhasil, sistem otomatis memilih antrean prioritas berikutnya.
- Step tanda tangan berjalan berurutan.
- Snapshot dokumen dibuat setelah approval.
- Notifikasi dikirim ke step berikutnya.

### Non-Fungsional

- User hanya dapat memproses step yang memang menjadi tugasnya.
- Status step harus konsisten dengan status surat.
- Perubahan approval harus tercatat.
- Dokumen preview harus menampilkan tanda tangan terbaru.
- PDF berfungsi sebagai verifikasi visual; informasi keputusan utama harus dapat dibaca dari kartu inbox tanpa membuka PDF.
- Pending approval harus bisa dipakai sebagai data SLA.
- Kegagalan mengambil data harus dibedakan dari antrean kosong dan menyediakan aksi coba lagi.
- Draft catatan, alokasi unit, kode produksi, dan pilihan file dipertahankan selama halaman masih aktif.
- Tampilan, loading, dan action bar harus tetap nyaman digunakan pada desktop dan mobile.

## 8. Permohonan Unit

### Fungsional

- Admin menentukan matrix yang mendukung kategori `Unit`.
- Admin menentukan departemen yang boleh mengajukan Unit melalui halaman Configuration `Pengajuan Unit`.
- Admin menentukan cell kalimat permohonan unit, default `C11`.
- User memilih `Unit` langsung saat registrasi sebelum memilih matrix dan form.
- Jika mode `Unit`, user memilih proyek, mengisi jumlah unit, dan catatan opsional.
- Sistem mengisi detail barang Unit otomatis:
  - Nama barang: `Permohonan Order Bangun SPK Pembangunan Rumah [jumlah] Unit`
  - Satuan: `Unit`
  - Jumlah: dari input pemohon
  - Status: default `2`
- Nomor surat Unit memakai format khusus, contoh `001/UAI/MKT.1.JST 3/VI/2026`.
- Sistem menulis kalimat seperti:

```text
Butuh : 10 Unit, Proyek: Marisland Kalinegoro, Cabang: Magelang
```

- Perencanaan memilih unit spesifik saat approval.
- Jumlah unit yang dipilih boleh lebih banyak, tetapi tidak boleh kurang dari permintaan.
- Perencanaan mengisi `Struktur Atas`, `Struktur Bawah`, dan komponen kode produksi per unit.
- Detail kavling dan kode produksi pada approval Unit ditampilkan sebagai carousel agar tinggi form stabil saat banyak kavling dipilih.
- Format kode produksi otomatis: `[nomor]/UAI/PRC/[blok]/[tanggal]`.
- Perencanaan mengunggah 3 lampiran manual: `SITEPLAN`, `VOLUME ADENDUM`, dan `HITUNGAN ADENDUM`.
- Sistem membuat 2 lampiran PDF otomatis:
  - `Rekap Adendum Unit` dengan tabel struktur dan total nominal.
  - `Kode Produksi Unit` dengan tabel `No`, `Proyek`, `Unit`, `Kode Produksi`.

### Non-Fungsional

- Mode unit tidak boleh bercampur dengan input barang biasa.
- Mapping field Unit hanya aktif saat kategori registrasi adalah `Unit`.
- Kategori `Aset`, `Unit`, dan `Non Unit` harus berada pada matrix alur, bukan pada Master Form.
- Izin Unit mengikuti departemen profil akun yang login, bukan departemen yang dipilih user pada form registrasi.
- Matrix Unit tanpa departemen terpilih tidak dapat dipakai oleh departemen mana pun.
- Frontend menyaring pilihan Unit dan RPC registrasi memvalidasi ulang izin yang sama di database.
- `unit_config` pada Master Form hanya menyimpan mapping teknis template, aturan lampiran, dan cell unit.
- Unit terpilih, proyek alokasi, detail struktur, kode produksi, lampiran, waktu, dan signature harus terekam di database.
- Lampiran otomatis Unit harus tersimpan sebagai `stage = unit_allocation`.
- Jika integrasi API external berubah, UI utama tidak perlu dirombak.

## 9. Monitoring Surat

### Fungsional

- User melihat status pengajuan miliknya.
- User melihat dokumen, lampiran, snapshot, dan riwayat tanda tangan.
- Admin melihat semua status surat pada All Status Monitoring.

### Non-Fungsional

- Monitoring harus mengikuti hak akses.
- Tombol preview/unduh/snapshot harus memakai mekanisme akses aman.
- Data status harus sinkron dengan perubahan realtime atau refresh query.
- Monitoring harus menampilkan loading state saat file/PDF belum siap.

## 10. Riwayat Terlibat

### Fungsional

- User melihat surat yang pernah melibatkan dirinya.
- User dapat membuka dokumen dan lampiran terkait surat tersebut.
- Riwayat membantu user melacak pekerjaan approval masa lalu.
- Riwayat dapat difilter berdasarkan tindakan `Setuju` dan `Tolak`.
- Riwayat memiliki filter rentang tanggal dengan default bulan berjalan.

### Non-Fungsional

- Riwayat tidak boleh menampilkan surat yang tidak pernah melibatkan user.
- File tetap harus dibuka lewat endpoint aman.
- Query riwayat harus tetap responsif meski data bertambah.

## 11. Batas Proses Approval

### Fungsional

- SIGAP menangani pembuatan, routing, tanda tangan, monitoring, dan penyelesaian approval.
- Setelah approval selesai, dokumen berstatus `DONE`.
- Pengiriman dokumen ke sistem departemen akan menggunakan endpoint integrasi ketika endpoint tersebut tersedia.
- Pembuatan SPK dan bukti pembayaran dilakukan di sistem departemen, bukan di SIGAP.

### Non-Fungsional

- Tidak ada akses PIC implisit atau bypass admin pada proses approval.
- Data hanya dapat dibaca oleh pembuat, penandatangan terkait, admin, atau external client resmi.
- Integrasi downstream harus idempoten dan dapat diaudit ketika diaktifkan.

## 12. Notifikasi dan Realtime

### Fungsional

- User mendapat notifikasi saat ada surat yang perlu diproses.
- Badge sidebar menunjukkan antrean approval yang relevan.
- Data aktif disinkronkan saat realtime event masuk atau tab kembali fokus.
- Bunyi notifikasi diputar untuk event penting.

### Non-Fungsional

- Notifikasi tidak boleh dobel secara tidak terkendali.
- Badge harus sesuai hak akses.
- Error akses ditolak harus terlihat oleh user, bukan hanya di console.
- Realtime harus punya fallback refresh query.
- Konfirmasi dan input pop-up aplikasi memakai dialog reusable SIGAP, bukan dialog browser bawaan, agar pengalaman user konsisten di semua halaman.

## 13. Master User Organization

### Fungsional

- Admin mengelola user.
- Admin mengatur relasi user dengan departemen/kantor.
- Admin melihat informasi dasar user untuk kebutuhan assignment.
- Admin dapat mengimpor data karyawan dengan panel progress yang menampilkan tahap proses, jumlah diproses, berhasil, gagal, dan akun yang dinonaktifkan.
- Setelah import selesai, daftar karyawan diperbarui otomatis tanpa refresh manual.
- Import karyawan menormalisasi tanggal Excel/CSV ke format database agar tanggal serial Excel tidak menyebabkan baris gagal.
- Import karyawan tidak menurunkan role user existing jika kolom role kosong; role lama dipertahankan kecuali file eksplisit berisi `admin` atau `user`.
- Admin melihat hirarki organisasi pada route `/admin/users/hierarchy`.
- Hirarki tersedia dalam dua mode: Tree List dan Chart Node.
- Tree List mendukung expand/collapse, search, filter departemen, filter kantor, filter status aktif/nonaktif, dan fokus ke user tertentu.
- Halaman hirarki organisasi default menampilkan user berstatus aktif.
- Halaman hirarki organisasi realtime terhadap perubahan profil/atasan dan menampilkan perpindahan node dengan animasi layout ringan.
- Mapping hirarki karyawan dapat dipreview dari file Excel HRD sebelum diterapkan ke `parent_id`.
- Hirarki memakai level jabatan 1-7: Pelaksana, Staff, Supervisor, Assistant Manager/Assistant Branch Manager, Manager/Branch Manager, Direktur, Direktur Utama.
- Jarak/indent visual hirarki mengikuti level jabatan 1-7, sehingga Sekretaris Direksi sejajar dengan Staff meskipun parent langsungnya Direktur.
- Saat filter kantor aktif, hirarki dibatasi ke karyawan kantor tersebut; Direksi Kantor Pusat tidak ikut ditampilkan sebagai ancestor kantor cabang.
- Branch Manager menjadi top tier saat dilihat per kantor cabang karena berada di level manajerial cabang.
- Jika sebuah kantor belum memiliki BM/ABM/Supervisor terkait, user di kantor tersebut difallback ke Direktur agar tidak tampil sebagai root palsu.
- Chart Node menampilkan struktur organisasi bergaya piramid top-down untuk browser PC.
- Node chart hanya menampilkan foto dan nama; detail user tampil saat node diklik.
- Chart Node mendukung drag-to-pan horizontal dengan klik-tahan lalu geser.
- Mobile tetap mengutamakan Tree List agar struktur tetap terbaca dan ringan.
- Hirarki dapat diekspor ke PDF untuk laporan siap baca sesuai filter yang sedang aktif.
- Hirarki dapat diekspor ke XLSX berisi level, path atasan, jumlah bawahan langsung, total bawahan, status, departemen, kantor, dan catatan masalah struktur.
- Export PNG untuk chart akan ditambahkan jika layout Chart Node perlu dipakai sebagai gambar presentasi.

### Non-Fungsional

- Data user harus konsisten dengan auth Supabase.
- Import user wajib menolak baris tanpa NIK agar sistem tidak membuat NIK fallback `PENDING-*`.
- Admin tidak boleh melihat atau mengubah secret/auth token user.
- Perubahan organisasi user berdampak pada akses dan routing, sehingga perlu audit.
- Hirarki harus mendeteksi masalah struktur seperti parent hilang, parent nonaktif, user menjadi parent dirinya sendiri, atau siklus parent.
- Tampilan halaman hirarki harus berada di dalam area konten admin dan tidak menimpa breadcrumb/header.
- Tampilan chart hirarki memakai panel admin yang netral agar tetap mudah dibaca pada desktop dan mobile.

## 14. Master Departemen

### Fungsional

- Admin mengelola daftar departemen.
- Admin mengatur kode dan urutan departemen.
- Departemen dipakai untuk routing tanda tangan, KPI, dan konfigurasi unit.

### Non-Fungsional

- Kode departemen harus konsisten.
- Perubahan departemen tidak boleh merusak surat lama.
- Departemen yang dipakai dalam config tidak boleh dihapus tanpa penanganan.

## 15. Master Entitas

### Fungsional

- Admin mengelola entitas/PT.
- Entitas dipakai dalam pembuatan nomor dan identitas surat.

### Non-Fungsional

- Kode entitas harus unik dan stabil.
- Perubahan entitas harus menjaga histori surat lama.

## 16. Master Form

### Fungsional

- Admin mengelola template form.
- Admin mengatur mapping cell Excel.
- Admin membuat konfigurasi permohonan biasa.
- Admin membuat mapping teknis template unit tanpa menentukan kategori registrasi.
- Admin menyimpan dan menerapkan quick preset.
- Admin mengatur field manual, field sistem, tabel, textarea, external select, merge range, alignment, font, dan row height.

### Non-Fungsional

- Mapping cell harus tervalidasi.
- Merge range harus tetap dianggap mapping valid.
- Preset tidak boleh hanya menjadi placeholder tanpa cell.
- Master Form tidak menentukan apakah registrasi termasuk Aset, Unit, atau Non Unit.
- Mapping teknis biasa dan unit harus terpisah jelas.
- Template baru harus bisa ditangani tanpa mengubah kode selama formatnya sesuai konfigurasi.
- Konfirmasi hapus template dan quick preset memakai dialog reusable aplikasi, bukan dialog browser bawaan.

## 17. Master Jenis Surat

### Fungsional

- Admin mengelola jenis surat.
- Jenis surat dipakai dalam pembuatan nomor, filter monitoring, dan KPI.

### Non-Fungsional

- Jenis surat perlu stabil karena dipakai untuk histori dan filter.
- Perubahan jenis surat tidak boleh mengubah makna surat lama.

## 18. Master Kantor Cabang

### Fungsional

- Admin mengelola kantor pusat, cabang, dan relasi cabang.
- Kantor/cabang dipakai dalam nomor surat, routing, filter, dan KPI.
- Master kantor mendukung unit Kost seperti Maris Kost Ekslusif, Kost Palur, Kost Pakuwon, dan Kost Slamet Riyadi.
- Import karyawan memakai alias kantor agar variasi nama dari data HRD tetap bisa termapping.

### Non-Fungsional

- Struktur cabang harus konsisten.
- Kode kantor/cabang harus unik.
- Alias kantor harus unik berdasarkan nama yang sudah dinormalisasi.
- Perubahan kantor/cabang harus menjaga histori surat lama.

## 19. Master Proyek

### Fungsional

- Admin mengelola proyek internal.
- Proyek dipakai untuk cabang dan nomor surat.
- Proyek juga menjadi konteks filter dan integrasi unit.

### Non-Fungsional

- Kode proyek harus sinkron dengan kebutuhan nomor surat dan integrasi eksternal.
- Perubahan proyek tidak boleh merusak surat yang sudah dibuat.

## 20. Matriks Tanda Tangan

### Fungsional

- Admin mengatur urutan tanda tangan.
- Admin mengatur label jabatan, role, cell tanda tangan, nama, jabatan, sheet, dan preset kotak tanda tangan.
- Admin menandai step yang wajib melakukan alokasi unit.
- Admin menentukan kategori registrasi yang didukung setiap matrix: `Aset`, `Unit`, dan/atau `Non Unit`.
- Admin dapat memfilter daftar Kegunaan Form berdasarkan form dan departemen pengaju.
- Admin dapat membuat Kegunaan Form kategori `Non Aset` selain `Aset`, `Unit`, dan `Non Unit`.
- Jika kategori `Unit` aktif, izin pemakaiannya diatur terpisah per departemen pada Configuration `Pengajuan Unit`.

### Non-Fungsional

- Urutan step harus deterministik.
- Matrix harus tersimpan sebagai konfigurasi yang dapat diaudit.
- Daftar matrix pada registrasi harus difilter berdasarkan kategori yang dipilih user sebelum form diketahui.
- Izin departemen Unit disimpan pada relasi `workflow_allowed_departments` dan tidak boleh bergantung pada konfigurasi Master Form.
- Editor Alur Persetujuan tidak menjadi tempat mengatur izin departemen agar konfigurasi matrix dan akses departemen tetap terpisah.
- Perubahan matrix tidak boleh mengubah surat yang sudah berjalan kecuali memang diproses ulang dengan aturan baru.

## 21. Fitur PIC yang Dihapus

### Fungsional

- Route diskusi PIC, antrean Review PIC, dan Manajemen PIC sudah dihapus.
- Tabel chat, master PIC, review keuangan, serta fungsi terkait sudah dihapus.
- Histori transaksi surat lama dibersihkan pada 2026-06-08 sebelum sistem dipakai ulang.

### Non-Fungsional

- Kode baru tidak boleh bergantung pada tabel atau kolom PIC lama.
- Proses approval hanya mengikuti `surat_signatures` dan urutan matrix.
- Migrasi lama tetap dipertahankan sebagai histori skema, tetapi kondisi database aktif mengikuti migrasi penghapusan.

## 22. Activity Logs

### Fungsional

- Admin melihat log aktivitas penting.
- Log dipakai untuk audit perubahan dan troubleshooting.

### Non-Fungsional

- Log tidak boleh berisi secret.
- Log harus cukup informatif untuk investigasi.
- Query log harus bisa difilter agar tidak berat.

## 23. Settings

### Fungsional

- User/admin mengakses pengaturan profil dan keamanan akun.
- User dapat memilih tema `System`, `Light`, atau `Dark`.
- Preferensi tema diterapkan segera dan disimpan per akun pada profil.
- Mode `System` mengikuti preferensi warna perangkat atau browser.

### Non-Fungsional

- Pengaturan harus valid sebelum disimpan.
- Perubahan setting perlu efek yang jelas dan tidak merusak session user.
- Tema harus menggunakan token warna bersama agar halaman aktif tetap terbaca pada light dan dark mode.
- Jika penyimpanan preferensi gagal, tema dikembalikan ke pilihan sebelumnya dan user menerima pesan error.

## 24. Configuration

### Fungsional

- Admin mengakses konfigurasi sistem dari satu menu `Configuration`.
- Dropdown konfigurasi memindahkan admin di antara `Form & Template`, `Alur Persetujuan`, `Pengajuan Unit`, `SLA Departemen`, `Penomoran Surat`, dan `Label Jabatan`.
- Dropdown konfigurasi juga menyediakan `Email Notification` untuk penerima email, privasi, dan mode file.
- Form & Template mengatur template Excel, mapping input, mode unit, dan lampiran.
- Alur Persetujuan mengatur urutan penandatangan serta koordinat tanda tangan.
- Pengajuan Unit mengatur matrix Unit yang diizinkan untuk setiap departemen.
- SLA Departemen mengatur target SLA, jam kerja, waktu istirahat, hari kerja, dan timezone.
- Penomoran Surat mengatur counter awal per tahun untuk scope pusat atau cabang/proyek.
- Label Jabatan mengatur alias jabatan untuk tampilan dokumen, misalnya `Manager Pengembangan Bisnis` ditampilkan sebagai `Mgr. PO`.
- Route lama `/admin/forms` dan `/admin/workflow-details` dialihkan ke route Configuration yang baru.

### Non-Fungsional

- Seluruh route Configuration hanya dapat diakses admin melalui pemeriksaan route, bukan sekadar disembunyikan dari sidebar.
- Master data operasional dan konfigurasi aturan sistem dipisahkan agar navigasi dan tanggung jawab halaman jelas.
- Layout konfigurasi harus responsif dan menggunakan komponen serta token tema yang sama dengan halaman lain.

## 25. External API Read-Only Surat

### Fungsional

- Sistem lain dapat mengambil data surat melalui API external SIGAP.
- Client menggunakan client credentials untuk mendapatkan access token.
- API menyediakan data surat, pengirim, tujuan, detail input, status, dan file preview melalui endpoint aman.
- Dokumentasi API tersedia di Swagger UI.

### Non-Fungsional

- `client_secret` tidak disimpan dalam bentuk plaintext.
- Access token memiliki masa berlaku.
- File tidak diberikan sebagai public storage URL langsung.
- API harus bisa diaudit per client.
- Client yang tidak aktif dapat dinonaktifkan tanpa mengganggu client lain.

## 26. Integrasi Data External

### Fungsional

- Sistem dapat mengambil data proyek/unit dari API external saat endpoint tersedia.
- Data source external dapat dipakai oleh field form dan alur unit.
- Saat ini integrasi dapat disesuaikan nanti ke POST endpoint yang disiapkan pihak eksternal.

### Non-Fungsional

- Format request/response external harus dipetakan di server, bukan hardcode di UI.
- Kredensial external tidak boleh berada di frontend.
- Kegagalan API external harus tampil sebagai feedback yang jelas.
- UI utama tidak perlu dirombak saat provider external berubah.

## 27. SLA Departemen untuk Approval

### Fungsional

- Dashboard SLA menampilkan performa approval per departemen.
- SLA dihitung per step tanda tangan di `surat_signatures`.
- Departemen KPI adalah departemen milik user yang bertanda tangan: `signer_snapshot.department_id`, fallback ke `profiles.department_id`.
- Departemen pengajuan/surat (`surat_registrasi.dept_id`) tidak dipakai untuk atribusi KPI penanda tangan.
- Pending ikut dihitung sampai `now()` hanya untuk tahap aktif yang sudah masuk ke signer.
- Step berikutnya yang belum aktif tidak dihitung sebagai pending.
- Jika surat ditolak, proses SLA berhenti; step setelah penolakan tidak dihitung sebagai pending.
- Admin dapat melihat antrean yang tepat waktu, telat, pending aman, pending telat, dan rejected.
- Dashboard dapat difilter berdasarkan periode tanggal, departemen, cabang/kantor, jenis surat, form/template, dan status KPI.
- Baris departemen dapat dibuka untuk melihat rincian setiap tahap approval, penandatangan, surat, durasi efektif, SLA, status, jenis surat, dan form.

### Non-Fungsional

- Perhitungan durasi memakai jam kerja efektif, bukan durasi kalender.
- Hari kerja awal: Senin-Jumat.
- Jam kerja awal: 08:00-17:00.
- Jam istirahat: 12:00-13:00 tidak dihitung.
- SLA awal: 120 menit efektif.
- Timezone: `Asia/Jakarta`.
- Perhitungan sebaiknya dilakukan di database melalui function/RPC agar scalable.

### Aturan Perhitungan

| Komponen | Nilai awal |
|---|---|
| Hari kerja | Senin-Jumat |
| Jam kerja | 08:00-17:00 |
| Jam istirahat | 12:00-13:00 |
| SLA | 120 menit efektif |
| Timezone | `Asia/Jakarta` |

Contoh:

| Waktu masuk antrean | Waktu diproses | Durasi kalender | Durasi KPI |
|---|---|---:|---:|
| Senin 11:30 | Senin 13:30 | 2 jam | 1 jam |
| Senin 16:00 | Selasa 08:30 | 16 jam 30 menit | 1 jam 30 menit |

### Status SLA

| Status | Definisi |
|---|---|
| `completed_on_time` | Sudah diproses dan durasi efektif `<= sla_minutes` |
| `completed_late` | Sudah diproses dan durasi efektif `> sla_minutes` |
| `pending_on_time` | Tahap aktif sudah masuk antrean signer, belum diproses, durasi efektif sampai `now()` masih `<= sla_minutes` |
| `pending_late` | Tahap aktif sudah masuk antrean signer, belum diproses, durasi efektif sampai `now()` sudah `> sla_minutes` |
| `rejected` | Ditolak, dipisahkan dari metrik tepat waktu/telat utama |

### Rencana Teknis

Tambahan data:

- `surat_signatures.available_at`
- `department_kpi_configs`
- optional: `kpi_holidays`

Rencana config:

```sql
department_kpi_configs
- id
- department_id nullable
- office_id nullable
- workday_start time default '08:00'
- workday_end time default '17:00'
- break_start time default '12:00'
- break_end time default '13:00'
- workdays int[] default '{1,2,3,4,5}'
- sla_minutes int default 120
- timezone text default 'Asia/Jakarta'
- active boolean default true
- created_at timestamptz
- updated_at timestamptz
```

Fallback data lama:

| Kondisi | Fallback |
|---|---|
| Step 1 tidak punya `available_at` | `surat_registrasi.created_at` |
| Step berikutnya tidak punya `available_at` | `signed_at` step sebelumnya |
| Step pending | hitung sampai `now()` |

### Status Implementasi

- Route UI: `/admin/kpi-departments`.
- Menu: `SLA Departemen` pada area admin/sidebar.
- Database: `department_kpi_configs`, kolom `surat_signatures.available_at`, function `calculate_business_minutes`, RPC `get_department_kpi_summary`, dan RPC `get_department_kpi_details`.
- Frontend service: `department-kpi.service.ts`.
- UI konfigurasi: admin dapat mengatur SLA menit, hari kerja, jam kerja, jam istirahat, dan timezone per departemen terpilih.
- UI detail: ranking departemen dapat diklik untuk membuka drill-down KPI per tahap approval.
- Realtime: query KPI departemen ikut direfresh saat `surat_registrasi` atau `surat_signatures` berubah.

### Lanjutan yang Masih Bisa Ditambah

1. Kalender hari libur nasional/perusahaan.
2. Export KPI untuk laporan manajemen.
3. Indikator telat langsung pada antrean approval jika diperlukan.

## 28. Email Notifikasi Profesional

### Fungsional

- Sistem mengirim email detail saat surat masuk, ditandatangani, ditolak, atau berpindah ke step berikutnya.
- Email menampilkan nomor surat, judul, status, pengaju, departemen, kantor, proyek, detail input dokumen, dan penandatangan.
- Email dapat dikirim ke user tujuan, email departemen, dan email kantor/cabang sesuai konfigurasi.
- URL tombol menuju sistem SIGAP dapat dikonfigurasi secara global sehingga perubahan domain tidak memerlukan perubahan kode.
- Admin dapat mengatur apakah NIK ditampilkan di email.
- Admin dapat menentukan mode file per tipe: PDF utama, lampiran awal, dan lampiran approval.
- File bisa dikirim sebagai link aman atau attachment email sesuai konfigurasi.
- Konfigurasi form secara default mengikuti konfigurasi global dan dapat di-override secara eksplisit per template.
- Detail input dokumen ditampilkan sebagai tabel berlabel, termasuk tabel daftar barang, bukan JSON mentah.
- Unit yang dialokasikan di email ditampilkan sebagai tabel Proyek, Unit, Struktur Atas, Struktur Bawah, dan Kode Produksi, bukan JSON mentah.
- Metadata teknis alokasi seperti signature id, timestamp ISO, dan snapshot project tidak ditampilkan sebagai detail input email.

### Non-Fungsional

- Link file email harus memakai token aman dengan TTL.
- Public storage URL tidak boleh dikirim langsung di email.
- File utama email hanya memakai PDF hasil worker; file Excel sumber tidak boleh diberi label atau dikirim sebagai PDF.
- Ukuran attachment harus dibatasi agar tidak melampaui batas SMTP.
- Mode attachment tidak boleh berubah diam-diam menjadi link. Jika file belum tersedia atau melewati batas, email tetap terkirim tanpa file tersebut.

## 29. Keamanan dan Hak Akses

### Fungsional

- Role admin, user, penandatangan, dan external client memiliki akses berbeda.
- Admin mengatur master data, form, matrix, dan konfigurasi.
- User hanya melihat surat dan file yang menjadi haknya.

### Non-Fungsional

- Service-role key hanya boleh berada di server/env production.
- File sensitif tidak boleh dibuka tanpa token sesi yang valid.
- API external memakai token dan secret yang bisa dicabut.
- RLS/RPC harus membatasi aksi sesuai peran yang konsisten.
- Error akses harus tampil di UI.
- Storage transaksi surat wajib menggunakan Supabase Storage self-hosted.
- Aplikasi dan worker gagal start jika konfigurasi self-hosted storage tidak lengkap.

## 30. Operasional, Deployment, dan Worker

### Fungsional

- Aplikasi utama berjalan di Docker production.
- External API berjalan sebagai service terpisah.
- PDF worker dapat dipisah di server lain.
- Cloudflare Tunnel dapat dipakai untuk expose service.

### Non-Fungsional

- Production deploy menggunakan `.env.production`.
- Worker PDF memiliki concurrency limit.
- Docker compose production dan worker tidak boleh menjalankan workload yang sama secara duplikat.
- Healthcheck container harus tersedia.
- Dokumentasi deploy harus mengikuti perubahan arsitektur.
- Secret deployment tidak boleh masuk repo.
- `index.html` tidak di-cache, sedangkan asset ber-hash memakai cache immutable.
- Asset build lama yang sudah hilang harus mengembalikan `404`, bukan fallback HTML.
- Browser melakukan satu kali reload otomatis jika lazy chunk berubah setelah deployment.
- Sinkronisasi saat tab kembali aktif memakai cooldown agar tidak memicu refetch berulang.
- Setiap perpindahan route memvalidasi ulang seluruh query aktif dan menampilkan overlay loading sampai pengambilan data terbaru selesai.
- Refresh route tidak melakukan browser reload sehingga sesi, koneksi realtime, dan state global aplikasi tetap terjaga.

## 31. Kegunaan Form dan Tanda Tangan Dinamis

### Fungsional

- Satu form Excel dapat dipakai oleh banyak kegunaan bisnis.
- Urutan registrasi adalah kategori dokumen, form, lalu kegunaan.
- Setiap kegunaan mengatur departemen pengaju, scope pusat/cabang, 2-8 tahap approval, departemen signer, kandidat user, action approval/alokasi unit, dan persyaratan lampiran.
- Setiap tahap dapat memiliki tim pengecek/verifikator data sebelum penanda tangan tahap tersebut dapat melakukan aksi.
- Tim pengecek bersifat opsional per tahap dan hanya aktif jika admin mengaktifkan konfigurasi pengecek pada tahap tersebut.
- Kandidat pengecek default mengikuti departemen penandatangan tahap yang akan diverifikasi; pada scope cabang, snapshot pengecek transaksi dibatasi ke kantor/cabang surat yang sama.
- Konfigurasi tim pengecek menyediakan pencarian nama, jabatan, dan kantor agar kandidat mudah ditemukan.
- Jika tahap membutuhkan verifikasi, penanda tangan tetap dapat melihat pengajuan tetapi tombol `Setujui` dan `Tolak` terkunci sampai tim pengecek memverifikasi data.
- Tim pengecek melihat task `Verifikasi Data` di Inbox Persetujuan, mengunggah lampiran tahap yang diwajibkan, mengisi alokasi Unit bila tahap tersebut membutuhkan alokasi, lalu menyimpan catatan verifikasi.
- Pada pengajuan Unit, proyek/kawasan dikunci dari pilihan pemohon dan tidak dapat diubah oleh tim pengecek atau penanda tangan; jika proyek salah, user harus membuat pengajuan baru.
- Untuk pengajuan Unit, tim pengecek dapat memilih jumlah unit kurang dari permintaan dengan konfirmasi eksplisit sebelum verifikasi dilanjutkan.
- Setelah data diverifikasi, penanda tangan melihat ringkasan hasil pengecekan dan tidak perlu mengunggah/mengisi data tahap yang sama.
- Penanda tangan dapat mengembalikan task ke tim pengecek dengan catatan revisi jika data/lampiran perlu diperbaiki.
- Lampiran dapat diwajibkan pada tahap pemohon maupun tahap signer tertentu, termasuk jumlah minimum/maksimum, multiple file, tipe MIME, dan batas ukuran.
- Semua lampiran pemohon dan approval hanya dikonfigurasi melalui Kegunaan Form berdasarkan `stage_order`.
- Konfigurasi lampiran lama pada Master Form dan fallback snapshot surat telah dihapus; satu file hanya melewati satu jalur validasi dan penyimpanan.
- Saat signer memilih lampiran approval, UI menampilkan jumlah file, nama file, ukuran file, status siap unggah, dan status mengunggah ketika approval sedang diproses.
- Form menyimpan satu `signature_layout` berupa sheet dan area persegi panjang yang dikelola sistem.
- Konfigurasi layout menyediakan preset `PGD` yang mengikuti struktur border dan merge workbook referensi untuk 3-6 kotak; mode `Adaptif` tetap tersedia untuk form lain.
- Preset PGD memvalidasi distribusi role: 3 tahap `1-1-1`, 4 tahap salah satu role berjumlah 2, 5 tahap salah satu role berjumlah 1, dan 6 tahap `2-2-2`.
- Pada preset PGD, urutan tahap wajib `Membuat`, `Memeriksa`, lalu `Menyetujui`; kombinasi yang tidak tersedia pada template ditolak agar dokumen tidak rusak.
- Saat dokumen dibuat, sistem membuka merge hanya di area tanda tangan, lalu membangun kotak 2-8 signer secara otomatis tanpa mengubah matrix tanda tangan lama.
- Baris pertama area tanda tangan dipakai untuk `Tempat, Tanggal`, misalnya `Magelang, 20 Juli 2026`; nilainya di-merge, diberi border, rata tengah, dan selebar kotak tanda tangan paling kanan tepat di bawahnya.
- Lebar, merge, border, dan pembagian baris kotak pada preset PGD mengikuti kolom asli template, bukan hasil pembagian lebar secara rata.
- Label yang sama dan berdampingan dalam satu baris tanda tangan digabung pada area label, sedangkan area tanda tangan, nama, dan jabatan tetap per signer.
- Baris jabatan pada template/PDF memakai label tahap dari konfigurasi Kegunaan Form, sehingga posisi seperti `Mgr. Marketing` tetap terbaca walaupun signer aktual berganti.
- Email menampilkan jabatan aktual signer dari `profiles.job_title` atau alias aktif Configuration `Label Jabatan`; label tahap tetap disimpan sebagai konteks alur dan fallback data historis.
- Posisi tanda tangan, identitas signer, kebijakan lampiran, dan konfigurasi kegunaan disimpan sebagai snapshot transaksi.
- Approval menggunakan snapshot posisi sehingga perubahan konfigurasi setelah surat dibuat tidak menggeser tanda tangan surat lama.
- Matrix lama tetap tersedia sebagai dokumentasi read-only dan dapat diduplikasi menjadi draft Kegunaan Form.
- Registrasi memakai fallback matrix lama selama belum ada Kegunaan Form aktif, sehingga konfigurasi dapat disiapkan tanpa menghentikan production.

### Non-Fungsional

- Registrasi baru divalidasi server-side terhadap kegunaan aktif dan departemen aktor.
- Admin yang mewakili departemen lain direkam melalui `represented_department_id` dan `represented_by_admin`.
- Database menolak signer yang tidak termasuk kandidat pada tahap kegunaan.
- Draft konfigurasi tidak dapat dibaca user biasa; user hanya membaca kegunaan aktif untuk departemen profilnya.
- Data transaksi lama belum dihapus sampai konfigurasi baru aktif dan cutover produksi dikonfirmasi.
- RLS diaktifkan untuk tabel konfigurasi baru serta master inti yang sebelumnya belum dilindungi.
