// frontend/src/components/users/EditUserModal.tsx
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
import { updateUserProfile } from '@/services/user.service';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  Building2, Briefcase, UserCog, UserCircle, Fingerprint, Mail,
  Loader2, ShieldCheck, User as UserIcon, Phone, Calendar, LogOut,
} from 'lucide-react';

interface EditUserModalProps {
  user: User | null;
  allUsers: User[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Department { id: string; name: string; }
interface Office     { id: string; name: string; kedudukan?: string; }

const stripCabang   = (name: string) => name.replace(/\s*\(Cabang\)\s*$/i, '').trim();
const isCabangOffice = (kedudukan?: string) => kedudukan === 'KC' || kedudukan === 'KCP';

export const EditUserModal = ({ user, allUsers, isOpen, onClose, onSuccess }: EditUserModalProps) => {
  const [loading, setLoading]         = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [offices, setOffices]         = useState<Office[]>([]);

  const [formData, setFormData] = useState({
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
    marisonEmployeeId: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      supabase.from('master_departments').select('id,name').order('name'),
      supabase.from('master_offices').select('id,name,kedudukan').order('name'),
    ]).then(([{ data: depts }, { data: offs }]) => {
      setDepartments(depts || []);
      setOffices(offs || []);
    }).catch(console.error);
  }, [isOpen]);

  useEffect(() => {
    if (!user || !isOpen) return;
    setFormData({
      email:        user.email || '',
      fullName:     user.fullName || '',
      nik:          user.nik || '',
      role:         ((user as any).role as Role) || 'user',
      jobTitle:     user.jobTitle || '',
      phone:        (user as any).phone || '',
      join_date:    (user as any).join_date || '',
      resign_date:  (user as any).resign_date || '',
      departmentId: user.departmentId ? String(user.departmentId) : 'none',
      officeId:     user.officeId     ? String(user.officeId)     : 'none',
      parentId:     user.parentId     || 'none',
      marisonEmployeeId: (user as any).marison_employee_id == null ? '' : String((user as any).marison_employee_id),
    });
  }, [user, isOpen]);

  // Kantor yang sedang dipilih
  const selectedOffice = useMemo(
    () => offices.find(o => o.id === formData.officeId),
    [offices, formData.officeId]
  );
  const isCabang = isCabangOffice(selectedOffice?.kedudukan);

  // Filter dept sesuai tipe kantor
  const filteredDepts = useMemo(() => {
    const includeCurrentDepartment = (items: Array<Department & { label: string }>) => {
      if (formData.departmentId === 'none' || items.some(d => d.id === formData.departmentId)) {
        return items;
      }

      const currentDepartment = departments.find(d => d.id === formData.departmentId);
      return currentDepartment
        ? [{ ...currentDepartment, label: `${currentDepartment.name} (tersimpan)` }, ...items]
        : items;
    };

    if (isCabang) {
      return includeCurrentDepartment(departments
        .filter(d => /\(Cabang\)/i.test(d.name))
        .map(d => ({ ...d, label: stripCabang(d.name) })));
    }
    return includeCurrentDepartment(departments
      .filter(d => !/\(Cabang\)/i.test(d.name))
      .map(d => ({ ...d, label: d.name })));
  }, [departments, formData.departmentId, isCabang]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!user) return;
    if (!formData.email || !formData.fullName || !formData.nik)
      return toast.error('Email, Nama, dan NIK wajib diisi');

    setLoading(true);
    try {
      const authIdentityChanged =
        formData.email !== (user.email || '') ||
        formData.fullName !== (user.fullName || '');

      if (authIdentityChanged) {
        const { error: edgeError } = await supabase.functions.invoke('admin-update-user', {
          body: { userId: user.id, newEmail: formData.email, newFullName: formData.fullName },
        });
        if (edgeError) throw new Error(`Auth Update Error: ${edgeError.message}`);
      }

      await updateUserProfile(user.id, {
        ...(authIdentityChanged ? {} : { fullName: formData.fullName, email: formData.email }),
        nik:          formData.nik,
        jobTitle:     formData.jobTitle,
        role:         formData.role,
        phone:        formData.phone      || null,
        join_date:    formData.join_date   || null,
        resign_date:  formData.resign_date || null,
        officeId:     formData.officeId     === 'none' ? null : String(formData.officeId),
        departmentId: formData.departmentId === 'none' ? null : String(formData.departmentId),
        parentId:     formData.parentId     === 'none' ? null : formData.parentId,
        marisonEmployeeId: formData.marisonEmployeeId.trim() || null,
      });

      toast.success('Data karyawan berhasil diperbarui');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error('Gagal memperbarui: ' + (err.message || 'Terjadi kesalahan'));
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
                <UserCog className="w-6 h-6" />
              </div>
              <DialogTitle className="text-2xl font-extrabold tracking-tight">
                Edit Profil Karyawan
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground font-medium">
              Update kredensial login dan informasi struktural karyawan.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">

          {/* ── Kredensial & Identitas ──────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionTitle>Kredensial & Identitas</SectionTitle>
            <div className="grid grid-cols-2 gap-4 bg-secondary/30 p-4 rounded-xl border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email Kerja
                </Label>
                <Input type="email" value={formData.email} onChange={set('email')}
                  className="bg-background h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <UserCircle className="w-3.5 h-3.5 text-muted-foreground" /> Nama Lengkap
                </Label>
                <Input value={formData.fullName} onChange={set('fullName')}
                  className="bg-background h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" /> NIK
                </Label>
                <Input
                  value={formData.nik}
                  placeholder="A-001"
                  className={`h-10 font-mono ${
                    formData.nik?.includes('PENDING')
                      ? 'border-destructive bg-destructive/5 text-destructive'
                      : 'bg-background'
                  }`}
                  onChange={set('nik')}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" /> No. HP
                </Label>
                <Input value={formData.phone} onChange={set('phone')}
                  placeholder="08xxxxxxxxxx" className="bg-background h-10" />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-xs font-bold">ID Employee External</Label>
                <Input type="number" value={formData.marisonEmployeeId} onChange={set('marisonEmployeeId')}
                  placeholder="Kosong untuk user manual" className="bg-background h-10 font-mono" />
              </div>
            </div>
            {(user as any)?.marison_review_required && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                {((user as any).marison_review_reasons || []).join(' · ')}
              </div>
            )}
          </div>

          {/* ── Informasi Jabatan ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionTitle>Informasi Jabatan</SectionTitle>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">

              <div className="space-y-2">
                <Label className="text-xs font-bold">Jabatan</Label>
                <Input value={formData.jobTitle} placeholder="Manager IT"
                  onChange={set('jobTitle')} className="h-10 bg-background" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold">Hak Akses</Label>
                <Select value={formData.role}
                  onValueChange={(v: Role) => setFormData(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-10 font-bold text-primary">
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

              {/* ── Kantor — pilih dulu ─────────────────────────────────────── */}
              <div className="space-y-2">
                <Label className="text-xs font-bold flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" /> Kantor
                </Label>
                <Select value={formData.officeId}
                  onValueChange={v => setFormData(f => ({ ...f, officeId: v }))}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Pilih Kantor" />
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

              {/* ── Departemen — terfilter ──────────────────────────────────── */}
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
                  <SelectTrigger className="h-10 bg-background">
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

              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-bold">Atasan Langsung</Label>
                <Select value={formData.parentId || 'none'}
                  onValueChange={v => setFormData(f => ({ ...f, parentId: v }))}>
                  <SelectTrigger className="h-10 bg-background border-dashed">
                    <SelectValue placeholder="Pilih Atasan" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    <SelectItem value="none" className="italic text-muted-foreground">
                      Tidak Ada (Top Level)
                    </SelectItem>
                    {allUsers.filter(u => u.id !== user?.id).map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.fullName} —{' '}
                        <span className="text-[10px] opacity-50">{u.jobTitle}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>
          </div>

          {/* ── Riwayat Kerja ──────────────────────────────────────────────── */}
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
                  <span className="text-[9px] text-muted-foreground font-normal normal-case">
                    (kosongkan jika masih aktif)
                  </span>
                </Label>
                <Input type="date" value={formData.resign_date} onChange={set('resign_date')}
                  className="bg-background h-10" />
              </div>
            </div>
          </div>

        </div>

        <DialogFooter className="bg-secondary/50 p-6 gap-3 border-t border-border">
          <Button variant="ghost" onClick={onClose} disabled={loading} className="font-bold">
            Batalkan
          </Button>
          <Button onClick={handleSave} disabled={loading}
            className="min-w-[160px] font-extrabold shadow-lg shadow-primary/20">
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Menyimpan...</>
              : 'Simpan Perubahan'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
