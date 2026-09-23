// frontend/src/components/users/AddUserModal.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { User, Role } from '@/types/agenda';
import { adminUserService, describeAdminUserError } from '@/services/admin-user.service';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  UserPlus, Building2, Briefcase, Fingerprint, Mail,
  Loader2, ShieldCheck, User as UserIcon, Phone, Calendar, LogOut,
} from 'lucide-react';

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  allUsers: User[];
}

interface Department { id: string; name: string; }
interface Office     { id: string; name: string; kedudukan?: string; }

const EMPTY_FORM = {
  email:        '',
  fullName:     '',
  nik:          '',
  role:         'user' as Role,
  jobTitle:     '',
  phone:        '',
  join_date:    '',
  resign_date:  '',
  departmentId: 'none' as string,
  officeId:     'none' as string,
  parentId:     'none' as string,
};

// Hapus suffix " (Cabang)" dari nama departemen untuk label UI
const stripCabang = (name: string) => name.replace(/\s*\(Cabang\)\s*$/i, '').trim();

// Cek apakah kantor adalah KC atau KCP
const isCabangOffice = (kedudukan?: string) =>
  kedudukan === 'KC' || kedudukan === 'KCP';

export const AddUserModal = ({ isOpen, onClose, onSuccess, allUsers }: AddUserModalProps) => {
  const [loading, setLoading]         = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices]         = useState<Office[]>([]);
  const [formData, setFormData]       = useState(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    setFormData(EMPTY_FORM);
    Promise.all([
      supabase.from('master_departments').select('id,name').order('name'),
      supabase.from('master_offices').select('id,name,kedudukan').order('name'),
    ]).then(([{ data: depts }, { data: offs }]) => {
      setDepartments(depts || []);
      setOffices(offs || []);
    }).catch(console.error);
  }, [isOpen]);

  // Tentukan kantor yang sedang dipilih
  const selectedOffice = useMemo(
    () => offices.find(o => o.id === formData.officeId),
    [offices, formData.officeId]
  );
  const isCabang = isCabangOffice(selectedOffice?.kedudukan);

  // Filter departemen sesuai tipe kantor:
  // - Pusat / belum dipilih → tampilkan yang TIDAK ber-suffix (Cabang)
  // - KC / KCP              → tampilkan yang ber-suffix (Cabang), label tanpa kata itu
  const filteredDepts = useMemo(() => {
    if (isCabang) {
      return departments
        .filter(d => /\(Cabang\)/i.test(d.name))
        .map(d => ({ ...d, label: stripCabang(d.name) }));
    }
    return departments
      .filter(d => !/\(Cabang\)/i.test(d.name))
      .map(d => ({ ...d, label: d.name }));
  }, [departments, isCabang]);

  // Reset departemen jika tipe kantor berubah dan pilihan tidak valid lagi
  useEffect(() => {
    if (formData.departmentId === 'none') return;
    const stillValid = filteredDepts.some(d => d.id === formData.departmentId);
    if (!stillValid) setFormData(f => ({ ...f, departmentId: 'none' }));
  }, [filteredDepts, formData.departmentId]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (loading) return; // double-submit guard
    if (!formData.email || !formData.fullName) return toast.error('Email dan Nama wajib diisi');
    if (!formData.nik) return toast.error('NIK wajib diisi');

    setLoading(true);
    try {
      await adminUserService.createUser({
        email:         formData.email,
        full_name:     formData.fullName,
        nik:           formData.nik,
        job_title:     formData.jobTitle    || null,
        phone:         formData.phone       || null,
        role:          formData.role        || 'user',
        join_date:     formData.join_date   || null,
        resign_date:   formData.resign_date || null,
        department_id: formData.departmentId === 'none' ? null : String(formData.departmentId),
        office_id:     formData.officeId     === 'none' ? null : String(formData.officeId),
        parent_id:     formData.parentId     === 'none' ? null : String(formData.parentId),
      });
      toast.success(`Akun ${formData.fullName} berhasil dibuat dengan password default staging.`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(describeAdminUserError(err));
    } finally {
      setLoading(false);
    }
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-[11px] font-bold text-primary tracking-[0.2em] uppercase px-1">{children}</h4>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px] bg-card border-border shadow-2xl p-0 overflow-hidden">

        <div className="p-6 pb-0">
          <DialogHeader>
            <div className="flex items-center gap-3 text-primary mb-1">
              <div className="p-2 bg-primary/10 rounded-lg">
                <UserPlus className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-gradient">
                Registrasi Karyawan
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground font-medium">
              Sistem akan membuat akun login dan profil database secara otomatis.{' '}
              <span className="text-primary font-bold">
                Password default staging akan dibuat server secara otomatis.
              </span>
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">

          {/* ── Kredensial ──────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionTitle>Informasi Kredensial</SectionTitle>
            <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-xl border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email Kerja *
                </Label>
                <Input type="email" value={formData.email} onChange={set('email')}
                  placeholder="name@company.com" className="bg-background h-10" />
              </div>
            </div>
          </div>

          {/* ── Data Organisasi ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionTitle>Data Organisasi</SectionTitle>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">

              <div className="space-y-2">
                <Label className="text-xs font-bold">Nama Lengkap *</Label>
                <Input value={formData.fullName} onChange={set('fullName')}
                  placeholder="Masukkan nama sesuai KTP" className="bg-background h-10" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" /> NIK
                </Label>
                <Input value={formData.nik} onChange={set('nik')}
                  placeholder="MBN-001" className="bg-background h-10 font-mono" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> No. HP
                </Label>
                <Input value={formData.phone} onChange={set('phone')}
                  placeholder="08xxxxxxxxxx" className="bg-background h-10" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Jabatan Resmi</Label>
                <Input value={formData.jobTitle} onChange={set('jobTitle')}
                  placeholder="Senior Manager" className="bg-background h-10" />
              </div>

              {/* ── Kantor — pilih dulu agar dept terfilter ───────────────── */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Penempatan Kantor
                </Label>
                <Select value={formData.officeId}
                  onValueChange={v => setFormData(f => ({ ...f, officeId: v }))}>
                  <SelectTrigger className="bg-background h-10">
                    <SelectValue placeholder="Pilih Lokasi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belum Ditentukan</SelectItem>
                    {offices.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.kedudukan && o.kedudukan !== 'Pusat'
                          ? `${o.kedudukan} ${o.name}`
                          : o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Departemen — terfilter sesuai tipe kantor ─────────────── */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Departemen
                  {isCabang && (
                    <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wider">
                      · Cabang
                    </span>
                  )}
                </Label>
                <Select value={formData.departmentId}
                  onValueChange={v => setFormData(f => ({ ...f, departmentId: v }))}>
                  <SelectTrigger className="bg-background h-10">
                    <SelectValue placeholder="Pilih Dept" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Belum Ditentukan</SelectItem>
                    {filteredDepts.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Hak Akses Sistem</Label>
                <Select value={formData.role}
                  onValueChange={(v: Role) => setFormData(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="bg-background h-10 font-bold text-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">
                      <UserIcon className="w-3 h-3 inline mr-2" /> STAFF / USER
                    </SelectItem>
                    <SelectItem value="admin">
                      <ShieldCheck className="w-3 h-3 inline mr-2" /> ADMINISTRATOR
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Atasan Langsung</Label>
                <Select value={formData.parentId || 'none'}
                  onValueChange={v => setFormData(f => ({ ...f, parentId: v }))}>
                  <SelectTrigger className="bg-background h-10 border-dashed">
                    <SelectValue placeholder="Pilih Atasan" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="none" className="italic text-muted-foreground">
                      Top Level / Board of Directors
                    </SelectItem>
                    {allUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName} —{' '}
                        <span className="text-[10px] opacity-50">{u.jobTitle}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>

          {/* ── Riwayat Kerja ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionTitle>Riwayat Kerja</SectionTitle>
            <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-xl border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Tanggal Bergabung
                </Label>
                <Input type="date" value={formData.join_date} onChange={set('join_date')}
                  className="bg-background h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <LogOut className="w-3.5 h-3.5 text-red-400" /> Tanggal Keluar
                  <span className="text-[9px] text-muted-foreground font-normal normal-case">(opsional)</span>
                </Label>
                <Input type="date" value={formData.resign_date} onChange={set('resign_date')}
                  className="bg-background h-10" />
              </div>
            </div>
          </div>

        </div>

        <DialogFooter className="bg-secondary/50 p-6 gap-3 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={loading}
            className="font-bold hover:bg-destructive/10 hover:text-destructive">
            Batalkan
          </Button>
          <Button onClick={handleSave} disabled={loading}
            className="min-w-[140px] font-extrabold shadow-lg shadow-primary/20">
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mendaftarkan...</>
              : 'Simpan User'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
