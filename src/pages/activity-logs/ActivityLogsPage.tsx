import { useState, useMemo } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ActivityLogsView } from '@/components/activity/ActivityLogsView'
import { AgendaParentFilter } from '@/components/agenda/AgendaParentFilter'
import { 
  getActivityLogs, 
  getUsers, 
  getAgendas, 
  getCurrentUser,
  isParentUser 
} from '@/services'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, RefreshCcw, History, ArrowDown, Search } from 'lucide-react'

export default function ActivityLogsPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [pageSize] = useState<number>(15)

  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading: loadingLogs, 
    error: errorLogs,
    refetch 
  } = useInfiniteQuery({ 
    queryKey: ['activity-logs', selectedUserId, selectedOfficeId, pageSize], 
    queryFn: ({ pageParam = 0 }) => getActivityLogs(selectedUserId, selectedOfficeId, pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => lastPage.length === pageSize ? allPages.length : undefined
  })
  
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: agendas } = useQuery({ queryKey: ['agendas'], queryFn: getAgendas })
  const { data: currentUser } = useQuery({ queryKey: ['currentUser'], queryFn: getCurrentUser })
  const { data: isParent } = useQuery({
    queryKey: ['is-parent', currentUser?.id],
    queryFn: () => isParentUser(currentUser?.id || ''),
    enabled: !!currentUser?.id
  })

  const allLogs = data?.pages.flat() ?? []

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      const actor = users?.find(u => String(u.id) === String(log.userId || log.user_id));
      const actorName = log.profiles?.fullName || actor?.fullName || 'Sistem';
      const searchable = [
        actorName,
        log.action,
        log.tableName || log.table_name,
        log.recordId || log.record_id,
        JSON.stringify(log.oldValues || {}),
        JSON.stringify(log.newValues || {}),
      ].join(' ').toLowerCase();
      const matchesSearch = searchQuery === '' || 
        searchable.includes(searchQuery.toLowerCase());
      const matchesAction = actionFilter === 'all' || log.action?.toUpperCase() === actionFilter;
      return matchesSearch && matchesAction;
    });
  }, [allLogs, searchQuery, actionFilter, users]);

  if (errorLogs) return <div className="p-10 text-center"><Button onClick={() => refetch()}>Retry</Button></div>;

  return (
    <div className="w-full space-y-6">
      
      {/* HEADER */}
      <div className="flex items-center gap-4">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <History className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground">Jejak audit administratif untuk perubahan data sistem.</p>
        </div>
      </div>

      {/* TABS/CONTAINER TABEL */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        
        {/* BARIS FILTER DISATUKAN DALAM SATU BOX */}
        <div className="p-5 border-b border-border/50 bg-muted/20 flex flex-col gap-4">
          
          {/* BARIS 1: Search & Aksi */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Cari pelaku, tabel, surat, agenda, atau perubahan data..." 
                className="pl-10 bg-background border-border/60 focus-visible:ring-primary/20"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-48 bg-background font-bold text-xs uppercase tracking-widest">
                <SelectValue placeholder="Pilih Aksi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Aksi</SelectItem>
                <SelectItem value="INSERT" className="text-emerald-600 font-bold">Inserted</SelectItem>
                <SelectItem value="CREATE" className="text-emerald-600 font-bold">Created</SelectItem>
                <SelectItem value="UPDATE" className="text-blue-600 font-bold">Updated</SelectItem>
                <SelectItem value="DELETE" className="text-rose-600 font-bold">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* BARIS 2: Filter Kantor & User (Hanya muncul jika isParent) */}
          {isParent && (
            <div className="pt-3 border-t border-border/40">
               <div className="rounded-md border border-dashed border-border/80 bg-background/40 p-1">
                <AgendaParentFilter
                  onUserSelect={setSelectedUserId}
                  selectedUserId={selectedUserId}
                  onOfficeSelect={setSelectedOfficeId}
                  selectedOfficeId={selectedOfficeId}
                />
              </div>
            </div>
          )}
        </div>

        {/* VIEW TABEL */}
        {loadingLogs ? (
          <div className="p-20"><Skeleton className="h-40 w-full" /></div>
        ) : (
          <ActivityLogsView
            logs={filteredLogs}
            users={users ?? []}
            agendas={agendas ?? []}
            currentUser={currentUser ?? null}
          />
        )}
      </div>

      {/* PAGINATION */}
      {hasNextPage && (
        <div className="flex justify-center pb-12">
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="ghost"
            className="rounded-full px-12 h-14 font-black uppercase tracking-widest text-[10px] hover:bg-primary/5 group border border-transparent hover:border-primary/20 transition-all"
          >
            {isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : (
              <ArrowDown className="h-5 w-5 mr-3 text-primary group-hover:animate-bounce" />
            )}
            Muat Data Selanjutnya
          </Button>
        </div>
      )}
    </div>
  )
}
