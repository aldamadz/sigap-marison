type AppReleaseChangeKind = 'feature' | 'update' | 'fix' | 'optimization' | 'maintenance';

type AppRelease = {
  version: `v${number}.${number}.${number}`;
  releasedOn: string;
  announcementId?: string;
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

export const findAppReleaseForAnnouncement = (id: string) => APP_RELEASES.find(release => release.announcementId === id);
