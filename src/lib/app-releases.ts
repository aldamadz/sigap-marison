type AppReleaseChangeKind = 'feature' | 'update' | 'fix' | 'optimization' | 'maintenance';

type AppRelease = {
  version: `v${number}.${number}.${number}`;
  releasedOn: string;
  announcementId?: string;
  announcementHeading?: string;
  changes: ReadonlyArray<{ kind: AppReleaseChangeKind; items: readonly string[] }>;
};

export const APP_RELEASE_CHANGE_LABELS: Record<AppReleaseChangeKind, string> = {
  feature: 'Penambahan fitur',
  update: 'Pembaruan',
  fix: 'Perbaikan',
  optimization: 'Optimasi',
  maintenance: 'Keamanan dan pemeliharaan',
};

// Record verified production releases newest first, independently of documentation editions.
export const APP_RELEASES: readonly AppRelease[] = [
  {
    version: 'v1.11.0',
    releasedOn: '2026-11-19',
    announcementHeading: 'Pembaruan SIGAP v1.11.0',
    changes: [
      { kind: 'feature', items: [
        'Periode penerimaan mingguan atau bulanan dapat diatur untuk semua pengajuan, per form, atau per kegunaan.',
      ] },
      { kind: 'fix', items: [
        'Tampilan Pengaturan, Notifikasi, dan SLA Departemen lebih rapi. Form ganti kata sandi dibuka saat diperlukan.',
        'Kolom Perlu Rekomendasi hanya ditampilkan pada pengajuan yang mendukung pilihan rekomendasi.',
      ] },
      { kind: 'update', items: [
        'Riwayat versi aplikasi dan riwayat dokumentasi dipisahkan, dengan detail yang dapat dibuka per entri dan navigasi halaman.',
      ] },
    ],
  },
  {
    version: 'v1.10.0',
    releasedOn: '2026-11-18',
    announcementId: '86df7576-42dc-490c-91d3-0112eb6ef28b',
    changes: [
      { kind: 'feature', items: [
        'Status Pengajuan: tandai pengajuan dengan bintang pribadi dan buka kembali melalui filter Ditandai.',
      ] },
      { kind: 'update', items: [
        'Dashboard: pilih Hari ini, Minggu ini, Bulan ini, atau rentang tanggal dari kalender.',
        "What's New: pengumuman pembaruan dapat diterbitkan terpisah dari maintenance dan dibaca kembali di Changelog.",
      ] },
    ],
  },
];

export const findAppReleaseForAnnouncement = (id: string, heading?: string) =>
  APP_RELEASES.find(release => release.announcementId === id) ??
  APP_RELEASES.find(release => release.announcementHeading && release.announcementHeading === heading?.trim());
