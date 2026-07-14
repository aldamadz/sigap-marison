// src/pages/CalendarPage.tsx
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, FileText, Calendar as CalendarIcon, Plus } from 'lucide-react';

import { CalendarView } from '@/components/calendar/CalendarView';
import { DayAgendaDialog } from '@/components/calendar/DayAgendaDialog';
import { AgendaModal } from '@/components/agenda/AgendaModal';
import { AgendaDetailModal } from '@/components/agenda/AgendaDetailModal';
import { AgendaParentFilter } from '@/components/agenda/AgendaParentFilter';
import { getAgendasForParent } from '@/services/agenda.service';
import { exportCalendarData } from '@/services/export.service';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Agenda } from '@/types/agenda';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export default function CalendarPage() {
  const { user } = useAuth() as any;
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAgenda, setSelectedAgenda] = useState<Agenda | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDayDialogOpen, setIsDayDialogOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // Diangkat ke sini agar subtitle ikut bulan yang sedang ditampilkan
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const isAllTeamSelected = selectedUserId === 'all';
  const effectiveUserId = selectedUserId && selectedUserId !== 'all' ? selectedUserId : user?.id;

  // ── Fetch agendas ─────────────────────────────────────────────────────────
  const { data: agendas = [], isLoading } = useQuery({
    queryKey: ['agendas', user?.id, selectedUserId || user?.id, selectedOfficeId || 'all_offices'],
    queryFn: () => getAgendasForParent(user.id, selectedUserId || user.id, selectedOfficeId),
    enabled: !!user?.id,
  });

  const { data: activeProfile } = useQuery({
    queryKey: ['calendar-profile', effectiveUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', effectiveUserId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveUserId,
  });

  // ── Realtime sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('agendas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['agendas'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // ── Save / update mutation ────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<Agenda>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sesi tidak ditemukan, silakan login ulang');

      // Simpan waktu lokal user (WIB/UTC+7) bukan UTC
      // .toISOString() selalu UTC → jam geser +7 saat dibaca kembali
      const toLocalIso = (val: any): string | null => {
        if (!val) return null;
        const d = val instanceof Date ? val : new Date(val);
        if (isNaN(d.getTime())) return null;
        const pad  = (n: number) => String(n).padStart(2, '0');
        const tz   = -d.getTimezoneOffset();          // menit offset, mis: +420 untuk WIB
        const sign = tz >= 0 ? '+' : '-';
        const hh   = pad(Math.floor(Math.abs(tz) / 60));
        const mm   = pad(Math.abs(tz) % 60);
        return (
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
          `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
          `${sign}${hh}:${mm}`
        );
      };

      const payload: Record<string, any> = {
        title:       data.title,
        description: data.description ?? null,
        location:    data.location ?? null,
        start_time:  toLocalIso(data.startTime),
        end_time:    toLocalIso(data.endTime),
        status:      data.status ?? 'Scheduled',
        created_by:  session.user.id,
      };

      if (data.id) {
        // Update existing
        const { error } = await supabase
          .from('agendas')
          .update(payload)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        // Insert baru
        const { error } = await supabase
          .from('agendas')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] });
      toast.success(selectedAgenda ? 'Agenda berhasil diperbarui' : 'Agenda berhasil dibuat');
      handleCloseModal();
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Gagal menyimpan agenda');
    },
  });


  // Helper timezone-safe untuk drag & drop
  const toLocalIsoStatic = (d: Date): string => {
    const pad  = (n: number) => String(n).padStart(2, '0');
    const tz   = -d.getTimezoneOffset();
    const sign = tz >= 0 ? '+' : '-';
    const hh   = pad(Math.floor(Math.abs(tz) / 60));
    const mm   = pad(Math.abs(tz) % 60);
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
      `${sign}${hh}:${mm}`
    );
  };

  // ── Drag & drop reschedule ────────────────────────────────────────────────
  const dropMutation = useMutation({
    mutationFn: async ({ agendaId, newDate }: { agendaId: string; newDate: Date }) => {
      const agenda = agendas.find(a => String(a.id) === agendaId);
      if (!agenda) throw new Error('Agenda tidak ditemukan');

      const oldStart = new Date(agenda.startTime);
      const oldEnd   = new Date(agenda.endTime);
      const diff     = oldEnd.getTime() - oldStart.getTime();

      const newStart = new Date(newDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const newEnd = new Date(newStart.getTime() + diff);

      const { error } = await supabase
        .from('agendas')
        .update({ start_time: toLocalIsoStatic(newStart), end_time: toLocalIsoStatic(newEnd) })
        .eq('id', agendaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] });
      toast.success('Jadwal agenda dipindahkan');
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Gagal memindahkan agenda');
    },
  });

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsDetailOpen(false);
    setSelectedAgenda(null);
    setPrefilledDate(null);
  };

  const handleOpenDetail = (agenda: Agenda) => {
    setSelectedAgenda(agenda);
    setIsDetailOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(new Date(date.getTime()));
    setIsDayDialogOpen(true);
  };

  const handleAddAgendaForDay = () => {
    if (!selectedDate) return;

    const now = new Date();
    const dateWithCurrentTime = new Date(selectedDate.getTime());
    dateWithCurrentTime.setHours(now.getHours(), now.getMinutes());
    setIsDayDialogOpen(false);
    setPrefilledDate(dateWithCurrentTime);
    setSelectedAgenda(null);
    setIsModalOpen(true);
  };

  const handleDayAgendaClick = (agenda: Agenda) => {
    setIsDayDialogOpen(false);
    handleOpenDetail(agenda);
  };

  const handleOpenEdit = (agenda: Agenda) => {
    setSelectedAgenda(agenda);
    setPrefilledDate(null);
    setIsModalOpen(true);
  };

  const userName = isAllTeamSelected
    ? 'Seluruh Anggota Tim'
    : activeProfile?.full_name ?? agendas.find(a => a.createdBy === effectiveUserId)?.profiles?.fullName ?? 'User';

  const monthlyCount = useMemo(() => {
    return agendas.filter(a => {
      if (!a.startTime) return false;
      if (!isAllTeamSelected && effectiveUserId && a.createdBy !== effectiveUserId) return false;
      const d = new Date(a.startTime);
      return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
    }).length;
  }, [agendas, currentMonth, effectiveUserId, isAllTeamSelected]);

  if (isLoading) return (
    <div className="py-2 sm:p-6">
      <Skeleton className="h-[500px] w-full rounded-xl opacity-20" />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 py-1 sm:space-y-6 sm:p-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:pb-6 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 sm:h-12 sm:w-12">
            <CalendarIcon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">Agenda Kerja</h1>
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{userName} — {monthlyCount} Entri Bulan Ini</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11 w-full rounded-lg border-border font-medium sm:h-10 sm:w-auto">
                <FileDown className="w-4 h-4 mr-2" /> Ekspor
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 p-1">
              <DropdownMenuItem
                onClick={() => exportCalendarData(agendas, 'excel', userName)}
                className="cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2 text-green-500" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportCalendarData(agendas, 'pdf', userName)}
                className="cursor-pointer"
              >
                <FileText className="w-4 h-4 mr-2 text-red-500" /> PDF (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => { setPrefilledDate(new Date()); setIsModalOpen(true); }}
            className="h-11 w-full rounded-lg bg-primary font-semibold shadow-sm sm:h-10 sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-1" /> Agenda Baru
          </Button>
        </div>
      </div>

      {/* ── Calendar ─────────────────────────────────────────────────────────── */}
      <AgendaParentFilter
        selectedUserId={selectedUserId || user?.id || null}
        onUserSelect={setSelectedUserId}
        selectedOfficeId={selectedOfficeId}
        onOfficeSelect={setSelectedOfficeId}
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <CalendarView
          agendas={agendas}
          onDateClick={handleDateClick}
          onAgendaClick={handleOpenDetail}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          onAgendaDrop={(agendaId, newDate) =>
            dropMutation.mutate({ agendaId, newDate })
          }
        />
      </div>

      <DayAgendaDialog
        open={isDayDialogOpen}
        onOpenChange={setIsDayDialogOpen}
        date={selectedDate}
        agendas={agendas}
        onAddAgenda={handleAddAgendaForDay}
        onAgendaClick={handleDayAgendaClick}
      />

      {/* ── Detail modal ─────────────────────────────────────────────────────── */}
      <AgendaDetailModal
        agenda={selectedAgenda}
        open={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onEdit={handleOpenEdit}
      />

      {/* ── Edit / buat modal ────────────────────────────────────────────────── */}
      <AgendaModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        agenda={selectedAgenda}
        prefilledDate={prefilledDate}
        onSave={(data) => saveMutation.mutate(data)}
      />
    </div>
  );
}
