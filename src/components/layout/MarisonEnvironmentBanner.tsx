import { FlaskConical } from "lucide-react";
import { useMarisonEnvironment } from "@/providers/MarisonEnvironmentProvider";

export function MarisonEnvironmentBanner() {
  const { status } = useMarisonEnvironment();
  if (!status?.isStaging) return null;

  return (
    <div className="flex min-h-9 shrink-0 items-center justify-center gap-2 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>Sumber data Marison sedang menggunakan environment staging.</span>
    </div>
  );
}
