// frontend/src/pages/agenda/AgendaPage.tsx
import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { AgendaTabs }        from '@/components/agenda/AgendaTabs'
import { AgendaModal }       from '@/components/agenda/AgendaModal'
import { AgendaDetailModal } from '@/components/agenda/AgendaDetailModal'  // ← nama baru
import { AgendaParentFilter } from '@/components/agenda/AgendaParentFilter'
import { Button }   from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import {
  getAgendas,
  getUsers,
  saveAgenda,
  updateAgendaStatus,
  deleteAgenda,
  getAgendasForParent,
  isParentUser,
} from '@/services'

import { useAuth } from '@/hooks/use-auth'
import type { Agenda, AgendaStatus } from '@/types/agenda'

export default function AgendaPage() {
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuth() as any

  const [isModalOpen,  setIsModalOpen]  = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedAgenda, setSelectedAgenda] = useState<Agenda | null>(null)

  const [isParent,         setIsParent]         = useState(false)
  const [selectedUserId,   setSelectedUserId]   = useState<string | null>(null)
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null)
  const [isCheckingParent, setIsCheckingParent] = useState(true)

  /* ── 1. Check parent status ──────────────────────────────────────────────── */
  useEffect(() => {
    const check = async () => {
      if (authLoading) return
      if (!user?.id) { setIsCheckingParent(false); return; }
      setIsCheckingParent(true)
      try {
        const parentStatus = await isParentUser(user.id)
        setIsParent(parentStatus)
        setSelectedUserId(parentStatus ? 'all' : user.id)
      } catch {
        setIsParent(false)
      } finally {
        setIsCheckingParent(false)
      }
    }
    check()
  }, [authLoading, user?.id])

  /* ── 2. Data fetching ────────────────────────────────────────────────────── */
  const { data: agendas = [], isLoading: isLoadingAgendas } = useQuery({
    queryKey: ['agendas', user?.id, selectedUserId, selectedOfficeId, isParent],
    queryFn: async () => {
      if (!user?.id) return []
      if (isParent) return await getAgendasForParent(user.id, selectedUserId, selectedOfficeId)
      return await getAgendas()
    },
    enabled: !!user?.id && !authLoading && !isCheckingParent,
    staleTime: 1000 * 60 * 5,
  })

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: !!user?.id && !authLoading,
  })

  /* ── 3. Mutations ────────────────────────────────────────────────────────── */
  const closeAllModals = useCallback(() => {
    setIsModalOpen(false)
    setIsDetailOpen(false)
    setSelectedAgenda(null)
  }, [])

  const agendaMutation = useMutation({
    mutationFn: (data: Partial<Agenda>) => {
      const id = selectedAgenda?.id ? (selectedAgenda.id as any) : undefined
      return saveAgenda(data, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
      toast.success(selectedAgenda ? 'Agenda diperbarui' : 'Agenda baru dibuat')
      closeAllModals()
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menyimpan data'),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string | number; status: AgendaStatus }) =>
      updateAgendaStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
      toast.success('Status diperbarui')
    },
    onError: (err: any) => toast.error(err.message || 'Gagal mengubah status'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => deleteAgenda(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] })
      toast.success('Agenda berhasil dihapus')
      closeAllModals()
    },
    onError: (err: any) => toast.error(err.message || 'Gagal menghapus agenda'),
  })

  /* ── 4. Handlers ─────────────────────────────────────────────────────────── */
  const handleAgendaClick = useCallback((agenda: Agenda) => {
    setSelectedAgenda(agenda)
    setIsDetailOpen(true)
  }, [])

  const handleEditFromDetail = (agenda: Agenda) => {
    setSelectedAgenda(agenda)
    setIsDetailOpen(false)
    setTimeout(() => setIsModalOpen(true), 200)
  }

  const handleStatusChange = useCallback((id: string | number, status: AgendaStatus) => {
    statusMutation.mutate({ id, status })
  }, [statusMutation])

  const getSubtitle = () => {
    if (!isParent) return 'Kelola jadwal pribadi Anda secara efisien.'
    if (selectedUserId === user?.id) return 'Menampilkan agenda pribadi Anda.'
    if (selectedUserId === 'all' || !selectedUserId) return 'Menampilkan seluruh agenda tim berdasarkan hirarki.'
    const targetMember = users.find((u: any) => String(u.id) === String(selectedUserId))
    return `Menampilkan agenda untuk: ${(targetMember as any)?.fullName || 'Anggota Tim'}`
  }

  /* ── 5. Render ───────────────────────────────────────────────────────────── */
  if (authLoading || isLoadingAgendas || isLoadingUsers || isCheckingParent) {
    return (
      <div className="sigap-page">
        <div className="flex justify-between items-center">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-12 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="sigap-page">
      <div className="sigap-panel sigap-panel-accent flex flex-col items-start justify-between gap-5 p-5 md:flex-row md:items-center sm:p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold sm:text-2xl">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">{getSubtitle()}</p>
        </div>
        <Button
          onClick={() => { setSelectedAgenda(null); setIsModalOpen(true); }}
          className="h-11 px-5"
        >
          <span className="mr-2 text-lg">+</span> Agenda baru
        </Button>
      </div>

      {isParent && (
        <div className="sigap-panel p-5">
          <AgendaParentFilter
            onUserSelect={(id) => setSelectedUserId(id || 'all')}
            selectedUserId={selectedUserId}
            onOfficeSelect={setSelectedOfficeId}
            selectedOfficeId={selectedOfficeId}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {agendas.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground">Tidak ada agenda ditemukan untuk filter ini.</p>
          </div>
        ) : (
          <AgendaTabs
            agendas={agendas}
            users={users}
            onAgendaClick={handleAgendaClick}
            onStatusChange={handleStatusChange}
          />
        )}
      </div>

      {/* ── Detail Modal ── */}
      <AgendaDetailModal
        agenda={selectedAgenda}
        isOpen={isDetailOpen}
        onClose={closeAllModals}
        onEdit={handleEditFromDetail}
        onStatusChange={handleStatusChange}
        onDelete={(id) => deleteMutation.mutate(id)}
        users={users}
        isDeleting={deleteMutation.isPending}
        currentUserId={user?.id}
      />

      {/* ── Edit / Buat Modal ── */}
      <AgendaModal
        isOpen={isModalOpen}
        agenda={selectedAgenda}
        onClose={closeAllModals}
        onSave={(data) => agendaMutation.mutate(data)}
        isLoading={agendaMutation.isPending}
      />
    </div>
  )
}
