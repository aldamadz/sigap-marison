// SettingsView.tsx
import React, { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { differenceInYears, differenceInMonths, differenceInDays, addYears, addMonths } from 'date-fns';
import { 
  Shield, User as UserIcon, 
  Key, Mail, Briefcase, Building, Fingerprint, Loader2, 
  Camera, Phone, CalendarDays, Monitor, Moon, Sun
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Services & Libs
import { getCurrentUser } from '@/services/user-ui.service';
import { getOffices } from '@/services/office.service';
import { supabase } from '@/lib/supabase';
import { NotificationPreferences } from './NotificationPreferences';

const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_UPDATED_EVENT = 'sigap:profile-updated';

export const SettingsView = ({ departmentSettings }: { departmentSettings?: ReactNode }) => {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null); // Gunakan any untuk fleksibilitas struktur DB
  const [officeName, setOfficeName] = useState<string>('Memuat...');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      const { data: preference } = await supabase
        .from('profiles')
        .select('theme_preference')
        .eq('id', userData?.id)
        .maybeSingle();
      if (preference?.theme_preference) {
        setTheme(preference.theme_preference);
      }

      // Menyesuaikan office_id (snake_case)
      const oId = userData?.officeId;
      if (oId) {
        const offices = await getOffices();
        const myOffice = offices.find(o => String(o.id) === String(oId));
        setOfficeName(myOffice ? myOffice.name : 'Kantor tidak ditemukan');
      } else {
        setOfficeName('Pusat / Head Office');
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!event.target.files || event.target.files.length === 0) return;
      
      const file = event.target.files[0];
      if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
        throw new Error('Format foto harus JPG, PNG, atau WebP.');
      }
      if (file.size > AVATAR_MAX_SIZE_BYTES) {
        throw new Error('Ukuran foto maksimal 5 MB.');
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      const authUserId = authData.user?.id;
      if (authError || !authUserId) {
        throw new Error('Sesi login tidak valid. Silakan login kembali.');
      }
      if (user?.id && user.id !== authUserId) {
        throw new Error('Profil yang terbuka tidak sesuai dengan akun yang sedang login.');
      }

      setUploading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sesi login tidak valid. Silakan login kembali.');
      }
      const formData = new FormData();
      formData.set('file', file);
      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Foto profil gagal diunggah.');
      }
      const publicUrl = String(payload?.avatarUrl || '');
      if (!publicUrl) throw new Error('URL foto profil tidak tersedia.');

      setUser((prev: any) => ({ ...prev, avatar_url: publicUrl, photoUrl: publicUrl }));
      window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, {
        detail: { avatar_url: publicUrl, photoUrl: publicUrl },
      }));
      
      toast({ title: "Berhasil", description: "Foto profil diperbarui" });
    } catch (error: any) {
      toast({ 
        title: "Gagal Upload", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword.length < 6) {
      toast({ title: "Gagal", description: "Password minimal 6 karakter.", variant: "destructive" });
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast({ title: "Gagal", description: "Password tidak cocok.", variant: "destructive" });
      return;
    }

    setUpdatingPassword(true);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({ password: passwords.newPassword });
    setUpdatingPassword(false);

    if (error) {
      toast({ title: "Gagal", description: error.message, variant: "destructive" });
    } else {
      if (authData.user?.id) {
        await supabase.rpc('record_auth_audit_event', { p_event: 'password_changed' });
      }
      toast({ title: "Berhasil", description: "Password diperbarui." });
      setPasswords({ newPassword: '', confirmPassword: '' });
    }
  };

  const handleThemeChange = async (nextTheme: string) => {
    const previousTheme = theme || 'system';
    setTheme(nextTheme);
    if (!user?.id) return;

    const { error } = await supabase
      .from('profiles')
      .update({ theme_preference: nextTheme })
      .eq('id', user.id);

    if (error) {
      setTheme(previousTheme);
      toast({
        title: "Gagal",
        description: "Preferensi tema tidak dapat disimpan.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Tampilan diperbarui", description: "Preferensi tema tersimpan untuk akun Anda." });
  };

  if (loading) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto w-10 h-10 text-primary" /></div>;

  // Mapping data dari JSON: full_name dan avatar_url
  const displayName = user?.full_name || user?.fullName || 'User';
  const avatarSrc = user?.avatar_url || user?.photoUrl || undefined;

  const tenureText = (() => {
    if (!user?.join_date) return '-';
    const start = new Date(user.join_date);
    if (isNaN(start.getTime())) return '-';
    const now = new Date();
    if (now <= start) return 'Baru bergabung';

    const years = differenceInYears(now, start);
    const afterYears = addYears(start, years);
    const months = differenceInMonths(now, afterYears);
    const afterMonths = addMonths(afterYears, months);
    const days = differenceInDays(now, afterMonths);

    const parts: string[] = [];
    if (years > 0) parts.push(`${years} tahun`);
    if (months > 0) parts.push(`${months} bulan`);
    if (days > 0) parts.push(`${days} hari`);

    return parts.join(' ') || 'Baru bergabung';
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="border-b pb-5">
        <h1 className="text-2xl font-semibold text-foreground">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Kelola profil, tampilan, dan keamanan akun.</p>
      </header>

      <div className="divide-y divide-border">
        <section className="space-y-4 pb-6" aria-labelledby="settings-profile">
          <h2 id="settings-profile" className="text-base font-semibold">Profil akun</h2>
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:gap-7">
            
            {/* AVATAR SECTION */}
            <div className="relative shrink-0">
              <div className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted sm:h-24 sm:w-24">
                <Avatar className={`h-full w-full rounded-lg transition-opacity ${uploading ? 'opacity-30' : 'opacity-100'}`}>
                  <AvatarImage src={avatarSrc} alt="Profile" />
                  <AvatarFallback className="rounded-lg bg-primary/10 text-3xl font-semibold text-primary">
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
              
              <button 
                type="button"
                aria-label="Ubah foto profil"
                title="Ubah foto profil"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-2 -right-2 grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground ring-2 ring-background hover:bg-primary/90 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
              </button>
              
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
            </div>

            {/* INFO GRID */}
            <div className="grid w-full min-w-0 flex-1 gap-x-6 gap-y-4 min-[420px]:grid-cols-2 xl:grid-cols-3">
              <ProfileItem label="Nama Lengkap" value={displayName} icon={UserIcon} />
              <ProfileItem label="NIK" value={user?.nik} icon={Fingerprint} />
              <ProfileItem label="Email" value={user?.email} icon={Mail} />
              <ProfileItem label="Nomor HP" value={user?.phone} icon={Phone} />
              <ProfileItem label="Jabatan" value={user?.job_title || user?.jobTitle} icon={Briefcase} />
              <ProfileItem label="Unit Kerja" value={officeName} icon={Building} highlight />
              <ProfileItem label="Departemen" value={user?.departmentName} icon={Building} />
              <ProfileItem label="Tanggal Masuk" value={user?.join_date} icon={CalendarDays} />
              <ProfileItem label="Masa Kerja" value={tenureText} icon={CalendarDays} />
              <ProfileItem label="Akses Role" value={user?.role?.toUpperCase()} icon={Shield} />
            </div>
          </div>
        </section>

        <section className="grid gap-3 py-5 sm:grid-cols-[minmax(9rem,1fr)_2fr] sm:items-center" aria-labelledby="settings-theme">
          <h2 id="settings-theme" className="text-base font-semibold">Tampilan</h2>
          <div className="grid max-w-sm grid-cols-3 gap-1 rounded-md border p-1" role="group" aria-label="Tema aplikasi">
            {[
              { value: 'system', label: 'Sistem', icon: Monitor },
              { value: 'light', label: 'Terang', icon: Sun },
              { value: 'dark', label: 'Gelap', icon: Moon },
            ].map((option) => {
              const Icon = option.icon;
              const active = (theme || 'system') === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleThemeChange(option.value)}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded px-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {user?.id && <NotificationPreferences userId={user.id} />}
        {departmentSettings}

        {/* SECURITY */}
        <section className="grid gap-4 py-5 sm:grid-cols-[minmax(9rem,1fr)_2fr]" aria-labelledby="settings-security">
          <h2 id="settings-security" className="flex items-start gap-2 text-base font-semibold"><Key className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />Ganti kata sandi</h2>
          <form onSubmit={handleUpdatePassword} className="max-w-md space-y-3">
            <label className="block space-y-1 text-sm"><span>Kata sandi baru</span><Input
              type="password" 
              autoComplete="new-password"
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            /></label>
            <label className="block space-y-1 text-sm"><span>Konfirmasi kata sandi</span><Input
              type="password" 
              autoComplete="new-password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            /></label>
            <Button
              type="submit"
              disabled={updatingPassword}
              className="w-full sm:w-auto"
            >
              {updatingPassword && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Simpan kata sandi
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
};

const ProfileItem = ({ label, value, icon: Icon, highlight = false }: any) => (
  <div className="flex min-w-0 items-start gap-2.5">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" /></span>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`break-words text-sm font-medium ${highlight ? 'text-primary' : ''}`}>{value || '-'}</p>
    </div>
  </div>
);
