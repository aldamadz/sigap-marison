import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, ClipboardList, Users, Activity, Settings,
  ChevronLeft, ChevronRight, Building2, LogOut, ShieldCheck, Loader2, FileSignature,
  Inbox, SearchCheck, ChevronDown, Mail, Database, Building, Tag, MapPin,
  GitMerge, Monitor, Briefcase, History, BarChart3, Network,
  SlidersHorizontal, BookOpenText, FileCheck2, ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from "@/lib/supabase"
import { getCurrentUser } from '@/services/user-ui.service'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@/types/agenda'
import { useAttention } from '@/providers/AttentionProvider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const PROFILE_UPDATED_EVENT = 'sigap:profile-updated'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  isMobile?: boolean
  onNavigate?: () => void
}

type SidebarAttentionTone = 'task' | 'update' | 'review'

const attentionToneClasses: Record<SidebarAttentionTone, {
  row: string
  badge: string
  dot: string
}> = {
  task: {
    row: 'border border-rose-500/35 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300',
    badge: 'bg-rose-600 text-white shadow-sm shadow-rose-500/30',
    dot: 'bg-rose-500',
  },
  update: {
    row: 'border border-sky-500/35 bg-sky-500/10 text-sky-700 hover:bg-sky-500/15 dark:text-sky-300',
    badge: 'bg-sky-600 text-white shadow-sm shadow-sky-500/30',
    dot: 'bg-sky-500',
  },
  review: {
    row: 'border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300',
    badge: 'bg-amber-600 text-white shadow-sm shadow-amber-500/30',
    dot: 'bg-amber-500',
  },
}

const SidebarCountBadge = ({ count, tone }: { count: number; tone: SidebarAttentionTone }) => (
  <span
    className={cn(
      'sidebar-attention-badge ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
      attentionToneClasses[tone].badge,
    )}
    aria-label={`${count} item membutuhkan perhatian`}
  >
    {count > 99 ? '99+' : count}
  </span>
)

export const Sidebar = ({ collapsed, onToggle, isMobile = false, onNavigate }: SidebarProps) => {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { state: attentionState, refetch: refetchAttention } = useAttention()
  
  const [user, setUser] = useState<User | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isSuratOpen, setIsSuratOpen] = useState(false)
  const [isMasterOpen, setIsMasterOpen] = useState(false)

  const inboxCount = attentionState.inboxCount
  const canAccessRecommendation = (() => {
    const departmentCode = String((user as any)?.departmentCode || (user as any)?.master_departments?.code || '').trim().toUpperCase()
    const departmentName = String(user?.departmentName || (user as any)?.master_departments?.name || '').trim().toLowerCase()
    return departmentCode === 'PBO' || departmentName === 'pengembangan organisasi' || departmentName === 'po'
  })()
  const recommendationCount = canAccessRecommendation ? attentionState.recommendationCount : 0
  const monitoringBadge = attentionState.monitoringCount
  const followUpCount = attentionState.followUpCount || 0
  const officeReviewCount = attentionState.masterOfficeReviewCount || 0
  const profileReviewCount = attentionState.profileReviewCount || 0
  const masterReviewCount = officeReviewCount + profileReviewCount
  const suratAttentionCount = inboxCount + recommendationCount + monitoringBadge + followUpCount
  const isUserAdmin = user?.role === 'admin'

  const getNavAttention = (label: string): { count: number; tone: SidebarAttentionTone } | null => {
    const attentionByLabel: Record<string, { count: number; tone: SidebarAttentionTone }> = {
      Persetujuan: { count: inboxCount, tone: 'task' },
      Rekomendasi: { count: recommendationCount, tone: 'task' },
      'Tindak Lanjut': { count: followUpCount, tone: 'task' },
      'Status Pengajuan': { count: monitoringBadge, tone: 'update' },
      'User Organization': { count: profileReviewCount, tone: 'review' },
      'Master Kantor Cabang': { count: officeReviewCount, tone: 'review' },
    }
    const attention = attentionByLabel[label]
    return attention?.count > 0 ? attention : null
  }

  useEffect(() => {
    if (location.pathname.startsWith('/surat/monitoring') && user?.id) {
      const t = setTimeout(async () => {
        await supabase
          .from('surat_registrasi')
          .update({ creator_seen_at: new Date().toISOString() })
          .eq('created_by', user.id)
          .eq('status', 'DONE')
        refetchAttention()
      }, 800)
      return () => clearTimeout(t)
    }
  }, [location.pathname, refetchAttention, user?.id])

  useEffect(() => {
    if (collapsed) return
    const path = location.pathname
    if (path.startsWith('/surat')) setIsSuratOpen(true)
    const masterDataPaths = ['/admin/users', '/admin/departments', '/admin/entities', '/admin/letter-types', '/admin/offices', '/admin/master-projects']
    if (masterDataPaths.some(p => path.startsWith(p))) setIsMasterOpen(true)
  }, [location.pathname, collapsed])

  useEffect(() => {
    const initSidebar = async () => {
      const data = await getCurrentUser()
      if (data) {
        setUser(data)
      }
    }
    initSidebar()

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<User> & { avatar_url?: string; photoUrl?: string }>).detail || {}
      setUser((previous) => previous
        ? {
            ...previous,
            ...detail,
            photoUrl: detail.photoUrl || detail.avatar_url || previous.photoUrl,
          }
        : previous
      )
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated)
    return () => window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated)
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    const toastId = toast.loading("Sedang keluar...")
    try {
      await supabase.removeAllChannels()
      await supabase.auth.signOut()
      localStorage.removeItem("isLoggedIn")
      localStorage.removeItem("sb-remember")
      queryClient.clear()
      toast.success("Berhasil keluar", { id: toastId })
      window.location.replace("/")
    } catch (error: any) {
      toast.error("Logout failed: " + error.message, { id: toastId })
      setIsLoggingOut(false)
    }
  }

  const handleNavClick = () => {
    if (isMobile && onNavigate) {
      onNavigate()
    }
  }

  const isDesktopCollapsed = !isMobile && collapsed

  const renderNavLink = (path: string, label: string, Icon: any, isSubItem = false) => {
    const attention = getNavAttention(label)
    return (
    <NavLink to={path} end={path === '/dashboard' || path === '/admin/users' || path.includes('registrasi')} className="group block text-decoration-none" onClick={handleNavClick}>
      {({ isActive }) => (
        <motion.div
          className={cn(
            "relative w-full flex items-center gap-3 py-2.5 rounded-md transition-all duration-150",
            isDesktopCollapsed
              ? "justify-center px-0"
              : isSubItem
                ? "pl-9 pr-3"
                : "px-3",
            isActive
              ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
            attention && 'sidebar-attention-row',
            attention && attentionToneClasses[attention.tone].row,
          )}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative shrink-0">
            <Icon className={cn(isSubItem ? "w-4 h-4" : "w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {!isMobile && collapsed && attention && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3 z-10">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", attentionToneClasses[attention.tone].dot)} />
                <span className={cn("sidebar-attention-badge relative inline-flex h-3 w-3 rounded-full border-2 border-sidebar", attentionToneClasses[attention.tone].dot)} />
              </span>
            )}
          </div>
          {(isMobile || !collapsed) && (
            <div className="flex items-center justify-between w-full overflow-hidden min-w-0">
              <span className={cn("truncate font-medium", isSubItem ? "text-[13px]" : "text-sm")}>{label}</span>
              {attention && <SidebarCountBadge count={attention.count} tone={attention.tone} />}
            </div>
          )}
        </motion.div>
      )}
    </NavLink>
    )
  }

  // Mobile Header in sidebar - TANPA TOMBOL X (sudah ada di Sheet)
  const MobileHeader = () => (
    <div className="flex items-center justify-between border-b border-sidebar-border px-4 py-4">
      <div className="flex items-center gap-3">
        <img
          src="/marison-sigap-logo-v2.png"
          alt="Logo Marison"
          className="w-10 h-10 object-contain shrink-0"
        />
        <div>
          <h1 className="text-sm font-semibold leading-none tracking-tight text-foreground">Marison - SIGAP</h1>
        </div>
      </div>
      {/* Tidak ada tombol X disini karena sudah otomatis dari SheetPrimitive.Close */}
    </div>
  )

  const sidebarContent = (
    <>
      {/* Desktop header */}
      {!isMobile && (
        <div
          className={cn(
            "h-16 border-b border-sidebar-border shrink-0 relative",
            collapsed
              ? "flex items-center justify-center px-2"
              : "flex items-center justify-between px-4"
          )}
        >
          <div className={cn("flex items-center overflow-hidden min-w-0", collapsed ? "gap-0" : "gap-3")}>
            <img
              src="/marison-sigap-logo-v2.png"
              alt="Logo Marison"
              className={cn("object-contain shrink-0", collapsed ? "w-8 h-8" : "w-9 h-9")}
            />
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="truncate min-w-0">
                <h1 className="text-xs font-semibold leading-none tracking-tight text-foreground">Marison - SIGAP</h1>
              </motion.div>
            )}
          </div>

          <button
            onClick={onToggle}
            className="absolute -right-3 top-1/2 z-20 flex h-9 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Buka sidebar' : 'Minimize sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Mobile header */}
      {isMobile && <MobileHeader />}

      <nav className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 py-4">
        {/* Main Navigation */}
        <div className="space-y-1">
          {renderNavLink('/dashboard', 'Dashboard', LayoutDashboard)}
          {renderNavLink('/calendar', 'Kalender', Calendar)}
          {renderNavLink('/agenda', 'Agenda', ClipboardList)}
        </div>

        {/* Surat Section */}
        <div className="space-y-1">
          {(isMobile || !collapsed) && (
            <p className="mb-2 px-3 text-[11px] font-semibold text-muted-foreground/70">
              Korespondensi
            </p>
          )}
          <div className="space-y-1">
            <button
              onClick={() => setIsSuratOpen(!isSuratOpen)}
              className={cn(
                "group relative flex w-full items-center rounded-md border border-transparent py-2.5 transition-colors",
                isDesktopCollapsed ? "justify-center px-0" : "justify-between px-4",
                location.pathname.includes('/surat')
                  ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]"
                  : "text-muted-foreground hover:bg-accent",
                suratAttentionCount > 0 && 'sidebar-attention-row',
                suratAttentionCount > 0 && attentionToneClasses.task.row,
              )}
            >
              <div className={cn("flex items-center min-w-0", isDesktopCollapsed ? "gap-0" : "gap-3")}>
                <div className="relative shrink-0">
                  <Mail className="w-5 h-5" />
                  {!isMobile && collapsed && suratAttentionCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", attentionToneClasses.task.dot)} />
                      <span className={cn("sidebar-attention-badge relative inline-flex h-3 w-3 rounded-full border-2 border-sidebar", attentionToneClasses.task.dot)} />
                    </span>
                  )}
                </div>
                {(isMobile || !collapsed) && <span className="truncate text-sm font-medium">Layanan Surat</span>}
              </div>
              {(isMobile || !collapsed) && (
                <div className="flex items-center gap-2 shrink-0">
                  {suratAttentionCount > 0 && <SidebarCountBadge count={suratAttentionCount} tone="task" />}
                  <ChevronDown className={cn("w-4 h-4 transition-transform duration-300 shrink-0", isSuratOpen && "rotate-180")} />
                </div>
              )}
            </button>
            <AnimatePresence>
              {(isSuratOpen) && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }} 
                  animate={{ height: 'auto', opacity: 1 }} 
                  exit={{ height: 0, opacity: 0 }} 
                  className="overflow-hidden space-y-0.5"
                >
                  {renderNavLink('/surat/registrasi', 'Buat Baru', FileSignature, true)}
                  {renderNavLink('/surat/inbox', 'Persetujuan', Inbox, true)}
                  {canAccessRecommendation && renderNavLink('/surat/rekomendasi', 'Rekomendasi', FileCheck2, true)}
                  {renderNavLink('/surat/tindak-lanjut', 'Tindak Lanjut', ClipboardCheck, true)}
                  {renderNavLink('/surat/monitoring', 'Status Pengajuan', SearchCheck, true)}
                  {renderNavLink('/surat/riwayat', 'Riwayat Terlibat', History, true)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Admin Section */}
        {isUserAdmin && (
          <div className="space-y-1">
            {(isMobile || !collapsed) && (
              <p className="mb-2 px-3 text-[11px] font-semibold text-muted-foreground/70">
                Administrasi
              </p>
            )}
            <div className="space-y-1">
              <button
                onClick={() => setIsMasterOpen(!isMasterOpen)}
                className={cn(
                  "group flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2.5 transition-colors",
                  isMasterOpen ? "bg-primary/10 text-primary shadow-[inset_3px_0_0_hsl(var(--primary))]" : "text-muted-foreground hover:bg-accent",
                  masterReviewCount > 0 && 'sidebar-attention-row',
                  masterReviewCount > 0 && attentionToneClasses.review.row,
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <Database className="w-5 h-5" />
                    {!isMobile && collapsed && masterReviewCount > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3">
                        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-50", attentionToneClasses.review.dot)} />
                        <span className={cn("sidebar-attention-badge relative inline-flex h-3 w-3 rounded-full border-2 border-sidebar", attentionToneClasses.review.dot)} />
                      </span>
                    )}
                  </div>
                  {(isMobile || !collapsed) && <span className="truncate text-sm font-medium">Master Data</span>}
                </div>
                {(isMobile || !collapsed) && (
                  <div className="flex items-center gap-2">
                    {masterReviewCount > 0 && (
                      <SidebarCountBadge count={masterReviewCount} tone="review" />
                    )}
                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-300 shrink-0", isMasterOpen && "rotate-180")} />
                  </div>
                )}
              </button>
              <AnimatePresence>
                {(isMasterOpen) && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }} 
                    className="overflow-hidden space-y-0.5"
                  >
                    {renderNavLink('/admin/users', 'User Organization', Users, true)}
                    {renderNavLink('/admin/users/hierarchy', 'Hirarki Organisasi', Network, true)}
                    {renderNavLink('/admin/departments', 'Master Departemen', Building2, true)}
                    {renderNavLink('/admin/entities', 'Master Entitas', Building, true)}
                    {renderNavLink('/admin/letter-types', 'Master Jenis Surat', Tag, true)}
                    {renderNavLink('/admin/offices', 'Master Kantor Cabang', MapPin, true)}
                    {renderNavLink('/admin/master-projects', 'Master Proyek', Briefcase, true)}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {renderNavLink('/admin/configuration', 'Konfigurasi', SlidersHorizontal)}
            {renderNavLink('/admin/monitoring', 'Monitoring Admin', Monitor)}
            {renderNavLink('/admin/kpi-departments', 'SLA Departemen', BarChart3)}
            {renderNavLink('/audit-logs', 'Audit Log', Activity)}
          </div>
        )}

        {/* Settings */}
        <div className="space-y-1 pt-2">
          {renderNavLink('/docs', 'Dokumentasi', BookOpenText)}
          {renderNavLink('/settings', 'Pengaturan', Settings)}
        </div>
      </nav>

      {/* Footer / User Info */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border bg-sidebar-accent/10 p-3">
        {(isMobile || !collapsed) && user && (
          <div className="mb-3 flex min-w-0 items-center gap-3 rounded-lg border border-border/60 bg-background/70 p-3">
            <Avatar className="h-10 w-10 shrink-0 rounded-md shadow-sm ring-1 ring-border">
              <AvatarImage src={user.photoUrl || undefined} alt="Profile" />
              <AvatarFallback className="rounded-md bg-primary/10 text-sm font-semibold text-primary">
                {(user.fullName || 'U').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{user.fullName}</p>
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
                <p className="truncate text-xs font-medium text-muted-foreground">{user.jobTitle || 'Member'}</p>
              </div>
            </div>
          </div>
        )}
        <button 
          onClick={handleLogout} 
          disabled={isLoggingOut} 
          className={cn(
            "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600",
            !isMobile && collapsed && "justify-center px-2"
          )}
        >
          {isLoggingOut ? (
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          ) : (
            <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform shrink-0" />
          )}
          {(isMobile || !collapsed) && <span className="text-sm font-medium">Keluar</span>}
        </button>
      </div>
    </>
  )

  // Mobile sidebar (full content)
  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-sidebar">
        {sidebarContent}
      </div>
    )
  }

  // Desktop sidebar
  return (
    <motion.aside 
      initial={false} 
      animate={{ width: collapsed ? 72 : 260 }} 
      transition={{ duration: 0.2, ease: "easeInOut" }} 
      className="sticky top-0 z-50 flex h-screen shrink-0 flex-col overflow-visible border-r border-sidebar-border bg-sidebar"
    >
      {sidebarContent}
    </motion.aside>
  )
}
