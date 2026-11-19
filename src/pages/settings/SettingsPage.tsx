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
  const departmentSettings = scope.isSuccess && scope.isFetchedAfterMount && scope.data.length > 0
    ? <nav aria-label="Pengaturan departemen" className="py-4">
      <Link to="/settings/department-sla" className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-muted">
        <Timer className="h-4 w-4 text-muted-foreground" aria-hidden="true" />SLA departemen<ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </Link>
    </nav> : undefined
  return <SettingsView departmentSettings={departmentSettings} />
}
