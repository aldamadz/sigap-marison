import { useState } from 'react'
import { Bell, Check, Trash2 } from 'lucide-react'
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useNotifications } from '@/hooks/useNotifications'
import { notificationOpenPath } from '@/lib/notification-target'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { 
    notifications, 
    unreadCount, 
    loading, 
    markAsRead, 
    markAllAsRead 
  } = useNotifications()

  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await markAsRead(id)
  }

  const handleNotificationClick = (notification: any) => {
    if (!notification.is_read) {
      markAsRead(notification.id)
    }
    window.location.href = notificationOpenPath(notification.id)
    setOpen(false)
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-green-500'
      case 'warning': return 'bg-yellow-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-blue-500'
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center bg-red-500"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifikasi</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={markAllAsRead}
            >
              <Check className="h-4 w-4 mr-1" />
              Baca semua
            </Button>
          )}
        </div>

        <ScrollArea className="h-80">
          {loading ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Memuat...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">
              Tidak ada notifikasi
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`
                    p-4 cursor-pointer hover:bg-gray-50 transition-colors
                    ${!notification.is_read ? 'bg-blue-50/50' : ''}
                  `}
                >
                  <div className="flex items-start gap-3">
                    <div className={`
                      w-2 h-2 rounded-full mt-2 flex-shrink-0
                      ${getTypeColor(notification.type)}
                    `} />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">
                        {notification.title}
                      </p>
                      <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDistanceToNow(
                          new Date(notification.created_at), 
                          { addSuffix: true, locale: id }
                        )}
                      </p>
                    </div>

                    {!notification.is_read && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={(e) => handleMarkAsRead(e, notification.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
