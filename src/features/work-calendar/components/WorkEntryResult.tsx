import { cn } from "@/lib/utils";

export function WorkEntryResult({ value, preview = false }: { value: string; preview?: boolean }) {
  // The stored value stays plain text; only list markers change for display.
  const text = value.replace(/^([\t ]*)-(?=[\t ]+\S)/gm, "$1\u2022");
  return <span className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", preview ? "line-clamp-3" : "block")}>{text}</span>;
}
