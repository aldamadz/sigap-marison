import { Bell, Plus, Clock, FileCheck, Inbox, CheckCheck, Trash2, AlertCircle, MessageSquare, Menu } from 'lucide-react'
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

interface HeaderProps {
  title: string
  subtitle?: string
  onNewAgenda?: () => void
  onMenuClick?: () => void
  showMenuButton?: boolean
}

export const Header = ({ title, subtitle, onNewAgenda, onMenuClick, showMenuButton = false }: HeaderProps) => {
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
    // Mark as read locally first
    setNotifications(prev =>
      prev.map(item => item.id === n.id ? { ...item, isRead: true } : item)
    )
    
    // Don't close sheet immediately on mobile - let user decide
    // setNotificationsOpen(false) - Removed this to prevent auto-close

    if (n.dbId) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', n.dbId)
    }

    if (n.url) {
      navigate(n.url)
      // Close after navigation on mobile
      setNotificationsOpen(false)
    }
  }, [navigate])

  useEffect(() => {
    const saved = localStorage.getItem('surat_notifs')
    if (saved) {
      try {
        const parsed = JSON.parse(saved).map((n: any) => ({ ...n, time: new Date(n.time) }))
        setNotifications(parsed)
      } catch (e) { console.error('Load notif fail', e) }
    }

    const audio = new Audio('/sounds/notif.WAV')
    audio.preload = 'auto'
    audio.volume = 0.6
    audioRef.current = audio
  }, [])

  useEffect(() => {
    localStorage.setItem('surat_notifs', JSON.stringify(notifications))
  }, [notifications])

  useEffect(() => {
    let suratChannel: any
    let notifChannel: any

    const initRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user
      if (!currentUser) return

      suratChannel = supabase
        .channel(`smart-notifs-${currentUser.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'surat_registrasi',
        }, async (payload) => {
          const newData = payload.new as any
          const oldData = payload.old as any
          if (!newData?.id) return

          try {
            const isNew = payload.eventType === 'INSERT'
            const isStepUpdate =
              payload.eventType === 'UPDATE' &&
              oldData &&
              newData.current_step !== oldData.current_step

            if (isNew || isStepUpdate) {
              if (isNew) await new Promise(r => setTimeout(r, 1200))

              const { data: myTurn } = await supabase
                .from('surat_signatures')
                .select('id, role_name')
                .eq('surat_id', newData.id)
                .eq('user_id', currentUser.id)
                .eq('step_order', Number(newData.current_step))
                .maybeSingle()

              if (myTurn) {
                addNotif({
                  id: `in-${newData.id}-${newData.current_step}`,
                  title: 'Permintaan Stamp Baru',
                  description: `Surat "${newData.judul_surat}" menunggu verifikasi Anda.`,
                  type: 'incoming',
                  time: new Date(),
                  isRead: false,
                  url: '/surat/inbox',
                })
                queryClient.invalidateQueries({ queryKey: ['surat-inbox'] })
              }
            }

            if (newData.created_by === currentUser.id && payload.eventType === 'UPDATE' && oldData) {
              if (newData.pic_feedback && newData.pic_feedback !== oldData.pic_feedback) {
                addNotif({
                  id: `fb-${newData.id}-${Date.now()}`,
                  title: 'Feedback PIC Baru',
                  description: `Catatan PIC: ${newData.pic_feedback}`,
                  type: 'feedback',
                  time: new Date(),
                  isRead: false,
                  url: '/surat/monitoring',
                })
              }

              if (newData.status === 'REJECTED' && oldData.status !== 'REJECTED') {
                addNotif({
                  id: `rej-${newData.id}-${Date.now()}`,
                  title: 'Dokumen Ditolak',
                  description: `Surat "${newData.judul_surat}" ditolak.`,
                  type: 'rejected',
                  time: new Date(),
                  isRead: false,
                  url: '/surat/monitoring',
                })
              }
              else if (
                Number(newData.current_step) > Number(oldData.current_step) &&
                newData.status !== 'DONE'
              ) {
                addNotif({
                  id: `step-${newData.id}-${newData.current_step}`,
                  title: 'Update Progres',
                  description: `Surat "${newData.judul_surat}" naik ke Step ${newData.current_step}.`,
                  type: 'stamped',
                  time: new Date(),
                  isRead: false,
                  url: '/surat/monitoring',
                })
              }

              queryClient.invalidateQueries({ queryKey: ['surat-list'] })
            }
          } catch (err) {
            console.error('Notif surat error:', err)
          }
        })
        .subscribe()

      notifChannel = supabase
        .channel(`db-notifs-${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`,
          },
          (payload) => {
            const row = payload.new as any
            if (!row) return

            const typeMap: Record<string, Notification['type']> = {
              success: 'completed',
              info:    'incoming',
              warning: 'rejected',
            }

            const action = (row.data?.action as string) ?? ''
            let url = '/surat/monitoring'
            if (action === 'chat_opened' || action === 'chat_closed') {
              const sid = row.data?.surat_id
              url = sid ? `/surat/pic/${sid}` : '/surat/monitoring'
            }

            addNotif({
              id:          `db-${row.id}`,
              dbId:        row.id,
              title:       row.title,
              description: row.message,
              type:        typeMap[row.type] ?? 'completed',
              time:        new Date(row.created_at),
              isRead:      false,
              url,
            })

            queryClient.invalidateQueries({ queryKey: ['surat-list'] })
            queryClient.invalidateQueries({ queryKey: ['pic-inbox'] })
          }
        )
        .subscribe()
    }

    initRealtime()

    return () => {
      if (suratChannel) supabase.removeChannel(suratChannel)
      if (notifChannel) supabase.removeChannel(notifChannel)
    }
  }, [addNotif, queryClient])

  const handleMarkAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))

    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
    }
  }, [])

  const handleClearAll = useCallback(() => {
    setNotifications([])
  }, [])

  return (
    <header className="h-14 sm:h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between px-3 sm:px-4 lg:px-6 shrink-0 safe-area-top">
      <div className="flex items-center gap-3 min-w-0">
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="lg:hidden shrink-0 -ml-1"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        
        <div className="flex flex-col min-w-0">
          <h1 className="text-base sm:text-lg lg:text-xl font-bold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-[9px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-wider truncate hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Notifications: conditionally render Sheet (mobile) or Popover (desktop) */}
        {isMobileView ? (
          <Sheet open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative group rounded-full h-9 w-9"
              >
                <Bell
                  className={cn(
                    'w-5 h-5 transition-all',
                    unreadCount > 0 ? 'text-primary animate-ring' : 'text-muted-foreground'
                  )}
                />
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
                  <SheetTitle className="text-sm font-black uppercase tracking-tighter">
                    Notifications ({unreadCount})
                  </SheetTitle>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleMarkAllRead}
                    >
                      <CheckCheck className="w-4 h-4" />
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
                    <p className="text-xs text-muted-foreground font-bold uppercase">No Activity</p>
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
                      <div
                        className={cn(
                          'p-2 rounded-lg h-fit shrink-0',
                          n.type === 'incoming'  ? 'bg-blue-500/10 text-blue-600'    :
                          n.type === 'rejected'  ? 'bg-red-500/10 text-red-600'      :
                          n.type === 'stamped'   ? 'bg-amber-500/10 text-amber-600'  :
                          n.type === 'feedback'  ? 'bg-purple-500/10 text-purple-600':
                                                        'bg-emerald-500/10 text-emerald-600'
                        )}
                      >
                        {n.type === 'incoming'  && <Inbox       className="w-4 h-4" />}
                        {n.type === 'rejected'  && <AlertCircle className="w-4 h-4" />}
                        {n.type === 'stamped'   && <Clock       className="w-4 h-4" />}
                        {n.type === 'feedback'  && <MessageSquare className="w-4 h-4" />}
                        {n.type === 'completed' && <FileCheck   className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black leading-tight mb-1 uppercase tracking-tighter truncate">
                          {n.title}
                        </p>
                        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-xs text-muted-foreground/50 font-bold uppercase mt-2">
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
                className="relative group rounded-full h-9 w-9 lg:h-10 lg:w-10"
              >
                <Bell
                  className={cn(
                    'w-5 h-5 transition-all',
                    unreadCount > 0 ? 'text-primary animate-ring' : 'text-muted-foreground'
                  )}
                />
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
                <span className="text-xs font-black uppercase tracking-tighter">
                  Notifications ({unreadCount})
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleMarkAllRead}
                  >
                    <CheckCheck className="w-4 h-4" />
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
                    <p className="text-xs text-muted-foreground font-bold uppercase">No Activity</p>
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
                      <div
                        className={cn(
                          'p-2 rounded-lg h-fit shrink-0',
                          n.type === 'incoming'  ? 'bg-blue-500/10 text-blue-600'    :
                          n.type === 'rejected'  ? 'bg-red-500/10 text-red-600'      :
                          n.type === 'stamped'   ? 'bg-amber-500/10 text-amber-600'  :
                          n.type === 'feedback'  ? 'bg-purple-500/10 text-purple-600':
                                                        'bg-emerald-500/10 text-emerald-600'
                        )}
                      >
                        {n.type === 'incoming'  && <Inbox       className="w-4 h-4" />}
                        {n.type === 'rejected'  && <AlertCircle className="w-4 h-4" />}
                        {n.type === 'stamped'   && <Clock       className="w-4 h-4" />}
                        {n.type === 'feedback'  && <MessageSquare className="w-4 h-4" />}
                        {n.type === 'completed' && <FileCheck   className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black leading-tight mb-1 uppercase tracking-tighter truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                          {n.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 font-bold uppercase mt-2">
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

        {onNewAgenda && (
          <Button
            onClick={onNewAgenda}
            size="sm"
            className="gap-2 rounded-lg font-bold text-xs uppercase tracking-wider h-8 sm:h-9 hidden sm:flex"
          >
            <Plus className="w-4 h-4" />
            <span>New Request</span>
          </Button>
        )}
      </div>
    </header>
  )
}
