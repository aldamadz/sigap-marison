// src/components/calendar/CalendarView.tsx
import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths,
  startOfDay, endOfDay, isWithinInterval
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Agenda } from '@/types/agenda';
import { CalendarAgendaItem } from './CalendarAgendaItem';
import { cn, getAutomaticStatus } from '@/lib/utils';

interface CalendarViewProps {
  agendas: Agenda[];
  onDateClick: (date: Date) => void;
  onAgendaClick: (agenda: Agenda) => void;
  onAgendaDrop: (agendaId: string, newDate: Date) => void;
  /** Controlled — state dikelola dari parent (CalendarPage) */
  currentMonth?: Date;
  onMonthChange?: (month: Date) => void;
}

const weekDays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export const CalendarView = ({
  agendas = [],
  onDateClick,
  onAgendaClick,
  onAgendaDrop,
  currentMonth: controlledMonth,
  onMonthChange,
}: CalendarViewProps) => {
  // Fallback ke internal state jika tidak dikontrol dari luar
  const [internalMonth, setInternalMonth] = useState(new Date());

  const currentMonth = controlledMonth ?? internalMonth;

  const setCurrentMonth = (next: Date) => {
    if (onMonthChange) onMonthChange(next);
    else setInternalMonth(next);
  };

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const processedAgendas = useMemo(() =>
    agendas.map(agenda => ({ ...agenda, status: getAutomaticStatus(agenda) })),
  [agendas]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end   = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">

      {/* ── Header navigasi ─────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b bg-muted/30 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <CalendarIcon className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold sm:text-xl">
            {format(currentMonth, 'MMMM yyyy', { locale: localeID })}
          </h2>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-xl border border-border/50">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            className="font-bold px-4 hover:bg-background transition-colors"
            onClick={() => setCurrentMonth(new Date())}
          >
            Hari Ini
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* ── Nama hari ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 border-b bg-muted/10 flex-shrink-0">
        {weekDays.map(d => (
          <div key={d} className="py-3 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* ── Grid kalender ───────────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-7 bg-border gap-[1px] overflow-hidden"
        style={{ gridAutoRows: 'minmax(160px, 260px)' }}
      >
        {days.map((day) => {
          const dayAgendas = processedAgendas.filter((a) => {
            if (!a.startTime) return false;
            const start = new Date(a.startTime);
            const end = a.endTime ? new Date(a.endTime) : start;
            if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

            // Tampilkan agenda pada setiap hari yang overlap dengan rentang agenda
            return isWithinInterval(day, {
              start: startOfDay(start),
              end: endOfDay(end),
            });
          });

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDateClick(day)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => draggedId && onAgendaDrop(draggedId, day)}
              className={cn(
                'bg-card p-3 group transition-all flex flex-col min-h-0 relative overflow-hidden hover:bg-muted/5',
                !isSameMonth(day, currentMonth) && 'opacity-20 bg-muted/20 grayscale pointer-events-none'
              )}
            >
              {/* Tanggal */}
              <div className="flex justify-between items-center mb-3 flex-shrink-0">
                <span className={cn(
                  'w-9 h-9 flex items-center justify-center text-lg font-bold rounded-xl transition-all duration-300',
                  isToday(day)
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/40 scale-110'
                    : 'text-foreground/70 group-hover:text-primary group-hover:bg-primary/5'
                )}>
                  {format(day, 'd')}
                </span>
                {dayAgendas.length > 3 && (
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full animate-in fade-in zoom-in">
                    +{dayAgendas.length - 3}
                  </span>
                )}
              </div>

              {/* Agenda items */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar min-h-0 pb-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {dayAgendas.map(agenda => (
                    <CalendarAgendaItem
                      key={agenda.id}
                      agenda={agenda}
                      onClick={() => onAgendaClick(agenda)}
                      onDragStart={() => setDraggedId(String(agenda.id))}
                      onDragEnd={() => setDraggedId(null)}
                      isDragging={draggedId === String(agenda.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
