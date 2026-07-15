import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { marisonIntegrationService, type MarisonEnvironmentStatus } from "@/services/marison-integration.service";

type ContextValue = {
  status: MarisonEnvironmentStatus | null;
  loading: boolean;
  refetch: () => Promise<unknown>;
};

const MarisonEnvironmentContext = createContext<ContextValue>({
  status: null,
  loading: true,
  refetch: async () => undefined,
});

export function MarisonEnvironmentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["marison-environment"],
    queryFn: marisonIntegrationService.getStatus,
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("marison-environment-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "system_email_settings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["marison-environment"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <MarisonEnvironmentContext.Provider value={{
      status: query.data || null,
      loading: query.isLoading,
      refetch: query.refetch,
    }}>
      {children}
    </MarisonEnvironmentContext.Provider>
  );
}

export const useMarisonEnvironment = () => useContext(MarisonEnvironmentContext);
