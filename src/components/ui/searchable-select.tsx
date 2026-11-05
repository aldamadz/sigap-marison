import { useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = { value: string; label: string; keywords?: string[]; disabled?: boolean };

export function SearchableSelect({ id, value, options, onValueChange, disabled, placeholder = "Pilih...",
  searchPlaceholder = "Cari...", emptyText = "Tidak ditemukan.", className, label }: {
  id?: string; value: string; options: SearchableSelectOption[]; onValueChange: (value: string) => void;
  disabled?: boolean; placeholder?: string; searchPlaceholder?: string; emptyText?: string; className?: string; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const selected = options.find(option => option.value === value);
  return <Popover modal open={open && !disabled} onOpenChange={next => { setOpen(next); setSearch(""); }}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" role="combobox" aria-label={label}
        aria-expanded={open && !disabled} aria-controls={listId} disabled={disabled}
        className={cn("h-11 w-full justify-between gap-2 text-left font-normal", className)}>
        <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>{selected?.label || placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
      <Command>
        <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
        <CommandList id={listId} className="max-h-[280px] overscroll-contain">
          <CommandEmpty>{emptyText}</CommandEmpty>
          <CommandGroup>
            {options.map(option => <CommandItem key={option.value} value={option.value}
              keywords={[option.label, ...(option.keywords || [])]} disabled={option.disabled}
              onSelect={() => { if (option.disabled) return; onValueChange(option.value); setOpen(false); setSearch(""); }}>
              <Check className={cn("mr-2 h-4 w-4 shrink-0", option.value === value ? "opacity-100" : "opacity-0")} />
              <span className="min-w-0 break-words">{option.label}</span>
            </CommandItem>)}
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
