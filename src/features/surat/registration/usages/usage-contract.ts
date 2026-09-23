import React from "react";
import type {
  UsageDetailRecord,
  TemplateField,
  FormInputData,
  LinkedDocumentContext,
  MasterData,
  MasterRecord,
} from "@/components/surat/form/surat-form-types";
import type {
  RecommendationAttachment,
  RecommendationDetail,
  RecommendationMultiDetail,
} from "@sigap/shared";
import type { UnitAvailabilityState } from "./unit/unit-availability";

export type UsageCategory = "asset" | "unit" | "non_asset" | "non_unit";
/** Hanya empat kategori canonical yang didukung. Tidak ada modul generic. */
export type UsageModuleKey = UsageCategory;

/** Fail-closed: resolver/module tidak pernah menebak kategori. */
export class UsageConfigurationError extends Error {
  readonly usageId: string | null;
  constructor(message: string, usageId?: string | null) {
    super(message);
    this.name = "UsageConfigurationError";
    this.usageId = usageId ?? null;
  }
}

export type FormDataSnapshot = {
  office_id: string;
  dept_id: string;
  entity_id: string;
  letter_type_id: string;
  project_id: string;
};

export type ExternalRevisionContext = {
  eventId: string;
  generation?: number;
  category?: UsageCategory;
  reason?: string;
};

/** Proyek Marison hasil mapping (single source di orchestrator, read-only bagi modul). */
export type ModuleMarisonProject = {
  ready: boolean;
  projectId: number;
  projectName: string;
  unavailableCount: number;
};

/**
 * Kemampuan file draft untuk editor rekomendasi. Implementasi upload/hapus
 * tetap memakai infrastruktur file draft bersama; modul memiliki alur UI.
 */
export type RecommendationIO = {
  model: RecommendationMultiDetail | null;
  onModelChange(model: RecommendationMultiDetail): void;
  uploadingKey: string | null;
  onUpload(parentId: string, detailId: string, files: File[], source: "upload" | "paste" | "drop"): Promise<void>;
  onDeleteAttachment(parentId: string, detailId: string, attachment: RecommendationAttachment): Promise<void>;
  onDeleteDetail(parentId: string, detail: RecommendationDetail): Promise<void>;
  directory: {
    users: MasterRecord[];
    offices: MasterRecord[];
    departments: MasterRecord[];
  };
};

export type { TemplateField };
export interface UsageModuleContext {
  usage: UsageDetailRecord;
  usageKey: UsageModuleKey;
  category: UsageCategory | null;
  formData: FormDataSnapshot;
  input: FormInputData;
  isPusatSelected: boolean;
  requesterDepartmentId: string;
  linkedDocumentContext: LinkedDocumentContext | null;
  externalRevision: ExternalRevisionContext | null;
  generatedNoSurat: string | null;
  master: MasterData;
  marisonProject: ModuleMarisonProject | null;
  /** Kapasitas unit Marison untuk proyek terpilih; null = bukan modul unit. */
  unitAvailability: UnitAvailabilityState | null;
  recommendationIO: RecommendationIO | null;

  setInputValue(key: string, value: unknown): void;
  setSelection(patch: Partial<FormDataSnapshot>): void;
  requestExternalOptions(sourceKey: string, variables?: Record<string, unknown>): Promise<Array<{ value: string; label: string; raw?: Record<string, unknown> }>>;
}

/** Satu masalah validasi konteks nomor: judul + deskripsi aman untuk UI. */
export type NumberContextIssue = {
  title: string;
  description?: string;
};

/** Satu masalah validasi submit: judul + deskripsi aman untuk UI. */
export type SubmitIssue = {
  title: string;
  description?: string;
};

/** Satu baris ringkasan submit milik modul. */
export type SummaryField = {
  key: string;
  label: string;
  value: unknown;
};

export interface UsageModuleMeta {
  key: UsageModuleKey;
  label: string;
  description: string;
  category: UsageCategory | null;
}

export interface UsageModuleRequirements {
  requiresProject: boolean;
  allowsFundWithoutProject: boolean;
  requiresUnitAllocation: boolean;
  requiresRecommendationChoice: boolean;
  allowsLinkedRecommendation: boolean;
  /** Butuh mapping master-proyek → Marison (selector Proyek + snapshot payload). */
  requiresMasterProjectMapping: boolean;
}

export interface CleanupResult {
  inputKeysToDelete: string[];
  resetSelection: Array<"project_id" | "usage" | "signers" | "recommendationMultiDetail" | "fundWithoutProject">;
}

export interface UsageModule {
  meta: UsageModuleMeta;
  requirements: UsageModuleRequirements;

  /** Panel konteks Section 1 (pra-nomor). */
  renderContextPanel(ctx: UsageModuleContext): React.ReactNode | null;
  /** Override field manual Section 2 (pasca-nomor). Null = render generik orchestrator. */
  renderFieldOverride?(field: TemplateField, ctx: UsageModuleContext): React.ReactNode | null;
  /** Panel detail Section 2 yang bukan field manual (mis. FundSubmissionEditor). */
  renderDetailsPanel?(ctx: UsageModuleContext): React.ReactNode | null;
  /** Field manual yang dirender sendiri oleh modul (disembunyikan dari render generik). */
  hiddenFieldKeys?(ctx: UsageModuleContext): string[];

  /** Aturan gate nomor khusus modul. Array kosong = lolos. */
  validateNumberContext(ctx: UsageModuleContext): NumberContextIssue[];

  /**
   * Kelengkapan satu field untuk submit. Boolean = milik modul;
   * null = serahkan ke pemeriksaan generik orchestrator.
   */
  isFieldComplete?(field: TemplateField, ctx: UsageModuleContext): boolean | null;

  /** Aturan gate submit khusus modul. Array kosong = lolos. */
  validateSubmit?(ctx: UsageModuleContext): SubmitIssue[];

  /** Baris ringkasan submit tambahan milik modul. */
  buildSummaryFields?(ctx: UsageModuleContext): SummaryField[];

  /** Override label ringkasan generik per key. */
  summaryFieldLabels?: Record<string, string>;

  /**
   * Rekonsiliasi input terhadap konteks (departemen/lokasi/linked/usage).
   * Dipanggil generik oleh orchestrator; orchestrator tidak tahu isi modul.
   */
  reconcileInputForContext?(input: FormInputData, ctx: UsageModuleContext): FormInputData;

  cleanup(ctx: UsageModuleContext, reason: "form_change" | "usage_change" | "category_change" | "number_reset"): CleanupResult;
  normalizeInput(input: FormInputData, ctx: UsageModuleContext): FormInputData;
}
