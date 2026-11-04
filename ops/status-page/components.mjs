export const WORKERS = [
  { id: 'sigap_pdf', name: 'Worker PDF', domain: 'Proses dan progres antrean' },
  { id: 'sigap_sync', name: 'Sinkronisasi', domain: 'Proses dan hasil sinkronisasi terjadwal' },
  { id: 'sigap_outbound', name: 'Outbound', domain: 'Proses dan progres antrean pengiriman' },
  { id: 'sigap_external', name: 'API External', domain: 'Proses dan respons API' },
];

export const COMPONENTS = [
  { id: 'sigap', name: 'SIGAP Production', domain: 'sigap.marisoncloud.com', url: 'https://sigap.marisoncloud.com', health: '/health/ready' },
  { id: 'sigap_staging', name: 'SIGAP Staging', domain: 'sigap.marison-testing.biz.id', url: 'https://sigap.marison-testing.biz.id', health: '/health/ready' },
  { id: 'sigap_storage', name: 'SIGAP Storage', domain: 'Storage API dan kesiapan penyimpanan' },
  { id: 'sigap_services', name: 'Service SIGAP', domain: 'Layanan pendukung production', children: WORKERS },
];

export const ALL_COMPONENTS = [...COMPONENTS, ...WORKERS];
export const LEGACY_COMPONENTS = [
  { id: 'drive', name: 'Maris Drive' }, { id: 'ai', name: 'AI Workspace' },
  { id: 'marison', name: 'Marison Cloud' },
];
