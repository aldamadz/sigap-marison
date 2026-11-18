import { Bell, Plus, FileCheck, Inbox, Trash2, AlertCircle, MessageSquare, Menu, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { formatDistanceToNow } from 'date-fns'
import { id as localeID } from 'date-fns/locale'
import { useNavigate } from 'react-router'
import { notificationService } from '@/services/notification.service'
import { notificationOpenPath } from '@/lib/notification-target'
import { BrowserNotificationButton } from '@/components/settings/BrowserNotificationButton'
import { useAttention } from '@/providers/AttentionProvider'
import {
  getWorkCalendarNotificationMeta,
  readWorkCalendarNotificationCategory,
  type WorkCalendarNotificationCategory,
} from '@/features/work-calendar'

interface Notification {
  id: string
  title: string
  description: string
  type: 'incoming' | 'stamped' | 'completed' | 'rejected' | 'feedback'
  time: Date
  isRead: boolean
  url?: string
  dbId?: string
  /** Kategori CAL-03 F7; diisi hanya untuk notifikasi Kalender Kerja. */
  calendarCategory?: WorkCalendarNotificationCategory
}

const mapDbNotification = (row: any): Notification => {
  const typeMap: Record<string, Notification['type']> = {
    success: 'completed',
    info: 'incoming',
    warning: 'rejected',
    error: 'rejected',
    feedback: 'feedback',
  }

  const calendarCategory = readWorkCalendarNotificationCategory(row.data)

  return {
    id: `db-${row.id}`,
    dbId: row.id,
    title: row.title,
    description: row.message,
    type: typeMap[row.type] ?? 'completed',
    time: new Date(row.created_at),
    isRead: !!row.is_read,
    url: notificationOpenPath(row.id),
    ...(calendarCategory ? { calendarCategory } : {}),
  }
}

/** Badge angka pada ikon lonceng; `99+` menjaga lebar tetap stabil. */
const formatUnreadBadge = (count: number): string => (count > 99 ? '99+' : String(count))

/**
 * Ikon notifikasi. Notifikasi Kalender Kerja (CAL-03 F7) memakai ikon per
 * kategori; notifikasi lain tetap memakai ikon per tipe lama.
 */
const renderNotificationIcon = (n: Notification) => {
  if (n.calendarCategory) {
    const meta = getWorkCalendarNotificationMeta(n.calendarCategory)
    return (
      <div className={cn('p-2 rounded-lg h-fit shrink-0', meta.iconClassName)}>
        <meta.icon className="w-4 h-4" />
      </div>
    )
  }

  return (
    <div className={cn(
      'p-2 rounded-lg h-fit shrink-0',
      n.type === 'incoming'  ? 'bg-blue-500/10 text-blue-600'    :
      n.type === 'rejected'  ? 'bg-red-500/10 text-red-600'      :
      n.type === 'stamped'   ? 'bg-amber-500/10 text-amber-600'  :
      n.type === 'feedback'  ? 'bg-purple-500/10 text-purple-600':
                                    'bg-emerald-500/10 text-emerald-600'
    )}>
      {n.type === 'incoming'  && <Inbox       className="w-4 h-4" />}
      {n.type === 'rejected'  && <AlertCircle className="w-4 h-4" />}
      {n.type === 'stamped'   && <Clock       className="w-4 h-4" />}
      {n.type === 'feedback'  && <MessageSquare className="w-4 h-4" />}
      {n.type === 'completed' && <FileCheck   className="w-4 h-4" />}
    </div>
  )
}

interface HeaderProps {
  onNewAgenda?: () => void
  onMenuClick?: () => void
  showMenuButton?: boolean
}

export const Header = ({ onNewAgenda, onMenuClick, showMenuButton = false }: HeaderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { state: attentionState, eventVersion, refetch: refetchAttention } = useAttention()
  const unreadCount = attentionState.unreadNotifications
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previousUnreadRef = useRef<number | null>(null)
  const navigate = useNavigate()
  const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleNotifClick = useCallback(async (n: Notification) => {
    setNotifications(prev =>
      prev.map(item => item.id === n.id ? { ...item, isRead: true } : item)
    )

    if (n.dbId) {
      await notificationService.markAsRead(n.dbId)
      await refetchAttention()
    }

    if (n.url) {
      navigate(n.url)
      setNotificationsOpen(false)
    }
  }, [navigate, refetchAttention])

  useEffect(() => {
    localStorage.removeItem('surat_notifs')
    const audio = new Audio('/sounds/notif.WAV')
    audio.preload = 'auto'
    audio.volume = 0.6
    audioRef.current = audio
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      // CAL-03 F7: generator idempotent dijalankan on-demand sebelum memuat
      // daftar, jadi notifikasi tenggat/eskalasi/pengingat selalu terbaru.
      await notificationService.generateWorkCalendarNotifications().catch(() => 0)
      const rows = await notificationService.getMyNotifications()
      const mapped = rows.map(mapDbNotification)
      const nextUnread = mapped.filter((item) => !item.isRead).length
      const previousUnread = previousUnreadRef.current
      if (previousUnread !== null && nextUnread > previousUnread && audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }
      previousUnreadRef.current = nextUnread
      setNotifications(mapped)
    } catch (err) {
      console.error('Load database notifications failed:', err)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [eventVersion, loadNotifications])

  const handleMarkAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    await notificationService.markAllAsRead()
    previousUnreadRef.current = 0
    await refetchAttention()
  }, [refetchAttention])

  const handleClearAll = useCallback(async () => {
    setNotifications([])
    await notificationService.deleteAllMyNotifications()
    previousUnreadRef.current = 0
    await refetchAttention()
  }, [refetchAttention])

  const notificationTrigger = <Button variant="ghost" size="icon" className="relative h-10 w-10 rounded-md"
    aria-label={`Buka notifikasi, ${unreadCount} belum dibaca`}>
    <Bell className={cn('h-5 w-5', unreadCount ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
    {unreadCount > 0 && <span data-testid="notification-unread-badge" className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-0.5 text-[10px] font-semibold leading-none text-destructive-foreground">
      {formatUnreadBadge(unreadCount)}
    </span>}
  </Button>

  const notificationTitle = 'Notifikasi'
  const notificationPanel = <>
    <div className={cn('flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3', isMobileView && 'pr-12')}>
      <div className="min-w-0">
        {isMobileView ? <SheetTitle className="text-base font-semibold">{notificationTitle}</SheetTitle>
          : <h2 className="text-base font-semibold">{notificationTitle}</h2>}
        {isMobileView ? <SheetDescription className="text-xs">{unreadCount} belum dibaca</SheetDescription>
          : <p className="text-xs text-muted-foreground">{unreadCount} belum dibaca</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Tandai semua sudah dibaca" title="Tandai semua sudah dibaca"
          disabled={unreadCount === 0} onClick={handleMarkAllRead}><FileCheck className="h-4 w-4" aria-hidden="true" /></Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label="Hapus semua notifikasi" title="Hapus semua notifikasi"
          disabled={!notifications.length} onClick={handleClearAll}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
    </div>
    <div className="shrink-0 border-b px-4 py-2.5"><BrowserNotificationButton /></div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {notifications.length === 0 ? <div className="grid justify-items-center gap-2 px-4 py-10 text-sm text-muted-foreground">
        <Inbox className="h-7 w-7" aria-hidden="true" />Tidak ada notifikasi
      </div> : <ul className="divide-y divide-border">
        {notifications.map(n => <li key={n.id}>
          <button type="button" onClick={() => { void handleNotifClick(n); }} className={cn(
            'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
            !n.isRead && 'bg-primary/5'
          )}>
            {renderNotificationIcon(n)}
            <div className="min-w-0 flex-1">
              <p className={cn('break-words text-sm leading-snug', !n.isRead ? 'font-semibold' : 'font-medium')}>{n.title}</p>
              <p className="mt-0.5 line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground">{n.description}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{formatDistanceToNow(n.time, { addSuffix: true, locale: localeID })}</p>
            </div>
            {!n.isRead && <><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" /><span className="sr-only">Belum dibaca</span></>}
          </button>
        </li>)}
      </ul>}
    </div>
  </>

  return (
    <header className="safe-area-top sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/92 px-3 backdrop-blur-md sm:px-5 lg:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="shrink-0 lg:hidden"
            aria-label="Buka navigasi"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Simple Logo/Brand for now - title is in AppLayout */}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* New Request Button - Desktop only */}
        {onNewAgenda && (
          <Button
            onClick={onNewAgenda}
            size="sm"
            className="hidden gap-2 sm:flex"
          >
            <Plus className="w-4 h-4" />
            <span>Permintaan Baru</span>
          </Button>
        )}

        {isMobileView ? (
          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <SheetTrigger asChild>{notificationTrigger}</SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col gap-0 border-border bg-background p-0 sm:w-[380px]">
              {notificationPanel}
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>{notificationTrigger}</PopoverTrigger>
            <PopoverContent className="flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border-border p-0 shadow-[var(--shadow-elevated)]" align="end">
              {notificationPanel}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </header>
  )
}
