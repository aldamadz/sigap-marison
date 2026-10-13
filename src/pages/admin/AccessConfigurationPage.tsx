import { useEffect, useRef, useState } from 'react';
import { Save, ShieldCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { accessService } from '@/services/access.service';
import type { MasterOffice } from '@/services/office.service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

type AccessUser = { id: string; full_name: string; email: string; office_id: string | null };

export default function AccessConfigurationPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [offices, setOffices] = useState<MasterOffice[]>([]);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [loadedOffices, setLoadedOffices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [userError, setUserError] = useState('');
  const [usersLoading, setUsersLoading] = useState(true);
  const generation = useRef(0);
  const saveLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    accessService.getOfficeCatalog().then(data => {
      if (!cancelled) { setOffices(data); setCatalogReady(true); }
    }).catch(() => { if (!cancelled) setCatalogError('Gagal memuat daftar kantor. Muat ulang halaman.'); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    setUserError('');
    const timer = setTimeout(async () => {
      const query = supabase.from('profiles').select('id, full_name, email, office_id')
        .eq('is_active', true).is('deleted_at', null).eq('role', 'user')
        .order('full_name').limit(50);
      if (search.trim()) query.ilike('full_name', `%${search.trim()}%`);
      const result = await query;
      if (!cancelled) {
        if (result.error) { setUsers([]); setUserError('Gagal memuat pengguna. Coba pencarian kembali.'); }
        else setUsers(result.data || []);
        setUsersLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);
  useEffect(() => () => { generation.current += 1; }, []);

  const selectUser = async (user: AccessUser) => {
    const request = ++generation.current;
    setSelectedUser(user);
    setLoading(true);
    setError('');
    setSelectedOffices([]);
    setLoadedOffices([]);
    try {
      const grants = await accessService.getUserOfficeGrants(user.id);
      if (request !== generation.current) return;
      setSelectedOffices(grants);
      setLoadedOffices(grants);
    } catch {
      if (request === generation.current) setError('Gagal memuat hak akses. Pilih pengguna kembali.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };
  const save = async () => {
    if (!selectedUser || loading || error || !catalogReady || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    const user = selectedUser;
    const officesToSave = [...selectedOffices];
    try {
      await accessService.setUserOfficeGrants(user.id, officesToSave);
      setLoadedOffices(officesToSave);
      toast({ title: 'Hak akses disimpan', description: user.full_name });
    } catch {
      toast({ variant: 'destructive', title: 'Gagal menyimpan hak akses' });
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };
  const dirty = [...selectedOffices].sort().join() !== [...loadedOffices].sort().join();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
      <section className="space-y-3">
        <label htmlFor="access-user-search" className="text-sm font-semibold">Pengguna</label>
        <Input id="access-user-search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama pengguna" disabled={saving} />
        {userError && <p role="alert" className="text-sm text-destructive">{userError}</p>}
        <div className="max-h-[480px] overflow-y-auto divide-y border-y">
          {users.map(user => <button key={user.id} type="button" disabled={saving}
            aria-pressed={selectedUser?.id === user.id}
            onClick={() => { void selectUser(user); }}
            className={`w-full px-3 py-3 text-left hover:bg-muted disabled:opacity-50 ${selectedUser?.id === user.id ? 'bg-primary/10' : ''}`}>
            <span className="block text-sm font-medium break-words">{user.full_name}</span>
            <span className="block text-xs text-muted-foreground break-all">{user.email}</span>
          </button>)}
          {usersLoading ? <p role="status" className="py-4 text-sm text-muted-foreground">Memuat pengguna...</p> :
            users.length === 0 && !userError && <p className="py-4 text-sm text-muted-foreground">Pengguna tidak ditemukan.</p>}
        </div>
      </section>
      <section className="min-w-0 space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 shrink-0" />
          <h3 className="text-base font-semibold">Kantor Pengajuan</h3></div>
        {catalogError && <p role="alert" className="text-sm text-destructive">{catalogError}</p>}
        {!selectedUser ? <p className="text-sm text-muted-foreground">Pilih pengguna.</p> : <>
          <p className="text-sm font-medium">{selectedUser.full_name}</p>
          <p className="text-sm text-muted-foreground">Kantor profil: {offices.find(o => o.id === selectedUser.office_id)?.name || 'Belum diisi'}</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading ? <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memuat hak akses...</div> :
            <fieldset disabled={saving || Boolean(error) || !catalogReady} className="divide-y border-y">
              <legend className="mb-2 text-sm font-medium">Kantor yang boleh dipilih</legend>
              {offices.filter(o => ['KC', 'KCP'].includes(String(o.kedudukan).toUpperCase())).map(office => {
                const own = office.id === selectedUser.office_id;
                return <label key={office.id} className="flex items-start gap-3 py-3">
                  <Checkbox aria-label={`${office.kedudukan} ${office.name}`} disabled={own || saving || Boolean(error) || !catalogReady}
                    checked={own || selectedOffices.includes(office.id)}
                    onCheckedChange={checked => setSelectedOffices(prev => checked === true
                      ? [...new Set([...prev, office.id])] : prev.filter(id => id !== office.id))} />
                  <span className="min-w-0 text-sm break-words">{office.kedudukan}. {office.name}
                    {own && <span className="ml-2 text-xs text-muted-foreground">Kantor profil</span>}</span>
                </label>;
              })}
            </fieldset>}
          <Button onClick={() => { void save(); }} disabled={loading || saving || !dirty || Boolean(error) || !catalogReady}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Simpan Hak Akses
          </Button>
        </>}
      </section>
    </div>
  );
}
