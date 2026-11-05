import { Bell, Plus, FileCheck, Inbox, Trash2, AlertCircle, MessageSquare, Menu, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
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

        {/* Notifications */}
        {isMobileView ? (
          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-10 w-10 rounded-md"
                aria-label={`Buka notifikasi, ${unreadCount} belum dibaca`}
              >
                <Bell className={cn('w-5 h-5', unreadCount > 0 ? 'text-primary' : 'text-muted-foreground')} />
                {unreadCount > 0 && (
                  <span
                    data-testid="notification-unread-badge"
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                  >
                    {formatUnreadBadge(unreadCount)}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="flex w-full flex-col border-border bg-background p-0 sm:w-[380px]"
            >
              <SheetHeader className="shrink-0 border-b px-4 py-3">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-sm font-semibold">
                    Notifikasi ({unreadCount})
                  </SheetTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleMarkAllRead}
                    >
                      <FileCheck className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={handleClearAll}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>
              <div className="border-b px-4 py-3"><BrowserNotificationButton /></div>

              <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Inbox className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Tidak ada notifikasi</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={cn(
                        'p-4 border-b border-border/40 flex gap-3 cursor-pointer active:bg-muted/50',
                        !n.isRead ? 'bg-primary/[0.03]' : 'opacity-60'
                      )}
                    >
                      {renderNotificationIcon(n)}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight mb-1 truncate">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(n.time, { addSuffix: true, locale: localeID })}
                        </p>
                      </div>

                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                    className="relative h-10 w-10 rounded-md"
                    aria-label={`Buka notifikasi, ${unreadCount} belum dibaca`}
              >
                <Bell className={cn('w-5 h-5', unreadCount > 0 ? 'text-primary' : 'text-muted-foreground')} />
                {unreadCount > 0 && (
                  <span
                    data-testid="notification-unread-badge"
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-destructive px-0.5 text-[10px] font-semibold leading-none text-destructive-foreground"
                  >
                    {formatUnreadBadge(unreadCount)}
                  </span>
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent
              className="mr-4 w-80 overflow-hidden rounded-lg border-border p-0 shadow-[var(--shadow-elevated)]"
              align="end"
            >
              <div className="flex items-center justify-between border-b bg-muted/40 p-3">
                <span className="text-sm font-medium">
                  Notifikasi ({unreadCount})
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleMarkAllRead}
                  >
                    <FileCheck className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={handleClearAll}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                <div className="border-b p-3"><BrowserNotificationButton /></div>
                {notifications.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center gap-3">
                    <Inbox className="w-10 h-10 text-muted-foreground/20" />
                    <p className="text-sm text-muted-foreground">Tidak ada notifikasi</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => handleNotifClick(n)}
                      className={cn(
                        'p-3 border-b border-border/40 flex gap-3 cursor-pointer transition-all hover:bg-muted/30',
                        !n.isRead ? 'bg-primary/[0.03]' : 'opacity-60'
                      )}
                    >
                      {renderNotificationIcon(n)}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight mb-1 truncate">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDistanceToNow(n.time, { addSuffix: true, locale: localeID })}
                        </p>
                      </div>

                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </header>
  )
}
