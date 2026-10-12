import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from "@/lib/supabase";
import { AppDialogProvider } from "@/components/app/AppDialogProvider";

import { UserThemeSync } from "@/providers/UserThemeSync";
import { AttentionProvider } from "@/providers/AttentionProvider";
import { RealtimeSync } from "@/providers/RealtimeSync";
import { MarisonEnvironmentProvider } from "@/providers/MarisonEnvironmentProvider";
import { isWorkCalendarEnabled } from "@/lib/feature-availability";

// STATIC IMPORT (Hanya Login karena ini entry point pertama)
import LoginPage from "@/pages/auth/LoginPage"; 
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";

// LAZY IMPORT - GENERAL PAGES
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const WorkCalendarPage = lazy(() => import("@/pages/work-calendar/WorkCalendarPage"));
const WorkCalendarUnavailablePage = lazy(() => import("@/pages/work-calendar/WorkCalendarUnavailablePage"));
const ActivityLogsPage = lazy(() => import("@/pages/activity-logs/ActivityLogsPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const PublicDocsPage = lazy(() => import("@/pages/docs/PublicDocsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// LAZY IMPORT - SURAT & MONITORING
const SuratPage = lazy(() => import("@/pages/surat/SuratPage"));
const InboxPage = lazy(() => import("@/pages/surat/InboxPage"));
const MonitoringPage = lazy(() => import("@/pages/surat/MonitoringPage"));
const RiwayatKeterlibatanPage = lazy(() => import("@/pages/surat/RiwayatKeterlibatanPage"));
const RecommendationTasksPage = lazy(() => import("@/pages/surat/RecommendationTasksPage"));
const TindakLanjutSuratPage = lazy(() => import("@/pages/surat/TindakLanjutSuratPage"));

// LAZY IMPORT - ADMIN MANAGEMENT
const UserManagementPage = lazy(() => import("@/pages/admin/UserManagementPage"));
const OrganizationHierarchyPage = lazy(() => import("@/pages/admin/OrganizationHierarchyPage"));
const DepartmentManagementPage = lazy(() => import("./pages/admin/DepartmentManagementPage"));
const EntityManagementPage = lazy(() => import("./pages/admin/EntityManagementPage"));
const LetterTypeManagementPage = lazy(() => import("./pages/admin/LetterTypeManagementPage"));
const OfficeManagementPage = lazy(() => import("./pages/admin/OfficeManagementPage"));
const FormUsageManagementPage = lazy(() => import("./pages/admin/FormUsageManagementPage"));
const MasterProjectManagementPage = lazy(() => import("./pages/admin/ProjectManagementPage"));
const AdminMonitoringPage = lazy(() => import("./pages/admin/AdminMonitoringPage"));
const DepartmentKPIPage = lazy(() => import("./pages/admin/DepartmentKPIPage"));
const LetterNumberCounterPage = lazy(() => import("./pages/admin/LetterNumberCounterPage"));
const JobTitleDisplayOverridesPage = lazy(() => import("./pages/admin/JobTitleDisplayOverridesPage"));
const EmailNotificationSettingsPage = lazy(() => import("./pages/admin/EmailNotificationSettingsPage"));
const MarisonIntegrationPage = lazy(() => import("./pages/admin/MarisonIntegrationPage"));
const ConfigurationLayout = lazy(() => import("./components/configuration/ConfigurationLayout"));
const AccessConfigurationPage = lazy(() => import("./pages/admin/AccessConfigurationPage"));

// Konfigurasi Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="h-screen w-full flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      <p className="text-sm text-muted-foreground animate-pulse">Menyiapkan Sesi...</p>
    </div>
  </div>
);

const RouteDataRefresh = () => {
  const location = useLocation();
  const firstPathRef = useRef(location.pathname);
  const refreshIdRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (firstPathRef.current === location.pathname) {
      firstPathRef.current = "";
      return;
    }

    const refreshId = ++refreshIdRef.current;
    const startedAt = Date.now();
    setRefreshing(true);

    queryClient.invalidateQueries({ refetchType: "active" }).finally(() => {
      const remainingDelay = Math.max(0, 250 - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (refreshIdRef.current === refreshId) setRefreshing(false);
      }, remainingDelay);
    });
  }, [location.pathname]);

  if (!refreshing) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/75 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-xl">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <div>
          <p className="text-sm font-bold text-foreground">Memuat halaman</p>
          <p className="text-xs text-muted-foreground">Mengambil data terbaru...</p>
        </div>
      </div>
    </div>
  );
};

const AdminOnlyRoute = ({ children }: { children: ReactNode }) => {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (active) setAllowed(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_active, deleted_at')
        .eq('id', user.id)
        .maybeSingle();

      if (active) setAllowed(!error && data?.role === 'admin' && data?.is_active === true && data?.deleted_at == null);
    };

    checkAdmin();
    return () => {
      active = false;
    };
  }, []);

  if (allowed === null) return <PageLoader />;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [initializing, setInitializing] = useState(true);
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (_event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (initializing) return <PageLoader />;

  const isAuth = !!session;
  const appShell = (
    <>
      {isAuth && <UserThemeSync />}
      {isAuth && <RouteDataRefresh />}

      <Toaster />
      <Sonner position="top-right" closeButton />

      <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
        {/* PUBLIC ROUTE */}
        <Route
          path="/"
          element={isAuth ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/docs" element={<PublicDocsPage />} />
        <Route path="/docs/:topicSlug" element={<PublicDocsPage />} />
        <Route path="/docs/:topicSlug/:sectionSlug" element={<PublicDocsPage />} />

        {/* PROTECTED ROUTES */}
        <Route
          element={isAuth ? <AppLayout /> : <Navigate to="/" replace />}
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/calendar"
            element={isWorkCalendarEnabled ? <WorkCalendarPage /> : <WorkCalendarUnavailablePage />}
          />
          <Route path="/activity-logs" element={<Navigate to="/audit-logs" replace />} />
          <Route path="/audit-logs" element={<AdminOnlyRoute><ActivityLogsPage /></AdminOnlyRoute>} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* SURAT MODULE */}
          <Route path="/surat/registrasi" element={<SuratPage />} />
          <Route path="/surat/inbox" element={<InboxPage />} />
          <Route path="/surat/rekomendasi" element={<RecommendationTasksPage />} />
          <Route path="/surat/rekomendasi/registrasi" element={<SuratPage />} />
          <Route path="/surat/monitoring" element={<MonitoringPage />} />
          <Route path="/surat/tindak-lanjut" element={<TindakLanjutSuratPage />} />
          <Route path="/surat/riwayat" element={<RiwayatKeterlibatanPage />} />

          {/* ADMIN MODULE */}
          <Route path="/admin/users" element={<AdminOnlyRoute><UserManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/users/hierarchy" element={<AdminOnlyRoute><OrganizationHierarchyPage /></AdminOnlyRoute>} />
          <Route path="/admin/departments" element={<AdminOnlyRoute><DepartmentManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/entities" element={<AdminOnlyRoute><EntityManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/letter-types" element={<AdminOnlyRoute><LetterTypeManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/offices" element={<AdminOnlyRoute><OfficeManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/master-projects" element={<AdminOnlyRoute><MasterProjectManagementPage /></AdminOnlyRoute>} />
          <Route path="/admin/monitoring" element={<AdminOnlyRoute><AdminMonitoringPage /></AdminOnlyRoute>} />
          <Route path="/admin/kpi-departments" element={<AdminOnlyRoute><DepartmentKPIPage /></AdminOnlyRoute>} />
<Route path="/admin/configuration" element={<AdminOnlyRoute><ConfigurationLayout /></AdminOnlyRoute>}>
  <Route index element={<Navigate to="/admin/configuration/form-usages" replace />} />
  <Route path="form-usages" element={<FormUsageManagementPage />} />

  {/* Halaman baru */}
  <Route path="integration" element={<MarisonIntegrationPage />} />

  <Route path="kpi" element={<DepartmentKPIPage configurationOnly />} />
  <Route path="numbering" element={<LetterNumberCounterPage />} />
  <Route path="job-title-labels" element={<JobTitleDisplayOverridesPage />} />
  <Route path="email" element={<EmailNotificationSettingsPage embedded />} />
  <Route path="access" element={<AccessConfigurationPage />} />
</Route>
        </Route>

        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppDialogProvider>
          {isAuth
            ? <MarisonEnvironmentProvider><AttentionProvider><RealtimeSync />{appShell}</AttentionProvider></MarisonEnvironmentProvider>
            : appShell}
        </AppDialogProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
