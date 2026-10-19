import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { isWorkCalendarEnabled } from '@/lib/feature-availability';
import { Skeleton } from '@/components/ui/skeleton';
import { ActionableDashboard } from './ActionableDashboard';
import {
  WorkCalendarDashboardWidget, buildWorkCalendarDashboardSummary,
  createSupabaseWorkCalendarDashboardRepository, todayWorkDate, workDateToUtcRange,
  type SupabaseWorkCalendarDashboardClient,
} from '@/features/work-calendar';

const workCalendarRepository = createSupabaseWorkCalendarDashboardRepository(
  supabase as SupabaseWorkCalendarDashboardClient,
);

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const selectedUserId = user?.id ?? null;
  const isReady = Boolean(selectedUserId) && !authLoading;
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
    queryFn: ({ signal }) => workCalendarRepository.listDashboardEntries({ ownerId: selectedUserId as string, today, signal }),
    enabled: isWorkCalendarEnabled && isReady && !!selectedUserId,
    staleTime: 20_000,
  });
  const workCalendarSummary = useMemo(
    () => buildWorkCalendarDashboardSummary(workCalendarEntries, today),
    [workCalendarEntries, today],
  );
  if (!isReady) return <div className="sigap-page"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>;
  return <div className="sigap-page">
    <ActionableDashboard key={selectedUserId} userId={selectedUserId} />
    {isWorkCalendarEnabled && (
      <WorkCalendarDashboardWidget summary={workCalendarSummary} today={today} loading={workCalendarLoading}
        error={workCalendarError ? 'Gagal memuat ringkasan Kalender Kerja.' : null} />
    )}
  </div>;
};
export default Dashboard;
