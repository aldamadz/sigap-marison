import { SettingsView } from '@/components/settings/SettingsView'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ChevronRight, Timer } from 'lucide-react'
import { departmentReceivingService } from '@/services/department-receiving.service'

export default function SettingsPage({ userId }: { userId: string }) {
  const scope = useQuery({
    queryKey: ['department-sla-scope', userId], queryFn: () => departmentReceivingService.getScope(),
    retry: false, gcTime: 0, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  })
  const departmentSettings = scope.isSuccess && scope.isFetchedAfterMount && scope.data.length > 0
    ? <nav aria-labelledby="settings-department" className="space-y-2 py-5">
      <h2 id="settings-department" className="text-base font-semibold">Pengaturan departemen</h2>
      <Link to="/settings/department-sla" className="flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Timer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />SLA departemen<ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </nav> : undefined
  return <SettingsView departmentSettings={departmentSettings} />
}
