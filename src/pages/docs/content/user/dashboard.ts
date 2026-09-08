import { BarChart3 } from "lucide-react";
import type { DocsEntry } from "../types";
import { DOCS_UPDATED_AT, DOCS_VERSION } from "../metadata";

export const dashboardDocs: DocsEntry = {
    id: "dashboard",
    title: "Dashboard",
    menu: "Dashboard",
    audience: "user",
    icon: BarChart3,
    version: DOCS_VERSION,
    updatedAt: DOCS_UPDATED_AT,
    summary: "Pusat ringkasan pekerjaan, agenda, surat, dan antrean yang perlu dipantau.",
    whenToUse: [
      "Melihat pekerjaan yang perlu segera ditindaklanjuti.",
      "Memeriksa status umum aktivitas agenda dan dokumen.",
      "Masuk cepat ke menu yang paling sering digunakan.",
    ],
    steps: [
      "Buka menu Dashboard setelah login.",
      "Baca kartu ringkasan sesuai area kerja Anda.",
      "Klik pintasan atau item yang perlu ditindaklanjuti.",
    ],
    examples: [
      "Jika ada persetujuan baru, buka Persetujuan dari kartu antrean.",
      "Jika ingin mengecek dokumen yang Anda buat, lanjutkan ke Status Pengajuan.",
    ],
    troubleshooting: [
      "Jika data terlihat kosong, refresh halaman dan pastikan akun Anda masih aktif.",
      "Jika data tidak sesuai hak akses, hubungi admin untuk mengecek departemen, kantor, dan role akun.",
    ],
    sections: [
      {
        type: "callout",
        title: "Data yang ditampilkan",
        description:
          "Dashboard memakai data akun yang sedang login. Atasan yang memiliki bawahan dapat memperluas tampilan ke kantor atau anggota tim yang berada dalam hirarkinya.",
        tone: "info",
      },
      {
        type: "feature-grid",
        title: "Bagian pada Dashboard",
        items: [
          {
            title: "Pengajuan Surat",
            description:
              "Ringkasan jumlah surat yang Anda buat pada periode terpilih: total, selesai, diproses, dan ditolak.",
          },
          {
            title: "Ringkasan Agenda",
            description:
              "Kartu Total Agenda, Selesai, Berjalan, Terjadwal, dan Terlambat untuk periode agenda yang dipilih.",
          },
          {
            title: "Distribusi Status",
            description:
              "Diagram komposisi agenda Completed, Ongoing, Scheduled, dan Overdue. Arahkan pointer untuk melihat jumlahnya.",
          },
          {
            title: "Aktivitas Departemen",
            description:
              "Perbandingan agregat total agenda dan agenda selesai untuk seluruh departemen. Grafik hanya menampilkan jumlah tanpa membuka judul atau isi agenda departemen lain.",
          },
          {
            title: "Aktivitas Terbaru",
            description:
              "Daftar aktivitas operasional berupa pembuatan agenda, pembuatan surat, dan approval surat.",
          },
          {
            title: "Filter Hirarki",
            description:
              "Khusus atasan: memilih area kantor, seluruh anggota tim, diri sendiri, atau satu anggota tertentu.",
          },
        ],
      },
      {
        type: "table",
        title: "Kontrol periode",
        description:
          "Periode Pengajuan Surat dan Agenda diatur secara terpisah. Mengubah periode surat tidak mengubah grafik agenda.",
        columns: ["Kontrol", "Fungsi"],
        rows: [
          ["Bulan", "Menampilkan data dari awal sampai akhir bulan yang dipilih."],
          ["Minggu", "Menampilkan data Senin sampai Minggu pada minggu yang dipilih."],
          ["Panah kiri", "Mundur satu bulan atau satu minggu."],
          ["Panah kanan", "Maju satu periode. Tombol nonaktif jika sudah berada pada periode berjalan."],
          ["Hari Ini", "Kembali ke bulan atau minggu berjalan."],
        ],
      },
      {
        type: "table",
        title: "Membaca ringkasan Pengajuan Surat",
        columns: ["Kartu", "Arti", "Saat diklik"],
        rows: [
          ["Total Pengajuan", "Semua surat yang Anda buat pada periode terpilih.", "Membuka seluruh Status Pengajuan."],
          ["Selesai", "Seluruh tanda tangan selesai dan surat berstatus selesai.", "Membuka Status Pengajuan dengan filter Selesai."],
          ["Diproses", "Surat masih menunggu pemeriksaan atau tanda tangan.", "Membuka Status Pengajuan dengan filter Proses."],
          ["Ditolak", "Salah satu tahap menolak surat sehingga alur berhenti.", "Membuka Status Pengajuan dengan filter Ditolak."],
        ],
      },
      {
        type: "table",
        title: "Membaca KPI Agenda",
        columns: ["Kartu", "Perhitungan"],
        rows: [
          ["Total Agenda", "Jumlah seluruh agenda dalam periode. Persentase membandingkan total dengan periode sebelumnya."],
          ["Selesai", "Agenda berstatus Completed. Ditampilkan juga sebagai progres dari total agenda."],
          ["Berjalan", "Agenda berstatus Ongoing."],
          ["Terjadwal", "Agenda berstatus Scheduled."],
          ["Terlambat", "Agenda berstatus Overdue atau melewati waktu selesai dan belum diselesaikan."],
        ],
      },
      {
        type: "steps",
        title: "Menelusuri pekerjaan dari Dashboard",
        items: [
          "Pilih periode Bulan atau Minggu pada bagian yang ingin dianalisis.",
          "Jika Anda atasan, tentukan kantor atau anggota tim sebelum membaca angkanya.",
          "Klik kartu Pengajuan Surat untuk membuka daftar dokumen dengan filter yang sesuai.",
          "Klik aktivitas terbaru untuk membaca detail aktivitas tanpa membuka Audit Log.",
        ],
      },
      {
        type: "troubleshooting",
        title: "Kendala pada Dashboard",
        items: [
          {
            problem: "Angka atau grafik kosong",
            solution:
              "Periksa periode, filter anggota, dan area kantor. Data kosong berarti tidak ada data pada kombinasi filter tersebut.",
          },
          {
            problem: "Filter kantor atau anggota tidak tersedia",
            solution:
              "Filter hanya muncul pada akun yang terdeteksi memiliki bawahan dalam hirarki organisasi.",
          },
          {
            problem: "Aktivitas terbaru tidak menampilkan perubahan profil atau konfigurasi",
            solution:
              "Dashboard hanya menampilkan aktivitas kerja operasional. Perubahan administratif tersedia di Audit Log untuk admin.",
          },
        ],
      },
    ],
  };
