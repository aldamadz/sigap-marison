import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { TZDate, type DateRange } from 'react-day-picker';
import { id } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatWorkDateKey, parseWorkDateParts, WORK_CALENDAR_TIME_ZONE } from '@/features/work-calendar/lib/work-calendar-date';

const presets = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: 'Minggu ini' },
  { value: 'month', label: 'Bulan ini' },
] as const;

type Preset = (typeof presets)[number]['value'];
type WorkDateRange = { start: string; end: string };
export type DashboardPeriod = { kind: Preset } | { kind: 'custom'; range: WorkDateRange };

const calendarDate = (value: string) => {
  const parts = parseWorkDateParts(value);
  return parts ? new TZDate(parts.year, parts.month - 1, parts.day, WORK_CALENDAR_TIME_ZONE) : undefined;
};

const formatDay = (value: string) => format(parseISO(value), 'd MMM yyyy', { locale: id });
const rangeLabel = (start: string, end: string) =>
  start === end ? formatDay(start) : `${formatDay(start)} s.d. ${formatDay(end)}`;

export function DashboardPeriodPicker({ period, month, currentMonth, today, onSelect, onMoveMonth }: {
  period: DashboardPeriod;
  month: Date;
  currentMonth: Date;
  today: string;
  onSelect: (value: DashboardPeriod) => void;
  onMoveMonth: (direction: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draft, setDraft] = useState<DateRange>();
  const isMonth = period.kind === 'month';
  const activePreset = isMonth && month.getTime() !== currentMonth.getTime() ? undefined : period.kind;
  const label = isMonth ? format(month, 'MMMM yyyy', { locale: id })
    : period.kind === 'custom' ? rangeLabel(period.range.start, period.range.end)
    : presets.find(option => option.value === period.kind)?.label;

  const changePeriod = (next: DashboardPeriod) => {
    onSelect(next);
    setOpen(false);
  };
  const openCalendar = () => {
    setDraft(period.kind === 'custom'
      ? { from: calendarDate(period.range.start), to: calendarDate(period.range.end) }
      : undefined);
    setShowCalendar(true);
  };

  return <div role="group" aria-label="Periode Dashboard" className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:ml-auto">
    <span className="text-xs text-muted-foreground">{isMonth ? 'Riwayat selesai / ditolak' : 'Tanggal dibuat (WIB)'}</span>
    <div className="flex min-w-0 max-w-full items-center rounded-md border border-border bg-card p-1">
      {isMonth && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Bulan sebelumnya" onClick={() => onMoveMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>}
      <Popover open={open} onOpenChange={value => { if (value) setShowCalendar(false); setOpen(value); }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 min-w-0 gap-1.5 whitespace-normal text-left">
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" collisionPadding={8} aria-label={showCalendar ? 'Pilih rentang tanggal' : 'Pilih periode Dashboard'}
          className={showCalendar ? 'max-h-[var(--radix-popover-content-available-height)] w-[18rem] max-w-[calc(100vw-1rem)] overflow-y-auto p-0' : 'w-48 max-w-[calc(100vw-1rem)] p-1'}>
          {showCalendar ? <>
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Kembali ke pilihan periode" onClick={() => setShowCalendar(false)}><ArrowLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold">Rentang tanggal (WIB)</span>
            </div>
            <Calendar mode="range" locale={id} timeZone={WORK_CALENDAR_TIME_ZONE} weekStartsOn={1}
              today={calendarDate(today)} defaultMonth={draft?.from ?? calendarDate(isMonth ? format(month, 'yyyy-MM-dd') : today)}
              selected={draft} onSelect={setDraft} resetOnSelect autoFocus
              className="p-2" classNames={{ nav: 'pointer-events-none absolute inset-x-2 top-2 z-10 flex items-center justify-between',
                month: 'w-full space-y-2', month_caption: 'flex h-11 items-center justify-center px-10',
                week: 'mt-1 grid grid-cols-7', weekdays: 'grid grid-cols-7',
                weekday: 'text-center text-xs text-muted-foreground', day: 'min-w-0 p-0 text-center',
                day_button: 'h-9 w-full min-w-0 rounded-md text-sm hover:bg-foreground/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                today: 'ring-1 ring-inset ring-primary/60', selected: 'bg-primary text-primary-foreground',
                range_middle: 'rounded-none !bg-accent !text-accent-foreground' }} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
              <span aria-live="polite" className="text-xs text-muted-foreground">
                {draft?.from && draft.to ? rangeLabel(formatWorkDateKey(draft.from), formatWorkDateKey(draft.to)) : 'Pilih tanggal awal dan akhir'}
              </span>
              <Button type="button" size="sm" className="ml-auto" disabled={!draft?.from || !draft.to} onClick={() => {
                if (draft?.from && draft.to) changePeriod({ kind: 'custom', range: { start: formatWorkDateKey(draft.from), end: formatWorkDateKey(draft.to) } });
              }}>Terapkan</Button>
            </div>
          </> : <>
            {presets.filter(option => option.value !== activePreset).map(option =>
              <Button key={option.value} type="button" variant="ghost" className="h-9 w-full justify-start px-2 font-normal"
                onClick={() => changePeriod({ kind: option.value })}>{option.label}</Button>)}
            <div className="mt-1 border-t pt-1">
              <Button type="button" variant="ghost" className="h-9 w-full justify-between px-2 font-normal" onClick={openCalendar}>
                Rentang tanggal <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Button>
            </div>
          </>}
        </PopoverContent>
      </Popover>
      {isMonth && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Bulan berikutnya" disabled={month >= currentMonth} onClick={() => onMoveMonth(1)}><ChevronRight className="h-4 w-4" /></Button>}
    </div>
  </div>;
}
