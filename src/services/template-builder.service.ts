import { supabase } from "@/lib/supabase";
import type {
  DocumentTemplateBuilder,
  DocumentTemplateBuilderVersion,
  TemplateBuilderRecord,
  TemplateDefinition,
  TemplateElement,
  TemplateInputSchema,
  TemplateStyle,
} from "@/types/template-builder";

const MAX_ELEMENTS = 80;
const MAX_COLUMNS = 20;
const MAX_TEXT_LENGTH = 500;
const MAX_LABEL_LENGTH = 120;

const SAFE_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$|^transparent$/;
const SAFE_BINDING = /^[a-zA-Z0-9_.-]{0,80}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const DATA_SOURCES = [
  { value: "surat", label: "Data Surat" },
  { value: "pengaju", label: "Data Pengaju" },
  { value: "items", label: "Daftar Barang" },
  { value: "units", label: "Daftar Unit" },
  { value: "recommendations", label: "Daftar Rekomendasi" },
  { value: "attachments", label: "Daftar Lampiran" },
  { value: "signers", label: "Penandatangan" },
] as const;

export const BUILTIN_BINDINGS = [
  { source: "surat", value: "no_surat", label: "Nomor Surat" },
  { source: "surat", value: "judul_surat", label: "Judul Surat" },
  { source: "surat", value: "tempat_tanggal", label: "Tempat, Tanggal" },
  { source: "surat", value: "kategori", label: "Kategori" },
  { source: "surat", value: "proyek", label: "Proyek" },
  { source: "pengaju", value: "nama", label: "Nama Pengaju" },
  { source: "pengaju", value: "jabatan", label: "Jabatan Pengaju" },
  { source: "pengaju", value: "departemen", label: "Departemen Pengaju" },
  { source: "pengaju", value: "kantor", label: "Kantor Pengaju" },
] as const;

export const SAMPLE_DATA: Record<string, unknown> = {
  surat: {
    no_surat: "001/UAI/PBO.1.MLO/VII/2026",
    judul_surat: "Permohonan Aset : Laptop, Printer, dan Scanner Dept. Pengembangan Organisasi Kantor Pusat",
    tempat_tanggal: "Magelang, 02 Juli 2026",
    kategori: "Aset",
    proyek: "-",
  },
  pengaju: {
    nama: "Aldama Rindra Saputra",
    jabatan: "Staff IT",
    departemen: "Pengembangan Organisasi",
    kantor: "Kantor Pusat",
  },
  items: [
    { kode: "IT-001", nama_barang: "Laptop operasional", sat: "Unit", jumlah: 1, status: "2", keterangan: "Untuk pekerjaan desain" },
    { kode: "IT-002", nama_barang: "Printer warna", sat: "Unit", jumlah: 1, status: "3", keterangan: "Pengganti unit lama" },
    { kode: "IT-003", nama_barang: "Scanner dokumen", sat: "Unit", jumlah: 1, status: "3", keterangan: "Arsip digital" },
  ],
  units: [
    { proyek: "Marison Kalinegoro", unit: "B14", kode_produksi: "001/UAI/PRC/4.1/14/01/2026" },
    { proyek: "Marison Kalinegoro", unit: "D17", kode_produksi: "002/UAI/PRC/4.1/14/01/2026" },
  ],
  recommendations: [
    { nama_barang: "Laptop operasional", tindakan: "Beli Baru", lokasi_pic: "PO / Aldama", link: "https://contoh.local/referensi" },
  ],
  attachments: [
    { nama: "Siteplan.pdf", tipe: "PDF", ukuran: "1.2 MB" },
    { nama: "Foto kondisi.png", tipe: "Gambar", ukuran: "650 KB" },
  ],
  signers: [
    { label: "Membuat", nama: "Aldama Rindra Saputra", jabatan: "Staff IT" },
    { label: "Memeriksa", nama: "Fenanika Ragasiwi", jabatan: "Mgr. PO" },
    { label: "Menyetujui", nama: "Direktur I", jabatan: "Direktur I" },
  ],
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

const cleanText = (value: unknown, max = MAX_TEXT_LENGTH) =>
  String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const cleanColor = (value: unknown, fallback?: string) => {
  const color = String(value ?? "").trim();
  if (!color) return fallback;
  return SAFE_COLOR.test(color) ? color : fallback;
};

const cleanBinding = (value: unknown) => {
  const binding = String(value ?? "").trim();
  return SAFE_BINDING.test(binding) ? binding : "";
};

const sanitizeStyle = (style?: TemplateStyle): TemplateStyle => ({
  fontSize: clamp(style?.fontSize, 7, 32, 10),
  fontWeight: ["normal", "medium", "semibold", "bold"].includes(String(style?.fontWeight))
    ? style?.fontWeight
    : "normal",
  italic: Boolean(style?.italic),
  align: ["left", "center", "right"].includes(String(style?.align)) ? style?.align : "left",
  verticalAlign: ["top", "middle", "bottom"].includes(String(style?.verticalAlign)) ? style?.verticalAlign : "middle",
  color: cleanColor(style?.color, "#111827"),
  backgroundColor: cleanColor(style?.backgroundColor, "transparent"),
  borderColor: cleanColor(style?.borderColor, "#111827"),
  borderWidth: clamp(style?.borderWidth, 0, 4, 1),
  radius: clamp(style?.radius, 0, 24, 0),
  padding: clamp(style?.padding, 0, 24, 4),
  lineHeight: clamp(style?.lineHeight, 1, 2, 1.25),
});

export const sanitizeTemplateDefinition = (definition: TemplateDefinition): TemplateDefinition => {
  const orientation = definition?.page?.orientation === "portrait" ? "portrait" : "landscape";
  const pageSize = definition?.page?.size === "F4" ? "F4" : "A4";
  const pageWidth = orientation === "landscape" ? 297 : 210;
  const pageHeight = orientation === "landscape" ? 210 : 297;
  const margin = clamp(definition?.page?.margin, 0, 40, 8);

  const elements = Array.isArray(definition?.elements) ? definition.elements.slice(0, MAX_ELEMENTS) : [];

  return {
    page: { size: pageSize, orientation, margin },
    elements: elements.map((element, index): TemplateElement => {
      const type = [
        "logo",
        "text",
        "field",
        "line",
        "box",
        "note_box",
        "repeater_table",
        "signature_grid",
      ].includes(String(element.type))
        ? element.type
        : "text";

      const columns = Array.isArray(element.columns)
        ? element.columns.slice(0, MAX_COLUMNS).map((column, columnIndex) => ({
            id: cleanText(column.id || `col-${columnIndex + 1}`, 50) || `col-${columnIndex + 1}`,
            label: cleanText(column.label || "Kolom", 80),
            binding: cleanBinding(column.binding),
            width: clamp(column.width, 20, 260, 80),
            align: ["left", "center", "right"].includes(String(column.align)) ? column.align : "left",
            headerAlign: ["left", "center", "right"].includes(String(column.headerAlign))
              ? column.headerAlign
              : column.align || "left",
            bodyAlign: ["left", "center", "right"].includes(String(column.bodyAlign))
              ? column.bodyAlign
              : column.align || "left",
            format: ["text", "number", "currency", "date", "index", "checkmark"].includes(String(column.format))
              ? column.format
              : "text",
          }))
        : undefined;

      return {
        id: cleanText(element.id || `element-${index + 1}`, 50) || `element-${index + 1}`,
        type,
        label: cleanText(element.label || `Elemen ${index + 1}`, MAX_LABEL_LENGTH),
        rect: {
          x: clamp(element.rect?.x, 0, pageWidth, margin),
          y: clamp(element.rect?.y, 0, pageHeight, margin),
          width: clamp(element.rect?.width, 4, pageWidth, 40),
          height: clamp(element.rect?.height, 4, pageHeight, 12),
        },
        binding: cleanBinding(element.binding),
        source: DATA_SOURCES.some((source) => source.value === element.source) ? element.source : "surat",
        content: cleanText(element.content, MAX_TEXT_LENGTH),
        imageUrl: cleanText(element.imageUrl, 600),
        style: sanitizeStyle(element.style),
        columns,
        minRows: clamp(element.minRows, 0, 60, 5),
        maxRows: clamp(element.maxRows, 1, 120, 20),
        rowHeight: clamp(element.rowHeight, 4, 30, 8),
        repeatHeader: element.repeatHeader !== false,
        signaturePattern: cleanText(element.signaturePattern || "auto", 20),
        signatureAutoSize: element.signatureAutoSize !== false,
        locked: Boolean(element.locked),
      };
    }),
  };
};

export const createSlug = (name: string) => {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return SAFE_SLUG.test(slug) ? slug : `template-${Date.now()}`;
};

export const createDefaultDefinition = (): TemplateDefinition => ({
  page: { size: "A4", orientation: "landscape", margin: 8 },
  elements: [
    {
      id: crypto.randomUUID(),
      type: "logo",
      label: "Logo",
      rect: { x: 8, y: 8, width: 42, height: 18 },
      imageUrl: "/logo-marison.png",
      style: { borderWidth: 1, borderColor: "#111827", padding: 2, align: "center" },
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      label: "Judul Dokumen",
      rect: { x: 50, y: 8, width: 160, height: 18 },
      content: "JUDUL DOKUMEN",
      style: { fontSize: 15, fontWeight: "bold", align: "center", borderWidth: 1, padding: 2 },
    },
    {
      id: crypto.randomUUID(),
      type: "field",
      label: "Nomor Dokumen",
      rect: { x: 8, y: 28, width: 120, height: 8 },
      source: "surat",
      binding: "no_surat",
      content: "No. Dokumen :",
      style: { fontSize: 9, fontWeight: "semibold", borderWidth: 1, padding: 2 },
    },
    {
      id: crypto.randomUUID(),
      type: "repeater_table",
      label: "Tabel Barang",
      rect: { x: 8, y: 58, width: 281, height: 80 },
      source: "items",
      minRows: 10,
      maxRows: 30,
      rowHeight: 7,
      repeatHeader: true,
      style: { fontSize: 8, borderWidth: 1, borderColor: "#111827", padding: 2 },
      columns: [
        { id: "no", label: "No", binding: "_index", width: 10, align: "center", format: "index" },
        { id: "kode", label: "Kode", binding: "kode", width: 25, align: "left", format: "text" },
        { id: "nama", label: "Nama Barang", binding: "nama_barang", width: 120, align: "left", format: "text" },
        { id: "sat", label: "Sat", binding: "sat", width: 20, align: "center", format: "text" },
        { id: "jumlah", label: "Jumlah", binding: "jumlah", width: 25, align: "center", format: "number" },
        { id: "status", label: "Status", binding: "status", width: 25, align: "center", format: "text" },
        { id: "ket", label: "Keterangan", binding: "keterangan", width: 56, align: "left", format: "text" },
      ],
    },
    {
      id: crypto.randomUUID(),
      type: "note_box",
      label: "Catatan",
      rect: { x: 8, y: 142, width: 281, height: 26 },
      source: "surat",
      binding: "catatan",
      content: "Catatan :",
      style: { fontSize: 8, borderWidth: 1, borderColor: "#111827", padding: 3 },
    },
    {
      id: crypto.randomUUID(),
      type: "signature_grid",
      label: "Tanda Tangan",
      rect: { x: 116, y: 172, width: 173, height: 30 },
      source: "signers",
      signaturePattern: "auto",
      signatureAutoSize: true,
      style: { fontSize: 8, borderWidth: 1, borderColor: "#111827", padding: 2, align: "center" },
    },
  ],
});

export const createDefaultInputSchema = (): TemplateInputSchema => ({
  fields: [
    { id: crypto.randomUUID(), key: "items", label: "Daftar Barang", type: "table", required: true, source: "items" },
    { id: crypto.randomUUID(), key: "catatan", label: "Catatan", type: "textarea", required: false, source: "surat" },
  ],
});

export const templateBuilderService = {
  async listTemplates(): Promise<TemplateBuilderRecord[]> {
    const { data, error } = await supabase
      .from("document_template_builders")
      .select(`
        *,
        master_departments:owner_department_id(id, name, code),
        document_template_builder_versions!document_template_builder_versions_template_id_fkey(*)
      `)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []) as TemplateBuilderRecord[];
  },

  async createTemplate(input: {
    name: string;
    description?: string;
    owner_department_id?: string | null;
    definition?: TemplateDefinition;
    input_schema?: TemplateInputSchema;
  }): Promise<DocumentTemplateBuilder> {
    const name = cleanText(input.name, 120);
    if (name.length < 3) throw new Error("Nama template minimal 3 karakter.");

    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("document_template_builders")
      .insert({
        name,
        slug: createSlug(name),
        description: cleanText(input.description, 300),
        owner_department_id: input.owner_department_id || null,
        created_by: userData.user?.id || null,
      })
      .select("*")
      .single();

    if (error) throw error;

    await this.saveVersion({
      template_id: data.id,
      version_number: 1,
      status: "draft",
      definition: input.definition || createDefaultDefinition(),
      input_schema: input.input_schema || createDefaultInputSchema(),
    });

    return data as DocumentTemplateBuilder;
  },

  async saveVersion(input: {
    template_id: string;
    version_number?: number;
    status?: "draft" | "published" | "archived";
    definition: TemplateDefinition;
    input_schema: TemplateInputSchema;
  }): Promise<DocumentTemplateBuilderVersion> {
    const { data: existing } = await supabase
      .from("document_template_builder_versions")
      .select("version_number")
      .eq("template_id", input.template_id)
      .order("version_number", { ascending: false })
      .limit(1);

    const versionNumber = input.version_number || Number(existing?.[0]?.version_number || 0) + 1;
    const { data: userData } = await supabase.auth.getUser();
    const cleanDefinition = sanitizeTemplateDefinition(input.definition);
    const cleanSchema = sanitizeInputSchema(input.input_schema);

    const { data, error } = await supabase
      .from("document_template_builder_versions")
      .upsert(
        {
          template_id: input.template_id,
          version_number: versionNumber,
          status: input.status || "draft",
          definition: cleanDefinition,
          input_schema: cleanSchema,
          created_by: userData.user?.id || null,
          published_at: input.status === "published" ? new Date().toISOString() : null,
        },
        { onConflict: "template_id,version_number" },
      )
      .select("*")
      .single();

    if (error) throw error;
    return data as DocumentTemplateBuilderVersion;
  },

  async publishVersion(templateId: string, versionId: string) {
    const { error: versionError } = await supabase
      .from("document_template_builder_versions")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("template_id", templateId);
    if (versionError) throw versionError;

    const { error: templateError } = await supabase
      .from("document_template_builders")
      .update({ status: "published", active_version_id: versionId })
      .eq("id", templateId);
    if (templateError) throw templateError;
  },

  async updateTemplateMeta(templateId: string, input: Partial<DocumentTemplateBuilder>) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) {
      payload.name = cleanText(input.name, 120);
      payload.slug = createSlug(String(input.name));
    }
    if (input.description !== undefined) payload.description = cleanText(input.description, 300);
    if (input.owner_department_id !== undefined) payload.owner_department_id = input.owner_department_id || null;
    if (input.status !== undefined) payload.status = input.status;

    const { error } = await supabase.from("document_template_builders").update(payload).eq("id", templateId);
    if (error) throw error;
  },
};

export const sanitizeInputSchema = (schema: TemplateInputSchema): TemplateInputSchema => ({
  fields: Array.isArray(schema?.fields)
    ? schema.fields.slice(0, 80).map((field, index) => ({
        id: cleanText(field.id || `field-${index + 1}`, 50) || `field-${index + 1}`,
        key: cleanBinding(field.key) || `field_${index + 1}`,
        label: cleanText(field.label || `Field ${index + 1}`, 100),
        type: ["text", "textarea", "number", "date", "select", "file", "table"].includes(String(field.type))
          ? field.type
          : "text",
        required: Boolean(field.required),
        source: DATA_SOURCES.some((source) => source.value === field.source) ? field.source : "surat",
        options: Array.isArray(field.options)
          ? field.options.slice(0, 50).map((option) => ({
              label: cleanText(option.label, 80),
              value: cleanText(option.value, 80),
            }))
          : [],
      }))
    : [],
});
