import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from "@/lib/supabase";

// IMPORT KOMPONEN SYNC (Tetap statis karena global state)
import { RealtimeSync } from "@/providers/RealtimeSync"; 

// STATIC IMPORT (Hanya Login karena ini entry point pertama)
import LoginPage from "@/pages/auth/LoginPage"; 

// LAZY IMPORT - GENERAL PAGES
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage"));
const AgendaPage = lazy(() => import("@/pages/agenda/AgendaPage"));
const CalendarPage = lazy(() => import("@/pages/calendar/CalendarPage"));
const ActivityLogsPage = lazy(() => import("@/pages/activity-logs/ActivityLogsPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// LAZY IMPORT - SURAT & MONITORING
const SuratPage = lazy(() => import("@/pages/surat/SuratPage"));
const InboxPage = lazy(() => import("@/pages/surat/InboxPage"));
const MonitoringPage = lazy(() => import("@/pages/surat/MonitoringPage"));
const RiwayatKeterlibatanPage = lazy(() => import("@/pages/surat/RiwayatKeterlibatanPage"));
const PICMonitoringPage = lazy(() => import("@/pages/monitoring-pic/MonitoringPICPage"));
const PICManagementPage = lazy(() => import("@/pages/admin/PICManagementPage"));
const UserChatPage = lazy(() => import("@/pages/user-chat/userChatPage"));

// LAZY IMPORT - ADMIN MANAGEMENT
const UserManagementPage = lazy(() => import("@/pages/admin/UserManagementPage"));
const OrganizationHierarchyPage = lazy(() => import("@/pages/admin/OrganizationHierarchyPage"));
const DepartmentManagementPage = lazy(() => import("./pages/admin/DepartmentManagementPage"));
const EntityManagementPage = lazy(() => import("./pages/admin/EntityManagementPage"));
const FormManagementPage = lazy(() => import("./pages/admin/FormManagementPage"));
const LetterTypeManagementPage = lazy(() => import("./pages/admin/LetterTypeManagementPage"));
const OfficeManagementPage = lazy(() => import("./pages/admin/OfficeManagementPage"));
const WorkflowDetailManagementPage = lazy(() => import("./pages/admin/WorkflowDetailManagementPage"));
const MasterProjectManagementPage = lazy(() => import("./pages/admin/ProjectManagementPage"));
const AdminMonitoringPage = lazy(() => import("./pages/admin/AdminMonitoringPage"));
const DepartmentKPIPage = lazy(() => import("./pages/admin/DepartmentKPIPage"));

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
        .select('role, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (active) setAllowed(!error && data?.role === 'admin' && data?.is_active !== false);
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {isAuth && <RealtimeSync />}
        
        <Toaster />
        <Sonner position="top-right" closeButton />

        <Suspense fallback={<PageLoader />}>
          <Routes location={location}>
            {/* PUBLIC ROUTE */}
            <Route 
              path="/" 
              element={isAuth ? <Navigate to="/dashboard" replace /> : <LoginPage />} 
            />

            {/* PROTECTED ROUTES */}
            <Route 
              element={isAuth ? <AppLayout /> : <Navigate to="/" replace />}
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/activity-logs" element={<Navigate to="/audit-logs" replace />} />
              <Route path="/audit-logs" element={<AdminOnlyRoute><ActivityLogsPage /></AdminOnlyRoute>} />
              <Route path="/settings" element={<SettingsPage />} />
              
              {/* SURAT MODULE */}
              <Route path="/surat/registrasi" element={<SuratPage />} />
              <Route path="/surat/inbox" element={<InboxPage />} />
              <Route path="/surat/monitoring" element={<MonitoringPage />} />
              <Route path="/surat/riwayat" element={<RiwayatKeterlibatanPage />} />
              
              {/* SURAT CHAT */}
              <Route path="/surat/chat" element={<UserChatPage />} />

              {/* PIC MODULE */}
              <Route path="/pic/monitoring" element={<PICMonitoringPage />} />

              {/* ADMIN MODULE */}
              <Route path="/admin/users" element={<UserManagementPage />} />
              <Route path="/admin/users/hierarchy" element={<OrganizationHierarchyPage />} />
              <Route path="/admin/departments" element={<DepartmentManagementPage />} />
              <Route path="/admin/entities" element={<EntityManagementPage />} />
              <Route path="/admin/forms" element={<FormManagementPage />} />
              <Route path="/admin/letter-types" element={<LetterTypeManagementPage />} />
              <Route path="/admin/offices" element={<OfficeManagementPage />} />
              <Route path="/admin/workflow-details" element={<WorkflowDetailManagementPage />} />
              <Route path="/admin/master-projects" element={<MasterProjectManagementPage />} />
              <Route path="/admin/pic-management" element={<PICManagementPage />} />
              <Route path="/admin/monitoring" element={<AdminMonitoringPage />} />
              <Route path="/admin/kpi-departments" element={<DepartmentKPIPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
