import { FileSignature } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const suratRegistrationDocs: DocsEntry = {
    id: "surat-registration",
    title: "Registrasi Surat",
    menu: "Layanan Surat > Buat Baru",
    audience: "user",
    icon: FileSignature,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Membuat pengajuan dokumen dengan nomor surat, template, lampiran, dan alur persetujuan.",
    whenToUse: [
      "Membuat permohonan barang, jasa, aset, non aset, unit, atau non unit.",
      "Mengajukan dokumen yang membutuhkan tanda tangan berjenjang.",
      "Melanjutkan draft pengajuan yang nomornya sudah dipesan.",
    ],
    steps: [
      "Buka Buat Baru.",
      "Pilih kategori pengajuan yang sesuai.",
      "Pilih form atau kegunaan dokumen.",
      "Isi tempat, tanggal, detail permohonan, catatan, dan lampiran jika diminta.",
      "Pilih penandatangan sesuai kandidat yang tersedia.",
      "Kirim pengajuan setelah semua validasi lengkap.",
    ],
    examples: [
      "Untuk pengajuan aset kantor, pilih kategori Aset lalu isi daftar barang dan jumlah.",
      "Untuk order bangun unit, pilih kategori Unit, proyek, jumlah unit, dan catatan jika ada.",
      "Jika nomor sudah dipesan lalu halaman tertutup, buka kembali registrasi untuk melanjutkan draft.",
    ],
    troubleshooting: [
      "Jika pilihan Unit tidak muncul, akun atau departemen Anda mungkin belum diizinkan membuat pengajuan Unit.",
      "Jika penandatangan kosong, cek pilihan kantor, departemen, dan kegunaan form.",
      "Jika lampiran wajib belum lengkap, tombol kirim akan terkunci sampai file diunggah.",
    ],
    related: ["Status Pengajuan", "Persetujuan", "Dokumen dan Lampiran"],
    sections: [
      {
        type: "table",
        title: "Dana Perencanaan dan HRD",
        columns: ["Pengajuan", "Lampiran dan proses"],
        rows: [
          ["Dana Perencanaan", "Lampiran RAB opsional. Pemohon boleh melampirkan; tim Perencanaan boleh menambahkan RAB jika pemohon belum melampirkannya."],
          ["Dana HRD", "Lampiran RAB opsional. HRD dapat meminta RAB/perbaikan redaksi melalui Minta Perbaikan Pemohon; RAB kosong tidak otomatis memblokir atau menolak pengajuan."],
          ["Tidak memerlukan RAB", "Checkbox menyatakan maksud pengecualian, misalnya servis AC/kendaraan. Tidak menghapus file yang sudah ada; dicentang atau tidak, upload RAB tetap tidak wajib."],
          ["Jenis biaya PGD Dana", "Operasional, produksi, atau pemasaran tetap dipilih sesuai kebutuhan; checkbox Tidak memerlukan RAB tidak mengubah jenis biaya."],
          ["KEU 1 / KEU 10", "Tidak menampilkan/mewajibkan pilihan jenis biaya PGD Dana; tipe teknis tetap operasional otomatis."],
        ],
      },
      {
        type: "group",
        title: "Nomor surat, counter, dan draft",
        description:
          "Baca bagian ini untuk memahami arti nomor surat, perbedaan format pusat/cabang, kapan counter reset, dan kenapa draft tetap menyimpan nomor.",
        sections: [
          {
            type: "callout",
            title: "Nomor tidak dilepas begitu saja",
            description:
              "Saat nomor sudah dipesan, sistem menyimpan draft agar pengajuan bisa dilanjutkan jika halaman tertutup. Nomor draft yang dibatalkan hanya dapat dipakai ulang dalam jendela kebijakan admin; setelah batas waktu menjadi VOID permanen. Nomor surat terdaftar tidak dipakai ulang.",
            tone: "info",
          },
          {
            type: "table",
            title: "Membaca nomor surat",
            description: "Contoh: 005/UAI/PBO.1.TRA/VI/2026.",
            columns: ["Segmen", "Contoh", "Arti", "Sumber data"],
            rows: [
              ["Nomor urut", "005", "Urutan surat pada scope penomoran aktif.", "Dari reservation/counter tahun berjalan."],
              ["Entitas", "UAI", "Kode perusahaan atau badan hukum penerbit surat.", "Master Entitas yang dipilih saat registrasi."],
              ["Kode departemen", "PBO", "Kode departemen pengaju atau departemen pembuat dokumen.", "Master Departemen pada profil/pilihan registrasi."],
              ["Index jenis surat", "1", "Urutan jenis surat untuk departemen tersebut.", "Mapping Master Jenis Surat per departemen."],
              ["Kode proyek", "TRA", "Kode proyek yang terkait dengan surat.", "Proyek dari API external Marison yang dipilih."],
              ["Kode proyek virtual", "000", "Dipakai pada nomor baru KC/KCP yang memilih Tanpa Proyek: Aset yang memenuhi fallback, Dana Umum, dan Kas Kecil. Unit dan Non Unit tetap wajib proyek external.", "Penanda penomoran sistem; bukan master proyek baru dan tidak dikirim sebagai ID proyek ke Marison."],
              ["Bulan", "VI", "Bulan penerbitan dalam angka Romawi.", "Bulan saat nomor diterbitkan; VI berarti Juni."],
              ["Tahun", "2026", "Tahun penerbitan sekaligus tahun counter.", "Tahun saat nomor diterbitkan."],
            ],
          },
          {
            type: "table",
            title: "Variasi format nomor",
            description:
              "Format nomor mengikuti scope surat. Contoh di bawah menjelaskan pola yang paling sering ditemui user.",
            columns: ["Konteks", "Pola", "Contoh", "Catatan"],
            rows: [
              [
                "Pusat tanpa proyek",
                "Nomor/Entitas/Departemen.IndexJenis/Bulan/Tahun",
                "001/UAI/PGD.1/VI/2026",
                "Dipakai untuk pengajuan pusat yang tidak membawa kode proyek.",
              ],
              [
                "Pusat dengan proyek atau Unit",
                "Nomor/Entitas/Departemen.IndexJenis.KodeProyek/Bulan/Tahun",
                "005/UAI/PBO.1.TRA/VI/2026",
                "Kode proyek muncul setelah index jenis surat.",
              ],
              [
                "KC",
                "Nomor/Entitas/KodeKantor-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCMLG-MLO.1.1/VI/2026",
                "Counter dipisah berdasarkan proyek.",
              ],
              [
                "KC tanpa proyek",
                "Nomor/Entitas/KodeKantor-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCMLG-000.1.1/VII/2026",
                "Untuk Aset yang memenuhi fallback, Dana Umum, atau Kas Kecil yang memilih Tanpa Proyek. Unit dan Non Unit tidak boleh memakai 000.",
              ],
              [
                "KCP",
                "Nomor/Entitas/KodeKCInduk.KodeKCP-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCSLO.KCPWNG-WNG.1.1/VI/2026",
                "Kode KC induk menjaga relasi KCP tetap terbaca.",
              ],
              [
                "KCP tanpa proyek",
                "Nomor/Entitas/KodeKCInduk.KodeKCP-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
                "001/UAI/KCSLO.KCPWNG-000.1.1/VII/2026",
                "Untuk Aset yang memenuhi fallback, Dana Umum, atau Kas Kecil yang memilih Tanpa Proyek. Unit dan Non Unit tetap wajib proyek external.",
              ],
            ],
          },
          {
            type: "table",
            title: "Scope dan reset nomor",
            columns: ["Kondisi", "Counter dipisah berdasarkan", "Reset"],
            rows: [
              ["Kantor Pusat", "Entitas + Departemen + Tahun.", "Reset ketika tahun berubah, kecuali counter awal tahun itu dikonfigurasi admin."],
              ["Cabang/KC/KCP dengan proyek", "Entitas + Proyek + Tahun.", "Reset ketika tahun berubah untuk proyek tersebut."],
              ["Cabang/KC/KCP tanpa proyek", "Entitas + Kantor + Departemen + Jenis + Tahun dengan kode virtual 000.", "Reset tahunan tanpa membuat master proyek 000."],
              ["Nomor lama", "Nomor yang sudah dipesan atau terdaftar tetap memakai format semula.", "Penyamaan -000 hanya berlaku saat mengambil nomor baru; tidak menomori ulang surat atau draft lama."],
              ["Nomor awal produksi", "Nilai start_from pada Konfigurasi Penomoran.", "Dipakai saat sistem mulai dari nomor lanjutan agar tidak bentrok dengan nomor manual lama."],
              ["Nomor VOID", "Hanya dapat dipakai ulang dalam jendela kebijakan admin.", "Lewat batas waktu menjadi VOID permanen; setiap siklus pembatalan/pemakaian ulang diaudit."],
              ["Nomor CANCELLED legacy", "Dapat dipakai ulang oleh generator jika status masih CANCELLED dan >= start_from.", "Status baru memakai VOID agar tidak membingungkan produksi."],
            ],
          },
          {
            type: "table",
            title: "Siklus draft dan nomor",
            columns: ["Status", "Arti", "Dampak ke nomor"],
            rows: [
              ["DRAFT", "Nomor sudah dipesan dan form disimpan otomatis.", "Nomor tetap menempel ke draft dan tidak diberikan ke user lain."],
              ["SUBMITTED", "Draft sudah dikirim menjadi surat berjalan.", "Nomor dipakai sebagai nomor resmi dokumen setelah reservasi draft divalidasi terhadap sesi login."],
              ["VOID", "Draft dibatalkan.", "Pemakaian ulang dibatasi kebijakan admin; draft pemakai baru terpisah dari draft batal lama."],
              ["EXPIRED", "Draft melewati masa aktif.", "Perlu dibuat ulang sesuai aturan yang aktif."],
              ["Masa aktif", "Draft aktif selama 7 hari dari penyimpanan terakhir.", "User diarahkan melanjutkan draft jika kembali ke registrasi."],
            ],
          },
        ],
      },
      {
        type: "steps",
        title: "Alur registrasi dokumen",
        items: [
          "Pilih kategori pengajuan: Aset, Non Aset, Unit, atau Non Unit sesuai izin departemen.",
          "Untuk kategori Aset, tentukan apakah permohonan membutuhkan dokumen rekomendasi tertaut. Jika memilih butuh rekomendasi, rekomendasi dibuat sebagai surat terpisah dengan nomor dan approval sendiri.",
          "Pilih kegunaan form. Pilihan ini menentukan template, nomor surat, kandidat penandatangan, dan lampiran wajib.",
          "Isi tempat, tanggal, detail permohonan, catatan, dan lampiran yang diminta. Tunggu progres lampiran mencapai 100% dan berstatus tersimpan sebelum membuka ringkasan.",
          "Pilih kandidat penandatangan dari daftar yang tersedia. Untuk cabang, kandidat dapat mengikuti kantor pemohon.",
          "Kirim pengajuan. Setelah terkirim, dokumen masuk ke tahap persetujuan pertama.",
        ],
      },
      {
        type: "group",
        title: "Rekomendasi aset pada registrasi",
        description:
          "Rekomendasi aset dipakai ketika permohonan aset perlu dokumen pendukung resmi dari PBO sebelum surat induk dapat lanjut.",
        sections: [
          {
            type: "table",
            title: "Kapan memilih rekomendasi",
            columns: ["Pilihan", "Dampak ke proses", "Catatan"],
            rows: [
              ["Tidak membutuhkan rekomendasi", "Surat induk berjalan seperti pengajuan biasa.", "Tetap wajib melengkapi lampiran pemohon jika dikonfigurasi."],
              ["Membutuhkan rekomendasi", "Sistem membuat tugas rekomendasi setelah surat induk dikonfirmasi.", "Nomor rekomendasi dibuat otomatis memakai counter PBO."],
              ["Surat induk menunggu rekomendasi", "Approval dapat terkunci pada tahap yang dikonfigurasi sampai dokumen rekomendasi selesai.", "Panel rekomendasi tampil di detail persetujuan/monitoring."],
            ],
          },
          {
            type: "table",
            title: "Data rekomendasi yang disiapkan",
            columns: ["Data", "Aturan"],
            rows: [
              ["Item rekomendasi", "Berisi nama barang/alat kerja, lokasi/PIC, kerusakan, hasil rekomendasi, uraian, dan keterangan."],
              ["Hasil rekomendasi", "Service, Ganti Komponen, Beli Baru, atau Tidak Direkomendasikan. Tidak Direkomendasikan wajib alasan dan membuat item induk ditampilkan tercoret."],
              ["Lampiran gambar", "Setiap item wajib memiliki gambar; petugas bisa unggah, drag-drop, atau paste screenshot dengan Ctrl+V."],
              ["Link referensi", "Opsional sebagai data pendukung dan tampil di UI/email, tetapi tidak masuk Excel sampai area template khusus tersedia."],
            ],
          },
        ],
      },
      {
        type: "table",
        title: "Pilihan kategori",
        columns: ["Kategori", "Dipakai untuk", "Data utama"],
        rows: [
          ["Aset", "Permohonan barang/aset yang dicatat sebagai aset.", "Daftar barang, satuan, jumlah, status, keterangan, dan pilihan dokumen rekomendasi."],
          ["Non Aset", "Permohonan operasional yang tidak menjadi aset.", "Daftar kebutuhan, jumlah, catatan, dan lampiran pendukung."],
          ["Unit", "Permohonan yang berhubungan dengan unit atau kavling.", "Proyek, jumlah unit, catatan, dan alokasi unit pada tahap perencanaan."],
          ["Non Unit", "Permohonan yang memakai form yang sama tetapi tidak memerlukan pemilihan unit.", "Detail permohonan biasa tanpa alokasi kavling."],
        ],
      },
      {
        type: "table",
        title: "Yang otomatis diisi sistem",
        description:
          "User tidak mengisi file Excel utama. Sistem memasukkan data ke template dan menyiapkan PDF saat dokumen dibuka.",
        columns: ["Data", "Sumber"],
        rows: [
          ["Nama, jabatan, departemen, kantor", "Profil akun pemohon."],
          ["Nomor surat", "Konfigurasi penomoran dan counter yang aktif."],
          ["Tempat, tanggal", "Input user pada registrasi."],
          ["Detail barang atau unit", "Input user dan/atau input tim pemeriksa pada tahap yang dikonfigurasi."],
          ["Tanda tangan", "Aksi penandatangan sesuai step approval."],
          ["Rekomendasi aset", "Dokumen surat tertaut yang dibuat dari panel rekomendasi pada approval bila permohonan aset membutuhkannya."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum saat registrasi",
        items: [
          {
            problem: "Kantor atau departemen tidak bisa diganti",
            solution:
              "Untuk user biasa, kantor dan departemen mengikuti profil akun. Admin dapat memperbaiki data dari User Organization.",
          },
          {
            problem: "Kegunaan form yang dicari tidak muncul",
            solution:
              "Kegunaan form dibatasi oleh departemen, kategori, dan konfigurasi aktif. Pilih kategori yang benar atau minta admin mengecek konfigurasi.",
          },
          {
            problem: "Draft lama muncul saat kembali ke registrasi",
            solution:
              "Itu berarti ada nomor yang sudah dipesan dan belum dikirim. Lanjutkan draft atau batalkan sesuai prosedur yang tersedia.",
          },
          {
            problem: "Admin menambah tahap penandatangan setelah draft dibuat",
            solution:
              "Buka ulang draft. Sistem memakai alur Kegunaan Form terbaru, mempertahankan signer pada tahap yang sama, lalu meminta Anda memilih signer untuk tahap baru sebelum mendaftarkan surat.",
          },
        ],
      },
    ],
  };

export const suratRegistrationDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Membaca nomor surat",
      description: "Contoh: 005/UAI/PBO.1.TRA/VI/2026.",
      columns: ["Segmen", "Contoh", "Arti", "Sumber data"],
      rows: [
        ["Nomor urut", "005", "Urutan surat pada scope penomoran aktif.", "Dari reservation/counter tahun berjalan."],
        ["Entitas", "UAI", "Kode perusahaan atau badan hukum penerbit surat.", "Master Entitas yang dipilih saat registrasi."],
        ["Kode departemen", "PBO", "Kode departemen pengaju atau departemen pembuat dokumen.", "Master Departemen pada profil/pilihan registrasi."],
        ["Index jenis surat", "1", "Urutan jenis surat untuk departemen tersebut.", "Mapping Master Jenis Surat per departemen."],
        ["Kode proyek", "TRA", "Kode proyek yang terkait dengan surat.", "Proyek dari API external Marison yang dipilih."],
        ["Kode proyek virtual", "000", "Dipakai pada nomor baru KC/KCP yang memilih Tanpa Proyek: Aset yang memenuhi fallback, Dana Umum, dan Kas Kecil. Unit dan Non Unit tetap wajib proyek external.", "Penanda penomoran sistem; bukan master proyek baru dan tidak dikirim sebagai ID proyek ke Marison."],
        ["Bulan", "VI", "Bulan penerbitan dalam angka Romawi.", "Bulan saat nomor diterbitkan; VI berarti Juni."],
        ["Tahun", "2026", "Tahun penerbitan sekaligus tahun counter.", "Tahun saat nomor diterbitkan."],
      ],
    },
    {
      type: "table",
      title: "Variasi format nomor",
      description:
        "Format nomor mengikuti scope surat. Contoh di bawah menjelaskan pola yang paling sering ditemui user.",
      columns: ["Konteks", "Pola", "Contoh", "Catatan"],
      rows: [
        [
          "Pusat tanpa proyek",
          "Nomor/Entitas/Departemen.IndexJenis/Bulan/Tahun",
          "001/UAI/PGD.1/VI/2026",
          "Dipakai untuk pengajuan pusat yang tidak membawa kode proyek.",
        ],
        [
          "Pusat dengan proyek atau Unit",
          "Nomor/Entitas/Departemen.IndexJenis.KodeProyek/Bulan/Tahun",
          "005/UAI/PBO.1.TRA/VI/2026",
          "Kode proyek muncul setelah index jenis surat.",
        ],
        [
          "KC",
          "Nomor/Entitas/KodeKantor-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCMLG-MLO.1.1/VI/2026",
          "Counter dipisah berdasarkan proyek.",
        ],
        [
          "KC tanpa proyek",
          "Nomor/Entitas/KodeKantor-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCMLG-000.1.1/VII/2026",
          "Untuk Aset yang memenuhi fallback, Dana Umum, atau Kas Kecil yang memilih Tanpa Proyek. Unit dan Non Unit tidak boleh memakai 000.",
        ],
        [
          "KCP",
          "Nomor/Entitas/KodeKCInduk.KodeKCP-KodeProyek.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCSLO.KCPWNG-WNG.1.1/VI/2026",
          "Kode KC induk menjaga relasi KCP tetap terbaca.",
        ],
        [
          "KCP tanpa proyek",
          "Nomor/Entitas/KodeKCInduk.KodeKCP-000.IndexDepartemen.IndexJenis/Bulan/Tahun",
          "001/UAI/KCSLO.KCPWNG-000.1.1/VII/2026",
          "Untuk Aset yang memenuhi fallback, Dana Umum, atau Kas Kecil yang memilih Tanpa Proyek. Unit dan Non Unit tetap wajib proyek external.",
        ],
      ],
    },
    {
      type: "table",
      title: "Scope dan reset nomor",
      columns: ["Kondisi", "Counter dipisah berdasarkan", "Reset"],
      rows: [
        ["Kantor Pusat", "Entitas + Departemen + Tahun.", "Reset ketika tahun berubah, kecuali counter awal tahun itu dikonfigurasi admin."],
        ["Cabang/KC/KCP dengan proyek", "Entitas + Proyek + Tahun.", "Reset ketika tahun berubah untuk proyek tersebut."],
        ["Cabang/KC/KCP tanpa proyek", "Entitas + Kantor + Departemen + Jenis + Tahun dengan kode virtual 000.", "Reset tahunan tanpa membuat master proyek 000."],
        ["Nomor lama", "Nomor yang sudah dipesan atau terdaftar tetap memakai format semula.", "Penyamaan -000 hanya berlaku saat mengambil nomor baru; tidak menomori ulang surat atau draft lama."],
        ["Nomor awal produksi", "Nilai start_from pada Konfigurasi Penomoran.", "Dipakai saat sistem mulai dari nomor lanjutan agar tidak bentrok dengan nomor manual lama."],
        ["Nomor VOID", "Hanya dapat dipakai ulang dalam jendela kebijakan admin.", "Lewat batas waktu menjadi VOID permanen; setiap siklus pembatalan/pemakaian ulang diaudit."],
        ["Nomor CANCELLED legacy", "Dapat dipakai ulang oleh generator jika status masih CANCELLED dan >= start_from.", "Status baru memakai VOID agar tidak membingungkan produksi."],
      ],
    },
    {
      type: "table",
      title: "Siklus draft dan nomor",
      columns: ["Status", "Arti", "Dampak ke nomor"],
      rows: [
        ["DRAFT", "Nomor sudah dipesan dan form disimpan otomatis.", "Nomor tetap menempel ke draft dan tidak diberikan ke user lain."],
        ["SUBMITTED", "Draft sudah dikirim menjadi surat berjalan.", "Nomor dipakai sebagai nomor resmi dokumen."],
        ["VOID", "Draft dibatalkan.", "Pemakaian ulang dibatasi kebijakan admin; draft pemakai baru terpisah dari draft batal lama."],
        ["EXPIRED", "Draft melewati masa aktif.", "Perlu dibuat ulang sesuai aturan yang aktif."],
        ["Masa aktif", "Draft aktif selama 7 hari dari penyimpanan terakhir.", "User diarahkan melanjutkan draft jika kembali ke registrasi."],
      ],
    },
  ];
