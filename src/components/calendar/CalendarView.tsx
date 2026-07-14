// src/components/calendar/CalendarView.tsx
import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Agenda } from '@/types/agenda';
import { CalendarAgendaItem } from './CalendarAgendaItem';
import { getAgendasForDay } from '@/lib/calendar-agenda';
import { cn } from '@/lib/utils';

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

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end   = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">

      {/* ── Header navigasi ─────────────────────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2">
            <CalendarIcon className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
          </div>
          <h2 className="truncate text-base font-semibold capitalize sm:text-xl">
            {format(currentMonth, 'MMMM yyyy', { locale: localeID })}
          </h2>
        </div>
        <div className="grid w-full grid-cols-[44px_1fr_44px] items-center gap-1 rounded-xl border border-border/50 bg-muted/50 p-1 sm:flex sm:w-auto sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan sebelumnya"
            className="h-11 w-11 sm:h-10 sm:w-10"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            className="h-11 px-3 font-bold transition-colors hover:bg-background sm:h-10 sm:px-4"
            onClick={() => setCurrentMonth(new Date())}
          >
            Hari Ini
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bulan berikutnya"
            className="h-11 w-11 sm:h-10 sm:w-10"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div
        role="region"
        aria-label="Kalender bulanan"
        tabIndex={0}
        className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div>
          {/* ── Nama hari ─────────────────────────────────────────────────────── */}
          <div className="grid flex-shrink-0 grid-cols-7 border-b bg-muted/10">
            {weekDays.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-muted-foreground sm:py-3">
                {d}
              </div>
            ))}
          </div>

          {/* ── Grid kalender ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-[1px] overflow-hidden bg-border md:auto-rows-[minmax(160px,260px)]">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const dayAgendas = getAgendasForDay(agendas, day);

          return (
            <div
              key={day.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => draggedId && onAgendaDrop(draggedId, day)}
              className={cn(
                'group relative flex aspect-square min-h-0 flex-col overflow-hidden bg-card p-1 transition-all hover:bg-muted/5 md:aspect-auto md:p-3',
                !isCurrentMonth && 'pointer-events-none bg-muted/20 opacity-20 grayscale'
              )}
            >
              <button
                type="button"
                aria-label={`Lihat agenda pada ${format(day, 'd MMMM yyyy', { locale: localeID })}`}
                disabled={!isCurrentMonth}
                onClick={() => onDateClick(day)}
                className="absolute inset-0 z-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />

              {/* Tanggal */}
              <div className="pointer-events-none relative z-[1] flex flex-shrink-0 items-center justify-between md:mb-3">
                <span className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold transition-all duration-300 md:h-9 md:w-9 md:rounded-xl md:text-lg',
                  isToday(day)
                    ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/40 sm:scale-110'
                    : 'text-foreground/70 group-hover:bg-primary/5 group-hover:text-primary'
                )}>
                  {format(day, 'd')}
                </span>
                {dayAgendas.length > 3 && (
                  <span className="hidden animate-in rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary fade-in zoom-in md:inline">
                    +{dayAgendas.length - 3}
                  </span>
                )}
              </div>

              {/* Agenda items */}
              <div className="custom-scrollbar absolute bottom-1 left-1 right-1 z-[2] flex min-h-0 items-center gap-1 md:relative md:bottom-auto md:left-auto md:right-auto md:block md:flex-1 md:space-y-2 md:overflow-y-auto md:pb-1 md:pr-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {dayAgendas.map((agenda, index) => (
                    <CalendarAgendaItem
                      key={agenda.id}
                      agenda={agenda}
                      date={day}
                      hiddenOnMobile={index >= 3}
                      onClick={() => onAgendaClick(agenda)}
                      onDragStart={() => setDraggedId(String(agenda.id))}
                      onDragEnd={() => setDraggedId(null)}
                      isDragging={draggedId === String(agenda.id)}
                    />
                  ))}
                </AnimatePresence>
                {dayAgendas.length > 3 && (
                  <span className="text-[9px] font-bold leading-none text-muted-foreground md:hidden">
                    +{dayAgendas.length - 3}
                  </span>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </div>
      </div>
    </div>
  );
};
