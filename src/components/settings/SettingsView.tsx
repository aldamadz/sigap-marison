// SettingsView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { differenceInYears, differenceInMonths, differenceInDays, addYears, addMonths } from 'date-fns';
import { 
  Shield, User as UserIcon, 
  Key, Mail, Briefcase, Building, Fingerprint, Loader2, 
  Camera, Phone, CalendarDays, Monitor, Moon, Sun
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast as sonnerToast } from 'sonner';

// Services & Libs
import { getCurrentUser } from '@/services/user-ui.service';
import { getOffices } from '@/services/office.service';
import { supabase } from '@/lib/supabase';

const AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const PROFILE_UPDATED_EVENT = 'sigap:profile-updated';
const toast = ({ title, description, variant }: { title: string; description?: string; variant?: string }) =>
  variant === "destructive" ? sonnerToast.error(title, { description }) : sonnerToast(title, { description });

export const SettingsView = () => {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<any>(null); // Gunakan any untuk fleksibilitas struktur DB
  const [officeName, setOfficeName] = useState<string>('Memuat...');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ newPassword: '', confirmPassword: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const avatarSrc = user?.avatar_url || user?.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random`;

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
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground">Kelola profil, tampilan, dan keamanan akun.</p>
      </header>

      <div className="grid gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border rounded-lg p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row gap-10 items-start">
            
            {/* AVATAR SECTION */}
            <div className="relative group self-center md:self-start">
              <div className="relative h-36 w-36 overflow-hidden rounded-lg border-4 border-background bg-muted shadow-lg">
                <img 
                  src={avatarSrc} 
                  alt="Profile"
                  className={`w-full h-full object-cover ${uploading ? 'opacity-30' : 'opacity-100'}`}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('ui-avatars.com')) {
                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`;
                    }
                  }}
                />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-2 -right-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
              </button>
              
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
            </div>

            {/* INFO GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 flex-1 w-full">
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
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border rounded-lg p-5 sm:p-6 shadow-sm"
        >
          <div className="mb-5">
            <h3 className="font-semibold">Tampilan</h3>
            <p className="text-sm text-muted-foreground">Pilih tema antarmuka yang digunakan pada akun ini.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-lg" role="radiogroup" aria-label="Tema aplikasi">
            {[
              { value: 'system', label: 'System', icon: Monitor },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ].map((option) => {
              const Icon = option.icon;
              const active = (theme || 'system') === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleThemeChange(option.value)}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </motion.section>

        {/* SECURITY */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card border rounded-lg p-5 sm:p-6 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-6">
            <Key className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold">Ganti Password</h3>
          </div>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <Input 
              type="password" 
              placeholder="Password Baru"
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            />
            <Input 
              type="password" 
              placeholder="Konfirmasi Password"
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            />
            <Button
              type="submit"
              disabled={updatingPassword}
              className="bg-orange-500 hover:bg-orange-600 w-full md:w-auto"
            >
              {updatingPassword && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Update Password
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

const ProfileItem = ({ label, value, icon: Icon, highlight = false }: any) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
    <div className={`flex items-center gap-3 ${highlight ? 'text-primary' : ''}`}>
      <div className="p-2 rounded-lg bg-muted/50"><Icon className="w-4 h-4" /></div>
      <span className="text-sm font-semibold truncate">{value || '-'}</span>
    </div>
  </div>
);
