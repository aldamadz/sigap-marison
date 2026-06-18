import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, ClipboardList, Users, Activity, Settings,
  ChevronLeft, ChevronRight, Building2, LogOut, ShieldCheck, Loader2, FileSignature,
  Inbox, SearchCheck, ChevronDown, Mail, Database, Building, Tag, MapPin,
  GitMerge, Monitor, Briefcase, History, BarChart3, Network,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { supabase } from "@/lib/supabase"
import { getCurrentUser } from '@/services/user-ui.service'
import { suratService } from '@/services/surat.service'
import { useQueryClient } from '@tanstack/react-query'
import type { User } from '@/types/agenda'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  isMobile?: boolean
  onNavigate?: () => void
}

export const Sidebar = ({ collapsed, onToggle, isMobile = false, onNavigate }: SidebarProps) => {
  const location = useLocation()
  const queryClient = useQueryClient()
  
  const [user, setUser] = useState<User | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [inboxCount, setInboxCount] = useState<number>(0)
  const [isSuratOpen, setIsSuratOpen] = useState(false)
  const [isMasterOpen, setIsMasterOpen] = useState(false)

  const [monitoringBadge, setMonitoringBadge] = useState(0)
  const isUserAdmin = user?.role === 'admin'

  useEffect(() => {
    if (location.pathname.startsWith('/surat/monitoring') && user?.id) {
      const t = setTimeout(async () => {
        await supabase
          .from('surat_registrasi')
          .update({ creator_seen_at: new Date().toISOString() })
          .eq('created_by', user.id)
          .eq('status', 'DONE')
        setMonitoringBadge(0)
      }, 800)
      return () => clearTimeout(t)
    }
  }, [location.pathname, user?.id])

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
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const fetchInboxCount = async () => {
      try {
        const rows = await suratService.getMyInbox(user.id)
        setInboxCount(rows.length)
      } catch (error) {
        console.error('Failed to load sidebar inbox count:', error)
        setInboxCount(0)
      }
    }
    fetchInboxCount()
    const channel = supabase.channel(`sidebar-realtime:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_signatures' }, () => fetchInboxCount())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'surat_registrasi' }, () => fetchInboxCount())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    const fetchMonitoringBadge = async () => {
      const { data: surats } = await supabase
        .from('surat_registrasi')
        .select('id, updated_at, creator_seen_at')
        .eq('created_by', user.id)
        .eq('status', 'DONE')
      const unseen = (surats ?? []).filter((s: any) =>
        !s.creator_seen_at || new Date(s.updated_at) > new Date(s.creator_seen_at)
      )
      setMonitoringBadge(unseen.length)
    }
    fetchMonitoringBadge()
    const ch = supabase.channel(`sidebar-monitoring-badge:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'surat_registrasi' }, fetchMonitoringBadge)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.id])

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

  const renderNavLink = (path: string, label: string, Icon: any, isSubItem = false) => (
    <NavLink to={path} end={path === '/dashboard' || path === '/admin/users' || path.includes('registrasi')} className="group block text-decoration-none" onClick={handleNavClick}>
      {({ isActive }) => (
        <motion.div
          className={cn(
            "relative w-full flex items-center gap-3 py-2.5 rounded-lg transition-all",
            isDesktopCollapsed
              ? "justify-center px-0"
              : isSubItem
                ? "pl-10 pr-4"
                : "px-4",
            isActive
              ? "bg-primary/10 text-primary border-l-2 border-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
          whileTap={{ scale: 0.98 }}
        >
          <div className="relative shrink-0">
            <Icon className={cn(isSubItem ? "w-4 h-4" : "w-5 h-5", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {!isMobile && collapsed && label === 'Persetujuan' && inboxCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3 z-10">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-sidebar"></span>
              </span>
            )}
          </div>
          {(isMobile || !collapsed) && (
            <div className="flex items-center justify-between w-full overflow-hidden min-w-0">
              <span className={cn("font-medium truncate", isSubItem ? "text-sm" : "text-sm")}>{label}</span>
              {label === 'Persetujuan' && inboxCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
              {label === 'Status Pengajuan' && monitoringBadge > 0 && (
                <span className="ml-2 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full shrink-0">
                  {monitoringBadge > 99 ? '99+' : monitoringBadge}
                </span>
              )}
            </div>
          )}
        </motion.div>
      )}
    </NavLink>
  )

  // Mobile Header in sidebar - TANPA TOMBOL X (sudah ada di Sheet)
  const MobileHeader = () => (
    <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
      <div className="flex items-center gap-3">
        <img
          src="/marison-sigap-logo-v2.png"
          alt="Logo Marison"
          className="w-10 h-10 object-contain shrink-0"
        />
        <div>
          <h1 className="font-black text-foreground leading-none text-sm tracking-tight">Marison - SIGAP</h1>
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
                <h1 className="font-black text-foreground leading-none text-xs tracking-tight">Marison - SIGAP</h1>
              </motion.div>
            )}
          </div>

          <button
            onClick={onToggle}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-6 h-10 rounded-full border border-sidebar-border bg-sidebar text-muted-foreground hover:text-foreground hover:border-primary/40 flex items-center justify-center shadow-md transition-all"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Buka sidebar' : 'Minimize sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Mobile header */}
      {isMobile && <MobileHeader />}

      <nav className="flex-1 py-4 px-3 space-y-6 overflow-y-auto overflow-x-hidden">
        {/* Main Navigation */}
        <div className="space-y-1">
          {renderNavLink('/dashboard', 'Dashboard', LayoutDashboard)}
          {renderNavLink('/calendar', 'Calendar', Calendar)}
          {renderNavLink('/agenda', 'Agendas', ClipboardList)}
        </div>

        {/* Surat Section */}
        <div className="space-y-1">
          {(isMobile || !collapsed) && (
            <p className="px-4 text-xs font-medium text-muted-foreground/60 mb-2">
              Korespondensi
            </p>
          )}
          <div className="space-y-1">
            <button
              onClick={() => setIsSuratOpen(!isSuratOpen)}
              className={cn(
                "w-full flex items-center py-2.5 rounded-lg transition-colors group relative",
                isDesktopCollapsed ? "justify-center px-0" : "justify-between px-4",
                location.pathname.includes('/surat')
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              <div className={cn("flex items-center min-w-0", isDesktopCollapsed ? "gap-0" : "gap-3")}>
                <div className="relative shrink-0">
                  <Mail className="w-5 h-5" />
                  {!isMobile && collapsed && inboxCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </div>
                {(isMobile || !collapsed) && <span className="text-sm font-medium truncate">Layanan Surat</span>}
              </div>
              {(isMobile || !collapsed) && (
                <div className="flex items-center gap-2 shrink-0">
                  {inboxCount > 0 && !isSuratOpen && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
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
              <p className="px-4 text-xs font-medium text-muted-foreground/60 mb-2">
                Administration
              </p>
            )}
            <div className="space-y-1">
              <button
                onClick={() => setIsMasterOpen(!isMasterOpen)}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-2.5 rounded-lg transition-colors group",
                  isMasterOpen ? "text-primary bg-primary/5" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Database className="w-5 h-5 shrink-0" />
                  {(isMobile || !collapsed) && <span className="text-sm font-medium truncate">Master Data</span>}
                </div>
                {(isMobile || !collapsed) && (
                  <ChevronDown className={cn("w-4 h-4 transition-transform duration-300 shrink-0", isMasterOpen && "rotate-180")} />
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
            {renderNavLink('/admin/configuration', 'Configuration', SlidersHorizontal)}
            {renderNavLink('/admin/monitoring', 'All Status Monitoring', Monitor)}
            {renderNavLink('/admin/kpi-departments', 'SLA Departemen', BarChart3)}
            {renderNavLink('/audit-logs', 'Audit Log', Activity)}
          </div>
        )}

        {/* Settings */}
        <div className="pt-2">
          {renderNavLink('/settings', 'Settings', Settings)}
        </div>
      </nav>

      {/* Footer / User Info */}
      <div className="p-4 bg-sidebar-accent/10 border-t border-sidebar-border mt-auto shrink-0">
        {(isMobile || !collapsed) && user && (
          <div className="mb-3 p-3 rounded-xl bg-background/50 border border-border/50 flex items-center gap-3 min-w-0">
            <img 
              src={user.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.fullName || 'U')}&background=0D9488&color=fff`} 
              className="w-10 h-10 rounded-lg object-cover shadow-sm ring-1 ring-border shrink-0" 
              alt="Profile" 
            />
            <div className="flex-1 overflow-hidden min-w-0">
              <p className="text-sm font-black truncate text-foreground uppercase tracking-tighter">{user.fullName}</p>
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground truncate uppercase font-bold">{user.jobTitle || 'Member'}</p>
              </div>
            </div>
          </div>
        )}
        <button 
          onClick={handleLogout} 
          disabled={isLoggingOut} 
          className={cn(
            "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors group",
            !isMobile && collapsed && "justify-center px-2"
          )}
        >
          {isLoggingOut ? (
            <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          ) : (
            <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform shrink-0" />
          )}
          {(isMobile || !collapsed) && <span className="text-sm font-bold uppercase tracking-widest">Sign Out</span>}
        </button>
      </div>
    </>
  )

  // Mobile sidebar (full content)
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-sidebar">
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
      className="sticky top-0 h-screen bg-sidebar border-r border-sidebar-border z-50 flex flex-col shrink-0 overflow-visible"
    >
      {sidebarContent}
    </motion.aside>
  )
}
