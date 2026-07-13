import { cn } from "@/lib/utils";

export type ApprovalBadgeTone = "approved" | "rejected" | "active" | "waiting" | "verification_waiting" | "verification_done";

const toneClass: Record<ApprovalBadgeTone, string> = {
  approved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  active: "border-primary/30 bg-primary/10 text-primary",
  waiting: "border-border bg-muted/40 text-muted-foreground",
  verification_waiting: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  verification_done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

export const approvalBadgeClass = (tone: ApprovalBadgeTone, className?: string) =>
  cn("border", toneClass[tone], className);

export const approvalDotClass = (tone: ApprovalBadgeTone, className?: string) =>
  cn({
    "bg-emerald-500 text-white": tone === "approved" || tone === "verification_done",
    "bg-red-500 text-white": tone === "rejected",
    "bg-primary text-primary-foreground": tone === "active",
    "bg-amber-500 text-white": tone === "verification_waiting",
    "bg-muted text-muted-foreground": tone === "waiting",
  }, className);
