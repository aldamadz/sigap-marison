# Setup Notifikasi Real-time - Agenda Flow

## 🚀 Quick Start (3 Langkah)

### **Langkah 1: Setup Database (Jalankan SQL)**

Buka Supabase Dashboard → SQL Editor → New Query → Paste & Run:

```sql
-- Copy dari file: supabase/migrations/001_create_notifications.sql
```

Atau jalankan satu per satu:

```sql
-- Minimal setup (tanpa trigger otomatis)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
    ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
    ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
    ON public.notifications FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

---

### **Langkah 2: Deploy Edge Function**

**Option A: Via Script (Double-click)**
```
Double-click: deploy-notification.bat
```

**Option B: Via Command**
```bash
cd "D:\Koding\Agenda Flow"
"D:\Koding\supabase\supabase.exe" functions deploy create-notification --project-ref xuhyodtmgwteyslhrkfx
```

**Verifikasi:**
```bash
"D:\Koding\supabase\supabase.exe" functions list --project-ref xuhyodtmgwteyslhrkfx
```

---

### **Langkah 3: Install Frontend Dependencies**

```bash
cd "D:\Koding\Agenda Flow\frontend"

# Install date-fns untuk formatting tanggal
npm install date-fns

# Jika belum punya lucide-react
npm install lucide-react

# Jika belum punya @radix-ui/react-popover
npm install @radix-ui/react-popover
```

---

## ✅ Tambahkan ke Layout/Header

```tsx
// src/components/Header.tsx
import { NotificationBell } from '@/components/NotificationBell'

export function Header() {
  return (
    <header className="flex items-center justify-between p-4 border-b">
      <h1 className="text-xl font-bold">Agenda Flow</h1>
      
      <div className="flex items-center gap-4">
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
```

---

## 🧪 Test Notifikasi

### **Test 1: Via Browser Console**
```javascript
// Buka DevTools Console
const { data, error } = await supabase.functions.invoke('create-notification', {
  body: {
    user_id: (await supabase.auth.getUser()).data.user.id,
    title: 'Test Notifikasi',
    message: 'Notifikasi berhasil dibuat!',
    type: 'success'
  }
})
console.log(data, error)
```

### **Test 2: Via UI**
1. Buka aplikasi di 2 browser/2 tab
2. Login dengan user yang sama
3. Trigger notifikasi di tab 1
4. Notifikasi muncul otomatis di tab 2 (real-time)

---

## 📋 Files yang Sudah Dibuat

| File | Lokasi | Fungsi |
|------|--------|--------|
| `create-notification` | `supabase/functions/create-notification/index.ts` | Edge function |
| `notification.service.ts` | `frontend/src/services/notification.service.ts` | API service |
| `useNotifications.ts` | `frontend/src/hooks/useNotifications.ts` | React hook |
| `NotificationBell.tsx` | `frontend/src/components/NotificationBell.tsx` | UI component |
| `001_create_notifications.sql` | `supabase/migrations/001_create_notifications.sql` | Database migration |
| `deploy-notification.bat` | Root folder | Deploy script |

---

## 🔍 Troubleshooting

### **Edge Function tidak muncul di list**
```bash
# Cek apakah project link benar
"D:\Koding\supabase\supabase.exe" link --project-ref xuhyodtmgwteyslhrkfx

# Deploy ulang
"D:\Koding\supabase\supabase.exe" functions deploy create-notification --project-ref xuhyodtmgwteyslhrkfx
```

### **Notifikasi tidak muncul**
```sql
-- Cek apakah data masuk ke tabel
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;

-- Cek RLS policy
SELECT * FROM pg_policies WHERE tablename = 'notifications';
```

### **Real-time tidak berfungsi**
```javascript
// Cek subscription
supabase.channel('notifications').on(
  'postgres_changes',
  { event: '*', schema: 'public', table: 'notifications' },
  (payload) => console.log('Change received!', payload)
).subscribe()
```

---

## 📚 Dokumentasi Lengkap

- `NOTIFICATION_FIX_GUIDE.md` - Panduan lengkap dengan trigger otomatis
- `SETUP_NOTIFICATION.md` - Quick start guide (file ini)

---

**Sudah siap!** 🚀

Jika ada error, cek bagian Troubleshooting atau tanya saya!