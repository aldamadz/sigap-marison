import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MasterReviewStatusProps = {
  required?: boolean | null;
  reasons?: Array<string | null | undefined> | null;
  className?: string;
};

export const masterReviewRowClass =
  "sidebar-attention-row bg-amber-50/80 hover:bg-amber-100/80 dark:bg-amber-950/20 dark:hover:bg-amber-950/30";

export const getMasterReviewDescription = (
  required?: boolean | null,
  reasons?: Array<string | null | undefined> | null,
) => {
  const normalizedReasons = (reasons || [])
    .map((reason) => String(reason || "").trim())
    .filter(Boolean);

  if (normalizedReasons.length > 0) return normalizedReasons.join(" · ");
  return required ? "Data belum lengkap" : "Lengkap";
};

export function MasterReviewStatus({
  required,
  reasons,
  className,
}: MasterReviewStatusProps) {
  const description = getMasterReviewDescription(required, reasons);

  return (
    <div
      className={cn(
        "flex max-w-[320px] items-start gap-2 text-xs font-medium leading-5",
        required
          ? "text-amber-800 dark:text-amber-200"
          : "text-emerald-700 dark:text-emerald-300",
        className,
      )}
      title={description}
    >
      {required ? (
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{description}</span>
    </div>
  );
}
