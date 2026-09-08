import { Inbox } from "lucide-react";
import type { DocsEntry, DocsSection } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const approvalInboxDocs: DocsEntry = {
    id: "approval-inbox",
    title: "Persetujuan",
    menu: "Layanan Surat > Persetujuan",
    audience: "user",
    icon: Inbox,
    version: "v1.0.0",
    updatedAt: DOCS_UPDATED_AT,
    summary: "Tempat penandatangan dan tim pemeriksa memproses dokumen yang masuk ke tanggung jawabnya.",
    whenToUse: [
      "Menyetujui atau menolak dokumen yang menunggu keputusan Anda.",
      "Memeriksa data sebagai tim pemeriksa sebelum signer melakukan aksi.",
      "Mengunggah lampiran approval atau mengisi alokasi unit jika diminta sistem.",
    ],
    steps: [
      "Buka Persetujuan.",
      "Pilih dokumen dari antrean atau task switcher.",
      "Baca ringkasan pengajuan tanpa harus membuka PDF.",
      "Periksa progres persetujuan, dokumen, lampiran, catatan, dan tugas step aktif.",
      "Isi data yang diwajibkan, lalu pilih Setujui atau Tolak.",
    ],
    examples: [
      "Jika Anda Mgr. Perencanaan pada pengajuan Unit, tim pemeriksa dapat mengisi detail unit terlebih dulu sebelum Anda menyetujui.",
      "Jika data belum benar, gunakan aksi kembalikan ke tim pemeriksa agar data diperbarui.",
      "Jika menolak dokumen, tulis alasan minimal lima karakter agar pembuat memahami masalahnya.",
    ],
    troubleshooting: [
      "Jika tombol Setujui terkunci, baca alasan di action bar untuk mengetahui data yang belum lengkap.",
      "Jika lampiran sudah ada, Anda tidak perlu upload ulang kecuali ingin mengganti lampiran lama.",
      "Jika dokumen hilang setelah diproses, artinya antrean Anda sudah selesai dan sistem memilih item berikutnya.",
    ],
    sections: [
      {
        type: "feature-grid",
        title: "Area utama Persetujuan",
        items: [
          {
            title: "Antrean tugas",
            description:
              "Menampilkan dokumen yang sedang menunggu aksi Anda sebagai signer atau tim pemeriksa.",
          },
          {
            title: "Ringkasan pengajuan",
            description:
              "Berisi pengaju, departemen, lokasi, dan permohonan agar keputusan awal bisa dibaca tanpa membuka PDF.",
          },
          {
            title: "Progres persetujuan",
            description:
              "Menampilkan tahap selesai, tahap aktif, signer, waktu aksi, dan catatan yang relevan.",
          },
          {
            title: "Tugas step aktif",
            description:
              "Menampilkan kewajiban sebelum aksi, seperti lampiran approval, pemeriksaan tim pemeriksa, atau alokasi unit.",
          },
          {
            title: "Dokumen dan lampiran",
            description:
              "Panel file untuk membuka PDF, snapshot, lampiran pemohon, lampiran tim pemeriksa, dan lampiran approval.",
          },
          {
            title: "Panel rekomendasi",
            description:
              "Muncul pada pengajuan aset yang membutuhkan rekomendasi agar status dokumen tertaut dapat dipantau dari surat induk.",
          },
          {
            title: "Action bar",
            description:
              "Tombol Setujui, Tolak, dan alasan kenapa aksi belum bisa dilakukan jika ada data yang belum lengkap.",
          },
        ],
      },
      {
        type: "steps",
        title: "Alur signer",
        items: [
          "Buka dokumen dari antrean dan baca ringkasan pengajuan.",
          "Periksa progress step sebelumnya dan catatan dari pemohon atau tim pemeriksa.",
          "Jika ada tugas wajib, lengkapi dulu atau minta tim pemeriksa memperbarui data.",
          "Jika surat aset menunggu rekomendasi, cek panel rekomendasi dan arahkan petugas PBO membuka menu Rekomendasi.",
          "Jika data perlu diperbaiki, pilih tujuan pengembalian yang tersedia. Tim pemeriksa hanya muncul jika tahap aktif memang memiliki pemeriksa pada snapshot transaksi.",
          "Isi perubahan item bila ada: tidak berubah, disetujui sebagian, atau tidak disetujui. Nilai diajukan hanya tampil sebagai referensi; signer cukup mengisi nilai disetujui dan alasan jika item berubah.",
          "Gunakan Setujui jika data sudah benar, atau Tolak dengan alasan yang jelas jika pengajuan tidak dapat dilanjutkan.",
          "Setelah aksi berhasil, dokumen keluar dari antrean dan sistem membuka tugas berikutnya bila ada.",
        ],
      },
      {
        type: "table",
        title: "Perbaikan dalam proses approval",
        columns: ["Kasus", "Tujuan perbaikan", "Dampak"],
        rows: [
          ["Nominal disetujui lebih kecil dari pengajuan", "Pemohon atau tim pemeriksa sesuai konteks", "Riwayat menyimpan nilai diajukan, nilai disetujui, dan alasan perubahan."],
          ["Jumlah aset disetujui lebih sedikit", "Pemohon atau tim pemeriksa", "Item yang tidak disetujui tetap tampil dengan garis coret dan alasan di detail/PDF."],
          ["Rekomendasi IT perlu revisi spek/harga", "Tim IT / rekomendasi", "Rekomendasi diperbarui dulu, lalu pemohon memilih lanjut atau batal."],
          ["Data berubah setelah tanda tangan berjalan", "Tahap 1", "Setelah pemohon menyetujui perubahan, semua signer meninjau dan tanda tangan ulang dari awal."],
          ["Tahap aktif tidak punya tim pemeriksa", "Pemohon atau signer sebelumnya", "Opsi tim pemeriksa tidak ditampilkan agar proses tidak dikirim ke target kosong."],
        ],
      },
      {
        type: "table",
        title: "Perbedaan signer dan tim pemeriksa",
        columns: ["Peran", "Bisa melakukan", "Tidak menggantikan"],
        rows: [
          ["Signer", "Setuju, tolak, membaca dokumen, dan mengembalikan ke tim pemeriksa jika data perlu diperbaiki.", "Pemeriksaan tim pemeriksa yang diwajibkan konfigurasi."],
          ["Tim pemeriksa", "Pemeriksaan data, mengisi data unit, mengganti lampiran wajib, dan menulis catatan pemeriksaan.", "Keputusan tanda tangan signer."],
          ["Pemohon", "Membuat pengajuan dan memantau status.", "Mengubah proyek unit setelah pengajuan dibuat."],
          ["Petugas rekomendasi", "Mengambil draft rekomendasi aset, mengisi item rekomendasi, dan mengonfirmasi dokumen tertaut.", "Keputusan approval surat induk."],
        ],
      },
      {
        type: "table",
        title: "Rekomendasi pada approval",
        columns: ["Kondisi", "Yang terjadi", "Yang perlu dicek"],
        rows: [
          ["Surat aset tidak butuh rekomendasi", "Approval berjalan tanpa panel rekomendasi.", "Pastikan pilihan rekomendasi saat registrasi memang Tidak."],
          ["Surat aset butuh rekomendasi", "Panel rekomendasi tampil dan sistem membuat tugas PBO setelah surat induk dikonfirmasi.", "Cek status tugas di menu Rekomendasi."],
          ["Rekomendasi belum selesai", "Approval induk dapat terkunci pada tahap yang dikonfigurasi.", "Tunggu dokumen rekomendasi selesai atau cek siapa yang mengambil tugas."],
          ["Rekomendasi selesai", "Dokumen tertaut dapat dibuka sebagai surat sendiri.", "Lanjutkan approval induk sesuai action bar."],
        ],
      },
      {
        type: "table",
        title: "Jika pengajuan Unit",
        columns: ["Bagian", "Aturan"],
        rows: [
          ["Proyek", "Mengikuti pilihan pemohon dan tidak diubah di tahap approval."],
          ["Jumlah unit", "Boleh dialokasikan kurang dari jumlah permintaan jika memang hanya tersedia sebagian."],
          ["Detail unit", "Diisi dalam tabel satu baris per kavling dengan header sticky: struktur atas, struktur bawah, nomor, blok, tanggal, dan kode produksi."],
          ["Template Excel", "Tim pemeriksa dapat mengunduh template setelah memilih kavling, mengisi data di Excel, lalu import kembali untuk memperbarui tabel alokasi. Keterangan cell memberi contoh nominal, nomor kode produksi, blok, dan tanggal."],
          ["Lampiran otomatis", "Kode produksi dan rekap adendum dibuat dari input sistem, bukan dari file manual kode produksi."],
        ],
      },
      {
        type: "troubleshooting",
        title: "Masalah umum saat approval",
        items: [
          {
            problem: "Tombol Setujui terkunci",
            solution:
              "Baca status kelengkapan pada action bar. Biasanya ada lampiran wajib, pemeriksaan tim pemeriksa, atau data unit yang belum lengkap.",
          },
          {
            problem: "Diminta upload lampiran padahal sudah ada",
            solution:
              "Lampiran lama tetap dipakai. Upload ulang hanya diperlukan jika ingin mengganti file lama.",
          },
          {
            problem: "Catatan tim pemeriksa tidak terlihat",
            solution:
              "Buka bagian progres persetujuan atau tugas step aktif. Catatan tim pemeriksa tampil sebagai bagian dari pemeriksaan data.",
          },
          {
            problem: "Surat induk aset tidak bisa disetujui karena rekomendasi",
            solution:
              "Buka panel rekomendasi untuk melihat status dokumen tertaut. Pembuatan rekomendasi dilakukan dari menu Rekomendasi oleh petugas PBO/Staff IT.",
          },
        ],
      },
    ],
  };

export const approval_inboxDetailSections: DocsSection[] = [
    {
      type: "table",
      title: "Kenapa tombol aksi terkunci",
      columns: ["Penyebab", "Contoh", "Yang perlu dilakukan"],
      rows: [
        ["Tim pemeriksa belum memeriksa", "Step 3 sudah terlihat signer, tetapi tim pemeriksa step itu belum selesai.", "Tunggu tim pemeriksa atau kembalikan dengan catatan jika perlu revisi."],
        ["Lampiran wajib belum lengkap", "Siteplan, volume adendum, atau lampiran approval belum tersedia.", "Lengkapi lampiran atau minta tim pemeriksa mengganti lampiran lama."],
        ["Data unit belum lengkap", "Unit dipilih tetapi struktur/kode produksi belum diisi.", "Lengkapi detail kavling sebelum pemeriksaan atau approval."],
        ["Jumlah unit perlu konfirmasi", "Alokasi unit kurang dari permintaan.", "Konfirmasi eksplisit bahwa sebagian unit memang belum bisa dialokasikan."],
        ["File masih upload", "File sudah dipilih tetapi proses upload belum selesai.", "Tunggu indikator upload selesai sebelum menekan Setujui."],
      ],
    },
    {
      type: "table",
      title: "Data yang wajib dibaca sebelum aksi",
      columns: ["Bagian", "Isi", "Risiko jika dilewati"],
      rows: [
        ["Ringkasan", "Pengaju, departemen, kantor, proyek, kategori, dan permohonan.", "Salah menyetujui dokumen yang bukan konteks Anda."],
        ["Progres", "Step sebelumnya, signer, waktu, dan catatan.", "Tidak mengetahui alasan revisi atau status pemeriksaan."],
        ["Dokumen", "PDF utama dan snapshot.", "Tampilan template atau tanda tangan bisa luput dicek."],
        ["Lampiran", "File pendukung pemohon/tim pemeriksa/approval.", "Approval berjalan tanpa bukti pendukung yang diminta."],
        ["Catatan", "Alasan pemohon, tim pemeriksa, atau penolakan.", "Keputusan tidak punya konteks cukup."],
      ],
    },
  ];
