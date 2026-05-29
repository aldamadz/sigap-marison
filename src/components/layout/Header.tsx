import { Bell, Plus, FileCheck, Inbox, Trash2, AlertCircle, MessageSquare, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatDistanceToNow } from 'date-fns'
import { id as localeID } from 'date-fns/locale'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationService } from '@/services/notification.service'

interface Notification {
  id: string
  title: string
  description: string
  type: 'incoming' | 'stamped' | 'completed' | 'rejected' | 'feedback'
  time: Date
  isRead: boolean
  url?: string
  dbId?: string
}

const mapDbNotification = (row: any): Notification => {
  const typeMap: Record<string, Notification['type']> = {
    success: 'completed',
    info: 'incoming',
    warning: 'rejected',
    error: 'rejected',
    feedback: 'feedback',
  }

  return {
    id: `db-${row.id}`,
    dbId: row.id,
    title: row.title,
    description: row.message,
    type: typeMap[row.type] ?? 'completed',
    time: new Date(row.created_at),
    isRead: !!row.is_read,
    url: row.link || '/surat/monitoring',
  }
}

interface HeaderProps {
  onNewAgenda?: () => void
  onMenuClick?: () => void
  showMenuButton?: boolean
}

export const Header = ({ onNewAgenda, onMenuClick, showMenuButton = false }: HeaderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unreadCount = notifications.filter(n => !n.isRead).length
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 640)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const addNotif = useCallback((n: Notification) => {
    setNotifications(prev => {
      if (prev.find(item => item.id === n.id)) return prev

      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(() => {})
      }

      return [n, ...prev].slice(0, 50)
    })
  }, [])

  const handleNotifClick = useCallback(async (n: Notification) => {
    setNotifications(prev =>
      prev.map(item => item.id === n.id ? { ...item, isRead: true } : item)
    )

    if (n.dbId) {
      await notificationService.markAsRead(n.dbId)
    }

    if (n.url) {
      navigate(n.url)
      setNotificationsOpen(false)
    }
  }, [navigate])

  useEffect(() => {
    localStorage.removeItem('surat_notifs')
    const audio = new Audio('/sounds/notif.WAV')
    audio.preload = 'auto'
    audio.volume = 0.6
    audioRef.current = audio
  }, [])

  useEffect(() => {
    let notifChannel: any = null
    let activeUserId: string | null = null

    const removeNotifChannel = () => {
      if (notifChannel) {
        supabase.removeChannel(notifChannel)
        notifChannel = null
      }
    }

    const loadNotificationsForUser = async (userId?: string) => {
      removeNotifChannel()
      activeUserId = userId ?? null

      if (!userId) {
        setNotifications([])
        return
      }

      setNotifications([])
      notificationService
        .getMyNotifications()
        .then((rows) => {
          if (activeUserId === userId) setNotifications(rows.map(mapDbNotification))
        })
        .catch((err) => console.error('Load database notifications failed:', err))

      notifChannel = supabase
        .channel(`db-notifs-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (activeUserId !== userId) return
            const row = payload.new as any
            if (!row) return

            addNotif(mapDbNotification(row))

            queryClient.invalidateQueries({ queryKey: ['surat-list'] })
            queryClient.invalidateQueries({ queryKey: ['pic-inbox'] })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (activeUserId !== userId) return
            const row = payload.new as any
            if (!row) return

            setNotifications((prev) =>
              prev.map((item) =>
                item.dbId === row.id ? mapDbNotification(row) : item
              )
            )
          }
        )
        .subscribe()
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadNotificationsForUser(session?.user?.id)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      loadNotificationsForUser(session?.user?.id)
    })

    return () => {
      authListener.subscription.unsubscribe()
      removeNotifChannel()
    }
  }, [addNotif, queryClient])

  const handleMarkAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await notificationService.markAllAsRead()
    }
  }, [])

  const handleClearAll = useCallback(async () => {
    setNotifications([])
    await notificationService.deleteAllMyNotifications()
  }, [])

  return (
    <header className="h-14 sm:h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 lg:px-6 shrink-0 safe-area-top">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden shrink-0"
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
            onClick={onAgenda}
            size="sm"
            className="gap-2 hidden sm:flex"
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
                className="relative rounded-full h-9 w-9"
              >
                <Bell className={cn('w-5 h-5', unreadCount > 0 ? 'text-primary' : 'text-muted-foreground')} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-full sm:w-[380px] p-0 bg-background border-border flex flex-col"
            >
              <SheetHeader className="px-4 py-3 border-b shrink-0">
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

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight mb-1 truncate">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-2">
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
                className="relative rounded-full h-9 w-9 lg:h-10 lg:w-10"
              >
                <Bell className={cn('w-5 h-5', unreadCount > 0 ? 'text-primary' : 'text-muted-foreground')} />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full border-2 border-background" />
                )}
              </Button>
            </PopoverTrigger>

            <PopoverContent
              className="w-80 p-0 mr-4 rounded-xl shadow-2xl border-border overflow-hidden"
              align="end"
            >
              <div className="p-3 bg-muted/40 border-b flex justify-between items-center">
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

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight mb-1 truncate">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-xs text-muted-foreground/50 mt-2">
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