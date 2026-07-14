// src/components/calendar/CalendarAgendaItem.tsx
import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { Agenda, AgendaStatus } from '@/types/agenda';
import { cn } from '@/lib/utils';

interface CalendarAgendaItemProps {
  agenda: Agenda;
  date: Date;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
  hiddenOnMobile?: boolean;
}

const statusLabels: Record<AgendaStatus, string> = {
  Scheduled: 'Terjadwal',
  Ongoing: 'Berlangsung',
  Completed: 'Selesai',
  Overdue: 'Terlambat',
  Deleted: 'Dihapus',
};

const statusStyles: Record<AgendaStatus, string> = {
  Scheduled: 'bg-blue-500 md:bg-blue-500/10 md:border-l-blue-500 md:text-blue-700 md:dark:text-blue-400',
  Ongoing: 'bg-amber-500 md:bg-amber-500/10 md:border-l-amber-500 md:text-amber-700 md:dark:text-amber-400',
  Completed: 'bg-emerald-500 md:bg-emerald-500/10 md:border-l-emerald-500 md:text-emerald-700 md:dark:text-emerald-500/60 md:opacity-60 md:shadow-none',
  Overdue: 'bg-rose-500 md:bg-rose-500/10 md:border-l-rose-500 md:text-rose-700 md:dark:text-rose-400',
  Deleted: 'bg-muted-foreground md:bg-gray-500/10 md:border-l-gray-500 md:text-gray-700 md:opacity-50',
};

// Gunakan forwardRef agar Framer Motion bisa mengakses elemen DOM
export const CalendarAgendaItem = forwardRef<HTMLButtonElement, CalendarAgendaItemProps>(
  ({ agenda, date, onClick, onDragStart, onDragEnd, isDragging, hiddenOnMobile }, ref) => {
    const status = statusLabels[agenda.status] || statusLabels.Scheduled;
    const accessibleLabel = `${agenda.title}, ${status}, ${format(date, 'd MMMM yyyy', { locale: localeID })}`;

    return (
      <motion.button
        ref={ref}
        type="button"
        title={accessibleLabel}
        aria-label={accessibleLabel}
        draggable
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={cn(
          "h-2 w-2 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "md:mb-1 md:block md:min-h-0 md:w-full md:cursor-grab md:select-none md:rounded-md md:border-l-[3px] md:px-2 md:py-1.5 md:text-left md:text-xs md:font-bold md:leading-snug md:shadow-sm md:transition-all md:hover:bg-black/[0.08] md:active:cursor-grabbing",
          "md:line-clamp-1 md:break-all md:decoration-none",
          statusStyles[agenda.status] || statusStyles.Scheduled,
          hiddenOnMobile && "hidden md:block",
          isDragging && "opacity-50 ring-2 ring-primary"
        )}
        layout
        whileHover={{ x: 3 }}
      >
        <span className="hidden md:inline">
          {agenda.status === 'Completed' && <span className="mr-1 italic">✓</span>}
          {agenda.title}
        </span>
      </motion.button>
    );
  }
);

// Penting untuk debugging di React DevTools
CalendarAgendaItem.displayName = "CalendarAgendaItem";