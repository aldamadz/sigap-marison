# Fitur SIGAP

Tanggal pembaruan: 2026-07-21
Status dokumen: living document untuk fitur fungsional dan non-fungsional.

Dokumen ini menjadi pusat inventaris fitur SIGAP. README cukup memuat garis besar dan tautan, sedangkan detail fitur fungsional dan non-fungsional dicatat di file ini.

## Prinsip Dokumentasi

- Semua fitur yang punya halaman, route, atau proses bisnis utama harus masuk dokumen ini.
- Setiap fitur dicatat dari dua sisi: fungsional dan non-fungsional.
- Jika implementasi berubah, dokumen ini ikut diperbarui pada perubahan yang sama.
- Dokumen teknis khusus seperti API, KPI project, dan KPI server boleh tetap terpisah, tetapi garis besar fiturnya tetap tercatat di sini.
- Panduan operasional end user dan admin tersedia di halaman `/docs`; file markdown ini tetap menjadi inventaris teknis untuk pengembang.

## Peta Route Aplikasi

| Area | Route | Fitur |
|---|---|---|
| Public | `/` | Login |
| Public | `/reset-password` | Reset kata sandi dari tautan email |
| Public/Core | `/docs` | Dokumentasi Pengguna dan Admin |
| Core | `/dashboard` | Dashboard |
| Core | `/calendar` | Kalender |
| Core | `/agenda` | Agenda |
| Core | `/settings` | Settings |
| Admin | `/audit-logs` | Audit Log |
| Surat | `/surat/registrasi` | Buat Surat |
| Surat | `/surat/inbox` | Inbox Persetujuan |
| Surat | `/surat/tindak-lanjut` | Tindak Lanjut Pemohon |
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
| Admin | `/admin/configuration/template-designer` | Configuration: Template Builder |
| Admin | `/admin/configuration/workflows` | Configuration: Dokumentasi Matrix Lama |
| Admin | `/admin/configuration/form-usages` | Configuration: Kegunaan Form |
| Admin | `/admin/configuration/kpi` | Configuration: SLA Departemen |
| Admin | `/admin/configuration/job-title-labels` | Configuration: Label Jabatan |
| Admin | `/admin/configuration/email` | Configuration: Email Notification |

## Dokumentasi Pengguna dan Admin

### Fungsional

- Halaman dokumentasi tersedia di `/docs` dan bisa dibuka tanpa login.
- User yang sudah login dapat membuka dokumentasi dari sidebar di atas menu Pengaturan, tetapi halaman `/docs` tetap tampil sebagai halaman docs mandiri tanpa sidebar aplikasi.
- Header dokumentasi menampilkan logo, identitas `Marison - SIGAP Docs`, pencarian, tombol Dashboard untuk user login atau Login untuk pengunjung publik, serta menu profil/theme/logout untuk user login.
- Dokumentasi dipisahkan menjadi panduan Pengguna, Admin, Bantuan, dan Versi.
- Setiap topik dokumentasi berisi tujuan penggunaan, langkah penggunaan, contoh, troubleshooting, dan detail operasional yang menjelaskan arti kode, field, status, sumber data, dampak ke alur, serta langkah pemeriksaan.
- Dokumentasi memakai layout full-width, daftar topik aktif, dan pencarian cepat lintas topik.
- Input pencarian membuka modal dokumentasi; shortcut `Ctrl+K` membuka modal yang sama tanpa animasi dekoratif berlebihan.
- Dokumentasi memakai route penuh untuk topik dan subtopik, misalnya `/docs/dashboard/overview` dan `/docs/persetujuan/alur-signer`.
- Link hash lama seperti `/docs#dashboard` diarahkan ke route dokumentasi baru agar tautan lama tetap bisa dibuka.
- Pada tampilan mobile, subtopik dokumentasi dapat dipilih melalui dropdown `Bagian dokumentasi`.
- Setiap subroute dokumentasi menampilkan isi section yang dipilih saja; Overview hanya berisi ringkasan dan daftar subtopik agar tidak menduplikasi semua isi topik.
- Topik yang belum memiliki section custom tetap memiliki subtopik otomatis seperti fungsi utama, alur penggunaan, contoh penggunaan, dan kendala umum.
- Topik yang sudah memiliki section custom tetap dapat ditambah section detail operasional, sehingga halaman tidak berhenti pada ringkasan.
- Topik yang sudah memiliki detail operasional tidak memakai fallback subtopik generik agar halaman dokumentasi tidak terasa seperti template berulang.
- Topik Rekomendasi memakai alur baca berurutan antar-subtopik. Setiap bagian menampilkan tombol menuju bagian berikutnya, sedangkan `Topik terkait` baru ditampilkan setelah pembaca mencapai subtopik terakhir `Masalah umum rekomendasi`.
- Subtopik dapat berbentuk gabungan, misalnya nomor surat, counter, variasi format, reset tahunan, dan draft berada dalam satu subtopik yang sama.
- Konten dokumentasi mendukung beberapa format sesuai kebutuhan: alur bernomor, tabel keputusan, kartu fitur, callout, dan troubleshooting.
- Dokumentasi Registrasi Surat menjelaskan nomor draft, kategori pengajuan, data yang otomatis diisi sistem, dan kendala umum saat pembuatan surat.
- Dokumentasi penomoran surat menjelaskan tiap segmen nomor, misalnya `005/UAI/PBO.1.TRA/VI/2026`: nomor urut, entitas, kode departemen, index jenis surat, kode proyek, bulan Romawi, tahun, scope counter, reset tahunan, start counter produksi, nomor `VOID`, dan siklus draft.
- Dokumentasi penomoran surat menjelaskan variasi format untuk kantor pusat, pengajuan proyek/unit, KC, dan KCP.
- Dokumentasi Persetujuan menjelaskan area halaman, alur signer, perbedaan signer dan tim pemeriksa, aturan pengajuan Unit, serta alasan tombol aksi terkunci.
- Dokumentasi admin tidak dicampur dengan dokumentasi end user biasa agar instruksi konfigurasi tidak membuat user operasional bingung.
- Topik terkait pada halaman dokumentasi berupa link yang bisa diklik dan disusun berdasarkan topik atau subtopik yang sedang dibuka.
- Halaman dokumentasi memiliki versi dan changelog agar pembaruan fitur dapat ditelusuri.

### Non-Fungsional

- Dokumentasi harus memakai bahasa operasional yang mudah dipahami end user.
- Dokumentasi harus diperbarui saat fitur, alur menu, validasi, atau perilaku bisnis berubah.
- Dokumentasi teknis pengembang tetap dicatat di markdown, sedangkan problem solving user disediakan di halaman aplikasi.

## 1. Autentikasi dan Sesi

### Fungsional

- User login untuk mengakses aplikasi.
- User yang sudah login diarahkan ke dashboard.
- User yang belum login diarahkan ke halaman login.
- User yang lupa kata sandi dapat meminta tautan reset dari halaman login. Tautan dikirim ke email terdaftar, membuka `/reset-password`, lalu user membuat kata sandi baru tanpa admin mengetahui password lama.
- Halaman `/reset-password` mendukung link reset default Supabase dan link berbasis `token_hash` dari email template custom.
- Halaman reset password mengunci tombol dan input saat proses simpan agar tidak terjadi submit ganda.
- Sesi digunakan untuk membatasi akses data, dokumen, lampiran, API internal, dan halaman protected.
- Saat surat dibuat, database menetapkan `created_by` dari identitas JWT aktif; nilai pembuat tidak dipercaya dari input klien.

### Non-Fungsional

- Token session tidak boleh ditulis ke log atau dokumen.
- Route protected harus menolak user tanpa session.
- Error akses harus tampil jelas ke user, bukan hanya di console.
- Reset kata sandi tidak boleh membedakan email terdaftar dan tidak terdaftar pada pesan UI agar daftar akun tidak mudah ditebak.
- Email template reset password harus mengarah ke domain SIGAP aktif dan disarankan memakai `token_hash` agar tidak kembali ke domain lama.
- Email reset password harus memakai template HTML branded SIGAP dengan logo Marison yang disematkan sebagai gambar inline, sehingga tidak bergantung pada URL localhost, staging, atau production.
- Email reset password dikirim melalui endpoint server SIGAP dan SMTP Hostinger agar tidak bergantung pada mailer bawaan Supabase.
- Kata sandi baru harus berbeda dari kata sandi yang sedang aktif; pesan teknis dari provider auth harus diterjemahkan menjadi pesan yang mudah dipahami user.
- Perubahan kata sandi dicatat sebagai audit event tanpa menyimpan nilai password.
- Multiple client/session warning perlu dijaga agar tidak menyebabkan perilaku auth tidak stabil.

## 2. Dashboard

### Fungsional

- Menampilkan ringkasan aktivitas dan status operasional user.
- Menjadi halaman awal setelah login.
- Menyediakan pintasan ke modul utama seperti surat, agenda, dan monitoring.
- Grafik Aktivitas Departemen menampilkan agregat total agenda dan agenda selesai untuk seluruh departemen kepada semua user.
- Agregasi lintas departemen dihitung endpoint server terautentikasi; browser tidak memperoleh judul, deskripsi, peserta, atau isi agenda departemen lain.
- Modal Aktivitas Terbaru memakai header dan footer tetap dengan isi yang dapat discroll agar detail panjang tidak terpotong pada desktop maupun mobile.

### Non-Fungsional

- Data dashboard harus cepat dimuat.
- Ringkasan harus mengikuti hak akses user.
- Dashboard hanya boleh membuka angka agregat lintas departemen; detail agenda tetap mengikuti RLS dan hirarki user.

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
- Pada permohonan aset pusat maupun cabang, user memilih apakah pengajuan membutuhkan rekomendasi. Pilihan ini tersimpan sebagai data terstruktur dan tampil di ringkasan approval/email.
- Sebelum pengajuan utama atau rekomendasi didaftarkan, sistem menampilkan ringkasan bergaya dokumen yang memuat identitas, detail input, lampiran, dan urutan penandatangan. Surat baru disimpan setelah user menekan konfirmasi final; user dapat kembali memperbaiki data tanpa kehilangan draft.
- Rekomendasi aset diproses sebagai dokumen surat tertaut, bukan lampiran mentah. Dokumen rekomendasi memiliki nomor surat, template, tanda tangan, status, dan preview sendiri.
- Rekomendasi aset tetap satu dokumen untuk banyak item, tetapi pengisian UI dibuat fokus per item agar petugas IT/PO tidak kehilangan konteks barang induk.
- Setiap item rekomendasi dapat diputuskan sebagai Service, Ganti Komponen, Beli Baru, atau Tidak Direkomendasikan.
- Service, Ganti Komponen, dan Beli Baru mewajibkan lampiran gambar; Tidak Direkomendasikan hanya mewajibkan alasan.
- Keputusan rekomendasi disalin ke snapshot surat induk saat task rekomendasi selesai, sehingga item yang tidak direkomendasikan dapat tampil tercoret pada detail surat dan PDF PGD tanpa membuka lampiran rekomendasi.
- Admin dapat memilih preset konfigurasi template saat upload Excel agar mapping input, kode form, departemen, dan area tanda tangan terisi otomatis.
- Template `Rekomendasi Peremajaan Barang / Alat Kerja` memakai file Excel terbaru user `Form Rekomendasi Peremajaan Alat Template 20260629.xlsx` sebagai form rekomendasi/prasyarat PBO dengan nomor dokumen di `C4:J4`, tabel rekomendasi row `9-15`, catatan `B18:H24`, tempat/tanggal `I17:J17`, dan tanda tangan dinamis `I17:J24`.
- Tabel rekomendasi berisi `No.` otomatis, `Nama Barang / Alat Kerja`, `No Registrasi` opsional, `Lokasi / PIC` dari pilihan user, `Kerusakan` opsional, pilihan `Service`, `Ganti`, atau `Beli Baru`, `Uraian`, dan `Keterangan` opsional.
- Item rekomendasi dibuat dari konteks permohonan induk, tetapi `Nama Barang / Alat Kerja` diisi manual oleh tim IT/PO agar spesifikasi, tipe, dan pilihan barang dapat ditentukan berdasarkan hasil pemeriksaan.
- Navigator item rekomendasi menampilkan nama item dari permohonan induk sebagai konteks pekerjaan, sedangkan input `Nama Barang / Alat Kerja` tetap manual dan tidak mengikuti nama item induk.
- Tabel item pada ringkasan pengajuan selalu memakai urutan `No., Nama Barang, Satuan, Jumlah, Status, Keterangan` walaupun sumber data memakai urutan key berbeda.
- Judul/perihal dan tempat dokumen tetap otomatis. Jika user pernah mengubah lalu ingin kembali ke nilai sistem, user cukup mengosongkan field sehingga aplikasi mengisi ulang otomatis tanpa tombol reset terpisah.
- Pengisian rekomendasi menggunakan tampilan fokus per item dengan navigator, indikator kelengkapan, serta tombol Sebelumnya/Berikutnya agar form panjang tidak memenuhi layar.
- Pilihan `Service` hanya mencentang kolom Service, pilihan `Ganti` hanya mencentang kolom Ganti, sedangkan `Beli Baru` tidak mencentang keduanya dan tetap menyimpan uraian rekomendasi.
- Lampiran gambar wajib untuk item rekomendasi dengan keputusan `Service`, `Ganti Komponen`, atau `Beli Baru`. Untuk `Tidak Direkomendasikan`, petugas wajib mengisi alasan dan gambar bersifat opsional.
- Jika penanda tangan surat induk mengembalikan perbaikan ke tim IT/rekomendasi, tugas rekomendasi dibuka kembali di menu `Rekomendasi` dengan data rekomendasi terakhir sebagai draft awal.
- Rekomendasi yang direvisi harus dikonfirmasi ulang oleh Staff IT dan ditandatangani ulang oleh Mgr. PO sebelum surat induk kembali ke pemohon untuk memilih lanjut atau batal.
- Saat rekomendasi revisi selesai, sistem memperbarui snapshot rekomendasi pada surat induk, menonaktifkan tautan rekomendasi lama, dan menampilkan dokumen rekomendasi terbaru sebagai dokumen tertaut aktif.
- Setiap item rekomendasi memiliki `Link Referensi` opsional. Link tampil di UI dan email sebagai data pendukung, tetapi belum dipetakan ke Excel sampai area template khusus ditentukan.
- Nomor dokumen rekomendasi dibuat otomatis setelah surat induk dikonfirmasi, memakai counter departemen PBO, dan tidak dibuat ketika pemohon baru memilih opsi rekomendasi.
- Nomor rekomendasi selalu memakai entitas `UAI` dan melanjutkan counter surat departemen PBO, meskipun surat induk diterbitkan oleh entitas atau kantor cabang lain.
- Pilihan kebutuhan rekomendasi dinormalisasi setelah identitas departemen pemohon tervalidasi agar pilihan `Butuh rekomendasi` tidak berubah saat surat disimpan.
- Alur default rekomendasi aset memakai departemen PBO: Staff IT membuat dan Mgr. PO memeriksa. Jika ada dua Staff IT, keduanya melihat tugas yang sama sampai salah satu mengambil tugas.
- Tugas rekomendasi memakai shared lock: Staff IT pertama yang mengambil tugas menjadi pembuat/signer pertama, sementara kandidat lain hanya melihat status terkunci dan tidak bisa mengedit.
- Identitas, nomor, form, kegunaan, dan matrix signer rekomendasi dikunci dari konfigurasi task. Petugas tidak dapat membatalkan atau mengganti identitas tersebut dari form rekomendasi.
- Pengerjaan dokumen rekomendasi memakai path khusus `/surat/rekomendasi/registrasi`, bukan `/surat/registrasi`, agar halaman tidak mewarisi step lokasi/klasifikasi milik registrasi surat biasa.
- Nomor rekomendasi menampilkan ikon gembok tanpa teks teknis permanen. Hover atau fokus pada ikon menjelaskan bahwa nomor dibuat otomatis dari pengajuan induk dan tidak dapat diubah oleh petugas rekomendasi.
- Saat mengerjakan rekomendasi, petugas melihat ringkasan pengajuan induk yang memuat nomor, judul, pemohon, departemen, kantor, tempat/tanggal, isi pengajuan, dan daftar lampiran. Data hanya dapat diakses oleh kandidat atau petugas yang mengunci tugas rekomendasi.
- Kategori dokumen rekomendasi tetap `Aset`, tetapi judulnya dibedakan menjadi `Rekomendasi Peremajaan Alat` dan mengikuti barang serta lokasi pengajuan induk.
- Judul rekomendasi mengikuti hasil tiap item: `Rekomendasi Service [Barang]`, `Rekomendasi Ganti Komponen [Barang]`, atau `Rekomendasi Beli Baru [Barang]`, kemudian diakhiri konteks `Dept. ...`, `KC. ...`, atau `KCP. ...`. Beberapa item dengan hasil sama digabung dalam satu kelompok judul.
- Kegunaan rekomendasi dikunci oleh task tertaut dan tetap memuat input `Daftar Rekomendasi` serta `Catatan`; perbedaan metadata kategori lama tidak boleh mengosongkan form.
- Judul permohonan aset otomatis membedakan lokasi: pusat memakai `Dept. [Departemen] Kantor Pusat`, kantor cabang memakai `KC. [Nama]`, dan kantor cabang pembantu memakai `KCP. [Nama]`.
- Setelah Staff IT mengonfirmasi rekomendasi, sistem menautkan dokumen ke surat induk dan mencoba menandatangani step pertama otomatis agar proses langsung lanjut ke Mgr. PO.
- Surat induk dapat mengunci approval pada tahap yang dikonfigurasi sampai dokumen rekomendasi tertaut selesai.
- Pada daftar dokumen/lampiran surat induk, rekomendasi tampil sebagai item `Rekomendasi` dengan judul dokumen rekomendasi. Saat diklik, sistem membuka PDF dokumen rekomendasi melalui jalur token aman, bukan URL storage langsung.
- Email rekomendasi menampilkan daftar item dalam tabel rapi, termasuk lokasi/PIC, hasil rekomendasi, uraian, link referensi, dan nama lampiran, bukan JSON mentah.
- Template Excel rekomendasi dibuat ulang dengan logo Marison, area cetak `A1:J24`, dan used range bersih agar hasil PDF tidak tertarik ke bawah.
- Lampiran dapat diwajibkan, opsional, atau multiple sesuai aturan form.
- Preview dokumen menggunakan PDF.
- Tombol `Detail` pada Status Pengajuan menampilkan ringkasan dokumen yang sama dengan konfirmasi registrasi: identitas, isi input, lampiran, dan penandatangan, kemudian dilanjutkan status serta timeline approval.
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
- KC/KCP yang belum memiliki proyek tetap dapat membuat pengajuan non-unit. Sistem tidak menampilkan dropdown proyek kosong dan memakai kode proyek virtual `000` pada nomor surat serta snapshot input.
- KC/KCP yang sudah memiliki proyek tetap wajib memilih proyek cabang sebelum nomor surat diterbitkan.
- Pengajuan Unit selalu wajib memilih proyek Unit karena kapasitas unit dan alokasi kavling bergantung pada proyek yang dipilih.
- User mendapatkan nomor surat.
- Setelah nomor dipesan, sistem membuat draft registrasi dan menyimpan perubahan form otomatis ke database.
- Saat draft dikirim menjadi surat aktif, server SIGAP memvalidasi session login, lalu database memakai `reservation_id` draft sebagai kunci reservasi nomor. Reservasi ditandai `USED` secara atomik agar draft milik user sendiri tidak gagal karena pencarian nomor yang ambigu.
- Jika pengajuan Aset membutuhkan rekomendasi, nomor rekomendasi dipesan dalam transaksi pendaftaran yang sama atas identitas pemohon. Kepemilikan reservasi baru dipindahkan kepada petugas IT saat tugas rekomendasi diklaim, sehingga pendaftaran induk tetap aman dan tidak gagal karena perbedaan user.
- Setelah draft atau nomor surat dipulihkan, Form Dokumen dan Kegunaan tetap ditampilkan sebagai informasi terkunci agar user memahami konteks form yang sedang dilanjutkan tanpa efek berkedip saat refresh.
- Pada dokumen rekomendasi tertaut, Form Dokumen dan Kegunaan tidak ditampilkan ulang karena identitas form sudah dikunci oleh tugas rekomendasi dari pengajuan induk.
- Deteksi dokumen rekomendasi tertaut dilakukan dari parameter URL sejak render pertama, sehingga halaman tidak sempat menampilkan pilihan registrasi biasa saat draft rekomendasi sedang dipulihkan.
- Jika link rekomendasi lama masih membuka `/surat/registrasi?linked_type=recommendation`, aplikasi mengarahkannya ke `/surat/rekomendasi/registrasi` dengan parameter yang sama.
- Draft aktif dapat dilanjutkan melalui URL `?draft=<draftId>`; jika hanya ada satu draft, halaman membukanya otomatis, sedangkan beberapa draft ditampilkan sebagai pilihan.
- Saat draft dibuka kembali, alur penandatangan direkonsiliasi dengan konfigurasi Kegunaan Form aktif. Pilihan signer pada tahap yang ID-nya masih sama dipertahankan, tahap baru ditambahkan, dan tahap yang sudah dihapus tidak digunakan lagi.
- Perubahan matrix hanya diterapkan pada draft yang belum didaftarkan. Surat yang sudah terdaftar tetap memakai snapshot alur saat pendaftaran agar histori persetujuan tidak berubah.
- Lampiran yang dipilih setelah nomor dipesan langsung diunggah dan dikaitkan ke draft. Saat draft dibuka kembali, file tetap tersedia dan digunakan pada registrasi final tanpa unggah ulang.
- Validasi registrasi menghitung gabungan file baru dan lampiran draft yang sudah tersimpan berdasarkan persyaratan masing-masing. Lampiran draft dibaca ulang dari database saat submit agar batas minimum/maksimum tidak bergantung pada state browser.
- Upload lampiran pemohon menampilkan nama file aktif, urutan file, persentase byte yang sudah terkirim, fase penyimpanan metadata, serta status berhasil atau gagal. Ringkasan dan pendaftaran dikunci sampai proses selesai.
- Draft dan reservation nomor aktif selama tujuh hari. Draft yang dibatalkan menjadi `VOID` dan nomornya tidak digunakan ulang.
- User mengisi detail template berdasarkan Master Form.
- Jika user memilih `Aset` atau `Non Unit`, field teknis Unit tidak ditampilkan dan tidak ditulis ke dokumen.
- User memilih pejabat penandatangan berdasarkan matrix.
- Jika tahap dikonfigurasi mengikuti kantor pemohon, daftar pejabat otomatis dibatasi ke kandidat pada kantor/cabang surat yang sama.
- User mengunggah lampiran awal jika diwajibkan.

### Kategori Pengajuan

- Dokumentasi user menyediakan satu panduan terpadu untuk memilih `Aset`, `Non Aset`, `Unit`, dan `Non Unit`.
- `Aset` digunakan untuk barang yang menjadi inventaris/aset perusahaan, termasuk pengadaan atau peremajaan perangkat. Dokumen rekomendasi dapat tersedia sesuai departemen dan konfigurasi.
- `Non Aset` digunakan untuk barang habis pakai, jasa, sewa, promosi, kegiatan, dan biaya operasional yang tidak dicatat sebagai aset serta bukan pekerjaan pembangunan/proyek fisik.
- `Unit` digunakan untuk order bangun yang wajib memiliki proyek, jumlah unit, alokasi kavling, struktur atas/bawah, dan kode produksi.
- `Non Unit` digunakan untuk seluruh permohonan pekerjaan pembangunan/proyek fisik yang tidak membutuhkan pemilihan kavling atau alokasi unit, termasuk SPK, infrastruktur, fasilitas umum, perbaikan kawasan, material proyek, dan tenaga proyek.
- `Non Aset` dan `Non Unit` tidak dianggap istilah yang sama: Non Aset menjelaskan klasifikasi kebutuhan, sedangkan Non Unit menjelaskan tidak adanya proses alokasi kavling.
- Panduan menampilkan kegunaan, contoh, data yang diminta, alur, perbandingan kategori, dan solusi ketika form/kegunaan tidak muncul.

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
- Jika surat aset membutuhkan rekomendasi, detail approval menampilkan panel rekomendasi aset. Pembuatan rekomendasi dilakukan dari menu `Rekomendasi` agar jalurnya tidak bercabang.
- Setelah tindakan berhasil, sistem otomatis memilih antrean prioritas berikutnya.
- Step tanda tangan berjalan berurutan.
- Snapshot dokumen dibuat setelah approval.
- Notifikasi dikirim ke step berikutnya.

### Non-Fungsional

- User hanya dapat memproses step yang memang menjadi tugasnya.
- Status step harus konsisten dengan status surat.
- Perubahan approval harus tercatat.
- Dokumen preview harus menampilkan tanda tangan terbaru.
- PDF berfungsi sebagai pemeriksaan visual; informasi keputusan utama harus dapat dibaca dari kartu inbox tanpa membuka PDF.
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
- Jumlah unit yang dipilih boleh kurang dari permintaan dengan konfirmasi eksplisit dari tim pemeriksa.
- Perencanaan mengisi `Struktur Atas`, `Struktur Bawah`, dan komponen kode produksi per unit.
- Input `Struktur Atas` dan `Struktur Bawah` menerima nominal hasil ketik maupun paste dengan pemisah ribuan. Nilai `1.000.000`, `1,000,000`, dan `1000000` dinormalisasi menjadi satu juta serta ditampilkan sebagai `1.000.000`.
- Detail kavling dan kode produksi pada approval Unit ditampilkan sebagai tabel satu baris per kavling dengan header sticky, sehingga tim pemeriksa tetap melihat kolom `Struktur Atas`, `Struktur Bawah`, `Nomor`, `Blok`, dan `Tanggal` saat daftar discroll.
- Tipe Unit tetap berupa teks dan memakai contoh `60`, sehingga nilai lain seperti `60/72` tetap dapat dicatat tanpa dibulatkan.
- Datepicker Tanggal Produksi membuka bulan berjalan untuk data kosong dan menandai hari ini tanpa mengisi nilai otomatis. Tanggal baru disimpan setelah tim pemeriksa memilihnya.
- Setelah memilih kavling, tim pemeriksa dapat mengunduh template Excel alokasi unit, mengisi struktur atas/bawah, nomor, blok, dan tanggal produksi secara massal, lalu import kembali ke tabel pemeriksaan.
- Template Excel alokasi unit memiliki keterangan cell yang memberi contoh Tipe Unit `60`, input nominal, nomor kode produksi, blok, dan tanggal produksi agar tim pemeriksa tidak perlu menebak format.
- Nomor kode produksi pada template Excel memakai format tiga digit. Input `1` maupun `001` ditampilkan, diimport, disimpan, dan diekspor sebagai `001`.
- Import alokasi unit menerima `.xlsx`, `.xls`, dan `.csv`, hanya memperbarui kavling yang sudah dipilih, serta memberi informasi jika ada baris yang dilewati.
- Format kode produksi otomatis: `[nomor]/UAI/PRC/[blok]/[tanggal]`.
- Perencanaan mengunggah 3 lampiran manual: `SITEPLAN`, `VOLUME ADENDUM`, dan `HITUNGAN ADENDUM`.
- Sistem membuat 2 lampiran PDF otomatis:
  - `Rekap Adendum Unit` dengan tabel struktur dan total nominal.
  - `Kode Produksi Unit` dengan tabel `No`, `Proyek`, `Unit`, `Kode Produksi`.
- Ringkasan `Rekap Adendum Unit` dan `Kode Produksi Unit` juga tampil langsung di detail approval, monitoring, dan riwayat keterlibatan. Penanda tangan dapat memahami pekerjaan tim pemeriksa tanpa wajib membuka lampiran PDF.

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
- Saat tim pemeriksa menekan `Simpan & lanjutkan`, alokasi Unit disimpan lewat RPC database atomik agar data kavling tidak hanya tersimpan di draft/autosave. Jika ada data lama yang sudah diverifikasi tetapi alokasi masih hanya ada di draft, migration melakukan backfill ke `form_input_data` dan snapshot detail.
- Jika integrasi API external berubah, UI utama tidak perlu dirombak.

## 9. Monitoring Surat

- Detail Status Pengajuan menghitung ulang status dari signature pada respons detail. Modal tidak bergantung pada field turunan milik daftar, sehingga pergantian dari data ringkas ke data lengkap tidak membuat halaman kosong.

### Fungsional

- User melihat status pengajuan miliknya.
- User melihat dokumen, lampiran, snapshot, dan riwayat tanda tangan.
- Admin melihat semua status surat pada All Status Monitoring.

### Non-Fungsional

- Monitoring harus mengikuti hak akses.
- Tombol preview/unduh/snapshot harus memakai mekanisme akses aman.
- PDF hasil worker, lampiran, dan snapshot dibuka melalui token sekali pakai; URL storage publik tidak dipakai sebagai akses langsung.
- Data status harus sinkron dengan perubahan realtime atau refresh query.
- Monitoring harus menampilkan loading state per tombol saat file/PDF belum siap agar satu file yang diproses tidak mengunci tombol file lain.

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
- Tombol dokumen dan lampiran pada riwayat harus menampilkan proses `Menyiapkan PDF` atau `Membuka lampiran` dan mencegah klik ganda untuk file yang sama.
- Query riwayat harus tetap responsif meski data bertambah.

## 11. Batas Proses Approval

### Fungsional

- SIGAP menangani pembuatan, routing, tanda tangan, monitoring, dan penyelesaian approval.
- Setelah approval selesai, dokumen berstatus `DONE`.
- Pada deployment staging, surat yang sudah selesai ditandatangani dikirim otomatis dari server SIGAP ke API Marison staging untuk kategori `Aset`, `Unit`, dan `Non Unit`.
- Payload outbound memakai nomor surat, data pengajuan, item/unit yang dipilih, lampiran bertautan token, serta riwayat approval berisi role, NIK, waktu, dan catatan.
- Selama pengujian integrasi staging, seluruh NIK pemohon dan penandatangan pada payload outbound dapat diganti dengan satu NIK karyawan external yang valid melalui konfigurasi server. Override ini tidak mengubah NIK profil SIGAP dan selalu diabaikan pada production.
- Kontrak outbound Aset dan Unit v1 memakai fixture kanonis di `docs/contracts/marison/v1` dan divalidasi secara strict sebelum request dikirim.
- Perubahan nama field, tipe data, atau struktur payload harus melalui versi kontrak baru dan koordinasi vendor; server tidak menyediakan dua bentuk payload untuk endpoint yang sama.
- Jika data eksternal wajib seperti `branch_id`, `project_id`, `unit_id`, atau `non_unit_id` belum tersedia, pengiriman ditandai gagal di snapshot surat dengan alasan spesifik dan tidak mengirim angka palsu.
- Pembuatan SPK dan bukti pembayaran dilakukan di sistem departemen, bukan di SIGAP.

### Non-Fungsional

- Tidak ada akses PIC implisit atau bypass admin pada proses approval.
- Data hanya dapat dibaca oleh pembuat, penandatangan terkait, admin, atau external client resmi.
- Integrasi downstream berjalan dari server, memakai access token dan HMAC API Marison, serta tidak pernah mengirim `client_secret` ke browser.
- Integrasi downstream bersifat idempoten melalui `data_snapshot.marison_dispatch`; surat yang sudah sukses dikirim tidak dikirim ulang otomatis.
- Kontrak baru tidak boleh diaktifkan pada staging sebelum OpenAPI vendor dan contract test bersama menyatakan struktur payload yang sama.
- Branch eksternal dipetakan ke `master_offices.marison_branch_id`; payload Aset memakai mapping ini ketika snapshot surat belum membawa ID branch numerik.
- Master Kantor Cabang adalah mirror read-only dari endpoint `GET /branches` Marison External API. Admin dapat memeriksa dan menjalankan sinkronisasi dari halaman master, tetapi tidak dapat membuat, mengubah, atau menghapus kantor langsung dari SIGAP.
- Sinkronisasi mempertahankan UUID `master_offices` agar seluruh relasi SIGAP tetap valid, lalu memperbarui nama, kode, kedudukan, ID branch, kode branch, dan waktu sinkron berdasarkan data external.

## 12. Notifikasi dan Realtime

### Fungsional

- User mendapat notifikasi saat ada surat yang perlu diproses.
- Badge sidebar menunjukkan antrean approval yang relevan.
- Data aktif disinkronkan saat realtime event masuk atau tab kembali fokus.
- Badge sidebar langsung disinkronkan ketika `surat_signatures` atau `surat_registrasi` berubah dan langsung direfresh setelah aksi approval/pemeriksaan berhasil.
- Bunyi notifikasi diputar untuk event penting.

### Non-Fungsional

- Notifikasi tidak boleh dobel secara tidak terkendali.
- Badge harus sesuai hak akses.
- Error akses ditolak harus terlihat oleh user, bukan hanya di console.
- Realtime harus punya fallback refresh query.
- Sinkronisasi badge memakai stream SSE bersama dengan debounce singkat, bukan polling atau koneksi realtime tambahan per badge.
- Konfirmasi dan input pop-up aplikasi memakai dialog reusable SIGAP, bukan dialog browser bawaan, agar pengalaman user konsisten di semua halaman.

## 13. Master User Organization

### Fungsional

- Admin mengelola user.
- Admin mengatur relasi user dengan departemen/kantor.
- Admin melihat informasi dasar user untuk kebutuhan assignment.
- Admin dapat memfilter daftar karyawan berdasarkan jabatan dan mengurutkan daftar berdasarkan nama, jabatan, departemen, kantor, atau status akun.
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
- Admin dapat memilih setiap form yang tersimpan lalu menghasilkan PDF uji tanpa membuat surat, nomor dokumen, tanda tangan, maupun data database. Form baru otomatis ikut tersedia pada pilihan uji.
- Uji PDF Form Permintaan Barang & Jasa mengisi contoh nomor, identitas pengaju, tiga item, catatan, tempat/tanggal, dan kotak tanda tangan berdasarkan jumlah serta distribusi role yang dipilih admin.
- Kolom nama barang selalu diratakan ke kiri berdasarkan fungsi datanya, termasuk ketika input UI menggunakan pilihan/select. Tipe kontrol tidak boleh mengubahnya menjadi rata tengah.
- Form Permintaan Barang & Jasa memakai generator PDF-native deklaratif dan tidak memakai Excel atau LibreOffice sebagai sumber tata letak PDF.
- Uji PDF, surat baru, snapshot approval, dan `Buat Ulang PDF` memakai renderer PGD tunggal. Data diambil dari snapshot transaksi database sehingga tabel, identitas, catatan, tempat/tanggal, dan tanda tangan tidak berbeda antarjalur.
- Stamp tanda tangan diseragamkan menjadi `DISETUJUI SISTEM` dengan tanggal-jam WIB, tanpa emoji dan tanpa label bahasa Inggris.
- Excel PGD hanya dipertahankan sebagai sumber historis/kompatibilitas; perubahan merge, border, atau print area Excel tidak memengaruhi PDF PGD baru.
- Renderer PGD menampilkan header Marison, metadata Cabang/Departemen dan Proyek, pilihan aset/non-aset, maksimal 15 baris barang, catatan, dan kotak tanda tangan dinamis pada satu halaman A4 landscape.
- Uji PDF dan dokumen transaksi memakai aturan pembagian tanda tangan yang sama: 3 kotak memakai tiga slot kanan dari grid 4, 4 kotak memakai grid 4, 5 kotak `3 + 2`, 6 kotak `3 + 3`, 7 kotak `4 + 3`, dan 8 kotak `4 + 4`.
- Tinggi setiap baris kotak tanda tangan bersifat tetap. Formasi satu baris 3/4 signer memakai tinggi yang sama dengan baris pertama formasi dua baris; area bawah dibiarkan kosong tanpa border.
- Tempat/tanggal hanya membentang selebar kotak aktif pada baris pertama.
- Area cetak dokumen dengan tanda tangan dinamis dipaksa satu halaman melalui `fitToWidth = 1` dan `fitToHeight = 1`.

### Non-Fungsional

- Mapping cell harus tervalidasi.
- Merge range harus tetap dianggap mapping valid.
- Preset tidak boleh hanya menjadi placeholder tanpa cell.
- Master Form tidak menentukan apakah registrasi termasuk Aset, Unit, atau Non Unit.
- Mapping teknis biasa dan unit harus terpisah jelas.
- Template baru harus bisa ditangani tanpa mengubah kode selama formatnya sesuai konfigurasi.
- Konfirmasi hapus template dan quick preset memakai dialog reusable aplikasi, bukan dialog browser bawaan.
- PDF uji hanya dapat dibuat oleh admin, mengambil template berdasarkan `form_id` dari database, membatasi host file template, dibatasi enam kali per menit, dan dibuka melalui URL sekali pakai yang kedaluwarsa dalam dua menit.

## 17. Master Jenis Surat

### Fungsional

- Admin mengelola jenis surat.
- Jenis surat dipakai dalam pembuatan nomor, filter monitoring, dan KPI.
- Admin dapat menentukan departemen mana saja yang boleh memakai tiap jenis surat.
- Admin dapat menentukan nomor index jenis surat berbeda untuk setiap departemen.
- Pada registrasi surat, pilihan jenis surat hanya menampilkan jenis yang aktif untuk departemen pengaju.

### Non-Fungsional

- Jenis surat perlu stabil karena dipakai untuk histori dan filter.
- Perubahan jenis surat tidak boleh mengubah makna surat lama.
- Pembatasan jenis surat dilakukan melalui mapping departemen, sehingga kamus kode global tetap aman untuk histori.
- Index jenis surat yang dipakai pada nomor surat diambil dari mapping departemen, bukan dari master global.

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
- Admin dapat mengatur scope kandidat signer per tahap: manual, kantor pemohon, kantor pusat, atau semua kantor.
- Kegunaan PGD cabang tersedia untuk `Permohonan Marketing Cabang` dan `Permohonan Teknik Cabang`, dengan Spv/BM mengikuti kantor pemohon serta Manager Marketing/Direktur Utama mengikuti kantor pusat. `Permohonan Teknik Cabang` diklasifikasikan sebagai `Non Unit` karena mencakup pekerjaan pembangunan/proyek fisik tanpa alokasi kavling.
- Kegunaan PGD diperluas untuk permohonan utilitas PDAM/PLN, SLO/SLF, legal-perizinan, karangan bunga, aset/non aset pusat dan cabang, HRD/GA, event, entertain, parcel, serta kompensasi proyek dengan alur signer sesuai konfigurasi bisnis.
- Registrasi kegunaan cabang dapat dibuat oleh admin cabang seperti `Marketing (Cabang)`, `Teknik (Cabang)`, `Umum & Keuangan (Cabang)`, atau departemen `Cabang`; penanda tangan tahap `Membuat` tetap mengikuti matrix signer yang dikonfigurasi.
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
- User dapat mengganti foto profil sendiri dengan JPG, PNG, atau WebP berukuran maksimal 5 MB.
- Upload foto profil diproses endpoint server terautentikasi; path storage dipaksa mengikuti ID Supabase Auth akun aktif.
- Avatar disimpan pada bucket private di Supabase Storage self-hosted dan disajikan melalui endpoint domain SIGAP.
- Sidebar, pengaturan, dan komponen avatar lain memakai loader terautentikasi yang sama agar foto private tetap muncul dan proporsi gambar tidak berubah.
- Tampilan aplikasi menggunakan thumbnail WebP maksimal 256 x 256, sedangkan pembukaan URL avatar sebagai tab menampilkan file asli.
- Avatar dapat dilihat oleh user yang sudah login pada halaman organisasi, agenda, aktivitas, dan profil tanpa membuka URL storage publik.
- User dapat memilih tema `System`, `Light`, atau `Dark`.
- Preferensi tema diterapkan segera dan disimpan per akun pada profil.
- Mode `System` mengikuti preferensi warna perangkat atau browser.

### Non-Fungsional

- Pengaturan harus valid sebelum disimpan.
- Perubahan setting perlu efek yang jelas dan tidak merusak session user.
- Tema harus menggunakan token warna bersama agar halaman aktif tetap terbaca pada light dan dark mode.
- Jika penyimpanan preferensi gagal, tema dikembalikan ke pilihan sebelumnya dan user menerima pesan error.
- Validasi foto dilakukan di frontend dan server, termasuk MIME type, ukuran, dan signature file.
- URL dan credential storage internal tidak boleh diekspos sebagai URL avatar publik.

### Sinkronisasi Dokumentasi

- Setiap perbaikan, pengembangan fitur, perubahan alur, perubahan keamanan, atau perubahan operasional harus memperbarui `docs/FITUR.md` dan halaman `/docs` yang relevan.
- Setiap pembaruan halaman `/docs` harus dicatat pada changelog dan menaikkan versi dokumentasi.
- Semua perubahan pada tanggal kalender yang sama digabung pada satu entri versi. Perubahan berikutnya pada hari yang sama menambah daftar perubahan pada versi tersebut, bukan membuat versi baru.
- Versi baru dibuat ketika tanggal pembaruan berubah atau ketika rilis resmi berikutnya dimulai.

## 24. Configuration

### Fungsional

- Admin mengakses konfigurasi sistem dari satu menu `Configuration`.
- Dropdown konfigurasi memindahkan admin di antara `Form & Template`, `Template Builder`, `Alur Persetujuan`, `Pengajuan Unit`, `SLA Departemen`, `Penomoran Surat`, dan `Label Jabatan`.
- Dropdown konfigurasi juga menyediakan `Email Notification` untuk penerima email, privasi, dan mode file.
- Form & Template mengatur konfigurasi form, mapping input, mode unit, dan lampiran. Untuk form non-PGD seperti rekomendasi, template Excel tetap aktif. Untuk PGD, template Excel dinonaktifkan dari UI karena PDF dibuat oleh renderer sistem.
- Template Builder mengatur template dokumen native dari nol. Admin dapat membuat canvas A4/F4 portrait atau landscape, menambahkan logo, teks, field data, tabel berulang, catatan, kotak, garis, dan area tanda tangan.
- Template Builder mendukung data berulang melalui elemen `Tabel Berulang`. Admin memilih sumber data seperti `Daftar Barang`, `Daftar Unit`, `Daftar Rekomendasi`, `Daftar Lampiran`, atau `Penandatangan`, lalu mengatur kolom, binding, format, jumlah baris minimum, jumlah baris maksimum, dan tinggi baris.
- Untuk template kompleks, AI tetap dipakai sebagai pendamping konfigurasi: membantu menyusun struktur form input, binding field, tabel berulang, dan variasi kotak tanda tangan dinamis 2-8 slot sebelum admin merapikan desain akhir di Template Builder.
- Area tanda tangan mendukung tinggi otomatis berdasarkan lebar area cetak, jumlah slot, dan jumlah baris. Aksi `Sesuaikan area cetak` memenuhi lebar halaman di dalam margin dan menjaga seluruh kotak tetap berada pada halaman; mode tinggi tetap tersedia untuk kebutuhan khusus.
- Canvas menampilkan batas area cetak dan mendeteksi elemen yang melewati margin. Tombol `Sesuaikan Semua` menata ulang posisi, memperkecil layout secara proporsional, lalu memusatkan keseluruhan layout secara horizontal dan vertikal di dalam area cetak.
- Template Builder menyimpan definisi layout sebagai JSON berversi pada tabel `document_template_builders` dan `document_template_builder_versions`. Versioning menjaga dokumen lama tetap dapat dirender dengan layout yang sama walaupun template baru sudah dipublish.
- Template Builder saat ini menjadi fondasi native renderer dan belum mengganti seluruh alur produksi PGD/rekomendasi yang sudah berjalan. Integrasi berikutnya adalah membuat generator PDF membaca JSON builder yang sama untuk Uji PDF, Buat Ulang PDF, dan surat baru.
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
- API menyediakan master data onboarding akun melalui `GET /api/onboarding/options`, `GET /api/master/offices`, dan `GET /api/master/departments`.
- Sistem lain dapat menampilkan pilihan Kantor Pusat, KC, KCP, dan Departemen tanpa mengambil data user SIGAP.
- Dokumentasi API tersedia di Swagger UI.

### Non-Fungsional

- `client_secret` tidak disimpan dalam bentuk plaintext.
- Access token memiliki masa berlaku.
- File tidak diberikan sebagai public storage URL langsung.
- Endpoint master data hanya mengirim field allowlist seperti `id`, `code`, `name`, `type`, `parent`, dan `dept_index`; email/internal field tidak diekspos.
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
- Jika surat sedang `MENUNGGU_PERBAIKAN` dan tugas berada di pemohon, SLA signer/departemen berhenti sehingga tidak dihitung sebagai pending atau terlambat.
- Saat pemohon memilih `Lanjutkan proses`, waktu SLA tahap 1 dimulai dari waktu pengajuan dilanjutkan kembali, bukan dari waktu sebelum surat dikembalikan.
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
- Production dan staging memakai layanan storage self-hosted yang sama agar pengelolaan bucket terpusat. Production mempertahankan path utama, sedangkan seluruh write staging dipaksa masuk ke namespace `staging/`.
- BFF dan PDF worker menolak akses storage staging ke object path di luar namespace `staging/`. Service-role bersama tetap harus diperlakukan sebagai credential sensitif karena namespace aplikasi bukan pengganti pembatasan credential di tingkat storage.
- Validasi namespace saat membuka dokumen atau lampiran memakai `bucket` dan object path aktual dari token file. Token yang sah tidak boleh ditolak hanya karena pemeriksaan origin tidak membawa path objek.
- Referensi file staging yang dibuat sebelum namespace `staging/` diterapkan dimigrasikan secara idempotent ke path baru. Migrasi menyalin objek terlebih dahulu, memperbarui referensi database setelah salinan tersedia, dan tidak menghapus objek sumber.

## 30. Operasional, Deployment, dan Worker

### Fungsional

- Aplikasi utama berjalan di Docker production.
- Deployment staging selalu memakai datasource Marison staging, sedangkan deployment production selalu memakai datasource Marison production.
- Domain production adalah `https://sigap.marisoncloud.com`; DNS Cloudflare berupa proxied `A` record ke origin publik, lalu Caddy meneruskan request ke container production pada `10.10.10.246:3010`.
- Domain staging adalah `https://sigap.marison-testing.biz.id` dan tetap melalui Cloudflare Tunnel ke container staging pada port host `3011`.
- Staging memakai project Supabase, Auth, database, dan PDF worker tersendiri. Layanan storage fisiknya dipakai bersama production, tetapi object path staging dipisahkan dengan prefix `staging/`; data transaksi production tidak disalin ke database staging.
- Master/config staging disalin dari production, sedangkan kandidat user dimasking agar matrix dapat diuji tanpa menyalin PII production.
- `npm run dev` membaca `.env.local`, menjalankan Vite pada port `8080` dan BFF lokal pada port `3010`, serta tetap memakai Supabase dan datasource Marison staging.
- Request `/api` dari Vite diproxy ke BFF lokal tanpa mengubah Host header agar validasi same-origin dan cookie HttpOnly bekerja sama seperti deployment.
- Environment Marison dikunci melalui `MARISON_DEPLOYMENT_ENVIRONMENT` pada Docker Compose dan tidak dapat diganti dari UI atau nilai database.
- Halaman `Konfigurasi > Integration` menampilkan status endpoint aktif, tes koneksi, pemeriksaan data, dan sinkronisasi manual master Marison untuk admin.
- Khusus staging, admin dapat memeriksa lalu menyinkronkan data `/branches` dan `/employees` dari halaman Integration tanpa mengirim credential external ke browser.
- Staging menjalankan sinkronisasi otomatis setiap hari pukul 00:00 Asia/Jakarta setelah sinkron manual dan aturan mapping diuji. Scheduler production tetap nonaktif sampai ada permintaan rilis production yang eksplisit.
- Sinkronisasi mempertahankan UUID, role, jabatan, departemen, dan kantor profil lama; NIK dinormalisasi dari sumber external, akun baru memakai role `user`, dan email login memakai pola `nama.lengkap@staging.test`.
- Employee tanpa NIK atau NIK yang ambigu diblokir dan dilaporkan pada preview; akun yang tidak ada pada response external tidak dinonaktifkan otomatis.
- External API berjalan sebagai service terpisah.
- PDF worker dapat dipisah di server lain.
- Cloudflare Tunnel hanya dipakai oleh staging dan layanan testing lain; hostname production SIGAP tidak terdaftar pada ingress Tunnel.
- Deploy aplikasi utama dilakukan dari host/workstation yang memiliki Docker context `ubuntu-server`.
- Jika perubahan tidak menyentuh `pdf-worker.mjs`, Dockerfile runtime PDF, LibreOffice/font runtime, atau konfigurasi worker, deploy cukup menjalankan service aplikasi utama tanpa merestart PDF worker.
- PDF worker hanya diredeploy ketika ada perubahan worker, dependency/runtime PDF, atau konfigurasi worker.
- External API dideploy terpisah melalui `docker-compose.external.yml`.

### Non-Fungsional

- Production deploy menggunakan `.env.production`.
- Staging menggunakan `.env.staging` dan `docker-compose.staging.yml` dengan `MARISON_DEPLOYMENT_ENVIRONMENT=staging`.
- Akun hasil salinan data staging mempertahankan nama riil dan memakai email non-deliverable berbasis nama (`nama.user@staging.test`); nama yang sama mendapat akhiran `.02`, `.03`, dan seterusnya. Password default akun uji hanya berlaku di staging, sementara akun admin staging dengan email asli dikelola terpisah.
- Production menggunakan `docker-compose.prod.yml` dengan `MARISON_DEPLOYMENT_ENVIRONMENT=production`.
- `APP_PUBLIC_URL` dan `VITE_APP_PUBLIC_URL` dikunci oleh masing-masing Compose agar tautan email, reset password, dan API browser tidak silang domain.
- Credential `MARISON_STAGING_*` dan `MARISON_PRODUCTION_*` hanya tersedia di server dan tidak dikirim ke browser.
- Fallback lama `MARISON_EXTERNAL_*`, pemilihan environment global dari database, dan switch OTP tidak digunakan lagi.
- Command deploy staging aplikasi utama saja, tanpa membuat ulang PDF worker atau sync worker:

```powershell
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build --no-deps agenda-flow-staging
```

- Command deploy seluruh stack staging secara sengaja:

```powershell
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --build
```

- Command deploy production aplikasi utama:

```powershell
docker --context ubuntu-server compose -p agenda-flow-production -f docker-compose.prod.yml --env-file .env.production up -d --build
```

- Jangan hilangkan `-p`; nama project Compose yang berbeda mencegah deploy staging menganggap container production sebagai orphan.
- Jangan hilangkan `--env-file`; staging wajib memakai `.env.staging` dan production wajib memakai `.env.production`.
- Deploy aplikasi utama saja tidak merestart PDF worker atau sync worker yang sudah berjalan.
- Jika hanya mengubah frontend, halaman dokumentasi, atau backend aplikasi utama di `backend/src`, gunakan command aplikasi utama staging di atas.
- Redeploy PDF worker staging hanya jika `pdf-worker.mjs`, dependency/runtime PDF, LibreOffice/font, atau konfigurasi worker berubah:

```powershell
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-pdf-worker-staging
```

- Redeploy sync worker staging hanya jika `server/marison-sync-worker.mjs`, image/runtime, token, URL, jadwal, atau konfigurasi sinkronisasi berubah:

```powershell
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging build agenda-flow-staging
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps agenda-marison-sync-staging
```

- Jika perlu redeploy PDF worker production, gunakan compose worker production secara terpisah:

```powershell
docker --context ubuntu-server compose -p agenda-flow-production-worker -f docker-compose.worker.yml --env-file .env.production up -d --build
```

- Setelah deploy staging, verifikasi service Compose dan endpoint readiness publik:

```powershell
docker --context ubuntu-server compose -p agenda-flow-staging -f docker-compose.staging.yml --env-file .env.staging ps
Invoke-WebRequest -UseBasicParsing https://sigap.marison-testing.biz.id/health/ready
```

- App harus berstatus healthy. Worker yang ikut dideploy harus berstatus running; periksa log service terkait bila worker tidak stabil.

- Jika hanya mengubah External API, gunakan compose external dan app utama/PDF worker tidak perlu diredeploy:

```powershell
docker --context ubuntu-server compose -f docker-compose.external.yml --env-file .env.production up -d --build
```

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
- Cookie sesi HttpOnly hanya menyimpan token dan identitas minimum user agar ukurannya tetap di bawah batas cookie browser; profil lengkap tetap dibaca dari database.
- BFF meneruskan JWT user melalui konfigurasi `accessToken` resmi Supabase SDK sehingga `auth.uid()` konsisten pada query, validasi kegunaan, dan submit registrasi.
- Endpoint ringan untuk attention badge, web push, dan data source unit memakai validasi token JWT lokal yang memeriksa bentuk token, expiry, dan user id. Jalur ini mengurangi ketergantungan ke request network Supabase Auth untuk badge/notifikasi, sedangkan endpoint dokumen dan token file tetap memakai validasi Auth server penuh.

## 31. Kegunaan Form dan Tanda Tangan Dinamis

### Fungsional

- Satu form Excel dapat dipakai oleh banyak kegunaan bisnis.
- Urutan registrasi adalah kategori dokumen, form, lalu kegunaan.
- Setiap kegunaan mengatur departemen pengaju, scope pusat/cabang, 2-8 tahap approval, departemen signer, kandidat user, action approval/alokasi unit, dan persyaratan lampiran.
- Daftar kandidat signer pada konfigurasi kegunaan dapat dicari berdasarkan nama/jabatan/kantor, difilter per jabatan, dan diurutkan berdasarkan nama, jabatan, atau kantor.
- Scope kandidat signer menentukan apakah kandidat tahap difilter manual, mengikuti kantor pemohon, mengikuti kantor pusat, atau lintas semua kantor.
- Pada scope kantor pemohon, UI registrasi dan trigger database hanya mengizinkan signer yang berada di kantor/cabang surat yang sama.
- Pada scope departemen pemohon, UI registrasi dan trigger database hanya mengizinkan signer yang berada di departemen pengaju surat, sehingga tahap seperti `Pimpinan Departemen` atau `Mgr. Departemen Terkait` tidak menampilkan manager dari departemen lain.
- Scope `BM cabang / dept pusat` tersedia untuk alur campuran. Jika pengaju dari cabang/kost, kandidat mengikuti kantor pemohon. Jika pengaju dari Kantor Pusat, kandidat mengikuti departemen pengaju.
- Marketing pusat diperlakukan sebagai departemen `Marketing`, sedangkan `Marketing (Cabang)` dipakai untuk relasi cabang ke BM/kantor cabang. Import karyawan otomatis memindahkan data Marketing Cabang yang berkantor di Kantor Pusat ke departemen Marketing.
- Operasional Kost tidak dipaksa mencari manager internal. Kegunaan `Permohonan Operasional Kost` memakai alur `SPV Kost -> Mgr. HRD GA -> Direktur I -> Direktur Utama`.
- Pada scope kantor pusat, UI registrasi dan trigger database hanya mengizinkan signer yang kantor profilnya berkedudukan `Pusat`.
- Setiap tahap dapat memiliki tim pemeriksa/verifikator data sebelum penanda tangan tahap tersebut dapat melakukan aksi.
- Tim pemeriksa bersifat opsional per tahap dan hanya aktif jika admin mengaktifkan konfigurasi pemeriksa pada tahap tersebut.
- Kandidat pemeriksa default mengikuti departemen penandatangan tahap yang akan diperiksa; pada scope cabang, snapshot pemeriksa transaksi dibatasi ke kantor/cabang surat yang sama.
- Konfigurasi tim pemeriksa menyediakan pencarian nama, jabatan, dan kantor agar kandidat mudah ditemukan.
- Jika tahap membutuhkan pemeriksaan, penanda tangan tetap dapat melihat pengajuan tetapi tombol `Setujui` dan `Tolak` terkunci sampai tim pemeriksa memeriksa data.
- Tim pemeriksa melihat task pemeriksaan di Inbox Persetujuan, mengunggah lampiran tahap yang diwajibkan, mengisi alokasi Unit bila tahap tersebut membutuhkan alokasi, lalu memakai tombol `Simpan & lanjutkan` untuk meneruskan proses ke signer.
- Tim pemeriksa mendapat autosave halus untuk data pemeriksaan seperti alokasi unit, detail kode produksi, dan catatan. Status autosave hanya tampil sebagai teks kecil agar tidak mengganggu fokus kerja.
- Detail persetujuan menyediakan tombol `Export Summary` untuk menghasilkan PDF formal `Summary Pengajuan - [Judul Surat]` dengan logo Marison, waktu pembuatan laporan, identitas surat, isi pengajuan, dan kavling/unit. Lampiran, alur penandatangan, serta riwayat revisi tidak disertakan pada summary ini.
- Panel utama tetap bernama `Ringkasan Pengajuan` agar tidak mengunci konteks ke direksi atau tahap tertentu.
- Tim pemeriksa dapat membuka dokumen utama dan lampiran surat yang menjadi tugasnya melalui token file aman; akses ini mengikuti `verifier_snapshot` transaksi, bukan URL storage publik.
- Badge Persetujuan memakai warna primary untuk menandakan jumlah tugas aktif. Warna merah hanya digunakan pada status ditolak atau indikator SLA yang terlambat.
- Pada pengajuan Unit, proyek/kawasan dikunci dari pilihan pemohon dan tidak dapat diubah oleh tim pemeriksa atau penanda tangan; jika proyek salah, user harus membuat pengajuan baru.
- Untuk pengajuan Unit, tim pemeriksa dapat memilih jumlah unit kurang dari permintaan dengan konfirmasi eksplisit sebelum pemeriksaan dilanjutkan.
- Setelah data diperiksa, penanda tangan melihat ringkasan hasil pemeriksaan dan tidak perlu mengunggah/mengisi data tahap yang sama.
- Pada pengajuan Unit, Mgr. Perencanaan atau signer berikutnya tidak lagi melihat panel `Pilih kavling` jika tim pemeriksa sudah menyimpan alokasi; yang tampil adalah ringkasan kavling, kode produksi, dan rekap adendum.
- Penanda tangan dapat mengembalikan task ke tim pemeriksa dengan catatan revisi jika data/lampiran perlu diperbaiki.
- Saat pengajuan dikembalikan ke tim pemeriksa, sistem mempertahankan data pemeriksaan terakhir seperti kavling terpilih, struktur atas/bawah, kode produksi, dan lampiran tahap. Tim pemeriksa dapat memperbaiki dari data lama, bukan menginput ulang dari nol.
- Jika tugas tim pemeriksa berasal dari revisi dan data sebelumnya sudah pernah diperiksa, tombol `Simpan & lanjutkan` menyelesaikan revisi tersebut setelah menyimpan perubahan, bukan memanggil ulang pemeriksaan normal yang sudah tidak berlaku.
- Status internal revisi mendukung fase `awaiting_requester`, sehingga hasil perbaikan tim pemeriksa dapat dikirim kembali ke pemohon untuk memilih lanjutkan proses atau batalkan pengajuan.
- Jika tim pemeriksa menyelesaikan revisi tanpa perubahan item atau nilai, sistem langsung mengembalikan proses ke signer aktif. Persetujuan pemohon ulang hanya diperlukan ketika ada perubahan bermakna pada item/nilai.
- Jika signer belum bisa menyetujui karena menunggu pemeriksaan, action bar menampilkan nama pemeriksa yang sedang ditunggu, bukan teks generik `tim pemeriksa`.
- Penanda tangan dapat mengembalikan task ke tim pemeriksa tanpa mengubah jumlah/nilai item. Pada kondisi ini baris item tetap `Tidak berubah`, tetapi `Instruksi perbaikan` tetap dikirim ke tim pemeriksa.
- Penanda tangan aktif dapat mengembalikan proses secara manual ke pemohon, tim pemeriksa, signer sebelumnya, atau tim IT/rekomendasi sesuai konteks perbaikan.
- Opsi `Tim pemeriksa` hanya tersedia jika tahap aktif memiliki pemeriksa pada snapshot transaksi; targetnya adalah user pemeriksa pada tahap tanda tangan tersebut.
- Pada dialog pengembalian, signer hanya mengisi alasan untuk item yang berubah. `Nilai diajukan` ditampilkan sebagai referensi saat keputusan `Disetujui sebagian`, bukan input wajib.
- Placeholder instruksi, nilai disetujui, dan alasan perubahan pada dialog pengembalian mengikuti konteks pengajuan seperti Unit, Aset, Non Aset, atau Rekomendasi.
- Pada pengajuan Unit, keputusan item dihitung otomatis dari `Jumlah disetujui`: sama dengan jumlah diajukan berarti tidak berubah, lebih sedikit berarti disetujui sebagian, dan nol berarti tidak disetujui.
- Dialog pengembalian proses tidak memakai field `Instruksi utama` untuk surat yang memiliki item terstruktur. Alasan utama otomatis diambil dari alasan perubahan item, sedangkan catatan umum hanya muncul jika surat tidak memiliki item terstruktur.
- Surat yang dikembalikan masuk status `MENUNGGU_PERBAIKAN`, memiliki riwayat perbaikan terstruktur, dan menampilkan badge/notifikasi agar pemohon atau pihak tujuan revisi menyadari tindakan yang diperlukan.
- Jika perbaikan ditujukan ke pemohon, badge tampil pada `Status Pengajuan`, bukan `Persetujuan`, karena pemohon melanjutkan atau membatalkan pengajuan dari halaman status.
- Indikator parent `Layanan Surat` ikut menyala jika ada perhatian di `Persetujuan`, `Rekomendasi`, `Tindak Lanjut`, atau `Status Pengajuan`.
- Detail pengajuan menampilkan `items` sebagai `Daftar Barang` dengan urutan kolom tetap `No., Nama Barang, Satuan, Jumlah, Status, Keterangan` agar tidak mengikuti urutan key mentah dari database.
- Catatan revisi item ditampilkan pada baris khusus di bawah item terkait. Nilai revisi mengikuti konteks satuan, misalnya `8 unit dari 10 unit`, bukan selalu diformat sebagai rupiah.
- Catatan revisi dengan keputusan `Tidak berubah` seperti `kirim ulang` tidak ditempelkan ke kolom `Keterangan` barang. Catatan tersebut tetap tersedia pada riwayat perbaikan agar tabel barang hanya berisi data barang yang benar-benar berubah.
- Riwayat perbaikan menyimpan nomor surat, judul, pengaju, tahap asal, tujuan perbaikan, alasan, perubahan terstruktur, aktor, dan waktu untuk kebutuhan audit.
- Riwayat perbaikan tidak menampilkan label generik seperti `Instruksi utama` sebagai isi riwayat. Jika catatan utama generik, sistem memakai alasan perubahan item pertama yang valid.
- Perubahan item dapat disimpan per baris dengan keputusan `Tidak berubah`, `Disetujui sebagian`, atau `Tidak disetujui`.
- Jika item tidak disetujui, item tetap tampil dengan garis coret dan alasan perubahan pada detail pengajuan serta PDF final agar riwayat keputusan tidak hilang.
- Jika nilai berubah, riwayat perbaikan menyimpan `nilai diajukan`, `nilai disetujui`, dan `alasan perubahan`.
- Jika pengajuan aset memakai rekomendasi, perbaikan spesifikasi/harga diarahkan ke tim IT/rekomendasi agar rekomendasi diperbarui lebih dulu sebelum approval induk berlanjut.
- Jika ada data yang berubah setelah sebagian tanda tangan berjalan dan dikembalikan ke pemohon, semua penandatangan wajib meninjau dan menandatangani ulang dari tahap 1.
- Setelah pihak tujuan revisi menyelesaikan perbaikan, pemohon harus memilih `Lanjutkan proses` atau `Batalkan pengajuan` dari halaman `Tindak Lanjut`, bukan dari Status Pengajuan.
- Badge revisi yang menjadi tugas pemohon dipisahkan ke menu `Tindak Lanjut`; Status Pengajuan tetap menjadi halaman baca progres dan detail dokumen.
- Link notifikasi revisi pemohon dinormalisasi ke `/surat/tindak-lanjut` agar user langsung masuk ke antrean keputusan yang benar.
- Aksi `Lanjutkan proses` dan `Batalkan pengajuan` pada Status Pengajuan memakai dialog aplikasi dengan textarea, validasi, dan loading state; tidak lagi memakai prompt native browser.
- Jika pemohon melanjutkan, sistem mengulang approval dari tahap 1 karena data surat sudah berubah.
- Saat pemohon melanjutkan perbaikan, perubahan item yang disetujui diterapkan ke `form_input_data`, cache PDF lama dibersihkan, dan catatan revisi dipindahkan ke snapshot terapan agar PDF baru memakai data terbaru.
- Jika pemohon membatalkan, nomor surat ditandai hangus melalui status penolakan/pembatalan revisi.
- Saat pemohon memilih proyek Unit, sistem menampilkan kapasitas unit tersedia saat ini agar jumlah yang diajukan tidak dibuat tanpa konteks stok proyek.
- Lampiran dapat diwajibkan pada tahap pemohon maupun tahap signer tertentu, termasuk jumlah minimum/maksimum, multiple file, tipe MIME, dan batas ukuran.
- Tahap lampiran `stage_order = 0` ditampilkan sebagai `Pemohon (Saat Registrasi)` agar tidak disalahpahami sebagai tahap penanda tangan.
- Semua lampiran pemohon dan approval hanya dikonfigurasi melalui Kegunaan Form berdasarkan `stage_order`.
- Departemen penanda tangan hanya wajib pada scope kandidat manual; scope dinamis seperti kantor pusat, kantor pemohon, departemen pemohon, BM cabang/departemen pusat, dan lintas kantor dapat menyimpan kandidat tanpa departemen tetap.
- Preview kandidat pada konfigurasi kegunaan tetap menampilkan kandidat relevan untuk scope dinamis walaupun departemen tetap belum dipilih.
- Konfigurasi lampiran lama pada Master Form dan fallback snapshot surat telah dihapus; satu file hanya melewati satu jalur validasi dan penyimpanan.
- Saat signer memilih lampiran approval, UI menampilkan jumlah file, nama file, ukuran file, status siap unggah, dan status mengunggah ketika approval sedang diproses.
- Form menyimpan satu `signature_layout` berupa sheet dan area persegi panjang yang dikelola sistem.
- Konfigurasi layout menyediakan preset `PGD` untuk aturan tanda tangan renderer sistem 3-8 kotak; mode `Adaptif` tetap tersedia untuk form lain.
- Setiap role `Membuat`, `Memeriksa`, dan `Menyetujui` wajib memiliki 1-3 signer. Jumlah keseluruhan signer yang didukung adalah 3-8.
- Pembagian baris preset PGD adalah: 3 kotak memakai grid 3, 4 kotak `4`, 5 kotak `3 + 2`, 6 kotak `3 + 3`, 7 kotak `4 + 3`, dan 8 kotak `4 + 4`. Jika baris kedua lebih pendek, slotnya diratakan ke kanan terhadap grid baris pertama.
- Ukuran vertikal satu blok tidak berubah berdasarkan jumlah baris. Formasi 3/4 memakai blok atas saja, sedangkan blok bawah hanya digunakan oleh formasi 5-8.
- Pada preset PGD, urutan tahap wajib `Membuat`, `Memeriksa`, lalu `Menyetujui`; kombinasi di luar aturan 3-8 signer ditolak agar dokumen tidak rusak.
- Saat dokumen dibuat, sistem membuka merge hanya di area tanda tangan, lalu membangun kotak 2-8 signer secara otomatis tanpa mengubah matrix tanda tangan lama.
- Baris pertama area tanda tangan dipakai untuk `Tempat, Tanggal`, misalnya `Magelang, 20 Juli 2026`; nilainya di-merge, diberi border, rata tengah, dan selebar kotak tanda tangan paling kanan tepat di bawahnya.
- Lebar, border, dan pembagian baris kotak pada preset PGD mengikuti aturan renderer sistem, bukan merge Excel lama.
- Label yang sama dan berdampingan dalam satu baris tanda tangan digabung pada area label, sedangkan area tanda tangan, nama, dan jabatan tetap per signer.
- Baris jabatan pada template/PDF memakai label tahap dari konfigurasi Kegunaan Form, sehingga posisi seperti `Mgr. Marketing` tetap terbaca walaupun signer aktual berganti.
- Email menampilkan jabatan aktual signer dari `profiles.job_title` atau alias aktif Configuration `Label Jabatan`; label tahap tetap disimpan sebagai konteks alur dan fallback data historis.
- Posisi tanda tangan, identitas signer, kebijakan lampiran, dan konfigurasi kegunaan disimpan sebagai snapshot transaksi.
- Approval normal menggunakan snapshot posisi sehingga perubahan konfigurasi setelah surat dibuat tidak menggeser tanda tangan surat lama secara otomatis.
- Tombol admin `Buat Ulang PDF` mengantrekan renderer yang sama dengan surat baru dan Uji PDF. Untuk PGD, renderer membaca snapshot database dan membubuhkan kembali status tanda tangan, nama, jabatan, serta waktu aslinya tanpa membangun workbook. Status dan histori approval tidak diubah.
- Membuka PDF biasa hanya memakai hasil yang tersedia atau mengantrekan konversi; tindakan tersebut tidak membangun ulang workbook sumber.
- Matrix lama tetap tersedia sebagai dokumentasi read-only dan dapat diduplikasi menjadi draft Kegunaan Form.
- Registrasi memakai fallback matrix lama selama belum ada Kegunaan Form aktif, sehingga konfigurasi dapat disiapkan tanpa menghentikan production.

### Non-Fungsional

- Registrasi baru divalidasi server-side terhadap kegunaan aktif dan departemen aktor.
- Admin yang mewakili departemen lain direkam melalui `represented_department_id` dan `represented_by_admin`.
- Database menolak signer yang tidak termasuk kandidat pada tahap kegunaan atau tidak sesuai scope kantor tahap tersebut.
- Draft konfigurasi tidak dapat dibaca user biasa; user hanya membaca kegunaan aktif untuk departemen profilnya.
- Data transaksi lama belum dihapus sampai konfigurasi baru aktif dan cutover produksi dikonfirmasi.
- RLS diaktifkan untuk tabel konfigurasi baru serta master inti yang sebelumnya belum dilindungi.

## 32. Efisiensi PostgREST dan Skalabilitas

### Fungsional

- Status Pengajuan dan Monitoring Admin memakai pagination server-side dengan maksimal 24 dokumen per halaman.
- Daftar monitoring hanya memuat identitas surat dan progres approval. Data form, snapshot, lampiran, serta snapshot signer dimuat ketika detail dibuka.
- Pencarian nomor/judul, status, dan periode monitoring diproses di database agar browser tidak perlu menerima seluruh histori.
- Statistik pengajuan dihitung oleh RPC agregasi dan hanya mengembalikan total, selesai, proses, serta ditolak.
- Kalender hanya mengambil agenda untuk bulan yang sedang ditampilkan dengan buffer tujuh hari untuk grid kalender.

### Non-Fungsional

- Attention badge memakai satu RPC agregasi, menggantikan enam query PostgREST terpisah pada setiap sinkronisasi.
- Subscription realtime global menjadi sumber invalidasi agenda dan riwayat; subscription halaman yang menduplikasi query yang sama dihapus.
- Worker PDF memakai backoff dari 2 detik sampai 30 detik saat antrean kosong dan kembali responsif setelah menemukan pekerjaan.
- Index parsial disediakan untuk signature pending, notifikasi belum dibaca, revision aktif, status surat, dan urutan histori.
- Dependency transitif `brace-expansion` dikunci ke patch aman `1.1.16` dan `2.1.2` tanpa mengubah major version yang dipakai tooling maupun ExcelJS; `js-yaml` milik tooling juga diperbarui ke patch aman `4.3.0`.
