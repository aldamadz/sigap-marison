import type { RegistrationSummaryData, RegistrationSummaryField } from "@/components/surat/RegistrationSummaryDialog";
import { formatSummaryValue, humanizeInputKey } from "@/components/surat/request-summary";
import { getUnitAllocationData } from "@/components/surat/unit-allocation-data";
import { applyRevisionToItems, getActiveRevision } from "@/components/surat/revision-utils";
import { isKeu10Form } from "@/features/surat/registration/lib/keu10-form";
import { normalizeKeu10Config } from "@/features/surat/registration/lib/keu10-config";
import { getFundSubmissionTypeLabel } from "@/features/surat/registration/usages/fund/fund-types";

const SUMMARY_HIDDEN_KEYS = new Set([
  "request_mode",
  "request_category",
  "unit_config_snapshot",
  "requested_project",
  "requested_unit_count",
  "unit_request_sentence",
  "allocated_at",
  "allocated_project",
  "allocated_unit_count",
  "recommendation_template_name",
  "recommendation_attachment_note",
  "allocated_by_signature_id",
]);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const getRecommendationDecisions = (snapshot: Record<string, unknown>) => {
  const direct = snapshot.recommendation_decisions;
  if (Array.isArray(direct)) return direct.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  const recommendation = asRecord(snapshot.recommendation);
  return Array.isArray(recommendation.items)
    ? recommendation.items.filter((row) => row && typeof row === "object") as Record<string, unknown>[]
    : [];
};

const applyRecommendationDecisionsToItems = (
  items: unknown[],
  decisions: Record<string, unknown>[],
) => {
  if (!Array.isArray(items) || decisions.length === 0) return items;

  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    const rowName = String(row.nama_barang || row.nama || row.barang || "").trim().toLowerCase();
    const decision = decisions.find((candidate) => {
      const applicantOriginal = asRecord(candidate.applicant_original);
      const explicitIndex = Number(candidate.parent_item_index || 0);
      const canonicalOrder = Number(candidate.order);
      const parentIndex = explicitIndex > 0
        ? explicitIndex
        : Number.isInteger(canonicalOrder) && canonicalOrder >= 0
          ? canonicalOrder + 1
          : 0;
      const parentName = String(candidate.parent_item_name || applicantOriginal.name || "").trim().toLowerCase();
      return parentIndex === index + 1 || (parentName && parentName === rowName);
    });
    const recommendationStatus = String(decision?.recommendation_status || decision?.status || "")
      .trim().toLowerCase().replace(/[\s-]+/g, "_");
    const notRecommended = !decision ||
      ["not_recommended", "tidak_direkomendasikan", "rejected", "ditolak"].includes(recommendationStatus) ||
      decision.recommendation_action === "tidak_direkomendasikan" ||
      decision.is_recommended === false;
    if (!notRecommended) {
      const details = Array.isArray(decision.details)
        ? decision.details.filter((detail) => detail && typeof detail === "object" && !Array.isArray(detail)) as Record<string, unknown>[]
        : [];
      const requestedQuantity = Number(row.jumlah ?? row.quantity);
      const approvedQuantity = details.length === 1 ? Number(details[0].quantity ?? details[0].jumlah) : NaN;
      if (Number.isFinite(requestedQuantity) && Number.isFinite(approvedQuantity) && requestedQuantity !== approvedQuantity) {
        return {
          ...row,
          __recommendation_decision: decision,
          __revision: {
            action: "adjust",
            nilai_diajukan: requestedQuantity,
            nilai_disetujui: approvedQuantity,
            value_type: "number",
            alasan: String(details[0].notes || details[0].keterangan || "Jumlah disesuaikan oleh tim rekomendasi.").trim(),
            source: "recommendation",
          },
        };
      }
      return {
        ...row,
        __recommendation_decision: decision,
      };
    }
    return {
      ...row,
      __revision: {
        action: "reject",
        alasan: String(decision?.rejection_reason || decision?.keterangan || decision?.alasan || decision?.reason || "Belum ada rekomendasi untuk item ini.").trim(),
        source: "recommendation",
      },
    };
  });
};

export const buildRegistrationSummaryData = (surat: any): RegistrationSummaryData => {
  const snapshot = asRecord(surat?.data_snapshot);
  const snapshotRequester = asRecord(snapshot.requester);
  const requester = Object.keys(snapshotRequester).length > 0 ? snapshotRequester : asRecord(surat?.requester_snapshot);
  const snapshotLocation = asRecord(snapshot.location);
  const location = Object.keys(snapshotLocation).length > 0 ? snapshotLocation : asRecord(surat?.location_snapshot);
  const formInput = asRecord(surat?.form_input_data);
  const snapshotInput = asRecord(snapshot.input);
  const mergedInput = { ...snapshotInput, ...formInput };
  const activeRevision = getActiveRevision(surat);
  if (Array.isArray(mergedInput.items)) {
    mergedInput.items = applyRevisionToItems(
      applyRecommendationDecisionsToItems(mergedInput.items, getRecommendationDecisions(snapshot)),
      activeRevision
    );
  }
  const unitAllocation = getUnitAllocationData({ form_input_data: mergedInput, data_snapshot: snapshot });
  const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
  const signatures = Array.isArray(surat?._sigs)
    ? surat._sigs
    : Array.isArray(surat?.surat_signatures)
      ? [...surat.surat_signatures].sort((a: any, b: any) => Number(a.step_order || 0) - Number(b.step_order || 0))
      : [];

  const locationForm = asRecord(location.form);
  const form = Object.keys(locationForm).length > 0 ? locationForm : asRecord(snapshot.form);
  const policy = asRecord(surat?.policy_snapshot);
  const keu10 = isKeu10Form({ nomor_form: typeof form.nomor_form === "string" ? form.nomor_form : null });
  const purpose = normalizeKeu10Config(policy.keu10_config)?.purposes.find((entry) => entry.code === mergedInput.keu10_purpose_code);
  const fields: RegistrationSummaryField[] = Object.entries(mergedInput)
    .filter(([key, value]) => !SUMMARY_HIDDEN_KEYS.has(key) && !(keu10 && key === "keu10_purpose_label") && formatSummaryValue(value) !== "-")
    .map(([key, value]) => ({
      key,
      label: key === "fund_type" ? "Jenis Pengajuan Dana" : keu10 && key === "keu10_purpose_code" ? "Tujuan Pengajuan" : humanizeInputKey(key),
      type: Array.isArray(value) ? "table" : undefined,
      value: key === "fund_type" ? getFundSubmissionTypeLabel(value) : keu10 && key === "keu10_purpose_code" ? purpose?.label || "-" : value,
    }));

  if (unitAllocation.units.length > 0 && !fields.some((field) => field.key === "allocated_units")) {
    if (unitAllocation.project && !fields.some((field) => field.key === "allocated_project")) {
      fields.push({
        key: "allocated_project",
        label: "Proyek Dialokasikan",
        value: unitAllocation.project,
      });
    }
    if (unitAllocation.requestedCount && !fields.some((field) => field.key === "requested_unit_count")) {
      fields.push({
        key: "requested_unit_count",
        label: "Jumlah Unit Diajukan",
        value: unitAllocation.requestedCount,
      });
    }
    fields.push({
      key: "allocated_units",
      label: "Kavling yang dipilih",
      type: "table",
      value: unitAllocation.units,
    });
  }

  const department = asRecord(location.department);
  const office = asRecord(location.office);
  const project = asRecord(location.project);
  const requestedProject = asRecord(mergedInput.requested_project);
  const snapshotSurat = asRecord(snapshot.surat);

  return {
    noSurat: String(surat?.no_surat || ""),
    title: String(surat?.judul_surat || ""),
    category: mergedInput.request_category || snapshotSurat.request_category || "-",
    usageName: String(policy.usage_name || "-"),
    formName: String(form.nama_form || "-"),
    formNumber: String(form.nomor_form || ""),
    requesterName: String(requester.full_name || "-"),
    requesterJobTitle: requester.job_title ? String(requester.job_title) : undefined,
    departmentName: String(department.name || "-"),
    officeName: String(office.name || "-"),
    projectName: project.name
      ? String(project.name)
      : requestedProject.name || requestedProject.label
        ? String(requestedProject.name || requestedProject.label)
        : undefined,
    requestPlace: String(surat?.request_place || snapshotSurat.request_place || "-"),
    requestDate: String(surat?.request_date || snapshotSurat.request_date || ""),
    fields,
    attachments: attachments
      .filter((attachment: any) => attachment.stage !== "recommendation_item")
      .map((attachment: any, index: number) => ({
      id: String(attachment.id || `${surat?.id}-attachment-${index}`),
      name: String(attachment.file_name || `Lampiran ${index + 1}`),
      type: attachment.file_type || null,
      size: attachment.file_size || null,
      label: attachment.requirement_label || null,
      fileUrl: attachment.file_url || null,
    })),
    signers: signatures.map((signature: any) => ({
      step: Number(signature.step_order || 0),
      role: String(signature.label_jabatan || signature.role_name || "-"),
      name: String(signature.profiles?.full_name || signature.signer_snapshot?.full_name || "Belum ditentukan"),
      jobTitle: signature.profiles?.job_title || signature.signer_snapshot?.job_title || undefined,
    })),
    isRecommendation: formInput.linked_document_type === "recommendation",
  };
};
