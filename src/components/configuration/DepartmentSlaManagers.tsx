import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { departmentReceivingService } from '@/services/department-receiving.service';

export function DepartmentSlaManagers({ deptId }: { deptId: string }) {
  const client = useQueryClient();
  const candidates = useQuery({
    queryKey: ['department-sla-manager-candidates', deptId],
    queryFn: () => departmentReceivingService.getManagerCandidates(deptId),
    retry: false, gcTime: 0, refetchOnMount: 'always',
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSelected((candidates.data || []).filter(row => row.selected).map(row => row.user_id));
  }, [candidates.data, deptId]);
  useEffect(() => { setNotice(''); }, [deptId]);
  const locked = busy || candidates.isPending || candidates.isError || !candidates.isFetchedAfterMount;
  const save = async () => {
    if (locked) return;
    setBusy(true);
    setNotice('');
    setFailed(false);
    try {
      // Submit only candidates from this department; the RPC rechecks active membership.
      const allowed = new Set(candidates.data?.map(row => row.user_id));
      await departmentReceivingService.setManagers(deptId, selected.filter(id => allowed.has(id)));
      const result = await candidates.refetch();
      await client.invalidateQueries({ queryKey: ['department-sla-scope'] });
      if (result.isError) throw Error('reload');
      setNotice('Pengelola SLA tersimpan.');
    } catch {
      setFailed(true);
      setNotice('Pengelola belum dapat dikonfirmasi. Muat ulang daftar lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="space-y-3 border-t pt-5" aria-label="Pengelola SLA departemen">
    <h2 className="flex items-center gap-2 text-base font-semibold"><Users className="h-5 w-5" aria-hidden="true" />Pengelola SLA departemen</h2>
    {candidates.isPending && <p role="status" className="text-sm text-muted-foreground">Memuat anggota departemen...</p>}
    {candidates.isError ? <div role="alert" className="space-y-2 text-sm"><p>Anggota departemen belum dapat dimuat.</p><Button variant="outline" onClick={() => { void candidates.refetch(); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div> : <>
      <fieldset disabled={locked} aria-label="Anggota departemen" className="grid min-w-0 gap-x-5 sm:grid-cols-2">
        {(candidates.isFetchedAfterMount ? candidates.data || [] : []).map(row => <label key={row.user_id} className="flex min-h-10 min-w-0 items-center gap-3 border-b py-2 text-sm">
          <input type="checkbox" checked={selected.includes(row.user_id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.user_id] : previous.filter(id => id !== row.user_id))} className="h-4 w-4 shrink-0 accent-primary" />
          <span className="min-w-0 break-words">{row.full_name || 'Anggota departemen'}</span>
        </label>)}
      </fieldset>
      {candidates.isSuccess && candidates.isFetchedAfterMount && !candidates.data.length && <p className="text-sm text-muted-foreground">Tidak ada anggota aktif di departemen ini.</p>}
      <Button disabled={locked} onClick={() => { void save(); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan pengelola</Button>
    </>}
    {notice && <p role={failed ? 'alert' : 'status'} className="text-sm">{notice}</p>}
  </section>;
}
