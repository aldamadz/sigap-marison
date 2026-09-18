import React from "react";
import type { 
  UsageDetailRecord, 
  TemplateField, 
  FormInputData,
  LinkedDocumentContext 
} from "@/components/surat/form/surat-form-types";
import type { MasterData } from "@/components/surat/form/surat-form-types";

export type UsageCategory = "asset" | "unit" | "non_asset" | "non_unit";
export type UsageModuleKey = UsageCategory | "generic";

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

  setInputValue(key: string, value: unknown): void;
  setSelection(patch: Partial<FormDataSnapshot>): void;
}

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
}

export interface CleanupResult {
  inputKeysToDelete: string[];
  resetSelection: Array<"project_id" | "usage" | "signers" | "recommendationMultiDetail" | "fundWithoutProject">;
}

export interface UsageModule {
  meta: UsageModuleMeta;
  requirements: UsageModuleRequirements;

  renderContextPanel(ctx: UsageModuleContext): React.ReactNode | null;
  renderFieldOverride?(field: TemplateField, ctx: UsageModuleContext): React.ReactNode | null;
  hiddenFieldKeys?(ctx: UsageModuleContext): string[];

  cleanup(ctx: UsageModuleContext, reason: "form_change" | "usage_change" | "category_change" | "number_reset"): CleanupResult;
  normalizeInput(input: FormInputData, ctx: UsageModuleContext): FormInputData;
}
