// frontend/src/pages/dashboard/Dashboard.tsx
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, subMonths, subWeeks,
  addMonths, addWeeks, isSameMonth, isSameWeek,
  format,
} from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import {
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange,
  FileText, LayoutList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Components
import { KPICard }          from './KPICard';
import { StatusChart }      from './StatusChart';
import { DepartmentChart }  from './DepartmentChart';
import { RecentActivity }   from './RecentActivity';
import { Skeleton }         from '@/components/ui/skeleton';
import { AgendaParentFilter } from '@/components/agenda/AgendaParentFilter';
import { SuratSummaryCards }  from './SuratSummaryCards';
import { PageHeader } from '@/components/ui/Breadcrumbs';

// Services
import {
  getDashboardKPI,
  getStatusDistribution,
  getRecentActivities,
  getDepartmentActivity,
} from '@/services/dashboard.service';
import { isParentUser } from '@/services';
import { ActivityLog } from '@/types/agenda';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { isWorkCalendarEnabled } from '@/lib/feature-availability';
import {
  WorkCalendarDashboardWidget,
  buildWorkCalendarDashboardSummary,
  createSupabaseWorkCalendarDashboardRepository,
  todayWorkDate,
  workDateToUtcRange,
  type SupabaseWorkCalendarDashboardClient,
} from '@/features/work-calendar';

// ── Tipe periode ──────────────────────────────────────────────────────────────
type PeriodMode = 'month' | 'week';

const workCalendarRepository = createSupabaseWorkCalendarDashboardRepository(
  supabase as SupabaseWorkCalendarDashboardClient,
);

// ── Helper: label + range dari satu periode ───────────────────────────────────
const getPeriodRange = (mode: PeriodMode, anchor: Date) => {
  if (mode === 'month') {
    return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
  }
  return {
    start: startOfWeek(anchor, { weekStartsOn: 1 }),
    end:   endOfWeek(anchor,   { weekStartsOn: 1 }),
  };
};

const getPeriodLabel = (mode: PeriodMode, anchor: Date): string => {
  if (mode === 'month') return format(anchor, 'MMMM yyyy', { locale: localeID });
  const s = startOfWeek(anchor, { weekStartsOn: 1 });
  const e = endOfWeek(anchor,   { weekStartsOn: 1 });
  if (isSameMonth(s, e)) return `${format(s, 'd')}–${format(e, 'd MMM yyyy', { locale: localeID })}`;
  return `${format(s, 'd MMM', { locale: localeID })} – ${format(e, 'd MMM yyyy', { locale: localeID })}`;
};

const isCurrentPeriod = (mode: PeriodMode, anchor: Date) => {
  const now = new Date();
  return mode === 'month'
    ? isSameMonth(anchor, now)
    : isSameWeek(anchor, now, { weekStartsOn: 1 });
};

// ── Sub-komponen: PeriodNav ───────────────────────────────────────────────────
interface PeriodNavProps {
  label: string;
  mode: PeriodMode;
  onMode: (m: PeriodMode) => void;
  onBack: () => void;
  onForward: () => void;
  onToday: () => void;
  isCurrent: boolean;
  icon: React.ReactNode;
  title: string;
  accentClass: string;
}

const PeriodNav = ({
  label, mode, onMode, onBack, onForward, onToday, isCurrent, icon, title, accentClass,
}: PeriodNavProps) => (
  <div className="sigap-panel flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="flex min-w-0 items-center gap-3">
      <div className={cn("h-9 w-1 rounded-full", accentClass)} />
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon} {title}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <div className="flex shrink-0 rounded-md border border-border bg-muted/60 p-1">
        <button
          onClick={() => onMode('month')}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-all',
            mode === 'month' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <CalendarDays className="w-4 h-4" /> Bulan
        </button>
        <button
          onClick={() => onMode('week')}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition-all',
            mode === 'week' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <CalendarRange className="w-4 h-4" /> Minggu
        </button>
      </div>

      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="Periode sebelumnya">
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <span className="hidden min-w-[150px] text-center text-sm font-medium text-foreground md:inline">
        {label}
      </span>

      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0"
        aria-label="Periode berikutnya"
        onClick={onForward} disabled={isCurrent}>
        <ChevronRight className="w-4 h-4" />
      </Button>

      {!isCurrent && (
        <Button variant="outline" size="sm" className="h-9 shrink-0"
          onClick={onToday}>
          Hari Ini
        </Button>
      )}
    </div>
  </div>
);

// ── Dashboard utama ───────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, loading: authLoading } = useAuth() as any;

  // ── Auth & parent status ──────────────────────────────────────────────────
  const [selectedUserId,   setSelectedUserId]   = useState<string | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [isParent,         setIsParent]         = useState(false);
  const [isReady,          setIsReady]          = useState(false);

  useEffect(() => {
    if (user && !authLoading) {
      setSelectedOfficeId(user.officeId ? String(user.officeId) : null);
      setSelectedUserId(user.id);
      isParentUser(user.id)
        .then(setIsParent)
        .catch(() => setIsParent(false))
        .finally(() => setIsReady(true));
    }
  }, [user, authLoading]);

  // ── Periode SURAT (terpisah dari agenda) ──────────────────────────────────
  const [suratPeriodMode,   setSuratPeriodMode]   = useState<PeriodMode>('month');
  const [suratAnchor,       setSuratAnchor]       = useState(new Date());

  const suratRange = useMemo(() => getPeriodRange(suratPeriodMode, suratAnchor), [suratPeriodMode, suratAnchor]);
  const suratLabel = useMemo(() => getPeriodLabel(suratPeriodMode, suratAnchor), [suratPeriodMode, suratAnchor]);
  const suratIsCurrent = useMemo(() => isCurrentPeriod(suratPeriodMode, suratAnchor), [suratPeriodMode, suratAnchor]);

  const suratGoBack    = () => setSuratAnchor(prev => suratPeriodMode === 'month' ? subMonths(prev, 1) : subWeeks(prev, 1));
  const suratGoForward = () => setSuratAnchor(prev => suratPeriodMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1));
  const suratGoToday   = () => setSuratAnchor(new Date());
  const suratSetMode   = (m: PeriodMode) => { setSuratPeriodMode(m); setSuratAnchor(new Date()); };

  // ── Periode AGENDA (terpisah dari surat) ──────────────────────────────────
  const [agendaPeriodMode, setAgendaPeriodMode] = useState<PeriodMode>('month');
  const [agendaAnchor,     setAgendaAnchor]     = useState(new Date());

  const agendaRange     = useMemo(() => getPeriodRange(agendaPeriodMode, agendaAnchor), [agendaPeriodMode, agendaAnchor]);
  const agendaLabel     = useMemo(() => getPeriodLabel(agendaPeriodMode, agendaAnchor), [agendaPeriodMode, agendaAnchor]);
  const agendaIsCurrent = useMemo(() => isCurrentPeriod(agendaPeriodMode, agendaAnchor), [agendaPeriodMode, agendaAnchor]);

  const agendaGoBack    = () => setAgendaAnchor(prev => agendaPeriodMode === 'month' ? subMonths(prev, 1) : subWeeks(prev, 1));
  const agendaGoForward = () => setAgendaAnchor(prev => agendaPeriodMode === 'month' ? addMonths(prev, 1) : addWeeks(prev, 1));
  const agendaGoToday   = () => setAgendaAnchor(new Date());
  const agendaSetMode   = (m: PeriodMode) => { setAgendaPeriodMode(m); setAgendaAnchor(new Date()); };

  // ── Data fetching AGENDA ──────────────────────────────────────────────────
  const queryBase = {
    enabled: isReady,
    staleTime: 0,
    refetchOnMount: true,
    placeholderData: (prev: any) => prev,
  };

  const { data: kpiData = [] } = useQuery({
    queryKey: ['kpi', agendaRange, selectedUserId, selectedOfficeId],
    queryFn: () => getDashboardKPI(agendaRange.start, agendaRange.end, selectedUserId, selectedOfficeId),
    ...queryBase,
  });

  const { data: statusData = [] } = useQuery({
    queryKey: ['status-dist', agendaRange, selectedUserId, selectedOfficeId],
    queryFn: () => getStatusDistribution(agendaRange.start, agendaRange.end, selectedUserId, selectedOfficeId),
    ...queryBase,
  });

  const { data: departmentData = [] } = useQuery({
    queryKey: ['dept-activity', agendaRange, selectedUserId, selectedOfficeId],
    queryFn: () => getDepartmentActivity(agendaRange.start, agendaRange.end, selectedUserId, selectedOfficeId),
    ...queryBase,
  });

  const { data: recentActivities = [] } = useQuery({
    queryKey: ['recent-logs', selectedUserId, selectedOfficeId],
    queryFn: () => getRecentActivities(100, selectedUserId, selectedOfficeId),
    select: (data): ActivityLog[] => {
      if (!Array.isArray(data)) return [];
      return data.map((item: any) => ({
        ...item,
        userId: item.user_id,
        createdAt: item.created_at,
        profiles: item.profiles,
      }));
    },
    ...queryBase,
  });

  // ── CAL-03 F7: widget ringkasan Kalender Kerja ────────────────────────────
  const [today, setToday] = useState(() => todayWorkDate());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refreshToday = () => {
      clearTimeout(timer);
      const current = new Date();
      const date = todayWorkDate(current);
      setToday(date);
      const midnight = new Date(workDateToUtcRange(date).endUtc).getTime();
      timer = setTimeout(refreshToday, Math.max(1, midnight - current.getTime()));
    };
    refreshToday();
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  }, []);

  const { data: workCalendarEntries = [], isLoading: workCalendarLoading, error: workCalendarError } = useQuery({
    queryKey: ['work-calendar-dashboard', selectedUserId, today],
    queryFn: ({ signal }) =>
      workCalendarRepository.listDashboardEntries({
        ownerId: selectedUserId as string,
        today,
        signal,
      }),
    enabled: isWorkCalendarEnabled && isReady && !!selectedUserId,
    ...queryBase,
  });

  const workCalendarSummary = useMemo(
    () => buildWorkCalendarDashboardSummary(workCalendarEntries, today),
    [workCalendarEntries, today],
  );

  const workCalendarErrorMessage = workCalendarError
    ? 'Gagal memuat ringkasan Kalender Kerja.'
    : null;

  if (authLoading || !isReady) {
    return (
      <div className="sigap-page">
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="sigap-page">

      {/* ── Header dengan PageHeader ─────────────────────────────────────────── */}
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan pekerjaan dan pengajuan."
      >
        {isParent && (
          <AgendaParentFilter
            onUserSelect={setSelectedUserId}
            selectedUserId={selectedUserId}
            onOfficeSelect={setSelectedOfficeId}
            selectedOfficeId={selectedOfficeId}
          />
        )}
      </PageHeader>

      {/* ── SECTION 1: SURAT ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <PeriodNav
          title="Pengajuan Surat"
          icon={<FileText className="w-4 h-4" />}
          accentClass="bg-primary"
          label={suratLabel}
          mode={suratPeriodMode}
          onMode={suratSetMode}
          onBack={suratGoBack}
          onForward={suratGoForward}
          onToday={suratGoToday}
          isCurrent={suratIsCurrent}
        />
        <SuratSummaryCards
          dateFrom={suratRange.start}
          dateTo={suratRange.end}
        />
      </section>

      {/* ── SECTION 2: AGENDA ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <PeriodNav
          title="Agenda"
          icon={<LayoutList className="w-4 h-4" />}
          accentClass="bg-amber-500"
          label={agendaLabel}
          mode={agendaPeriodMode}
          onMode={agendaSetMode}
          onBack={agendaGoBack}
          onForward={agendaGoForward}
          onToday={agendaGoToday}
          isCurrent={agendaIsCurrent}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kpiData.map((kpi: any, index: number) => (
            <KPICard key={kpi.label} data={kpi} index={index} />
          ))}
        </div>
      </section>

      {/* ── CHARTS ─────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <StatusChart data={statusData} />
        <div className="xl:col-span-2">
          <DepartmentChart data={departmentData} />
        </div>
      </section>

      {/* ── CAL-03 F7: Ringkasan Kalender Kerja ────────────────────────────── */}
      {isWorkCalendarEnabled && (
        <WorkCalendarDashboardWidget
          summary={workCalendarSummary}
          today={today}
          loading={workCalendarLoading}
          error={workCalendarErrorMessage}
        />
      )}

      <RecentActivity logs={recentActivities} />
    </div>
  );
};

export default Dashboard;
