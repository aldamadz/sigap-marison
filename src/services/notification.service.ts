import { supabase } from '@/lib/supabase'

export const notificationService = {
  // Kirim notifikasi via RPC (bypass RLS)
  async createNotification(userId: string, title: string, message: string, type = 'info', link?: string) {
    const { data, error } = await supabase.rpc('create_notification_rpc', {
      p_user_id: userId,
      p_title: title,
      p_message: message,
      p_type: type,
      p_link: link
    })

    if (error) {
      console.error('Create notification error:', error)
      throw error
    }

    return data
  },

  // Ambil notifikasi user yang login
  async getMyNotifications() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get notifications error:', error)
      throw error
    }

    return data || []
  },

  // Ambil notifikasi yang belum dibaca
  async getUnreadNotifications() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
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
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq('id', notificationId)
      .select()

    if (error) {
      console.error('Mark as read error:', error)
      throw error
    }

    return data
  },

  // Tandai semua notifikasi sebagai sudah dibaca
  async markAllAsRead() {
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
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
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)

    if (error) {
      console.error('Delete notification error:', error)
      throw error
    }
  }
}
