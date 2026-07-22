# Workflow Permohonan Aset dan Unit

Dokumen ini menjelaskan alur bisnis yang aktif berdasarkan konfigurasi production
per 22 Juli 2026. Penjelasan ditujukan untuk pemohon, tim pemeriksa,
penandatangan, admin, dan pihak yang melakukan audit.

Kategori Non Aset dan Non Unit tidak dibahas karena masih dalam pengembangan.

## Diagram PNG Transparan

Diagram berikut disediakan dalam format PNG transparan untuk presentasi,
dokumentasi, dan komunikasi lintas departemen. File sumber Mermaid berada pada
folder yang sama agar diagram dapat diperbarui bersama perubahan workflow.

| Workflow | PNG transparan | Sumber |
| --- | --- | --- |
| Permohonan Aset | [Buka PNG](./diagrams/workflow-permohonan-aset.png) | [Mermaid](./diagrams/workflow-permohonan-aset.mmd) |
| Permohonan Unit | [Buka PNG](./diagrams/workflow-permohonan-unit.png) | [Mermaid](./diagrams/workflow-permohonan-unit.mmd) |

## 1. Istilah yang Digunakan

| Istilah | Arti |
| --- | --- |
| Pemohon | User yang mengisi dan mendaftarkan pengajuan. |
| Penandatangan | Pejabat yang membuat, memeriksa, atau menyetujui dokumen pada tahap tertentu. |
| Tim pemeriksa | User yang menyiapkan atau memverifikasi data sebelum penandatangan pada tahap terkait dapat mengambil keputusan. |
| Rekomendasi Aset | Dokumen pendamping dari PBO yang memiliki nomor dan tanda tangan sendiri. |
| Tindak Lanjut | Halaman pemohon untuk menerima perubahan dan melanjutkan proses, atau membatalkan pengajuan. |
| Menunggu Perbaikan | Status ketika pengajuan dikembalikan kepada pemohon, tim pemeriksa, signer sebelumnya, atau tim rekomendasi. |
| Selesai | Seluruh persetujuan selesai dan dokumen final sudah dapat diproses ke sistem tujuan. |

## 2. Alur Umum Sebelum Pengajuan

```mermaid
flowchart TD
    A["Pemohon membuka Registrasi Surat"] --> B["Sistem mengisi kantor dan departemen dari profil"]
    B --> C{"Pilih kategori"}
    C -->|Aset| D["Pilih kegunaan Aset sesuai kantor dan departemen"]
    C -->|Unit| E["Pilih kegunaan Permohonan Order Bangun"]
    D --> F["Isi barang, jumlah, status, keterangan, dan catatan"]
    E --> G["Pilih proyek dan isi jumlah unit yang diminta"]
    F --> H["Sistem menentukan kandidat penandatangan"]
    G --> H
    H --> I["Pesan nomor dan simpan sebagai draft"]
    I --> J["Periksa summary pengajuan"]
    J --> K{"Data sudah benar?"}
    K -->|Belum| L["Kembali memperbaiki draft"]
    L --> J
    K -->|Ya| M["Daftarkan pengajuan"]
    M --> N["Tahap pertama menerima tugas"]
```

Nomor yang sudah dipesan tetap terhubung dengan draft. Pengajuan baru aktif
setelah pemohon menekan **Data Sudah Benar, Daftarkan** pada summary.

## 3. Permohonan Aset

### 3.1 Data yang Diisi Pemohon

| Data | Keterangan |
| --- | --- |
| Kantor dan departemen | Mengikuti profil user dan tidak dapat diganti oleh user biasa. |
| Kegunaan | Sistem menampilkan Aset Pusat atau Aset Cabang sesuai kantor pemohon. |
| Daftar barang | Nama barang, satuan, jumlah, status, dan keterangan. |
| Catatan | Opsional, digunakan jika ada konteks tambahan. |
| Lampiran awal | Mengikuti konfigurasi kegunaan; dapat wajib atau opsional. |
| Rekomendasi | Hanya tersedia pada konteks PBO yang memang dikonfigurasi untuk rekomendasi. |

### 3.2 Aset Kantor Pusat

```mermaid
flowchart TD
    A["Pemohon mendaftarkan Permohonan Aset Pusat"] --> B["Tahap 1: Staff Departemen membuat"]
    B --> C["Tahap 2: Pimpinan Departemen memeriksa"]
    C --> D["Tahap 3: Manager HRD dan GA memeriksa"]
    D --> E["Tahap 4: Direktur I menyetujui"]
    E --> F["Tahap 5: Direktur Utama menyetujui"]
    F --> G["Status Selesai"]
    G --> H["PDF final, histori, dan audit tersedia"]
    H --> I["Data Aset dikirim ke sistem Marison sesuai konfigurasi environment"]
```

Pemimpin departemen pada tahap 2 ditentukan dari departemen pemohon. Contohnya,
pengajuan dari Perencanaan diarahkan ke Manager Perencanaan, sedangkan pengajuan
dari Marketing diarahkan ke Manager Marketing.

### 3.3 Aset Kantor Cabang atau KCP

```mermaid
flowchart TD
    A["Staff Admin cabang mendaftarkan Permohonan Aset"] --> B["Tahap 1: Staff Admin membuat"]
    B --> C["Tahap 2: Branch Manager pada kantor yang sama memeriksa"]
    C --> D["Tahap 3: Manager HRD dan GA pusat memeriksa"]
    D --> E["Tahap 4: Direktur I menyetujui"]
    E --> F["Tahap 5: Direktur Utama menyetujui"]
    F --> G["Status Selesai"]
    G --> H["PDF final, histori, dan audit tersedia"]
    H --> I["Data Aset dikirim ke sistem Marison sesuai konfigurasi environment"]
```

Staff Admin dan Branch Manager dipilih dari kantor pemohon. Kandidat dari kantor
lain tidak boleh digunakan untuk pengajuan tersebut.

### 3.4 Aset yang Membutuhkan Rekomendasi PBO

Rekomendasi adalah dokumen anak dari permohonan Aset. Dokumen ini tidak dibuat
sebagai pengajuan bebas dan tidak menggantikan surat induk.

```mermaid
flowchart TD
    A["Pemohon memilih membutuhkan rekomendasi"] --> B["Pemohon mengonfirmasi surat induk Aset"]
    B --> C["Sistem membuat nomor dan tugas rekomendasi PBO"]
    C --> D["Dua Staff IT dapat melihat tugas"]
    D --> E{"Siapa yang mengambil lebih dulu?"}
    E --> F["Tugas dikunci untuk Staff IT tersebut"]
    F --> G["Staff IT mengisi rekomendasi per item"]
    G --> H{"Keputusan item"}
    H -->|Service| I["Isi uraian dan unggah gambar"]
    H -->|Ganti Komponen| I
    H -->|Beli Baru| I
    H -->|Tidak Direkomendasikan| J["Isi alasan; gambar opsional"]
    I --> K["Staff IT mengonfirmasi dokumen rekomendasi"]
    J --> K
    K --> L["Tanda tangan Staff IT tercatat"]
    L --> M["Manager PO memeriksa dan menandatangani"]
    M --> N["Rekomendasi selesai dan tertaut ke surat induk"]
    N --> O["Approval surat induk dapat dilanjutkan"]
```

Satu dokumen rekomendasi dapat memuat banyak item. Pengisian UI tetap fokus satu
item pada satu waktu agar petugas tidak tertukar.

| Keputusan rekomendasi | Data wajib |
| --- | --- |
| Service | Nama/spesifikasi barang, uraian, dan gambar. |
| Ganti Komponen | Nama/spesifikasi barang, uraian, dan gambar. |
| Beli Baru | Nama/spesifikasi barang, uraian, dan gambar. |
| Tidak Direkomendasikan | Alasan; gambar tidak wajib. |

Item yang tidak direkomendasikan tetap tampil pada surat induk dengan garis
coret dan alasan. Riwayatnya tetap disimpan untuk audit.

## 4. Permohonan Unit

### 4.1 Data yang Diisi Pemohon

| Data | Keterangan |
| --- | --- |
| Departemen pengaju | Marketing. |
| Proyek | Wajib dipilih dan tidak dapat diganti oleh tim pemeriksa atau penandatangan. |
| Kapasitas tersedia | Ditampilkan setelah proyek dipilih agar pemohon mengetahui jumlah unit yang tersedia. |
| Jumlah unit diminta | Jumlah kebutuhan pemohon; belum menentukan kavling tertentu. |
| Lampiran awal | Opsional sesuai konfigurasi aktif. |
| Catatan | Opsional. |

Jika proyek yang dipilih salah, pengajuan harus dibatalkan dan dibuat ulang.
Proyek tidak dapat diganti di tengah proses karena menjadi identitas utama
alokasi unit.

### 4.2 Alur Utama Unit

```mermaid
flowchart TD
    A["Pemohon Marketing memilih proyek dan jumlah unit"] --> B["Konfirmasi summary dan daftarkan"]
    B --> C["Tahap 1: Assistant Manager Marketing membuat"]
    C --> D["Tahap 2: Manager Marketing memeriksa"]
    D --> E["Tim pemeriksa Perencanaan menerima tugas"]
    E --> F["Pilih kavling atau unit pada proyek yang dikunci"]
    F --> G["Isi Struktur Atas, Struktur Bawah, nomor, blok, dan tanggal kode produksi"]
    G --> H["Unggah Siteplan, Volume Adendum, dan Nilai Adendum"]
    H --> I{"Jumlah yang dipilih sesuai permintaan?"}
    I -->|Ya| J["Simpan dan lanjutkan"]
    I -->|Lebih sedikit| K["Konfirmasi pengurangan dan simpan alasan"]
    K --> J
    J --> L["Sistem membuat Rekap Adendum dan Kode Produksi"]
    L --> M["Tahap 3: Manager Perencanaan memeriksa hasil alokasi"]
    M --> N["Tim pemeriksa sebelum Direksi memeriksa kelengkapan dan summary"]
    N --> O["Tahap 4: Direktur I menyetujui"]
    O --> P["Tahap 5: Direktur Utama menyetujui"]
    P --> Q["Status Selesai"]
    Q --> R["PDF final, histori, dan audit tersedia"]
    R --> S["Data Unit dikirim ke sistem Marison sesuai konfigurasi environment"]
```

### 4.3 Tugas Tim Pemeriksa Unit

| Posisi | Petugas aktif | Tugas |
| --- | --- | --- |
| Sebelum Manager Perencanaan | Lili Pratiwi | Memilih kavling, mengisi struktur atas/bawah, membuat data kode produksi, dan melengkapi tiga lampiran wajib. |
| Sebelum Direktur I | Tri Widyawati | Memeriksa kelengkapan hasil alokasi dan summary sebelum pengajuan masuk ke Direksi. |

Tim pemeriksa menekan **Simpan & lanjutkan** setelah pekerjaannya lengkap.
Penandatangan pada tahap terkait dapat melihat surat lebih awal, tetapi tombol
Setujui dan Tolak terkunci sampai pemeriksaan selesai.

### 4.4 Hasil Pemeriksaan Unit

Setelah pemeriksaan pertama selesai, penandatangan dapat membaca data berikut
langsung dari detail pengajuan tanpa membuka PDF:

- daftar kavling yang dipilih;
- proyek setiap kavling;
- Struktur Atas dan Struktur Bawah;
- total Struktur Atas, total Struktur Bawah, dan total nominal;
- kode produksi setiap kavling;
- Rekap Adendum Unit;
- Kode Produksi Unit;
- catatan tim pemeriksa.

Jumlah kavling boleh lebih sedikit dari jumlah yang diminta. Pengurangan harus
dikonfirmasi dan disertai alasan agar pemohon serta penandatangan memahami
perbedaannya.

## 5. Keputusan pada Setiap Tahap

```mermaid
flowchart TD
    A["Tugas aktif dibuka"] --> B{"Ada tim pemeriksa?"}
    B -->|Ya| C{"Pemeriksaan selesai?"}
    C -->|Belum| D["Setujui dan Tolak dikunci"]
    D --> E["Tunggu tim pemeriksa atau kembalikan dengan instruksi"]
    C -->|Sudah| F["Penandatangan membaca summary, dokumen, dan histori"]
    B -->|Tidak| F
    F --> G{"Keputusan"}
    G -->|Setujui| H["Proses masuk ke tahap berikutnya"]
    G -->|Tolak| I["Isi alasan penolakan"]
    I --> J["Proses berhenti dengan status Ditolak"]
    G -->|Perlu perbaikan| K["Pilih pihak tujuan dan isi instruksi"]
    K --> L["Status menjadi Menunggu Perbaikan"]
```

## 6. Alur Perbaikan dan Tanda Tangan Ulang

Pihak tujuan perbaikan dipilih sesuai masalahnya:

| Masalah | Tujuan yang tepat |
| --- | --- |
| Data awal pemohon salah | Pemohon. |
| Kavling, struktur, kode produksi, atau lampiran Unit salah | Tim pemeriksa. |
| Keputusan atau pemeriksaan tahap sebelumnya perlu ditinjau | Penandatangan sebelumnya. |
| Spesifikasi atau rekomendasi Aset salah | Tim IT/PBO. |

```mermaid
flowchart TD
    A["Penandatangan mengembalikan pengajuan"] --> B["Sistem mencatat pihak, waktu, instruksi, dan data yang berubah"]
    B --> C{"Tujuan perbaikan"}
    C -->|Pemohon| D["Pemohon menerima tugas di menu Tindak Lanjut"]
    C -->|Tim pemeriksa| E["Data pemeriksaan terakhir dibuka kembali"]
    C -->|Signer sebelumnya| F["Signer sebelumnya meninjau ulang"]
    C -->|Tim IT atau PBO| G["Rekomendasi terakhir dibuka sebagai draft revisi"]
    E --> H{"Ada perubahan item atau nilai?"}
    H -->|Tidak| I["Kembali langsung ke signer aktif"]
    H -->|Ya| D
    F --> D
    G --> J["Staff IT memperbaiki dan Manager PO menandatangani ulang"]
    J --> D
    D --> K{"Keputusan pemohon"}
    K -->|Batalkan| L["Pengajuan dihentikan dan nomor menjadi hangus"]
    K -->|Lanjutkan| M["Perubahan diterapkan ke data surat"]
    M --> N["PDF lama dibersihkan"]
    N --> O["Seluruh tanda tangan dimulai ulang dari tahap 1"]
```

Jika tim pemeriksa hanya memperbaiki data teknis tanpa mengubah item atau nilai,
proses dapat kembali langsung ke signer aktif. Jika item, jumlah, atau nilai
berubah, pemohon wajib menerima perubahan terlebih dahulu.

## 7. Status dan Notifikasi

| Kondisi | Status/badge | Penerima perhatian |
| --- | --- | --- |
| Menunggu signer | Menunggu | Signer tahap aktif. |
| Menunggu tim pemeriksa | Menunggu Pemeriksaan | Tim pemeriksa tahap aktif. |
| Pemeriksaan selesai | Terverifikasi | Signer tahap aktif. |
| Dikembalikan untuk revisi | Menunggu Perbaikan | Pihak tujuan revisi. |
| Menunggu keputusan pemohon | Tindak Lanjut | Pemohon. |
| Ditolak | Ditolak | Pemohon dan pihak yang terlibat. |
| Semua tahap selesai | Selesai | Pemohon, pihak terkait, dan proses integrasi. |

Badge sidebar dan notifikasi membantu user menemukan tugas. Detail surat tetap
menjadi sumber informasi utama untuk membaca data, alasan, dan riwayat tindakan.

## 8. Data Akhir yang Dipertahankan

Setelah proses selesai, SIGAP mempertahankan:

- nomor dan identitas surat;
- data awal pemohon;
- data hasil revisi yang disetujui;
- dokumen utama dan lampiran;
- dokumen rekomendasi aktif jika ada;
- hasil alokasi Unit dan kode produksi jika ada;
- urutan tanda tangan, waktu, keputusan, dan catatan;
- riwayat pemeriksaan dan revisi;
- PDF final;
- status pengiriman ke sistem Marison.

Data historis tidak dihapus ketika workflow atau konfigurasi berubah. Surat lama
tetap dibaca menggunakan snapshot konfigurasi pada saat surat didaftarkan.

## 9. Batasan Saat Ini

- Workflow Non Aset masih dalam pengembangan.
- Workflow Non Unit masih dalam pengembangan.
- Dokumen ini tidak menetapkan matrix baru untuk kedua kategori tersebut.
- Perubahan kandidat signer atau tim pemeriksa dilakukan melalui Kegunaan Form
  dan hanya berlaku untuk pengajuan baru; surat berjalan memakai snapshot lama.
