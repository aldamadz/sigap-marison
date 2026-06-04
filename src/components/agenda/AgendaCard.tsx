import { format, isValid } from 'date-fns'; // Tambahkan isValid
import { id as localeID } from 'date-fns/locale';
import { Clock, User as UserIcon, MoreVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Agenda, AgendaStatus, User } from '@/types/agenda';
import { cn } from '@/lib/utils';

interface AgendaCardProps {
  agenda: Agenda;
  owner?: User;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onClick: () => void;
}

const statusBadgeStyles: Record<AgendaStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Ongoing: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  Overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  Deleted: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

export const AgendaCard = ({ 
  agenda, 
  owner, 
  index, 
  isSelected, 
  onSelect, 
  onClick 
}: AgendaCardProps) => {

  // FUNGSI PEMBANTU UNTUK MENCEGAH CRASH
const formatDateTime = (dateInput: string | Date | null | undefined) => {
  if (!dateInput) return 'No Time Set';
  
  // Konversi ke Date Object jika inputnya adalah string
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  // Validasi apakah objek Date tersebut valid
  if (!isValid(date)) return 'Invalid Date';
  
  // date-fns format sekarang pasti menerima 'date' karena sudah divalidasi
  return format(date, 'd MMM yyyy, HH:mm', { locale: localeID });
};

  return (
    <div
      className={cn(
        "agenda-item flex items-start gap-4 cursor-pointer p-4 rounded-xl border border-border bg-card transition-all hover:shadow-md",
        isSelected && "ring-2 ring-primary bg-primary/5 border-primary/20"
      )}
      onClick={onClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onSelect()}
        onClick={(e) => e.stopPropagation()}
        className="mt-1"
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-foreground truncate">{agenda.title}</h4>
            {agenda.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                {agenda.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", statusBadgeStyles[agenda.status])}>
              {agenda.status}
            </span>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {/* PERBAIKAN DI SINI */}
            <span>{formatDateTime(agenda.startTime)}</span>
          </div>
          
          {owner && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserIcon className="w-3.5 h-3.5" />
              <span>{owner.fullName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
