import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { useState, useEffect } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const TITLE: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Ringkasan pekerjaan, antrean, dan performa persetujuan' },
  '/calendar': { title: 'Kalender', subtitle: 'Kelola agenda dan jadwal kerja' },
  '/agenda': { title: 'Agenda', subtitle: 'Kelola jadwal pribadi dan tim sesuai akses' },
  '/hierarchy': { title: 'Organisasi', subtitle: 'Struktur hirarki karyawan' },
  '/audit-logs': { title: 'Audit Log', subtitle: 'Jejak audit administratif sistem' },
  '/settings': { title: 'Settings', subtitle: 'Configure your preferences' },
  '/surat/registrasi': { title: 'Registrasi Surat', subtitle: 'Kelola pendaftaran surat masuk & keluar' },
  '/surat/inbox': { title: 'Inbox Approval', subtitle: 'Daftar surat yang memerlukan persetujuan' },
  '/surat/monitoring': { title: 'Monitoring Surat', subtitle: 'Lacak status dan alur distribusi surat' },
  '/surat/riwayat': { title: 'Riwayat Keterlibatan', subtitle: 'Riwayat pengajuan untuk pihak yang terlibat' },
  '/admin/users/hierarchy': { title: 'Hirarki Organisasi', subtitle: 'Tree list dan chart node struktur karyawan' },
  '/admin/kpi-departments': { title: 'SLA Departemen', subtitle: 'Evaluasi approval berdasarkan jam kerja efektif' },
  '/admin/configuration/forms': { title: 'Form & Template', subtitle: 'Konfigurasi template dan input dokumen' },
  '/admin/configuration/workflows': { title: 'Alur Persetujuan', subtitle: 'Konfigurasi urutan dan posisi tanda tangan' },
  '/admin/configuration/kpi': { title: 'SLA Departemen', subtitle: 'Konfigurasi waktu kerja efektif departemen' },
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const location = useLocation()

  const { title, subtitle } =
    TITLE[location.pathname] || { title: '', subtitle: '' }

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div className="flex min-h-dvh overflow-hidden bg-muted/35 text-foreground">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(v => !v)}
          isMobile={false}
        />
      </div>

      {/* Mobile Sheet Sidebar */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent 
          side="left" 
          className="w-[286px] p-0 bg-sidebar border-sidebar-border sm:w-[306px]"
        >
          <Sidebar
            collapsed={false}
            onToggle={() => {}}
            isMobile={true}
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setMobileMenuOpen(true)}
          showMenuButton={isMobile}
        />
        
        {/* Kontainer Scrollable */}
        <div className="safe-area-bottom flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-5">
          {/* Breadcrumbs - Tampilkan di semua ukuran layar */}
          <div className="mb-3">
            <Breadcrumbs showHome={true} />
          </div>

          {/* Mobile Breadcrumb/Title when sidebar collapsed */}
          {isMobile && title && (
            <div className="mb-4 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-card)] lg:hidden">
              <h1 className="text-base font-semibold text-foreground sm:text-lg">{title}</h1>
              {subtitle && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
              )}
            </div>
          )}

          <div className="mx-auto min-h-0 w-full max-w-[1500px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
