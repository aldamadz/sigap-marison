/**
 * Toolbar filter Team Overview (CAL-03 F4A Director Scale).
 *
 * Urutan filter mengikuti hierarki canonical yang benar-benar ada:
 * Kantor -> Departemen -> Anggota. Dimensi `Entitas` sengaja tidak disediakan
 * karena tidak ada relasi profile/office/department -> entity.
 *
 * Desktop/tablet: kontrol dirender inline.
 * Mobile: kontrol yang sama dirender di dalam Sheet lewat tombol "Filter",
 * sehingga ringkasan jumlah filter aktif tetap terlihat di luar Sheet.
 */

import { Filter, RotateCcw, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  WorkTeamOverviewFilters,
  WorkTeamOverviewOption,
} from "../types/work-team-overview";
import { WORK_TEAM_OVERVIEW_SORTS } from "../types/work-team-overview";
import type { UseWorkTeamOverviewResult } from "../hooks/use-work-team-overview";
import { TeamOverviewMemberPicker } from "./TeamOverviewMemberPicker";

const STATUS_OPTIONS: readonly {
  value: WorkTeamOverviewFilters["status"];
  label: string;
}[] = [
  { value: "all", label: "Semua status" },
  { value: "blocked", label: "Terhambat" },
  { value: "overdue", label: "Terlambat" },
  { value: "in_progress", label: "Berjalan" },
  { value: "planned", label: "Direncanakan" },
  { value: "completed", label: "Selesai" },
];

const SORT_LABELS: Record<(typeof WORK_TEAM_OVERVIEW_SORTS)[number], string> = {
  priority: "Prioritas (terhambat/terlambat dulu)",
  progress_asc: "Progres terendah",
  progress_desc: "Progres tertinggi",
  name: "Nama A-Z",
};

const ALL_VALUE = "__all__";

export interface TeamOverviewFilterPanelProps {
  overview: UseWorkTeamOverviewResult;
  departmentOptions: readonly WorkTeamOverviewOption[];
  /** `true` merender kontrol tanpa pembungkus Sheet (dipakai di mobile sheet). */
  variant: "inline" | "sheet";
}

function toSelectValue(value: string | null): string {
  return value ?? ALL_VALUE;
}

function fromSelectValue(value: string): string | null {
  return value === ALL_VALUE ? null : value;
}

export function TeamOverviewFilterPanel({
  overview,
  departmentOptions,
  variant,
}: TeamOverviewFilterPanelProps) {
  const { filters, options, optionsStatus, optionsError, activeFilterCount } = overview;
  const disabled = optionsStatus === "loading";

  const officeOptions = options.filter((option) => option.kind === "office");

  return (
    <div
      data-testid={`team-overview-filters-${variant}`}
      className={cn(
        "space-y-3",
        variant === "inline" && "rounded-sm border border-border bg-card p-3",
      )}
    >
      {optionsError && (
        <p role="alert" className="text-xs text-destructive">
          Gagal memuat pilihan organisasi. Coba muat ulang.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>Kantor</span>
          <Select
            value={toSelectValue(filters.officeId)}
            disabled={disabled}
            onValueChange={(value) =>
              overview.setFilter({ type: "office", value: fromSelectValue(value) })
            }
          >
            <SelectTrigger aria-label="Filter kantor" className="h-11 rounded-sm">
              <SelectValue placeholder="Semua kantor" />
            </SelectTrigger>
            <SelectContent className="work-calendar-scope">
              <SelectItem value={ALL_VALUE}>Semua kantor</SelectItem>
              {officeOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                  {option.memberCount > 0 ? ` (${option.memberCount})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>Departemen</span>
          <Select
            value={toSelectValue(filters.departmentId)}
            disabled={disabled || departmentOptions.length === 0}
            onValueChange={(value) =>
              overview.setFilter({ type: "department", value: fromSelectValue(value) })
            }
          >
            <SelectTrigger aria-label="Filter departemen" className="h-11 rounded-sm">
              <SelectValue placeholder="Semua departemen" />
            </SelectTrigger>
            <SelectContent className="work-calendar-scope">
              <SelectItem value={ALL_VALUE}>Semua departemen</SelectItem>
              {departmentOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <TeamOverviewMemberPicker overview={overview} />

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>Status</span>
          <Select
            value={filters.status}
            onValueChange={(value) => {
              const match = STATUS_OPTIONS.find((option) => option.value === value);
              if (match) overview.setFilter({ type: "status", value: match.value });
            }}
          >
            <SelectTrigger aria-label="Filter status" className="h-11 rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="work-calendar-scope">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>Urutkan</span>
          <Select
            value={overview.sort}
            onValueChange={(value) => {
              const match = WORK_TEAM_OVERVIEW_SORTS.find((sort) => sort === value);
              if (match) overview.setSort(match);
            }}
          >
            <SelectTrigger aria-label="Urutkan hasil" className="h-11 rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="work-calendar-scope">
              {WORK_TEAM_OVERVIEW_SORTS.map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-1 text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-1">
          <span>Cari anggota</span>
          <span className="relative block">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={filters.search}
              placeholder="Nama, NIK, atau jabatan"
              aria-label="Cari anggota berdasarkan nama, NIK, atau jabatan"
              className="h-11 rounded-sm pl-7"
              onChange={(event) =>
                overview.setFilter({ type: "search", value: event.target.value })
              }
            />
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" data-testid="team-overview-filter-count">
          {activeFilterCount > 0
            ? `${activeFilterCount} filter aktif`
            : "Belum ada filter aktif"}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 rounded-sm"
          disabled={activeFilterCount === 0}
          onClick={overview.resetFilters}
        >
          <RotateCcw aria-hidden="true" />
          Reset filter
        </Button>
      </div>
    </div>
  );
}

export interface TeamOverviewFilterBarProps {
  overview: UseWorkTeamOverviewResult;
  departmentOptions: readonly WorkTeamOverviewOption[];
}

/**
 * Baris filter responsif: `Sheet` pada mobile, inline pada layar lebar.
 * Ringkasan filter aktif selalu tampil di luar Sheet.
 */
export function TeamOverviewFilterBar({
  overview,
  departmentOptions,
}: TeamOverviewFilterBarProps) {
  const summary =
    overview.activeFilterCount > 0
      ? `${overview.activeFilterCount} filter aktif`
      : "Tanpa filter";

  return (
    <div className="space-y-2 md:hidden">
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="h-11 rounded-sm">
              <Filter aria-hidden="true" />
              Filter
              {overview.activeFilterCount > 0 && (
                <Badge variant="secondary" className="ml-1 rounded-sm">
                  {overview.activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="work-calendar-scope w-full overflow-y-auto sm:max-w-md"
          >
            <SheetHeader>
              <SheetTitle>Filter tim</SheetTitle>
              <SheetDescription>
                Persempit anggota berdasarkan kantor, departemen, status, atau nama.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <TeamOverviewFilterPanel
                overview={overview}
                departmentOptions={departmentOptions}
                variant="sheet"
              />
            </div>
          </SheetContent>
        </Sheet>
        <p className="text-xs text-muted-foreground" data-testid="team-overview-filter-summary">
          {summary}
        </p>
      </div>
    </div>
  );
}
