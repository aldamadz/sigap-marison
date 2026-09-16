/**
 * Public boundary Unified Work Calendar (CAL-03 F1 & F2).
 *
 * Modul ini sengaja tidak mengekspor `testing/*`. Fixture hanya boleh
 * diimpor langsung dari `@/features/work-calendar/testing/work-calendar-fixtures`
 * oleh test atau harness visual verification, bukan oleh runtime aplikasi.
 */

export { WorkCalendarWorkspace } from "./components/WorkCalendarWorkspace";
export { WorkCalendarToolbar } from "./components/WorkCalendarToolbar";
export { QuickWorkEntry } from "./components/QuickWorkEntry";
export { WorkEntryRow } from "./components/WorkEntryRow";
export { WorkEntryList } from "./components/WorkEntryList";
export { WorkEntryEditor } from "./components/WorkEntryEditor";
export { WorkEntryDetail } from "./components/WorkEntryDetail";
export { WorkEntryStatusGlyph } from "./components/WorkEntryStatusGlyph";
export { DailyWorkView } from "./components/DailyWorkView";
export { WeeklyWorkView } from "./components/WeeklyWorkView";
export { MonthlyWorkView } from "./components/MonthlyWorkView";
export { TeamProgressView } from "./components/TeamProgressView";
export { TeamOverviewView } from "./components/TeamOverviewView";
export {
  TeamOverviewFilterBar,
  TeamOverviewFilterPanel,
} from "./components/TeamOverviewFilters";
export { DailyProgressSummary } from "./components/DailyProgressSummary";

export { createSupabaseWorkEntryRepository } from "./data/supabase-work-entry-repository";
export type {
  SupabaseWorkCalendarClient,
  WorkCalendarDbQueryFilter,
  WorkCalendarDbTable,
  WorkCalendarRpcQuery,
} from "./data/supabase-work-entry-repository";
export {
  WORK_TEAM_OVERVIEW_UNNAMED_LABEL,
  createSupabaseWorkTeamOverviewRepository,
  mapWorkTeamOverviewOptionRow,
  mapWorkTeamOverviewRow,
  resolveWorkTeamOverviewMemberName,
} from "./data/supabase-work-team-overview-repository";
export type {
  SupabaseWorkTeamOverviewClient,
  WorkTeamOverviewOptionRow,
  WorkTeamOverviewRow,
  WorkTeamOverviewRpcQuery,
} from "./data/supabase-work-team-overview-repository";
export {
  createSupabaseWorkCalendarProfileRepository,
  mapProfileRowToOwner,
} from "./data/work-calendar-profile-repository";
export type {
  SupabaseWorkCalendarProfileClient,
  WorkCalendarProfileDbQuery,
  WorkCalendarProfileDbTable,
  WorkCalendarProfileRepository,
  WorkCalendarProfileRpcQuery,
  WorkCalendarProfileRow,
  WorkCalendarTeamMemberRow,
} from "./data/work-calendar-profile-repository";
export {
  WorkEntryConflictError,
  WORK_ENTRY_CONFLICT_CODE,
  isWorkEntryConflictError,
} from "./lib/work-entry-conflict";
export { mapWorkEntryRow } from "./data/work-entry-row-mapper";
export type { WorkCalendarEntryRow } from "./data/work-entry-row-mapper";

export { useWorkCalendarView, useWorkCalendarDerivedView } from "./hooks/use-work-calendar-view";
export type {
  UseWorkCalendarViewInput,
  UseWorkCalendarViewResult,
  WorkCalendarDerivedView,
} from "./hooks/use-work-calendar-view";

export { useWorkTeamOverview } from "./hooks/use-work-team-overview";
export type {
  UseWorkTeamOverviewInput,
  UseWorkTeamOverviewResult,
  WorkTeamOverviewFilterChange,
  WorkTeamOverviewStatus,
} from "./hooks/use-work-team-overview";
export { useWorkCalendarRouteBinding } from "./hooks/use-work-calendar-route-state";
export type { WorkCalendarRouteBinding } from "./hooks/use-work-calendar-route-state";
export { useWorkTeamOverviewCompact } from "./hooks/use-work-team-overview-compact";

export {
  applyWorkTeamOverviewFilterChange,
  clampWorkTeamOverviewPage,
  clampWorkTeamOverviewPageSize,
  countActiveWorkTeamOverviewFilters,
  createWorkTeamOverviewFilters,
  getWorkTeamOverviewPageCount,
  isWorkTeamOverviewSort,
  isWorkTeamOverviewStatusFilter,
  listWorkTeamOverviewDepartmentOptions,
  listWorkTeamOverviewMemberOptions,
  normalizeWorkTeamOverviewSearch,
  readWorkTeamOverviewUrlState,
  reconcileWorkTeamOverviewFilters,
  toWorkTeamOverviewDbStatus,
  writeWorkTeamOverviewUrlState,
} from "./lib/work-team-overview";
export type {
  ReadWorkTeamOverviewUrlInput,
  WorkTeamOverviewUrlState,
} from "./lib/work-team-overview";

export {
  WORK_CALENDAR_TIME_ZONE,
  WORK_WEEKDAY_LABELS_ID,
  addWorkDays,
  compareWorkDates,
  endOfWorkMonth,
  formatWorkDateFull,
  formatWorkDateKey,
  formatWorkDateShort,
  formatWorkDateHeading,
  formatWorkMonthLabel,
  formatWorkTimeLabel,
  formatWorkTimeLabelFromIso,
  formatWorkWeekRangeLabel,
  getDayName,
  getDaysInWorkMonth,
  getMonthName,
  getWorkCalendarDateRange,
  getWorkDateWeekday,
  isWorkDateAfter,
  isWorkDateBefore,
  isWorkDateWithin,
  isValidWorkDate,
  parseWorkDateParts,
  parseWorkDateTimeInput,
  shiftWorkDate,
  startOfWorkMonth,
  startOfWorkWeek,
  todayWorkDate,
  workDateRangeToUtcRange,
  workDateToUtcRange,
  workMonthDates,
  workWeekDates,
} from "./lib/work-calendar-date";
export type { WorkCalendarDateRange } from "./lib/work-calendar-date";

export {
  WORK_ENTRY_STATUS_META,
  WORK_ENTRY_STATUS_ORDER,
  WORK_ENTRY_OVERDUE_META,
  compareWorkEntries,
  getWorkEntryStatusFollowUp,
  getWorkEntryStatusLabel,
  getWorkEntryStatusMeta,
  isFinalWorkEntryStatus,
  isUnfinishedWorkEntryStatus,
  isWorkEntryOverdue,
} from "./lib/work-entry-status";
export type { WorkEntryStatusFollowUp, WorkEntryStatusMeta } from "./lib/work-entry-status";

export {
  WORK_ENTRY_BLOCKED_REASON_MAX_LENGTH,
  WORK_ENTRY_LOCATION_MAX_LENGTH,
  WORK_ENTRY_NOTES_MAX_LENGTH,
  WORK_ENTRY_REALIZATION_MAX_LENGTH,
  WORK_ENTRY_TITLE_MAX_LENGTH,
  canQuickCreateWorkEntry,
  normalizeWorkEntryText,
  normalizeWorkEntryTitle,
  validateStoredWorkEntry,
  validateWorkEntryInput,
} from "./lib/work-entry-validation";
export type {
  WorkEntryFieldErrors,
  WorkEntryValidationInput,
  WorkEntryValidationResult,
} from "./lib/work-entry-validation";

export {
  EMPTY_WORK_PROGRESS,
  WORK_MONTH_CELL_PREVIEW_LIMIT,
  WORK_MONTH_MOBILE_CELL_PREVIEW_LIMIT,
  buildWorkCalendarDayCells,
  buildWorkCalendarDaySummaries,
  buildWorkEntryOwnerGroups,
  buildWorkEntryStates,
  buildWorkProgressStatusRows,
  computeWorkCompletionPercent,
  computeWorkProgress,
  createWorkCalendarPermissions,
  filterWorkEntriesByOwner,
  getWorkMonthCellPreview,
  groupWorkEntriesByDate,
  isWorkCalendarTeamViewAvailable,
  selectUnfinishedWorkEntries,
} from "./lib/work-progress";

export {
  WORK_CALENDAR_VIEW_MODES,
  WORK_ENTRY_KINDS,
  WORK_ENTRY_STATUSES,
} from "./types/work-calendar";
export type {
  WorkCalendarDayCell,
  WorkCalendarDaySummary,
  WorkCalendarPermissions,
  WorkCalendarViewMode,
  WorkCalendarViewModel,
  WorkCalendarWorkspaceProps,
  WorkDate,
  WorkEntry,
  WorkEntryDraft,
  WorkEntryId,
  WorkEntryKind,
  WorkEntryOwner,
  WorkEntryOwnerGroup,
  WorkEntryOwnerId,
  WorkEntryPatch,
  WorkEntryRepository,
  WorkEntryState,
  WorkEntryStatus,
  WorkProgressCounts,
  WorkTimestamp,
} from "./types/work-calendar";

export { WORK_TEAM_OVERVIEW_SORTS, WORK_TEAM_OVERVIEW_STATUS_FILTERS } from "./types/work-team-overview";
export type {
  WorkTeamOverviewEntryQuery,
  WorkTeamOverviewFilters,
  WorkTeamOverviewMember,
  WorkTeamOverviewOption,
  WorkTeamOverviewOptionKind,
  WorkTeamOverviewPage,
  WorkTeamOverviewQuery,
  WorkTeamOverviewRepository,
  WorkTeamOverviewSort,
  WorkTeamOverviewStatusFilter,
} from "./types/work-team-overview";
