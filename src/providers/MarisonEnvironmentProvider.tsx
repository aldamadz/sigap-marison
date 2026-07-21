import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const query = useQuery({
    queryKey: ["marison-environment"],
    queryFn: marisonIntegrationService.getStatus,
    staleTime: Number.POSITIVE_INFINITY,
  });

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
