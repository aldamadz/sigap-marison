import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsageModuleContext } from "../usage-contract";
import { MasterRecord } from "@/components/surat/form/surat-form-types";
import {
  ASSET_RECOMMENDATION_NEED_NOTE,
  ASSET_RECOMMENDATION_SKIP_NOTE,
  ASSET_RECOMMENDATION_TEMPLATE_NAME,
  isRecommendationChoiceAllowed,
} from "./recommendation-eligibility";

export function AssetContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  const { input, formData, master, linkedDocumentContext, requesterDepartmentId, setInputValue } = ctx;

  const canRequesterUseRecommendation = useMemo(() => {
    const departmentId = formData.dept_id || requesterDepartmentId;
    const department = master.depts.find((dept: MasterRecord) => dept.id === departmentId);
    return isRecommendationChoiceAllowed(department, linkedDocumentContext?.type ?? null);
  }, [formData.dept_id, requesterDepartmentId, master.depts, linkedDocumentContext]);

  if (!canRequesterUseRecommendation) return null;

  const required = input.requires_recommendation === true;
  const RECOMMENDATION_TEMPLATE_NAME = ASSET_RECOMMENDATION_TEMPLATE_NAME;

  const applyRecommendationChoice = (choice: boolean) => {
    setInputValue("requires_recommendation", choice);
    setInputValue("recommendation_template_name", RECOMMENDATION_TEMPLATE_NAME);
    setInputValue(
      "recommendation_attachment_note",
      choice ? ASSET_RECOMMENDATION_NEED_NOTE : ASSET_RECOMMENDATION_SKIP_NOTE
    );
  };

  const options = [
    {
      value: true,
      label: "Butuh rekomendasi",
      description: "Pengajuan aset ini membutuhkan lampiran rekomendasi. Template rekomendasi sudah tersedia di sistem.",
    },
    {
      value: false,
      label: "Tidak perlu rekomendasi",
      description: "Pengajuan aset dapat berjalan tanpa lampiran rekomendasi tambahan.",
    },
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Rekomendasi Aset</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Tentukan apakah permohonan aset ini membutuhkan lampiran rekomendasi.
          </p>
        </div>
        <span className={cn(
          "inline-flex w-fit rounded-md border px-3 py-1 text-[11px] font-semibold",
          required
            ? "border-primary/20 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground"
        )}>
          {required ? "Rekomendasi diperlukan" : "Tanpa rekomendasi"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = required === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => applyRecommendationChoice(option.value)}
              className={cn(
                "min-h-24 rounded-md border px-4 py-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background/70 text-foreground hover:bg-muted"
              )}
              aria-pressed={selected}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border",
                  selected ? "border-primary-foreground bg-primary-foreground text-primary" : "border-muted-foreground/40"
                )}>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
                {option.label}
              </span>
              <span className={cn(
                "mt-2 block text-xs leading-5",
                selected ? "text-primary-foreground/85" : "text-muted-foreground"
              )}>
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
