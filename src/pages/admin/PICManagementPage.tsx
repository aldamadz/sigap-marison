import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Crown, Building2, Search, Loader2, ChevronDown,
  ShieldCheck, Users, AlertCircle, X, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ── Types (sesuai schema DB aktual) ──────────────────────────────────────────

interface Department {
  id: string;
  name: string;
  code: string | null;
}

interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: string | null;
  job_title: string | null;
}

// Supabase join profiles:user_id(...) selalu array
interface DeptPIC {
  id: string;
  dept_id: string;
  user_id: string;
  profiles: { full_name: string; email: string | null }[] | null;
}

interface DeptWithPICs extends Department {
  pics: DeptPIC[];
}

// ── Component ─────────────────────────────────────────────────────────────────

const PICManagementPage = () => {
  const [depts, setDepts] = useState<DeptWithPICs[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchDept, setSearchDept] = useState('');
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [addingToDept, setAddingToDept] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isAdminUser = (user: Profile) => (user.role ?? '').toLowerCase() === 'admin';

  // ── Fetch all data ─────────────────────────────────────────────────────────
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [{ data: deptData }, { data: picRaw }, { data: usersData }] = await Promise.all([
        supabase
          .from('master_departments')
          .select('id, name, code')
          .order('name'),
        // Ambil master_dept_pics TANPA join — hindari ambiguitas multiple FK ke profiles
        supabase
          .from('master_dept_pics')
          .select('id, dept_id, user_id'),
        supabase
          .from('profiles')
          .select('id, full_name, email, role, job_title')
          .is('deleted_at', null)
          .order('full_name'),
      ]);

      const deptList = (deptData ?? []) as Department[];
      const userList = (usersData ?? []) as Profile[];
      const adminIds = new Set(userList.filter(isAdminUser).map((u) => u.id));

      // Buat lookup map user_id → profile untuk merge manual
      const profileMap = new Map<string, Profile>();
      userList.forEach((u) => profileMap.set(u.id, u));

      const adminPicRows = (picRaw ?? []).filter((p: any) => adminIds.has(p.user_id));
      if (adminPicRows.length > 0) {
        const { error: cleanupError } = await supabase
          .from('master_dept_pics')
          .delete()
          .in('id', adminPicRows.map((p: any) => p.id));
        if (cleanupError) throw cleanupError;
        toast.success(`${adminPicRows.length} mapping PIC admin dibersihkan`);
      }

      const safePicRows = (picRaw ?? []).filter((p: any) => !adminIds.has(p.user_id));

      // Gabungkan pic + profile secara manual
      const picList: DeptPIC[] = safePicRows.map((p: any) => ({
        id: p.id,
        dept_id: p.dept_id,
        user_id: p.user_id,
        profiles: profileMap.has(p.user_id)
          ? [{ full_name: profileMap.get(p.user_id)!.full_name, email: profileMap.get(p.user_id)!.email }]
          : null,
      }));

      setDepts(
        deptList.map((dept) => ({
          ...dept,
          pics: picList.filter((p) => p.dept_id === dept.id),
        }))
      );
      setAllUsers(userList);
    } catch {
      toast.error('Gagal memuat data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Add PIC ────────────────────────────────────────────────────────────────
  const handleAddPIC = async (deptId: string, userId: string) => {
    const dept = depts.find((d) => d.id === deptId);
    const selectedUser = allUsers.find((u) => u.id === userId);
    if (selectedUser && isAdminUser(selectedUser)) {
      return toast.error('Admin tidak perlu dimasukkan ke mapping PIC');
    }
    if (dept?.pics.some((p) => p.user_id === userId)) {
      return toast.error('User sudah menjadi PIC departemen ini');
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('master_dept_pics')
        .insert({ dept_id: deptId, user_id: userId });
      if (error) throw error;
      toast.success('PIC berhasil ditambahkan');
      setAddingToDept(null);
      setUserSearch('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message ?? 'Gagal menambahkan PIC');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Remove PIC ─────────────────────────────────────────────────────────────
  const handleRemovePIC = async (picId: string, deptName: string) => {
    if (!confirm(`Hapus PIC dari departemen ${deptName}?`)) return;
    try {
      const { error } = await supabase
        .from('master_dept_pics')
        .delete()
        .eq('id', picId);
      if (error) throw error;
      toast.success('PIC dihapus');
      fetchData();
    } catch {
      toast.error('Gagal menghapus PIC');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filteredDepts = depts.filter((d) =>
    d.name.toLowerCase().includes(searchDept.toLowerCase()) ||
    (d.code ?? '').toLowerCase().includes(searchDept.toLowerCase())
  );

  const filteredUsers = allUsers.filter(
    (u) =>
      !isAdminUser(u) &&
      (
        u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email ?? '').toLowerCase().includes(userSearch.toLowerCase())
      )
  );

  const totalPICs    = depts.reduce((s, d) => s + d.pics.length, 0);
  const deptsWithPIC = depts.filter((d) => d.pics.length > 0).length;
  const deptsNoPIC   = depts.length - deptsWithPIC;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold tracking-tighter flex items-center gap-3 uppercase">
            <Crown className="text-primary w-8 h-8 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              Manajemen PIC
            </span>
          </h1>
          <p className="text-muted-foreground text-sm font-medium">
            Kelola penanggung jawab (PIC) untuk setiap departemen.
          </p>
        </div>

        {/* Stats */}
        <div className="flex gap-3">
          <StatCard value={totalPICs}    label="Total PIC"   color="primary" />
          <StatCard value={deptsWithPIC} label="Dept Aktif"  color="success" />
          <StatCard value={deptsNoPIC}   label="Tanpa PIC"   color="warning" />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <input
          type="text"
          placeholder="Cari departemen atau kode..."
          value={searchDept}
          onChange={(e) => setSearchDept(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Department list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDepts.map((dept) => {
            const isExpanded   = expandedDept === dept.id;
            const isAddingHere = addingToDept  === dept.id;
            const hasPIC       = dept.pics.length > 0;

            return (
              <Card
                key={dept.id}
                className={`overflow-hidden transition-all border ${hasPIC ? 'border-border' : 'border-warning/30'}`}
              >
                {/* Dept header row */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${hasPIC ? 'bg-primary/10' : 'bg-warning/10'}`}>
                      <Building2 size={18} className={hasPIC ? 'text-primary' : 'text-warning'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black tracking-tight uppercase">{dept.name}</h3>
                        {dept.code && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                            {dept.code}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                        {dept.pics.length} PIC Terdaftar
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!hasPIC && (
                      <span className="hidden md:flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border bg-warning/10 text-warning border-warning/30">
                        <AlertCircle size={9} /> Belum ada PIC
                      </span>
                    )}
                    {dept.pics.slice(0, 2).map((p) => (
                      <span
                        key={p.id}
                        className="hidden md:flex items-center gap-1 text-[9px] bg-primary/5 text-primary border border-primary/20 rounded-full px-2 py-0.5 font-bold"
                      >
                        <ShieldCheck size={9} /> {p.profiles?.[0]?.full_name ?? '—'}
                      </span>
                    ))}
                    {dept.pics.length > 2 && (
                      <span className="hidden md:inline text-[9px] text-muted-foreground font-bold">
                        +{dept.pics.length - 2} lagi
                      </span>
                    )}
                    <ChevronDown
                      size={16}
                      className={`text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-border bg-secondary/5 px-5 py-4 space-y-4">

                    {/* Existing PICs */}
                    {hasPIC ? (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Daftar PIC Aktif</p>
                        {dept.pics.map((pic) => (
                          <div key={pic.id} className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <ShieldCheck size={14} className="text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-bold">{pic.profiles?.[0]?.full_name ?? '—'}</p>
                                <p className="text-[10px] text-muted-foreground">{pic.profiles?.[0]?.email ?? '—'}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemovePIC(pic.id, dept.name)}
                              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title="Hapus PIC"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-warning/5 rounded-xl border border-warning/20">
                        <AlertCircle size={16} className="text-warning shrink-0" />
                        <p className="text-xs font-bold text-warning">
                          Departemen ini belum memiliki PIC yang ditunjuk.
                        </p>
                      </div>
                    )}

                    {/* Add PIC */}
                    {isAddingHere ? (
                      <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Cari nama atau email user..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>

                        <div className="max-h-52 overflow-y-auto border border-border rounded-xl bg-background divide-y divide-border/40">
                          {filteredUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-6 font-bold">
                              User tidak ditemukan
                            </p>
                          ) : (
                            filteredUsers.slice(0, 30).map((user) => {
                              const alreadyPIC = dept.pics.some((p) => p.user_id === user.id);
                              return (
                                <button
                                  key={user.id}
                                  disabled={alreadyPIC || isSaving}
                                  onClick={() => handleAddPIC(dept.id, user.id)}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                                >
                                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <Users size={12} className="text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{user.full_name}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{user.email ?? '—'}</p>
                                  </div>
                                  {alreadyPIC ? (
                                    <span className="text-[9px] bg-success/10 text-success border border-success/20 rounded px-1.5 py-0.5 font-black uppercase shrink-0">
                                      Sudah PIC
                                    </span>
                                  ) : user.role ? (
                                    <span className="text-[9px] text-muted-foreground font-bold uppercase shrink-0">
                                      {user.role}
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setAddingToDept(null); setUserSearch(''); }}
                          className="w-full text-xs"
                        >
                          <X size={14} className="mr-1" /> Batal
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingToDept(dept.id)}
                        className="w-full border-dashed border-primary/30 text-primary hover:bg-primary/5 text-xs font-bold uppercase tracking-widest"
                      >
                        <Plus size={14} className="mr-2" /> Tambah PIC
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Stat card helper ──────────────────────────────────────────────────────────

const colorMap = {
  primary: { bg: 'bg-primary/5 border-primary/20',   text: 'text-primary' },
  success: { bg: 'bg-success/5 border-success/20',   text: 'text-success' },
  warning: { bg: 'bg-warning/5 border-warning/20',   text: 'text-warning' },
} as const;

const StatCard = ({
  value, label, color,
}: {
  value: number;
  label: string;
  color: keyof typeof colorMap;
}) => {
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border rounded-xl px-4 py-3 text-center min-w-[72px]`}>
      <p className={`text-2xl font-black ${c.text}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
};

export default PICManagementPage;
