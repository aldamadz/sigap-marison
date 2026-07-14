import { useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { CalendarDays, Clock, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getAgendasForDay } from '@/lib/calendar-agenda';
import { Agenda, AgendaStatus } from '@/types/agenda';

interface DayAgendaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  agendas: Agenda[];
  onAddAgenda: () => void;
  onAgendaClick: (agenda: Agenda) => void;
}

const statusLabels: Record<AgendaStatus, string> = {
  Scheduled: 'Terjadwal',
  Ongoing: 'Berlangsung',
  Completed: 'Selesai',
  Overdue: 'Terlambat',
  Deleted: 'Dihapus',
};

export const DayAgendaDialog = ({
  open,
  onOpenChange,
  date,
  agendas,
  onAddAgenda,
  onAgendaClick,
}: DayAgendaDialogProps) => {
  const dayAgendas = useMemo(
    () => (date ? getAgendasForDay(agendas, date) : []),
    [agendas, date],
  );
  const formattedDate = date && !Number.isNaN(date.getTime())
    ? format(date, 'EEEE, d MMMM yyyy', { locale: localeID })
    : '';
  const focusReturnTargetRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(true);

  const handleAdd = () => {
    shouldRestoreFocusRef.current = false;
    onOpenChange(false);
    onAddAgenda();
  };

  const handleAgendaClick = (agenda: Agenda) => {
    shouldRestoreFocusRef.current = false;
    onOpenChange(false);
    onAgendaClick(agenda);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={() => {
          shouldRestoreFocusRef.current = true;
          focusReturnTargetRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        }}
        onCloseAutoFocus={(event) => {
          const focusReturnTarget = focusReturnTargetRef.current;
          focusReturnTargetRef.current = null;
          if (!shouldRestoreFocusRef.current || !focusReturnTarget?.isConnected) return;

          event.preventDefault();
          focusReturnTarget.focus({ preventScroll: true });
        }}
        className="max-h-[calc(100dvh-1rem)] gap-5 rounded-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-xl [&>button]:h-11 [&>button]:w-11"
      >
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2 capitalize">
            <CalendarDays className="h-5 w-5 text-primary" aria-hidden="true" />
            Agenda {formattedDate}
          </DialogTitle>
          <DialogDescription>
            Lihat agenda pada tanggal terpilih atau tambahkan jadwal baru.
          </DialogDescription>
        </DialogHeader>

        {dayAgendas.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            Belum ada agenda pada tanggal ini. Tambahkan agenda untuk mulai menjadwalkan kegiatan.
          </p>
        ) : (
          <ul className="max-h-[min(55dvh,28rem)] space-y-2 overflow-y-auto pr-1" aria-label="Daftar agenda">
            {dayAgendas.map((agenda) => (
              <li key={agenda.id}>
                <button
                  type="button"
                  onClick={() => handleAgendaClick(agenda)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{agenda.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {format(new Date(agenda.startTime), 'HH:mm')} · {statusLabels[agenda.status]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" onClick={handleAdd} className="h-11 w-full sm:w-auto">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Agenda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
