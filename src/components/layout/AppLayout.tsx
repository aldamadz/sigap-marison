import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { useState, useEffect } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const TITLE: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Overview of your agenda metrics' },
  '/calendar': { title: 'Calendar', subtitle: 'Drag and drop to reschedule' },
  '/agenda': { title: 'Agendas', subtitle: 'Manage your tasks and meetings' },
  '/hierarchy': { title: 'Organization', subtitle: '7-level hierarchy structure' },
  '/audit-logs': { title: 'Audit Log', subtitle: 'Jejak audit administratif sistem' },
  '/settings': { title: 'Settings', subtitle: 'Configure your preferences' },
  '/surat/registrasi': { title: 'Registrasi Surat', subtitle: 'Kelola pendaftaran surat masuk & keluar' },
  '/surat/inbox': { title: 'Inbox Approval', subtitle: 'Daftar surat yang memerlukan persetujuan' },
  '/surat/monitoring': { title: 'Monitoring Surat', subtitle: 'Lacak status dan alur distribusi surat' },
  '/surat/riwayat': { title: 'Riwayat Keterlibatan', subtitle: 'Riwayat pengajuan untuk pihak yang terlibat' },
  '/surat/chat': { title: 'Diskusi', subtitle: 'Komunikasi dengan PIC' },
  '/pic/monitoring': { title: 'PIC Monitoring', subtitle: 'Kelola review dan tindak lanjut surat' },
  '/admin/users/hierarchy': { title: 'Hirarki Organisasi', subtitle: 'Tree list dan chart node struktur karyawan' },
  '/admin/kpi-departments': { title: 'KPI Departemen', subtitle: 'Evaluasi SLA approval berdasarkan jam kerja efektif' },
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
    <div className="flex min-h-screen bg-background overflow-hidden">
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
          className="w-[280px] sm:w-[300px] p-0 bg-sidebar border-sidebar-border"
        >
          <Sidebar
            collapsed={false}
            onToggle={() => {}}
            isMobile={true}
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <main className="flex flex-1 flex-col min-w-0 relative h-screen overflow-hidden">
        <Header
          onMenuClick={() => setMobileMenuOpen(true)}
          showMenuButton={isMobile}
        />
        
        {/* Kontainer Scrollable */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6 safe-area-bottom">
          {/* Breadcrumbs - Tampilkan di semua ukuran layar */}
          <div className="mb-4">
            <Breadcrumbs showHome={true} />
          </div>

          {/* Mobile Breadcrumb/Title when sidebar collapsed */}
          {isMobile && title && (
            <div className="mb-4 lg:hidden">
              <h1 className="text-lg sm:text-xl font-bold text-foreground">{title}</h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>
              )}
            </div>
          )}

          <div className="min-h-0">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  )
}
