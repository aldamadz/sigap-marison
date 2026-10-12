import { Tag } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const requestCategoriesDocs: DocsEntry = {
    id: "request-categories",
    title: "Kategori Pengajuan",
    menu: "Layanan Surat > Kategori Pengajuan",
    audience: "user",
    icon: Tag,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Panduan memilih Aset, Non Aset, Unit, atau Non Unit sebelum membuat pengajuan.",
    whenToUse: [
      "Menentukan kategori sebelum memilih form dan kegunaan dokumen.",
      "Membedakan pengadaan aset, kebutuhan operasional, order bangun unit, dan dokumen tanpa alokasi kavling.",
      "Memahami data dan proses lanjutan yang akan diminta oleh sistem.",
    ],
    steps: [
      "Tentukan apakah permohonan berkaitan dengan unit/kavling properti.",
      "Jika berkaitan dengan unit/kavling, pilih Unit; jika tidak, lanjutkan menilai jenis barang atau prosesnya.",
      "Pilih Aset untuk barang yang dicatat sebagai aset, Non Aset untuk kebutuhan operasional, atau Non Unit untuk pekerjaan pembangunan/proyek fisik tanpa alokasi kavling.",
      "Periksa form dan kegunaan yang muncul. Sistem hanya menampilkan konfigurasi yang sesuai kategori dan departemen Anda.",
    ],
    examples: [
      "Komputer inventaris kantor menggunakan Aset.",
      "ATK, jasa sewa, biaya promosi, atau bahan habis pakai menggunakan Non Aset.",
      "Order bangun rumah pada kavling proyek menggunakan Unit.",
      "SPK, pembangunan infrastruktur, perbaikan kawasan, material proyek, dan tenaga proyek tanpa pemilihan kavling menggunakan Non Unit.",
    ],
    troubleshooting: [
      "Jika form atau kegunaan tidak muncul, pastikan kategori yang dipilih sesuai dan minta admin memeriksa konfigurasi departemen.",
      "Jika pilihan Unit tidak tersedia, departemen Anda belum diizinkan mengajukan Unit.",
      "Kategori dan identitas surat tetap terkunci. Proyek Unit hanya dapat dikoreksi oleh pemilik revisi eksternal yang masih terbuka melalui Tindak Lanjut; di luar itu ikuti prosedur pembatalan/pengajuan baru.",
    ],
    related: ["Registrasi Surat", "Persetujuan", "Rekomendasi"],
    sections: [
      {
        type: "callout",
        title: "Kategori menentukan alur, bukan sekadar nama dokumen",
        description:
          "Kategori menyaring form, kegunaan, penandatangan, lampiran, dan tugas tim pemeriksa. Satu form dapat dipakai oleh beberapa kategori, tetapi proses yang berjalan mengikuti kategori dan kegunaan yang dipilih.",
        tone: "info",
      },
      {
        type: "table",
        title: "Cara menentukan kategori",
        columns: ["Pertanyaan", "Jika ya", "Jika tidak"],
        rows: [
          ["Apakah permohonan membutuhkan proyek, pemilihan kavling, dan alokasi unit?", "Pilih Unit.", "Lanjutkan ke klasifikasi barang atau proses."],
          ["Apakah barang akan menjadi inventaris/aset perusahaan?", "Pilih Aset.", "Pertimbangkan Non Aset atau Non Unit."],
          ["Apakah kebutuhan berupa biaya operasional, jasa, sewa, promosi, atau barang habis pakai dan bukan pekerjaan pembangunan?", "Pilih Non Aset.", "Periksa apakah kegunaannya merupakan pekerjaan Non Unit."],
          ["Apakah permohonan berupa pekerjaan pembangunan/proyek fisik tanpa alokasi kavling/unit?", "Pilih Non Unit.", "Hubungi admin jika tidak ada kategori yang sesuai."],
        ],
      },
      {
        type: "group",
        title: "Aset",
        description: "Untuk pengadaan barang yang menjadi inventaris atau aset perusahaan.",
        sections: [
          {
            type: "table",
            title: "Kegunaan Aset",
            columns: ["Kegunaan", "Contoh", "Hasil proses"],
            rows: [
              ["Pengadaan inventaris kantor", "Komputer, printer, meja, kursi, alat kerja, atau perangkat operasional berumur panjang.", "Barang diajukan sebagai aset dan mengikuti matrix Aset."],
              ["Penggantian atau peremajaan aset", "Mengganti perangkat lama, rusak, atau tidak lagi memadai.", "Dapat membutuhkan dokumen rekomendasi sesuai konfigurasi."],
              ["Aset kantor pusat atau cabang", "Aset untuk departemen pusat, KC, atau KCP.", "Kantor dan kandidat penandatangan mengikuti profil serta matrix aktif."],
            ],
          },
          {
            type: "table",
            title: "Data dan alur Aset",
            columns: ["Bagian", "Aturan"],
            rows: [
              ["Data utama", "Nama barang, satuan, jumlah, status prioritas, keterangan, catatan, dan lampiran yang dikonfigurasi."],
              ["Rekomendasi", "Opsi rekomendasi hanya tersedia pada departemen yang diizinkan. Dokumen rekomendasi menjadi child dari pengajuan induk dan memiliki nomor serta approval sendiri."],
              ["Proyek cabang", "KC/KCP yang memiliki proyek external wajib memilih proyek. Jika tidak ada proyek external terdaftar, fallback Aset memakai kode virtual 000 tanpa membuat master proyek baru."],
              ["Setelah dikirim", "Barang dapat disetujui seluruhnya, disetujui sebagian, dikembalikan untuk perbaikan, atau ditolak sesuai keputusan signer."],
            ],
          },
          {
            type: "callout",
            title: "Jangan gunakan Aset untuk biaya operasional",
            description: "Jasa, sewa, konsumsi, promosi, bahan habis pakai, dan biaya operasional biasanya masuk Non Aset, kecuali kebijakan internal dan konfigurasi admin menentukan lain.",
            tone: "warning",
          },
        ],
      },
      {
        type: "group",
        title: "Non Aset",
        description: "Untuk kebutuhan barang/jasa dan biaya operasional yang tidak dicatat sebagai aset perusahaan serta bukan pekerjaan pembangunan/proyek fisik.",
        sections: [
          {
            type: "table",
            title: "Kegunaan Non Aset",
            columns: ["Kegunaan", "Contoh"],
            rows: [
              ["Barang habis pakai", "ATK, bahan kebersihan, konsumsi, bahan pendukung, atau kebutuhan rutin."],
              ["Jasa dan sewa operasional", "Sewa peralatan, dokumentasi, layanan operasional, atau jasa pihak ketiga yang tidak menjadi pekerjaan pembangunan."],
              ["Promosi dan kegiatan", "Banner, baliho, brosur, paid promote, sponsorship, pameran, atau customer gathering."],
              ["Biaya operasional", "Perpanjangan iklan, perawatan, biaya pemasangan, dan kebutuhan operasional lain."],
            ],
          },
          {
            type: "table",
            title: "Data dan alur Non Aset",
            columns: ["Bagian", "Aturan"],
            rows: [
              ["Data utama", "Nama kebutuhan, satuan, jumlah, status prioritas, keterangan, catatan, dan lampiran pendukung."],
              ["Alokasi kavling", "Tidak menggunakan pemilihan kavling, kode produksi, atau rekap adendum Unit."],
              ["Proyek Marison", "Pilih proyek yang siap Marison, atau centang 'Tanpa Proyek (Dana Umum)' untuk pengajuan dana tidak terikat proyek; surat tersebut dikirim ke Marison tanpa project_id."],
              ["Nomor Tanpa Proyek", "Dana Umum dan Kas Kecil dari KC/KCP memakai -000 pada nomor baru. Kas Kecil juga boleh memilih proyek external; jika dipilih, nomor memakai kode proyek tersebut. Nomor lama tidak diubah."],
              ["Persetujuan", "Mengikuti kegunaan dan matrix Non Aset yang tersedia untuk departemen/kantor pemohon."],
              ["Pencatatan", "Kategori menunjukkan kebutuhan bukan aset; keputusan akuntansi akhir tetap mengikuti kebijakan perusahaan."],
            ],
          },
        ],
      },
      {
        type: "group",
        title: "Unit",
        description: "Untuk permohonan/order bangun yang membutuhkan proyek, jumlah unit, dan alokasi kavling.",
        sections: [
          {
            type: "table",
            title: "Kegunaan Unit",
            columns: ["Kegunaan", "Contoh", "Kebutuhan khusus"],
            rows: [
              ["Order bangun rumah", "Permohonan pembangunan satu atau beberapa unit pada proyek.", "Proyek dan jumlah unit wajib diisi."],
              ["Alokasi kavling", "Tim pemeriksa menentukan kavling yang memenuhi permintaan.", "Kavling dapat dialokasikan lebih sedikit dengan konfirmasi dan alasan."],
              ["Rekap struktur/adendum", "Pencatatan struktur atas, struktur bawah, dan nominal per kavling.", "Sistem membuat rekap dan total otomatis."],
              ["Kode produksi", "Nomor, blok, dan tanggal produksi setiap unit.", "Sistem membentuk lampiran kode produksi dari data terstruktur."],
            ],
          },
          {
            type: "steps",
            title: "Alur Unit",
            items: [
              "Pemohon memilih proyek dan melihat kapasitas unit yang tersedia.",
              "Pemohon mengisi jumlah unit yang diminta dan mengirim pengajuan.",
              "Pada tahap yang dikonfigurasi, tim pemeriksa memilih kavling, mengisi struktur, kode produksi, dan lampiran.",
              "Signer membaca kavling serta rekap langsung dari detail pengajuan tanpa wajib membuka PDF.",
              "Setelah seluruh approval selesai, PDF final memuat data Unit yang telah disetujui.",
            ],
          },
          {
            type: "callout",
            title: "Batas perubahan proyek Unit",
            description: "Pada approval biasa, proyek dikunci dan tim pemeriksa hanya mengalokasikan kavling di proyek tersebut. Pemilik revisi Unit eksternal yang masih terbuka dapat mengganti proyek; nomor/identitas surat tetap, kapasitas dimuat ulang, dan alokasi lama dikosongkan untuk pemeriksaan ulang.",
            tone: "warning",
          },
        ],
      },
      {
        type: "group",
        title: "Non Unit",
        description: "Untuk seluruh permohonan pekerjaan pembangunan/proyek fisik yang tidak membutuhkan pemilihan kavling atau alokasi unit.",
        sections: [
          {
            type: "table",
            title: "Kegunaan Non Unit",
            columns: ["Kegunaan", "Contoh", "Catatan"],
            rows: [
              ["SPK dan pembangunan", "Pembuatan SPK, pembangunan kawasan, talud, jalan, jembatan, pondasi, saluran, fasos, atau fasum.", "Tidak memilih kavling/unit tertentu."],
              ["Perbaikan dan infrastruktur proyek", "Perbaikan jalan, saluran, jaringan air/listrik, penerangan, perkerasan, atau rehabilitasi kawasan.", "Tidak menghasilkan rekap adendum atau kode produksi Unit."],
              ["Material, alat, dan tenaga proyek", "Sirtu, pasir, urugan, sewa excavator, tenaga harian proyek, pemadatan, atau pembersihan lahan.", "Mengikuti matrix Permohonan Teknik Cabang."],
              ["Proyek wajib", "Non Unit memakai proyek dan jenis pekerjaan dari API external Marison.", "Cabang tanpa proyek external tidak dapat memakai 000; pastikan proyek tersedia di sistem perencanaan."],
            ],
          },
          {
            type: "steps",
            title: "Mengisi pekerjaan Non Unit",
            items: [
              "Pilih Proyek Tujuan yang sesuai. Pemohon Kantor Pusat melihat seluruh proyek siap, sedangkan pemohon cabang hanya melihat proyek siap pada kantornya.",
              "Klik Dapatkan Nomor Surat setelah proyek dipilih; rincian pekerjaan baru diisi setelah nomor diperoleh.",
              "Pada setiap item, pilih jenis pekerjaan proyek dari API external lalu isi nama pekerjaan yang benar-benar diajukan.",
              "Isi nilai pengajuan. Angka dapat diketik atau ditempel dalam format seperti 1000000 atau 1.000.000.",
              "Tambahkan catatan perencanaan jika ada ruang lingkup, lokasi, atau ketentuan teknis yang perlu diketahui penandatangan.",
              "Periksa total dan rincian item pada ringkasan sebelum menekan Data Sudah Benar, Daftarkan.",
            ],
          },
          {
            type: "table",
            title: "Data pada setiap pekerjaan",
            columns: ["Data", "Isi", "Contoh"],
            rows: [
              ["Jenis pekerjaan", "Dipilih dari data pekerjaan proyek di API external Marison.", "INFRA - Pekerjaan Infrastruktur"],
              ["Nama pekerjaan", "Nama pekerjaan aktual pada pengajuan.", "Pembangunan saluran blok A"],
              ["Nilai pengajuan", "Nilai untuk item tersebut.", "Rp 125.000.000"],
              ["Catatan perencanaan", "Ruang lingkup atau informasi teknis; opsional.", "Termasuk material dan tenaga pemasangan"],
            ],
          },
          {
            type: "callout",
            title: "Proyek tidak tersedia",
            description: "Proyek hanya dapat dipilih jika ID proyek dan kantor proyek sudah terhubung ke Marison. Admin dapat meninjau proyek yang belum siap pada Master Proyek.",
            tone: "warning",
          },
          {
            type: "callout",
            title: "Non Unit berbeda dari Non Aset",
            description: "Non Unit menjelaskan bahwa proses tidak memakai kavling/alokasi unit. Non Aset menjelaskan bahwa kebutuhan tidak dicatat sebagai aset. Jika keduanya terasa cocok, ikuti kegunaan form yang ditetapkan admin atau konfirmasikan klasifikasinya sebelum memesan nomor.",
            tone: "info",
          },
        ],
      },
      {
        type: "table",
        title: "Perbandingan empat kategori",
        columns: ["Kategori", "Fokus", "Proyek", "Kavling", "Rekomendasi aset", "Contoh singkat"],
        rows: [
          ["Aset", "Inventaris/aset perusahaan", "Mengikuti konteks kantor", "Tidak", "Dapat tersedia", "Komputer inventaris"],
          ["Non Aset", "Barang/jasa dan biaya operasional", "Mengikuti konteks kantor", "Tidak", "Tidak", "Sewa alat atau banner"],
          ["Unit", "Order bangun dan unit properti", "Wajib", "Wajib dialokasikan", "Tidak", "Pembangunan 3 unit"],
          ["Non Unit", "Pekerjaan pembangunan/proyek fisik tanpa alokasi kavling", "Wajib proyek API external; tidak memakai 000", "Tidak", "Tidak", "SPK atau pekerjaan kawasan"],
        ],
      },
      {
        type: "troubleshooting",
        title: "Jika kategori tidak sesuai",
        items: [
          {
            problem: "Form atau kegunaan yang dicari tidak muncul",
            solution: "Kembali ke klasifikasi dokumen dan pilih kategori yang benar. Jika tetap tidak tersedia, admin perlu memeriksa kategori, departemen pengaju, dan status aktif kegunaan form.",
          },
          {
            problem: "Unit tidak dapat dipilih",
            solution: "Kategori Unit hanya tersedia untuk departemen yang diizinkan dan tetap membutuhkan proyek dengan data unit yang dapat dimuat.",
          },
          {
            problem: "Sudah mendapatkan nomor tetapi kategori salah",
            solution: "Batalkan draft agar nomor tercatat VOID, lalu buat pengajuan baru dengan kategori yang benar. Jangan memaksakan form dari kategori lain.",
          },
          {
            problem: "Bingung memilih Non Aset atau Non Unit",
            solution: "Gunakan Non Aset untuk kebutuhan operasional/barang-jasa non aset. Gunakan Non Unit untuk pekerjaan pembangunan/proyek fisik yang tidak membutuhkan alokasi kavling.",
          },
        ],
      },
    ],
  };
