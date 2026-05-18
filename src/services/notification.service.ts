import { supabase } from '@/lib/supabase'

const getCurrentUserId = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user?.id) throw new Error('Tidak terautentikasi')
  return user.id
}

export const notificationService = {
  // Kirim notifikasi via RPC (bypass RLS)
  async createNotification(userId: string, title: string, message: string, type = 'info', link?: string) {
    const payload = {
      user_id: userId,
      title,
      message,
      type,
      link: link || null,
      is_read: false,
    }

    const { data, error } = await supabase.rpc('create_notification_rpc', {
      p_user_id: userId,
      p_title: title,
      p_message: message,
      p_type: type,
      p_link: link
    })

    if (!error) return data

    console.error('Create notification RPC error, trying direct insert:', error)

    const { data: insertData, error: insertError } = await supabase
      .from('notifications')
      .insert(payload)
      .select()
      .single()

    if (insertError) {
      console.error('Create notification insert error:', insertError)
      throw insertError
    }

    return insertData
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
  }
}
