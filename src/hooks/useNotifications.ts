import { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notification.service'
import { useAuth } from './use-auth'
import { useAttention } from '@/providers/AttentionProvider'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  link?: string
  is_read: boolean
  created_at: string
  read_at?: string
}

export function useNotifications() {
  const { user } = useAuth()
  const { eventVersion, refetch: refetchAttention } = useAttention()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const data = await notificationService.getMyNotifications()
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.is_read).length)
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Mark as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationService.markAsRead(id)
      await refetchAttention()
      await fetchNotifications() // Refresh
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }, [fetchNotifications])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead()
      await refetchAttention()
      await fetchNotifications() // Refresh
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }, [fetchNotifications])

  // Initial fetch dan sinkronisasi dari AttentionProvider (SSE)
  useEffect(() => {
    if (!user) return

    fetchNotifications()
  }, [eventVersion, user, fetchNotifications])

  return {
    notifications,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead
  }
}
