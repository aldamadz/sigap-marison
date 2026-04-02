# 🔧 FIX NOTIFICATION TIDAK MUNCUL

## 🚨 MASALAH YANG SERING TERJADI

### 1. Tabel `notifications` Belum Ada

**Cek di Supabase Dashboard:**
1. Buka https://supabase.com/dashboard/project/xuhyodtmgwteyslhrkfx
2. Menu **Database** → **Tables**
3. Cari tabel `notifications`

**Jika BELUM ADA, buat dengan SQL:**

```sql
-- Buat tabel notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- info, success, warning, error
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "Users can view own notifications" 
  ON public.notifications 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy: Edge function can insert (service role)
CREATE POLICY "Service role can insert notifications" 
  ON public.notifications 
  FOR INSERT 
  WITH CHECK (true);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" 
  ON public.notifications 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Create index untuk performa
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
```

---

### 2. Edge Function Belum Deploy

**Deploy ulang:**

```bash
cd "D:\Koding\Agenda Flow"

"D:\Koding\supabase\supabase.exe" functions deploy create-notification --project-ref xuhyodtmgwteyslhrkfx
```

**Verifikasi:**
```bash
"D:\Koding\supabase\supabase.exe" functions list --project-ref xuhyodtmgwteyslhrkfx
```

---

### 3. Cara Panggil yang Benar

**❌ SALAH (HTTP fetch langsung):**
```javascript
// Jangan pakai fetch langsungetch('https://...supabase.co/functions/v1/create-notification', ...)
```

**✅ BENAR (Pakai Supabase client):**
```typescript
// src/services/notification.service.ts
import { supabase } from '@/lib/supabase'

export const notificationService = {
  // Kirim notifikasi
  async createNotification(userId: string, title: string, message: string, type = 'info', link?: string) {
    const { data, error } = await supabase.functions.invoke('create-notification', {
      body: {
        user_id: userId,
        title,
        message,
        type,  // 'info' | 'success' | 'warning' | 'error'
        link   // optional: '/agendas/123'
      }
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
```

---

### 4. React Hook untuk Notifikasi

**File:** `src/hooks/useNotifications.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { notificationService } from '@/services/notification.service'
import { useAuth } from './useAuth'

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
      await fetchNotifications() // Refresh
    } catch (error) {
      console.error('Failed to mark as read:', error)
    }
  }, [fetchNotifications])

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead()
      await fetchNotifications() // Refresh
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }, [fetchNotifications])

  // Initial fetch
  useEffect(() => {
    fetchNotifications()
    
    // Poll setiap 30 detik
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  return {
    notifications,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead
  }
}
```

---

### 5. React Component untuk Notifikasi

**File:** `src/components/notifications/NotificationBell.tsx`

```typescript
import { useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { id } from 'date-fns/locale'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

  const handleNotificationClick = async (notification: any) => {
    if (!notification.is_read) {
      await markAsRead(notification.id)
    }
    if (notification.link) {
      window.location.href = notification.link
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h4 className="font-semibold">Notifikasi</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              Tandai sudah dibaca
            </Button>
          )}
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              Tidak ada notifikasi
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 border-b cursor-pointer hover:bg-muted transition-colors ${
                  !notification.is_read ? 'bg-muted/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    !notification.is_read ? 'bg-blue-500' : 'bg-transparent'
                  }`} />
                  <div className="flex-1">
                    <p className={`text-sm ${!notification.is_read ? 'font-medium' : ''}`}>
                      {notification.title}
                    </p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: id
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

---

## 🎯 CONTOH PENGGUNAAN

### **Kirim Notifikasi saat Agenda Dibuat:**

```typescript
// Di component atau service agenda
import { notificationService } from '@/services/notification.service'

async function createAgenda(agendaData: any) {
  // 1. Buat agenda
  const { data: agenda, error } = await supabase
    .from('agendas')
    .insert(agendaData)
    .select()
    .single()

  if (error) throw error

  // 2. Kirim notifikasi ke PIC
  await notificationService.createNotification(
    agenda.pic_id,                    // user_id penerima
    'Agenda Baru',                    // title
    `Anda ditugaskan sebagai PIC: ${agenda.judul}`,  // message
    'info',                           // type
    `/agendas/${agenda.id}`          // link
  )

  return agenda
}
```

---

## ✅ CHECKLIST

- [ ] Tabel `notifications` sudah dibuat di Supabase
- [ ] RLS policies sudah di-setup
- [ ] Edge function `create-notification` sudah deploy
- [ ] Service file `notification.service.ts` sudah dibuat
- [ ] Hook `useNotifications.ts` sudah dibuat
- [ ] Component `NotificationBell.tsx` sudah dibuat
- [ ] Login user sudah benar (sama user_id dengan notifikasi)

---

## 🐛 DEBUG

**Cek di Supabase Dashboard:**
1. Buka **Table Editor** → **notifications**
2. Lihat apakah data masuk saat edge function dipanggil
3. Cek **Logs** di menu **Edge Functions**

**Cek di Browser Console:**
```javascript
// Test langsungetch('https://xuhyodtmgwteyslhrkfx.supabase.co/functions/v1/create-notification', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + supabaseToken,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    user_id: 'user-uuid-anda',
    title: 'Test',
    message: 'Test notifikasi',
    type: 'info'
  })
}).then(r => r.json()).then(console.log)
```
