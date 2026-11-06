import { SettingsView } from '@/components/settings/SettingsView'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowRight, Timer } from 'lucide-react'
import { departmentReceivingService } from '@/services/department-receiving.service'

export default function SettingsPage({ userId }: { userId: string }) {
  const scope = useQuery({
    queryKey: ['department-sla-scope', userId], queryFn: () => departmentReceivingService.getScope(),
    retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  })
  return <>
    {scope.isSuccess && scope.isFetchedAfterMount && scope.data.length > 0 && <nav aria-label="Pengaturan departemen" className="mx-auto mb-5 max-w-5xl border-b pb-4">
      <Link to="/settings/department-sla" className="flex min-h-10 items-center gap-2 text-sm font-medium text-primary hover:underline"><Timer className="h-4 w-4" aria-hidden="true" />SLA departemen<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
    </nav>}
    <SettingsView />
  </>
}
