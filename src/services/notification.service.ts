import { supabase } from '@/lib/supabase'
import { isWorkCalendarEnabled } from '@/lib/feature-availability'
import {
  createSupabaseWorkCalendarDashboardRepository,
  type SupabaseWorkCalendarDashboardClient,
} from '@/features/work-calendar/data/supabase-work-calendar-dashboard-repository'

const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user?.id) throw new Error('Tidak terautentikasi')
  return user.id
}

export const notificationService = {
  async createNotification(userId: string, title: string, message: string, type = 'info', link?: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Tidak terautentikasi')

    const response = await fetch('/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_ids: [userId],
        title,
        message,
        type,
        link: link || null,
        email: false,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || 'Gagal membuat notifikasi')
    }

    return response.json()
  },

  // Ambil notifikasi user yang login
  async getMyNotifications() {
    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get notifications error:', error)
      throw error
    }

    return data || []
  },

  // Ambil notifikasi yang belum dibaca
  async getUnreadNotifications() {
    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get unread notifications error:', error)
      throw error
    }

    return data || []
  },

  // Tandai notifikasi sebagai sudah dibaca
  async markAsRead(notificationId: string) {
    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('id', notificationId)
      .eq('user_id', userId)
      .select()

    if (error) {
      console.error('Mark as read error:', error)
      throw error
    }

    return data
  },

  // Tandai semua notifikasi sebagai sudah dibaca
  async markAllAsRead() {
    const userId = await getCurrentUserId()
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select()

    if (error) {
      console.error('Mark all as read error:', error)
      throw error
    }

    return data
  },

  // Hapus notifikasi
  async deleteNotification(notificationId: string) {
    const userId = await getCurrentUserId()
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId)

    if (error) {
      console.error('Delete notification error:', error)
      throw error
    }
  },

  async deleteAllMyNotifications() {
    const userId = await getCurrentUserId()
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)

    if (error) {
      console.error('Delete all notifications error:', error)
      throw error
    }
  },

  /**
   * CAL-03 F7: hasilkan notifikasi Work Calendar secara on-demand.
   *
   * Generator bersifat idempotent (dedupe + debounce di database), jadi aman
   * dipanggil sesering apa pun; kesalahan tidak boleh memblokir pemuatan
   * notifikasi, sehingga pemanggil menangani error secara terpisah.
   */
  async generateWorkCalendarNotifications() {
    if (!isWorkCalendarEnabled) return 0
    const repository = createSupabaseWorkCalendarDashboardRepository(
      supabase as SupabaseWorkCalendarDashboardClient,
    )
    return repository.generateNotifications()
  }
}
