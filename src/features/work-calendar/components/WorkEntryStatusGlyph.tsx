/**
 * Glyph status kecil. Selalu dipasangkan dengan label teks lain di UI
 * supaya status tidak pernah dibedakan hanya lewat warna.
 */

import { CircleCheck, CircleDashed, CircleSlash, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkEntryStatus } from "../types/work-calendar";

const GLYPHS = {
  planned: CircleDashed,
  in_progress: LoaderCircle,
  completed: CircleCheck,
  blocked: CircleSlash,
} as const;

const TONE_CLASSES: Record<WorkEntryStatus, string> = {
  planned: "text-muted-foreground",
  in_progress: "text-pending",
  completed: "text-success",
  blocked: "text-destructive",
};

export interface WorkEntryStatusGlyphProps {
  status: WorkEntryStatus;
  className?: string;
}

export function WorkEntryStatusGlyph({ status, className }: WorkEntryStatusGlyphProps) {
  const Glyph = GLYPHS[status];
  return (
    <Glyph
      aria-hidden="true"
      data-status-glyph={status}
      data-testid={`work-entry-status-glyph-${status}`}
      className={cn("h-3.5 w-3.5 shrink-0", TONE_CLASSES[status], className)}
    />
  );
}
