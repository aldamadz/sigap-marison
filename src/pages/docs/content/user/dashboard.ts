import { BarChart3 } from 'lucide-react';
import type { DocsEntry } from '../types';
import { DOCS_UPDATED_AT, DOCS_VERSION } from '../metadata';

export const dashboardDocs: DocsEntry = {
  id: 'dashboard', title: 'Dashboard', menu: 'Dashboard', audience: 'user', icon: BarChart3,
  version: DOCS_VERSION, updatedAt: DOCS_UPDATED_AT,
  summary: 'Pantau pengajuan, antrean tanda tangan, penanggung jawab, dan SLA sesuai departemen atau kantor.',
  whenToUse: ['Menentukan pengajuan yang perlu segera ditindaklanjuti.', 'Melihat antrean sekarang dan pengajuan yang belum sampai ke tahap Anda.', 'Memantau pengajuan rekan satu departemen atau kantor, termasuk KCP di bawah KC.'],
  steps: ['Buka Dashboard dan pilih Pengajuan saya, Tanda tangan saya, atau Departemen / kantor.', 'Pilih kategori antrean atau SLA untuk melihat daftar yang sesuai.', 'Buka dokumen atau kirim pengingat kepada penanggung jawab tahap aktif.'],
  examples: ['Staff KC dapat memantau pengajuan KCP di bawah KC-nya tanpa memperoleh hak tanda tangan tambahan.', 'Manager melihat pekerjaan yang perlu ditandatangani terpisah dari pengajuan yang masih di tahap sebelumnya.'],
  troubleshooting: ['Angka kosong berarti tidak ada pengajuan pada kategori atau pencarian tersebut.', 'Jika muncul gagal memuat, pilih Coba lagi; angka tidak dianggap nol saat koneksi gagal.'],
  sections: [
    { type: 'feature-grid', title: 'Bagian pada Dashboard', items: [
      { title: 'Pengajuan saya', description: 'Pengajuan yang Anda buat: antrean aktif, perlu perbaikan, selesai, dan ditolak.' },
      { title: 'Tanda tangan saya', description: 'Tugas pejabat yang benar-benar ditugaskan kepada Anda. Tanda tangan otomatis pemohon pada tahap pertama tidak dihitung sebagai beban kerja penandatangan.' },
      { title: 'Departemen / kantor', description: 'Pusat memantau departemen sendiri. KCP memantau kantor sendiri. KC mencakup KCP turunannya. Pengajuan juga terlihat jika penandatangan aktif berasal dari lingkup tersebut. Hak membuka dokumen dan menyetujui tetap mengikuti izin yang berlaku.' },
      { title: 'Kalender Kerja', description: 'Pekerjaan Anda hari ini dan pekerjaan tertunda tetap tersedia. Ringkasan Agenda lama tidak lagi ditampilkan.' },
    ] },
    { type: 'table', title: 'Membaca antrean tanda tangan', columns: ['Kategori', 'Arti'], rows: [
      ['Perlu tanda tangan', 'Tahap Anda sedang aktif dan pemeriksaan/rekomendasi prasyarat sudah selesai. Buka pengajuan untuk melakukan pemeriksaan sebelum mengambil keputusan.'],
      ['Belum sampai tahap saya', 'Anda ditugaskan pada tahap berikutnya. Dokumen belum dapat Anda setujui dan SLA tahap Anda belum dimulai.'],
      ['Menunggu kelengkapan', 'Tahap Anda aktif tetapi masih menunggu tim pemeriksa atau rekomendasi.'],
      ['Perlu perbaikan', 'Pengajuan sedang dikembalikan. Pemohon memperbaikinya melalui Tindak Lanjut, bukan membuat nomor baru.'],
    ] },
    { type: 'table', title: 'Kontrol periode', columns: ['Bagian', 'Periode'], rows: [
      ['Bulan ini', 'Mode bawaan. Bulan yang ditampilkan membatasi riwayat selesai/ditolak berdasarkan tanggal keputusan. Antrean aktif tetap mencakup pengajuan dari bulan sebelumnya.'],
      ['Hari ini / Minggu ini', 'Klik label bulan, lalu pilih periode. Daftar dan ringkasan memfilter tanggal dibuat dalam WIB; minggu berjalan dimulai Senin.'],
      ['Rentang tanggal', 'Klik label periode, pilih Rentang tanggal, pilih tanggal awal dan akhir di kalender, lalu klik Terapkan. Kedua tanggal termasuk dalam hasil.'],
      ['Pencarian', 'Mencari nomor, judul, pengaju, kantor, atau penanggung jawab dalam kategori yang dipilih.'],
    ] },
    { type: 'table', title: 'Membaca SLA', columns: ['Indikator', 'Perhitungan'], rows: [
      ['Antrean dalam SLA', 'Tugas tahap aktif yang waktu kerjanya belum melewati konfigurasi SLA departemen penanggung jawab.'],
      ['Antrean melewati SLA', 'Tugas tahap aktif yang waktu kerjanya sudah melebihi konfigurasi tersebut.'],
      ['Selesai tepat waktu', 'Persentase pengajuan atau tugas terukur yang selesai dalam SLA pada periode aktif. Jumlah pembilang dan penyebut ditampilkan bersama persentase.'],
      ['Belum mulai / dijeda', 'SLA signer belum berjalan jika tahap belum aktif atau belum bisa mengambil keputusan, misalnya menunggu pemeriksaan, rekomendasi, periode penerimaan, atau perbaikan pemohon.'],
    ], description: 'Perhitungan menggunakan jam kerja, hari kerja, jeda istirahat, dan zona waktu konfigurasi KPI yang sudah ada. Tidak menghitung waktu kalender mentah.' },
    { type: 'callout', title: 'Memantau tidak berarti menyetujui', tone: 'info', description: 'Akses ringkasan dan detail dokumen tidak mengubah pejabat, kantor penerbit, nomor, atau hak persetujuan. Aksi tanda tangan tetap mengikuti penugasan dan tahap aktif.' },
    { type: 'steps', title: 'Mengingatkan penanggung jawab', items: [
      'Cari pengajuan, lalu periksa nama penanggung jawab dan posisi tahapnya.',
      'Gunakan ikon lonceng untuk mengingatkan penandatangan tahap aktif, atau pemohon pada pengajuan yang dikembalikan.',
      'Pengingat masuk ke notifikasi SIGAP. Sistem membatasi pengingat yang sama kepada penerima yang sama selama enam jam, termasuk jika dikirim rekan lain.',
      'Pengingat tidak mengubah status, melakukan approval, atau mengirim dokumen ke sistem external.',
    ] },
  ],
};
