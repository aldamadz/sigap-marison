import { matchPath } from 'react-router'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export const BREADCRUMB_ROUTES: Record<string, string> = {
  '/': 'Masuk',
  '/reset-password': 'Atur Ulang Kata Sandi',
  '/dashboard': 'Dashboard',
  '/calendar': 'Kalender Kerja',
  '/notifications/open': 'Notifikasi',
  '/audit-logs': 'Audit Log',
  '/settings': 'Pengaturan',
  '/settings/department-sla': 'SLA Departemen',
  '/docs': 'Dokumentasi',
  '/docs/:topicSlug': 'Dokumentasi',
  '/docs/:topicSlug/:sectionSlug': 'Dokumentasi',
  '/surat/registrasi': 'Buat Pengajuan',
  '/surat/inbox': 'Persetujuan',
  '/surat/rekomendasi': 'Rekomendasi',
  '/surat/rekomendasi/registrasi': 'Buat Rekomendasi',
  '/surat/tindak-lanjut': 'Tindak Lanjut',
  '/status-pengajuan': 'Status Pengajuan',
  '/surat/riwayat': 'Riwayat Terlibat',
  '/admin/users': 'Manajemen Karyawan',
  '/admin/users/hierarchy': 'Hirarki Organisasi',
  '/admin/departments': 'Master Departemen',
  '/admin/entities': 'Master Entitas',
  '/admin/letter-types': 'Master Jenis Dokumen',
  '/admin/offices': 'Master Kantor',
  '/admin/master-projects': 'Master Proyek',
  '/admin/monitoring': 'Monitoring Admin',
  '/admin/kpi-departments': 'SLA Departemen',
  '/admin/configuration': 'Konfigurasi',
  '/admin/configuration/form-usages': 'Kegunaan Form',
  '/admin/configuration/integration': 'Integrasi Marison',
  '/admin/configuration/kpi': 'SLA Departemen',
  '/admin/configuration/numbering': 'Penomoran Surat',
  '/admin/configuration/job-title-labels': 'Label Jabatan',
  '/admin/configuration/email': 'Notifikasi Email',
  '/admin/configuration/access': 'Hak Akses',
  '/admin/configuration/maintenance': 'Pemeliharaan Sistem',
}

export const BREADCRUMB_ALIASES: Record<string, string> = {
  '/surat/monitoring': '/status-pengajuan',
  '/activity-logs': '/audit-logs',
  '/maintenance-admin': '/admin/configuration/maintenance',
}

// Staging-only leaf pages have labels but are never emitted as parent links.
export const BREADCRUMB_OPTIONAL_LEAVES: Record<string, string> = {
  '/desktop/authorize': 'Persetujuan Perangkat',
  '/settings/devices': 'Perangkat Terhubung',
  '/admin/configuration/desktop-devices': 'Perangkat Terhubung',
}

const normalize = (path: string) => path.replace(/\/+$/, '') || '/'

export function isBreadcrumbDestination(href: string | undefined): boolean {
  if (!href || !href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return false
  try {
    const url = new URL(href, 'https://sigap.invalid')
    const path = normalize(url.pathname)
    return url.origin === 'https://sigap.invalid' && (
      Boolean(BREADCRUMB_ALIASES[path]) ||
      Object.keys(BREADCRUMB_ROUTES).some(pattern => matchPath({ path: pattern, end: true }, path))
    )
  } catch {
    return false
  }
}

export function routeBreadcrumbs(path: string, showHome = true): BreadcrumbItem[] {
  const normalized = normalize(path)
  const pathname = BREADCRUMB_ALIASES[normalized] || normalized
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbItem[] = showHome ? [{ label: 'Beranda', href: '/dashboard' }] : []
  let currentPath = ''
  for (const segment of segments) {
    currentPath += `/${segment}`
    const isLast = currentPath === pathname
    // URL grouping segments are not pages and must not become parent links.
    if (!isLast && !isBreadcrumbDestination(currentPath)) continue
    crumbs.push({
      label: BREADCRUMB_ROUTES[currentPath] || BREADCRUMB_OPTIONAL_LEAVES[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1),
      href: isLast ? undefined : currentPath,
    })
  }
  return crumbs
}
