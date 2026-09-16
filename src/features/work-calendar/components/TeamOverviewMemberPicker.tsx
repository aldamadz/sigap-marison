/**
 * Pemilih Anggota terbatas (CAL-03 F4A Director Scale).
 *
 * Daftar anggota tidak pernah dimuat seluruhnya: pemilih hanya menjalankan
 * pencarian terotorisasi yang dibatasi server (`search_work_calendar_team_members`)
 * dan menampilkan satu halaman pada satu waktu. Halaman berikutnya dimuat
 * eksplisit lewat tombol "Tampilkan lebih banyak".
 *
 * Filter Kantor/Departemen yang aktif ikut dikirim ke pencarian sehingga hasil
 * selalu konsisten dengan cascading organisasi yang sedang berlaku.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseWorkTeamOverviewResult } from "../hooks/use-work-team-overview";

export interface TeamOverviewMemberPickerProps {
  overview: UseWorkTeamOverviewResult;
}

export function TeamOverviewMemberPicker({ overview }: TeamOverviewMemberPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = overview.memberOptions.find(
    (option) => option.id === overview.filters.memberId,
  );

  // Menutup daftar saat fokus berpindah keluar dari pemilih.
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const activate = () => {
    setOpen(true);
    overview.activateMemberSearch();
  };

  const results = overview.memberOptions;

  return (
    <div className="space-y-1 text-xs font-medium text-muted-foreground">
      <span id={`${listId}-label`}>Anggota</span>
      <div ref={containerRef} className="space-y-2">
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            role="combobox"
            aria-label="Cari dan pilih anggota"
            aria-expanded={open}
            aria-controls={listId}
            data-testid="team-overview-member-search"
            className="h-11 rounded-sm pl-7"
            placeholder={selected ? selected.label : "Cari nama atau jabatan"}
            value={overview.memberSearch}
            onFocus={activate}
            onClick={activate}
            onChange={(event) => {
              activate();
              overview.setMemberSearch(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
          />
        </span>

        {selected && (
          <span
            className="flex flex-wrap items-center gap-2 text-xs text-foreground"
            data-testid="team-overview-member-selected"
          >
            <span className="font-medium">{selected.label}</span>
            {selected.sublabel ? (
              <span className="text-muted-foreground">{selected.sublabel}</span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-sm px-2"
              data-testid="team-overview-member-clear"
              aria-label="Hapus filter anggota"
              onClick={() => {
                overview.setFilter({ type: "member", value: null });
                overview.setMemberSearch("");
                setOpen(false);
              }}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
              Hapus
            </Button>
          </span>
        )}

        {open && (
          <div className="space-y-1">
            {overview.memberSearchStatus === "loading" && results.length === 0 && (
              <p role="status" className="text-xs text-muted-foreground">
                Mencari anggota…
              </p>
            )}
            {overview.memberSearchStatus === "error" && (
              <p role="alert" className="text-xs text-destructive">
                {overview.memberSearchError?.message ?? "Gagal mencari anggota."}
              </p>
            )}

            <ul
              id={listId}
              role="listbox"
              aria-labelledby={`${listId}-label`}
              aria-label="Hasil pencarian anggota"
              data-testid="team-overview-member-results"
              className="max-h-56 space-y-1 overflow-y-auto rounded-sm border border-border bg-popover p-1"
            >
              {results.length === 0 && overview.memberSearchStatus === "ready" && (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">
                  Tidak ada anggota yang cocok.
                </li>
              )}
              {results.map((option) => {
                const isSelected = option.id === overview.filters.memberId;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`team-overview-member-option-${option.id}`}
                      className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => {
                        overview.setFilter({ type: "member", value: option.id });
                        overview.setMemberSearch("");
                        setOpen(false);
                      }}
                    >
                      <span className="font-medium text-foreground">{option.label}</span>
                      {option.sublabel ? (
                        <span className="text-muted-foreground">{option.sublabel}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            {overview.memberSearchTotal > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="team-overview-member-status">
                Menampilkan {results.length} dari {overview.memberSearchTotal} anggota
              </p>
            )}

            {overview.hasMoreMembers && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 rounded-sm"
                data-testid="team-overview-member-load-more"
                disabled={overview.memberSearchStatus === "loading"}
                onClick={() => overview.loadMoreMembers()}
              >
                {overview.memberSearchStatus === "loading"
                  ? "Memuat…"
                  : "Tampilkan lebih banyak"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
