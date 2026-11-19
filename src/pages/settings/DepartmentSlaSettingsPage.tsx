import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DepartmentReceivingPolicy } from '@/components/configuration/DepartmentReceivingPolicy';
import { departmentReceivingService } from '@/services/department-receiving.service';

export default function DepartmentSlaSettingsPage({ userId }: { userId: string }) {
  const scope = useQuery({
    queryKey: ['department-sla-scope', userId], queryFn: () => departmentReceivingService.getScope(),
    retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  });
  const [selected, setSelected] = useState('');
  const departments = scope.isSuccess && scope.isFetchedAfterMount ? scope.data : [];
  const deptId = departments.some(row => row.dept_id === selected) ? selected : departments[0]?.dept_id;

  return <div className="sigap-page mx-auto max-w-5xl space-y-6">
    <header>
      <h1 className="text-2xl font-semibold">SLA departemen</h1>
    </header>
    {scope.isPending || !scope.isFetchedAfterMount ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memeriksa akses departemen...</p> : scope.isError ?
      <div role="alert" className="space-y-3 text-sm"><p>Akses departemen belum dapat dikonfirmasi.</p><Button variant="outline" onClick={() => { void scope.refetch(); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div> : !deptId ?
        <p role="status" className="text-sm text-muted-foreground">Anda tidak memiliki akses pengelolaan SLA departemen.</p> :
          <DepartmentReceivingPolicy key={userId} deptId={deptId} departmentField={
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              <span>Departemen</span>
              <select className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal" value={deptId} onChange={event => setSelected(event.target.value)}>
                {departments.map(row => <option key={row.dept_id} value={row.dept_id}>{row.name}</option>)}
              </select>
            </label>
          } />}
  </div>;
}
