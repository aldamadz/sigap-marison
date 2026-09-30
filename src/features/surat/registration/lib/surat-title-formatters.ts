/**
 * Pure formatters for the SuratForm auto-title pipeline.
 *
 * Pass I refactor: behaviour-preserving extraction of the inline
 * `buildAutoTitle` helper from `SuratForm.tsx` into a pure module.
 *
 * The helper has zero state, no effects, no fetches and no
 * mutations. It accepts a snapshot of the inputs that the form
 * reads when computing a new title and returns a string. The caller
 * (the form) still owns the lifecycle, the manual-override flag,
 * the `setFormData` write and the surrounding `useEffect` deps.
 *
 * Title generation is independent of I/O and form lifecycle.
 *
 * Linked recommendation path
 * --------------------------
 * The recommendation path derives its office suffix from the parent
 * summary fetched by `useLinkedRecommendationContext` (Pass E). This
 * helper does NOT fetch or own that data — it just consumes whatever
 * snapshot the caller passes.
 *
 * `getRecommendationAction` injection
 * ------------------------------------
 * `getRecommendationAction` lives in `SuratForm.tsx` as a closure
 * over the local `RECOMMENDATION_ACTIONS` constant. Rather than
 * drag that closure into the helper (and into every test), the
 * helper accepts a `getRecommendationAction` callback. The caller
 * passes its existing closure. When the caller omits the callback,
 * the helper falls back to a default that inspects only the
 * `recommendation_action` field — identical to the no-closure
 * callers' effective behaviour.
 */
import { normalizeTableRows } from "@/components/surat/form/surat-form-schema";
import type {
  LinkedDocumentContext,
  MasterRecord,
  RequestCategory,
  TableRow,
} from "@/components/surat/form/surat-form-types";
import {
  buildNonUnitRequestTitle,
  formatIndonesianList,
  getDepartmentTitlePart,
  getOfficeTitleSuffix,
} from "@/components/surat/form/surat-form-formatters";
import type { RecommendationParentSummary } from "@/services/surat.service";

/**
 * Mirrors the `RECOMMENDATION_ACTIONS` constant in `SuratForm.tsx`.
 * Kept in sync with that declaration — the values and labels are
 * contract for both the inline table UI and the title formatter.
 */
const RECOMMENDATION_ACTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "service", label: "Service" },
  { value: "ganti", label: "Ganti Komponen" },
  { value: "beli_baru", label: "Beli Baru" },
  { value: "tidak_direkomendasikan", label: "Tidak Direkomendasikan" },
];

/** Key used to read recommendation rows from `form_input_data`. */
const RECOMMENDATION_ITEMS_KEY = "recommendation_items";

/**
 * Default `getRecommendationAction` implementation. Mirrors the
 * closure in `SuratForm.tsx`: prefer the explicit
 * `recommendation_action` field, then fall back to detecting
 * whichever action field is set.
 */
const defaultGetRecommendationAction = (row: TableRow): string => {
  const explicit = String(row.recommendation_action ?? "").trim();
  if (RECOMMENDATION_ACTIONS.some((action) => action.value === explicit)) return explicit;
  if (String(row.service ?? "").trim()) return "service";
  if (String(row.ganti ?? "").trim()) return "ganti";
  if (String(row.beli_baru ?? "").trim()) return "beli_baru";
  if (String(row.tidak_direkomendasikan ?? "").trim()) return "tidak_direkomendasikan";
  return "";
};

export type BuildAutoTitleOptions = {
  /** The current request category (asset / unit / non_unit / non_asset). */
  category: RequestCategory | null;
  /** The form's current `form_input_data` (raw object). */
  formInputData: Record<string, unknown>;
  formNumber?: string | null;
  /** Currently selected office (used for the office suffix). */
  selectedOffice?: MasterRecord | null;
  /** Currently selected department (used for the office suffix). */
  selectedDepartment?: MasterRecord | null;
  /** Optional linked-document context (recommendation flow). */
  linkedDocumentContext?: LinkedDocumentContext | null;
  /** Optional parent recommendation summary (recommendation flow). */
  recommendationParentSummary?: RecommendationParentSummary | null;
  /**
   * Optional callback that derives a recommendation action from a
   * table row. When omitted, the default inspects
   * `recommendation_action` / `service` / `ganti` / `beli_baru` /
   * `tidak_direkomendasikan` fields — identical to the inline
   * helper when no closure is available.
   */
  getRecommendationAction?: (row: TableRow) => string;
};

/**
 * Compute the auto-title for the form. Pure: no I/O, no state, no
 * effects. Returns a non-empty string. Always returns something —
 * the inline `if (!nextTitle) return;` guard in the form is a
 * belt-and-braces check; this helper always produces a value.
 *
 * Behaviour matrix (preserved verbatim from inline):
 *  | category        | output shape                                    |
 *  | --------------- | ----------------------------------------------- |
 *  | recommendation  | "Rekomendasi <segments>" OR "Rekomendasi Peremajaan Alat : <items>" OR "Rekomendasi Peremajaan Alat", joined with parent office suffix |
 *  | unit            | "Permohonan Order Bangun SPK Pembangunan Rumah <n> Unit" OR "Permohonan Order Bangun", joined with project + office suffix |
 *  | non_unit        | delegated to `buildNonUnitRequestTitle(itemText, officeSuffix)` |
 *  | asset           | "Permohonan Aset" or "Permohonan Aset : <items>", joined with office suffix |
 *  | non_asset       | "Permohonan Non Aset" or "Permohonan Non Aset : <items>", joined with office suffix |
 *  | (none)          | "Permohonan" or "Permohonan : <items>", joined with office suffix |
 */
export const buildAutoTitle = (options: BuildAutoTitleOptions): string => {
  const {
    category,
    formInputData,
    formNumber,
    selectedOffice = null,
    selectedDepartment = null,
    linkedDocumentContext = null,
    recommendationParentSummary = null,
    getRecommendationAction = defaultGetRecommendationAction,
  } = options;

  const officeSuffix = getOfficeTitleSuffix(selectedOffice, selectedDepartment);
  const isRecommendationDocument = linkedDocumentContext?.type === "recommendation";
  const rows = normalizeTableRows(formInputData.items);
  const itemNames = rows
    .map((row) => String(row.nama_barang || row.item_name || row.keterangan || row.name || "").trim())
    .filter(Boolean);
  const itemText = itemNames.length > 2
    ? `${itemNames[0]} dan ${itemNames.length - 1} item lainnya`
    : formatIndonesianList(itemNames);

  if (isRecommendationDocument) {
    const recommendationRows = normalizeTableRows(formInputData[RECOMMENDATION_ITEMS_KEY]);
    const recommendationItemText = formatIndonesianList(
      recommendationRows
        .map((row) => String(row.nama_barang || row.name || "").trim())
        .filter(Boolean)
    );
    const recommendationSegments = RECOMMENDATION_ACTIONS.flatMap((action) => {
      if (action.value === "tidak_direkomendasikan") return [];
      const names = recommendationRows
        .filter((row) => getRecommendationAction(row) === action.value)
        .map((row) => String(row.nama_barang || row.name || "").trim())
        .filter(Boolean);
      if (names.length === 0) return [];
      const actionTitle = action.value === "ganti" ? "Ganti Komponen" : action.label;
      return [`${actionTitle} ${formatIndonesianList(names)}`];
    });
    const parentOfficeSuffix = recommendationParentSummary
      ? String(recommendationParentSummary.office_kedudukan || "").toUpperCase() === "PUSAT"
        ? getDepartmentTitlePart({
            id: recommendationParentSummary.parent_surat_id,
            name: recommendationParentSummary.department_name || "",
            code: recommendationParentSummary.department_code || "",
          })
        : getOfficeTitleSuffix({
            id: recommendationParentSummary.parent_surat_id,
            name: recommendationParentSummary.office_name || "",
            kedudukan: recommendationParentSummary.office_kedudukan || "",
          })
      : "";
    const title =
      recommendationSegments.length > 0
        ? `Rekomendasi ${formatIndonesianList(recommendationSegments)}`
        : recommendationItemText
          ? `Rekomendasi Peremajaan Alat : ${recommendationItemText}`
          : "Rekomendasi Peremajaan Alat";
    return [title, parentOfficeSuffix].filter(Boolean).join(" ");
  }

  if (String(formNumber || "").toUpperCase().includes("KEU-01")) {
    return [itemText ? `Pengajuan Kas Kecil: ${itemText}` : "Pengajuan Kas Kecil", officeSuffix]
      .filter(Boolean).join(" ");
  }

  if (category === "unit") {
    const count = Number((formInputData as Record<string, unknown>).requested_unit_count || 0);
    const project = (formInputData as Record<string, unknown>).requested_project as
      | { name?: string }
      | undefined;
    const title =
      count > 0
        ? `Pengajuan SPK Unit: ${count} Unit`
        : "Pengajuan SPK Unit";
    return [title, project?.name, officeSuffix].filter(Boolean).join(" ");
  }

  if (category === "non_unit") {
    return buildNonUnitRequestTitle(itemText, officeSuffix);
  }

  const categoryLabel =
    category === "asset"
      ? "Pengajuan Aset"
      : category === "non_asset"
        ? String(formInputData.fund_type) === "production_cost"
          ? "Pengajuan Dana Produksi"
          : "Pengajuan Dana Operasional"
        : "Pengajuan";
  return [
    itemText ? `${categoryLabel}: ${itemText}` : categoryLabel,
    officeSuffix,
  ]
    .filter(Boolean)
    .join(" ");
};
