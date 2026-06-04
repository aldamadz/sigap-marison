// src/components/agenda/AgendaTabs.tsx
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, isWithinInterval,
  isSameMonth, isSameWeek,
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input }  from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import {
  Search, CheckSquare, LayoutGrid, List,
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, History,
} from 'lucide-react';
import { Agenda, AgendaStatus, User } from '@/types/agenda';
import { AgendaCard } from './AgendaCard';
import { cn } from '@/lib/utils';

type ViewMode   = 'grid' | 'list';
type PeriodMode = 'month' | 'week';

interface AgendaTabsProps {
  agendas: Agenda[];
  users: User[];
  onAgendaClick: (agenda: Agenda) => void;
  onStatusChange: (agendaId: string, status: AgendaStatus) => void;
}

const STATUS_LABELS: Record<AgendaStatus, string> = {
  Scheduled: 'Terjadwal',
  Ongoing:   'Berlangsung',
  Completed: 'Selesai',
  Overdue:   'Terlambat',
  Deleted:   'Dihapus',
};

const STATUS_BADGE: Record<AgendaStatus, string> = {
  Scheduled: 'bg-blue-500/10 text-blue-600',
  Ongoing:   'bg-amber-500/10 text-amber-600',
  Completed: 'bg-emerald-500/10 text-emerald-600',
  Overdue:   'bg-rose-500/10 text-rose-600',
  Deleted:   'bg-muted/50 text-muted-foreground',
};

export const AgendaTabs = ({ agendas, users, onAgendaClick, onStatusChange }: AgendaTabsProps) => {
  const [searchQuery,     setSearchQuery]     = useState('');
  const [selectedAgendas, setSelectedAgendas] = useState<string[]>([]);
  const [viewMode,        setViewMode]        = useState<ViewMode>('grid');
  const [periodMode,      setPeriodMode]      = useState<PeriodMode>('month');
  const [currentPeriod,   setCurrentPeriod]   = useState(new Date());
  // null = tampilkan periode aktif, true = tampilkan semua (arsip)
  const [showAll,         setShowAll]         = useState(false);

  // ── Label periode ──────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    if (periodMode === 'month') return format(currentPeriod, 'MMMM yyyy', { locale: localeID });
    const start = startOfWeek(currentPeriod, { weekStartsOn: 1 });
    const end   = endOfWeek(currentPeriod,   { weekStartsOn: 1 });
    if (isSameMonth(start, end)) {
      return `${format(start, 'd')} - ${format(end, 'd MMM yyyy', { locale: localeID })}`;
    }
    return `${format(start, 'd MMM', { locale: localeID })} - ${format(end, 'd MMM yyyy', { locale: localeID })}`;
  }, [currentPeriod, periodMode]);

  const isCurrentPeriod = useMemo(() => {
    const now = new Date();
    return periodMode === 'month'
      ? isSameMonth(currentPeriod, now)
      : isSameWeek(currentPeriod, now, { weekStartsOn: 1 });
  }, [currentPeriod, periodMode]);

  // ── Navigasi ───────────────────────────────────────────────────────────────
  const goBack = () => {
    setCurrentPeriod(prev =>
      periodMode === 'month' ? subMonths(prev, 1) : subWeeks(prev, 1)
    );
    setShowAll(false);
  };

  const goForward = () => {
    setCurrentPeriod(prev =>
      periodMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1)
    );
    setShowAll(false);
  };

  const goToday = () => {
    setCurrentPeriod(new Date());
    setShowAll(false);
  };

  // ── Filter agendas ─────────────────────────────────────────────────────────
  const filteredAgendas = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return agendas.filter(agenda => {
      // Search
      const matchesSearch =
        agenda.title.toLowerCase().includes(query) ||
        (agenda.description?.toLowerCase().includes(query) ?? false) ||
        (agenda.location?.toLowerCase().includes(query) ?? false);

      if (!matchesSearch) return false;
      if (showAll) return true; // Mode arsip — semua periode

      // Filter periode
      const start = agenda.startTime ? new Date(agenda.startTime) : null;
      if (!start) return false;

      if (periodMode === 'month') {
        const from = startOfMonth(currentPeriod);
        const to   = endOfMonth(currentPeriod);
        return isWithinInterval(start, { start: from, end: to });
      } else {
        const from = startOfWeek(currentPeriod, { weekStartsOn: 1 });
        const to   = endOfWeek(currentPeriod,   { weekStartsOn: 1 });
        return isWithinInterval(start, { start: from, end: to });
      }
    });
  }, [agendas, searchQuery, periodMode, currentPeriod, showAll]);

  // ── Group by status ────────────────────────────────────────────────────────
  const groupedAgendas = useMemo(() => ({
    Ongoing:   filteredAgendas.filter(a => a.status === 'Ongoing'),
    Scheduled: filteredAgendas.filter(a => a.status === 'Scheduled'),
    Completed: filteredAgendas.filter(a => a.status === 'Completed'),
    Overdue:   filteredAgendas.filter(a => a.status === 'Overdue'),
  }), [filteredAgendas]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getOwner = (createdBy?: string | null) =>
    users.find(u => String(u.id) === String(createdBy));

  const toggleSelect = (id: string | number) => {
    const s = String(id);
    setSelectedAgendas(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleBulkComplete = () => {
    selectedAgendas.forEach(id => onStatusChange(id, 'Completed'));
    setSelectedAgendas([]);
  };

  return (
    <div className="w-full space-y-4">

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 bg-background/50 p-4 rounded-2xl border border-border/50">

        {/* Row 1: Search + view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari agenda..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 bg-background border-border/50 focus-visible:ring-primary/20"
            />
          </div>

          {/* Period mode toggle */}
          <div className="flex bg-muted p-1 rounded-lg shrink-0">
            <Button
              variant={periodMode === 'month' ? 'secondary' : 'ghost'}
              size="sm" className="h-8 px-3 gap-1.5 text-xs font-bold"
              onClick={() => { setPeriodMode('month'); setCurrentPeriod(new Date()); setShowAll(false); }}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Bulan
            </Button>
            <Button
              variant={periodMode === 'week' ? 'secondary' : 'ghost'}
              size="sm" className="h-8 px-3 gap-1.5 text-xs font-bold"
              onClick={() => { setPeriodMode('week'); setCurrentPeriod(new Date()); setShowAll(false); }}
            >
              <CalendarRange className="w-3.5 h-3.5" /> Minggu
            </Button>
          </div>

          {/* Grid/list toggle */}
          <div className="flex bg-muted p-1 rounded-lg shrink-0">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm"
              className="h-8 w-8 p-0" onClick={() => setViewMode('grid')}>
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm"
              className="h-8 w-8 p-0" onClick={() => setViewMode('list')}>
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Navigasi periode */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={goBack}>
            <ChevronLeft className="w-4 h-4" />
          </Button>

          {/* Label periode — klik untuk toggle arsip */}
          <button
            onClick={() => setShowAll(prev => !prev)}
            className={cn(
              "flex-1 text-center text-sm font-black tracking-tight px-3 py-1.5 rounded-lg transition-all",
              showAll
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted text-foreground"
            )}
          >
            {showAll ? (
              <span className="flex items-center justify-center gap-2">
                <History className="w-3.5 h-3.5" /> Semua Periode (Arsip)
              </span>
            ) : periodLabel}
          </button>

          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
            onClick={goForward} disabled={isCurrentPeriod && !showAll}>
            <ChevronRight className="w-4 h-4" />
          </Button>

          {/* Kembali ke sekarang */}
          {(!isCurrentPeriod || showAll) && (
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold px-3"
              onClick={goToday}>
              Sekarang
            </Button>
          )}
        </div>

        {/* Bulk action */}
        <AnimatePresence>
          {selectedAgendas.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground">
                {selectedAgendas.length} dipilih
              </span>
              <Button onClick={handleBulkComplete} size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg shadow-emerald-500/20">
                <CheckSquare className="w-4 h-4" /> Selesaikan Massal
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="Ongoing" className="w-full">
        <TabsList className="inline-flex h-11 items-center justify-start rounded-xl bg-muted/50 p-1 w-full overflow-x-auto no-scrollbar gap-1">
          {(Object.keys(groupedAgendas) as AgendaStatus[]).map(status => (
            <TabsTrigger key={status} value={status}
              className="rounded-lg px-5 py-2 text-xs font-bold transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm shrink-0">
              {STATUS_LABELS[status]}
              <Badge variant="secondary"
                className={cn("ml-2 px-1.5 py-0 text-[10px] rounded-md", STATUS_BADGE[status])}>
                {groupedAgendas[status as keyof typeof groupedAgendas].length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.entries(groupedAgendas) as [AgendaStatus, Agenda[]][]).map(([status, items]) => (
          <TabsContent key={status} value={status} className="mt-4 outline-none ring-0">
            <AnimatePresence mode="popLayout">
              {items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-3xl border-muted bg-muted/10"
                >
                  <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-4">
                    <Search className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="font-semibold text-foreground/60">
                    Tidak ada agenda {STATUS_LABELS[status].toLowerCase()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {showAll ? 'Tidak ada data sama sekali.' : (
                      <>Periode ini kosong. Klik <span className="font-bold">{periodLabel}</span> untuk lihat semua.</>
                    )}
                  </p>
                </motion.div>
              ) : (
                <div
                  className={viewMode === 'grid'
                    ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                    : "flex flex-col gap-3"}>
                  {items.map((agenda, index) => (
                    <AgendaCard
                      key={agenda.id}
                      agenda={agenda}
                      owner={getOwner(agenda.createdBy)}
                      index={index}
                      isSelected={selectedAgendas.includes(String(agenda.id))}
                      onSelect={() => toggleSelect(agenda.id)}
                      onClick={() => onAgendaClick(agenda)}
                    />
                  ))}
                </div>
              )}
            </AnimatePresence>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
