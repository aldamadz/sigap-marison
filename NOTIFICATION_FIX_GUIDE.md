:# Panduan Fix Notifikasi Real-time - Agenda Flow

## 🎯 Masalah Utama

Notifikasi tidak muncul saat login di perangkat lain karena beberapa alasan:

1. ❌ **Edge Function tidak berjalan** (belum di-deploy)
2. ❌ **Realtime subscription tidak aktif** di frontend
3. ❌ **Notifikasi tidak terfilter berdasarkan user_id** yang login
4. ❌ **RLS policy blocking** read/write notifikasi

---

## ✅ Solusi Lengkap

### **1. Database: Buat Tabel Notifications**

Jalankan SQL ini di Supabase Dashboard → SQL Editor:

```sql
-- Tabel Notifikasi
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: User hanya bisa baca notifikasi sendiri
CREATE POLICY "Users can read own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: User hanya bisa update notifikasi sendiri (mark as read)
CREATE POLICY "Users can update own notifications"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Service role bisa insert (untuk edge function)
CREATE POLICY "Service role can insert notifications"
    ON public.notifications
    FOR INSERT
    WITH CHECK (true);

-- Policy: User bisa delete notifikasi sendiri
CREATE POLICY "Users can delete own notifications"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);

-- Index untuk performa
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);
```

---

### **2. Deploy Edge Function**

**File sudah dibuat:** `supabase/functions/create-notification/index.ts`

**Deploy command:**
```bash
cd "D:\Koding\Agenda Flow"
"D:\Koding\supabase\supabase.exe" functions deploy create-notification --project-ref xuhyodtmgwteyslhrkfx
```

**Atau double-click:** `deploy-notification.bat`

---

### **3. Frontend: Gunakan Service & Hook**

**File sudah dibuat:**
- ✅ `src/services/notification.service.ts`
- ✅ `src/hooks/useNotifications.ts`
- ✅ `src/components/NotificationBell.tsx`

**Tambahkan ke Header/Navbar:**

```tsx
// src/components/Header.tsx atau Layout.tsx
import { NotificationBell } from '@/components/NotificationBell'

export function Header() {
  return (
    <header className="flex items-center justify-between p-4">
      <h1>Agenda Flow</h1>
      <div className="flex items-center gap-4">
        <NotificationBell />
        {/* ... komponen lain */}
      </div>
    </header>
  )
}
```

**Install dependency date-fns:**
```bash
cd "D:\Koding\Agenda Flow\frontend"
npm install date-fns
```

---

### **4. Trigger: Auto-Notifikasi saat Agenda Dibuat**

**Buat database function:**

```sql
-- Function untuk kirim notifikasi otomatis
CREATE OR REPLACE FUNCTION notify_on_agenda_created()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT;
BEGIN
    -- Ambil user yang membuat agenda
    v_user_id := NEW.created_by;
    
    -- Ambil nama user
    SELECT raw_user_meta_data->>'full_name' 
    INTO v_user_name 
    FROM auth.users 
    WHERE id = v_user_id;
    
    -- Insert notifikasi untuk semua peserta agenda
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT 
        participant_id,
        'Agenda Baru: ' || NEW.title,
        COALESCE(v_user_name, 'Seseorang') || ' menambahkan Anda ke agenda rapat',
        'info',
        '/agendas/' || NEW.id
    FROM public.agenda_participants
    WHERE agenda_id = NEW.id
      AND participant_id != v_user_id; -- Jangan notifikasi diri sendiri
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk agenda baru
DROP TRIGGER IF EXISTS trg_notify_agenda_created ON public.agendas;
CREATE TRIGGER trg_notify_agenda_created
    AFTER INSERT ON public.agendas
    FOR EACH ROW
    EXECUTE FUNCTION notify_on_agenda_created();
```

---

### **5. Trigger: Auto-Notifikasi untuk Surat**

```sql
-- Function untuk notifikasi approval surat
CREATE OR REPLACE FUNCTION notify_on_surat_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Notifikasi ke pembuat surat saat status berubah
    IF OLD.status != NEW.status THEN
        INSERT INTO public.notifications (user_id, title, message, type, link)
        VALUES (
            NEW.created_by,
            CASE 
                WHEN NEW.status = 'approved' THEN 'Surat Disetujui'
                WHEN NEW.status = 'rejected' THEN 'Surat Ditolak'
                ELSE 'Status Surat Berubah'
            END,
            'Nomor surat: ' || NEW.nomor_surat || ' - ' || NEW.perihal,
            CASE 
                WHEN NEW.status = 'approved' THEN 'success'
                WHEN NEW.status = 'rejected' THEN 'error'
                ELSE 'info'
            END,
            '/surat/' || NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk perubahan status surat
DROP TRIGGER IF EXISTS trg_notify_surat_status ON public.surat_registrasi;
CREATE TRIGGER trg_notify_surat_status
    AFTER UPDATE ON public.surat_registrasi
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION notify_on_surat_status_change();
```

---

## 🧪 Cara Test

### **Test 1: Buat Notifikasi Manual**
```typescript
// Di browser console atau component
import { notificationService } from '@/services/notification.service'

// Kirim notifikasi ke diri sendiri
await notificationService.createNotification(
  'YOUR_USER_ID', // Lihat di Supabase Auth
  'Test Notifikasi',
  'Ini notifikasi test dari browser',
  'info',
  '/dashboard'
)
```

### **Test 2: Buat Agenda Baru**
```typescript
// Buat agenda dengan peserta lain
// Peserta lain seharusnya dapat notifikasi otomatis
```

### **Test 3: Cek Real-time**
1. Buka 2 browser berbeda
2. Login dengan user yang sama di keduanya
3. Buat notifikasi di browser 1
4. Notifikasi harus muncul otomatis di browser 2

---

## 🔍 Debugging

### **Cek di Supabase Dashboard:**

**Table Editor → notifications:**
- Pastikan data masuk dengan `user_id` yang benar

**Database → Triggers:**
- Pastikan trigger `trg_notify_agenda_created` ada dan enabled

**Edge Functions:**
- Functions → `create-notification` harus muncul di list

### **Cek di Browser Console:**

```javascript
// Test connection
const { data, error } = await supabase.functions.invoke('create-notification', {
  body: {
    user_id: 'YOUR_USER_ID',
    title: 'Test',
    message: 'Hello',
    type: 'info'
  }
})
console.log(data, error)
```

---

## 📋 Checklist Implementasi

- [ ] **Database:** Tabel `notifications` sudah dibuat
- [ ] **Database:** RLS policies sudah di-setup
- [ ] **Database:** Triggers sudah dibuat (opsional)
- [ ] **Edge Function:** Sudah di-deploy
- [ ] **Frontend:** `notification.service.ts` ada
- [ ] **Frontend:** `useNotifications.ts` ada
- [ ] **Frontend:** `NotificationBell.tsx` ada
- [ ] **Frontend:** `date-fns` sudah di-install
- [ ] **Frontend:** `<NotificationBell />` dipakai di Header
- [ ] **Test:** Notifikasi muncul saat create
- [ ] **Test:** Real-time works di multi device

---

## 🚀 Deployment Checklist

```bash
# 1. Deploy edge function
cd "D:\Koding\Agenda Flow"
"D:\Koding\supabase\supabase.exe" functions deploy create-notification --project-ref xuhyodtmgwteyslhrkfx

# 2. Install dependency frontend
cd frontend
npm install date-fns

# 3. Build & deploy frontend
npm run build
# Upload ke hosting
```

---

**Sudah jelas?** Ada yang perlu dijelaskan lebih detail? 🚀