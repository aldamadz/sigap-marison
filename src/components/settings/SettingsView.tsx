// SettingsView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { differenceInYears, differenceInMonths, differenceInDays, addYears, addMonths } from 'date-fns';
import { 
  Shield, User as UserIcon, 
  Key, Mail, Briefcase, Building, Fingerprint, Loader2, 
  Camera, Phone, CalendarDays
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

// Services & Libs
import { getCurrentUser } from '@/services/user-ui.service';
import { getOffices } from '@/services/office.service';
import { supabase } from '@/lib/supabase';

export const SettingsView = () => {
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
      if (!user?.id || !event.target.files || event.target.files.length === 0) return;
      
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar_${Date.now()}.${fileExt}`; 

      setUploading(true);

      // 1. Upload ke Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // 2. Dapatkan Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update database sesuai nama kolom: avatar_url
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // 4. Update local state
      setUser((prev: any) => ({ ...prev, avatar_url: publicUrl }));
      
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
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <header>
        <h2 className="text-3xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground">Kelola profil dan keamanan akun</p>
      </header>

      <div className="grid gap-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border rounded-2xl p-8 shadow-sm">
          <div className="flex flex-col md:flex-row gap-10 items-start">
            
            {/* AVATAR SECTION */}
            <div className="relative group self-center md:self-start">
              <div className="w-36 h-36 rounded-3xl overflow-hidden bg-muted border-4 border-background shadow-xl relative">
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
                className="absolute -bottom-2 -right-2 p-3 bg-primary text-primary-foreground rounded-xl shadow-lg hover:scale-110 active:scale-95 transition-all disabled:opacity-50"
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

        {/* SECURITY */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card border rounded-2xl p-8 shadow-sm"
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
