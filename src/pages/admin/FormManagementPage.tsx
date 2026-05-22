import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText, Plus, Pencil, Trash2, Loader2,
  ExternalLink, Search, FileSpreadsheet, Upload, CheckCircle2, X, Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TemplateInputType = "text" | "textarea" | "date" | "number" | "currency" | "table";
type TemplateHorizontalAlign = "left" | "center" | "right";
type TemplateVerticalAlign = "top" | "middle" | "bottom";
type TemplateDefaultSource =
  | "manual"
  | "requester_name"
  | "requester_nik"
  | "requester_job_title"
  | "department_name"
  | "office_name"
  | "project_name"
  | "entity_name"
  | "letter_number"
  | "letter_title"
  | "request_place"
  | "request_date"
  | "request_place_date";

interface TemplateInputField {
  id: string;
  key: string;
  label: string;
  type: TemplateInputType;
  required: boolean;
  cell: string;
  sheet: number;
  defaultSource: TemplateDefaultSource;
  merge_range?: string;
  horizontal?: TemplateHorizontalAlign;
  vertical?: TemplateVerticalAlign;
  wrap?: boolean;
  shrink?: boolean;
  font_name?: string;
  font_size?: number;
  row_height?: number;
  table_config?: {
    start_row: number;
    end_row: number;
    no_column: string;
    columns: Array<{
      key: string;
      label: string;
      column: string;
      required?: boolean;
      type?: "text" | "number";
    }>;
  };
}

const createFieldId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeInputSchema = (value: any): TemplateInputField[] => {
  const raw = typeof value === "string" ? (() => {
    try { return JSON.parse(value || "[]"); } catch { return []; }
  })() : value;

  if (!Array.isArray(raw)) return [];

  return raw.map((item: any, index: number) => ({
    id: item.id || createFieldId(),
    key: item.key || `field_${index + 1}`,
    label: item.label || `Field ${index + 1}`,
    type: item.type || "text",
    required: item.required !== false,
    cell: item.cell || "",
    sheet: Number(item.sheet || 1),
    defaultSource: item.defaultSource || item.default_source || "manual",
    merge_range: item.merge_range || item.mergeRange || "",
    horizontal: item.horizontal || "left",
    vertical: item.vertical || "top",
    wrap: item.wrap === true,
    shrink: item.shrink === true,
    font_name: item.font_name || item.fontName || "",
    font_size: item.font_size || item.fontSize ? Number(item.font_size || item.fontSize) : undefined,
    row_height: item.row_height || item.rowHeight ? Number(item.row_height || item.rowHeight) : undefined,
    table_config: item.table_config || item.tableConfig,
  }));
};

const serializeInputSchema = (fields: TemplateInputField[]) =>
  fields
    .filter(field => field.key.trim() && field.label.trim())
    .map(({ id, ...field }) => ({
      ...field,
      key: field.key.trim(),
      label: field.label.trim(),
      cell: field.cell.trim().toUpperCase(),
      sheet: Number(field.sheet || 1),
      default_source: field.defaultSource,
      merge_range: field.merge_range?.trim().toUpperCase() || undefined,
      horizontal: field.horizontal || undefined,
      vertical: field.vertical || undefined,
      wrap: field.wrap || undefined,
      shrink: field.shrink || undefined,
      font_name: field.font_name?.trim() || undefined,
      font_size: field.font_size ? Number(field.font_size) : undefined,
      row_height: field.row_height ? Number(field.row_height) : undefined,
      table_config: field.table_config ? {
        start_row: Number(field.table_config.start_row || 1),
        end_row: Number(field.table_config.end_row || field.table_config.start_row || 1),
        no_column: field.table_config.no_column?.trim().toUpperCase() || undefined,
        columns: field.table_config.columns
          .filter((column) => column.key.trim() && column.label.trim() && column.column.trim())
          .map((column) => ({
            key: column.key.trim(),
            label: column.label.trim(),
            column: column.column.trim().toUpperCase(),
            required: column.required === true,
            type: column.type || "text",
          })),
      } : undefined,
    }));

const getDefaultSourceLabel = (source: TemplateDefaultSource) => ({
  manual: "Field Manual",
  requester_name: "Nama User",
  requester_nik: "NIK User",
  requester_job_title: "Jabatan User",
  department_name: "Departemen",
  office_name: "Kantor/Cabang",
  project_name: "Proyek",
  entity_name: "PT/Entitas",
  letter_number: "Nomor Surat",
  letter_title: "Perihal",
  request_place: "Tempat",
  request_date: "Tanggal",
  request_place_date: "Tempat, Tanggal",
}[source] ?? source);

const hasPlaceDateMapping = (inputSchema: TemplateInputField[]) => {
  const mappedSources = new Set(
    inputSchema
      .filter((field) => !!field.cell)
      .map((field) => field.defaultSource)
  );
  return mappedSources.has("request_place_date") ||
    (mappedSources.has("request_place") && mappedSources.has("request_date"));
};

const createDefaultTableConfig = (): NonNullable<TemplateInputField["table_config"]> => ({
  start_row: 1,
  end_row: 5,
  no_column: "A",
  columns: [
    { key: "nama_barang", label: "Nama Barang", column: "B", required: true, type: "text" },
  ],
});

const PGD_INPUT_PRESET: TemplateInputField[] = [
  {
    id: "preset-place-date",
    key: "request_place_date",
    label: "Tempat, Tanggal",
    type: "text",
    required: true,
    cell: "",
    sheet: 1,
    defaultSource: "request_place_date",
  },
  {
    id: "preset-items",
    key: "items",
    label: "Daftar Barang/Jasa",
    type: "table",
    required: true,
    cell: "",
    sheet: 1,
    defaultSource: "manual",
    table_config: {
      start_row: 11,
      end_row: 25,
      no_column: "A",
      columns: [
        { key: "kode", label: "Kode", column: "B", required: false, type: "text" },
        { key: "nama_barang", label: "Nama Barang", column: "C", required: true, type: "text" },
        { key: "sat", label: "Sat", column: "J", required: true, type: "text" },
        { key: "jumlah", label: "Jumlah", column: "K", required: true, type: "number" },
        { key: "status", label: "Status", column: "M", required: true, type: "text" },
        { key: "keterangan", label: "Keterangan", column: "N", required: false, type: "text" },
      ],
    },
  },
  {
    id: "preset-catatan",
    key: "catatan",
    label: "Catatan",
    type: "textarea",
    required: false,
    cell: "B28",
    sheet: 1,
    defaultSource: "manual",
    merge_range: "B28:N31",
    vertical: "top",
    horizontal: "left",
    wrap: true,
    shrink: true,
    font_name: "Arial",
    font_size: 11,
    row_height: 15,
  },
];

export default function FormManagementPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    nama_form: "",
    nomor_form: "",
    link_form: "",
    department_id: "",
    input_schema: [] as TemplateInputField[],
  });

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const { data: formsData, error: formsError } = await supabase
        .from("master_forms")
        .select(`
          *,
          master_departments!fk_master_forms_department (id, name, code)
        `)
        .order("created_at", { ascending: false });

      if (formsError) throw formsError;

      const { data: deptsData } = await supabase
        .from("master_departments")
        .select("*")
        .order("name");

      const { data: presetsData, error: presetsError } = await supabase
        .from("master_form_presets")
        .select("*")
        .order("created_at", { ascending: false });

      if (presetsError) throw presetsError;

      setForms(formsData || []);
      setDepartments(deptsData || []);
      setPresets(presetsData || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Koneksi Bermasalah", description: error.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { loadInitialData(); }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileNameRaw = file.name;
    const fileExt = fileNameRaw.split('.').pop()?.toLowerCase();
    
    if (fileExt !== 'xlsx' && fileExt !== 'xls') {
      return toast({ variant: "destructive", title: "Format Salah", description: "Hanya file Excel (.xlsx) yang diizinkan." });
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const baseName = fileNameRaw.replace(/\.[^/.]+$/, ""); 
      const cleanName = baseName
        .replace(/[_-]/g, " ") 
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const storagePath = `${Date.now()}_${fileNameRaw.replace(/\s/g, '_')}`;

      const { error: uploadError } = await supabase.storage
        .from('templates')
        .upload(storagePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;
      
      setUploadProgress(70);

      const { data: { publicUrl } } = supabase.storage
        .from('templates')
        .getPublicUrl(storagePath);

      setFormData(prev => ({ 
        ...prev, 
        link_form: publicUrl,
        nama_form: prev.nama_form || cleanName
      }));

      setUploadProgress(100);
      toast({ title: "Upload Berhasil", description: "Nama form dan link telah diperbarui." });
      
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload Gagal", description: error.message });
      setUploadProgress(0);
    } finally {
      setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 1000);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenModal = (form: any = null) => {
    if (form) {
      setSelectedForm(form);
      setFormData({
        nama_form: form.nama_form,
        nomor_form: form.nomor_form,
        link_form: form.link_form,
        department_id: form.department_id || "",
        input_schema: normalizeInputSchema(form.input_schema),
      });
    } else {
      setSelectedForm(null);
      setFormData({ nama_form: "", nomor_form: "", link_form: "", department_id: "", input_schema: [] });
    }
    setIsModalOpen(true);
  };

  const addInputField = (defaultSource: TemplateDefaultSource = "manual") => {
    const nextIndex = formData.input_schema.length + 1;
    setFormData(prev => ({
      ...prev,
      input_schema: [
        ...prev.input_schema,
        {
          id: createFieldId(),
          key: defaultSource === "manual" ? `field_${nextIndex}` : defaultSource,
          label: defaultSource === "manual" ? `Field ${nextIndex}` : getDefaultSourceLabel(defaultSource),
          type: defaultSource === "request_date" ? "date" : "text",
          required: defaultSource === "manual",
          cell: "",
          sheet: 1,
          defaultSource,
        },
      ],
    }));
  };

  const updateInputField = <K extends keyof TemplateInputField>(id: string, key: K, value: TemplateInputField[K]) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => field.id === id ? { ...field, [key]: value } : field),
    }));
  };

  const updateInputFieldType = (id: string, type: TemplateInputType) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => field.id === id ? {
        ...field,
        type,
        table_config: type === "table" ? field.table_config || createDefaultTableConfig() : field.table_config,
      } : field),
    }));
  };

  const updateTableConfig = (
    fieldId: string,
    patch: Partial<NonNullable<TemplateInputField["table_config"]>>
  ) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => field.id === fieldId ? {
        ...field,
        table_config: {
          ...(field.table_config || createDefaultTableConfig()),
          ...patch,
        },
      } : field),
    }));
  };

  const updateTableColumn = (
    fieldId: string,
    columnIndex: number,
    patch: Partial<NonNullable<TemplateInputField["table_config"]>["columns"][number]>
  ) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => {
        if (field.id !== fieldId) return field;
        const config = field.table_config || createDefaultTableConfig();
        return {
          ...field,
          table_config: {
            ...config,
            columns: config.columns.map((column, index) => index === columnIndex ? { ...column, ...patch } : column),
          },
        };
      }),
    }));
  };

  const addTableColumn = (fieldId: string) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => {
        if (field.id !== fieldId) return field;
        const config = field.table_config || createDefaultTableConfig();
        const nextIndex = config.columns.length + 1;
        return {
          ...field,
          table_config: {
            ...config,
            columns: [
              ...config.columns,
              { key: `kolom_${nextIndex}`, label: `Kolom ${nextIndex}`, column: "", required: false, type: "text" },
            ],
          },
        };
      }),
    }));
  };

  const removeTableColumn = (fieldId: string, columnIndex: number) => {
    setFormData(prev => ({
      ...prev,
      input_schema: prev.input_schema.map(field => {
        if (field.id !== fieldId) return field;
        const config = field.table_config || createDefaultTableConfig();
        return {
          ...field,
          table_config: {
            ...config,
            columns: config.columns.filter((_column, index) => index !== columnIndex),
          },
        };
      }),
    }));
  };

  const removeInputField = (id: string) => {
    setFormData(prev => ({ ...prev, input_schema: prev.input_schema.filter(field => field.id !== id) }));
  };

  const cloneInputSchema = (fields: TemplateInputField[]) =>
    fields.map((field) => ({
      ...field,
      id: createFieldId(),
      table_config: field.table_config ? {
        ...field.table_config,
        columns: field.table_config.columns.map((column) => ({ ...column })),
      } : undefined,
    }));

  const applyInputSchemaPreset = (fields: TemplateInputField[], label: string) => {
    setFormData(prev => ({
      ...prev,
      input_schema: cloneInputSchema(fields),
    }));
    toast({ title: "Preset diterapkan", description: `${label} sudah masuk ke konfigurasi input.` });
  };

  const applyPgdPreset = () => {
    applyInputSchemaPreset(PGD_INPUT_PRESET, "Quick Preset PGD");
  };

  const handleSavePreset = async () => {
    const schema = serializeInputSchema(formData.input_schema);
    if (schema.length === 0) {
      return toast({ variant: "destructive", title: "Preset Kosong", description: "Tambahkan minimal satu field sebelum menyimpan preset." });
    }

    const name = prompt("Nama quick preset");
    if (!name?.trim()) return;
    const description = prompt("Catatan preset (opsional)") || "";

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("master_form_presets")
        .insert([{
          name: name.trim(),
          description: description.trim() || null,
          input_schema: schema,
          created_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        }]);

      if (error) throw error;
      toast({ title: "Preset Disimpan", description: "Quick preset sekarang bisa dipakai ulang di template lain." });
      loadInitialData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Menyimpan Preset", description: error.message });
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm("Hapus quick preset ini?")) return;
    try {
      const { error } = await supabase.from("master_form_presets").delete().eq("id", id);
      if (error) throw error;
      setPresets(prev => prev.filter(preset => preset.id !== id));
      toast({ title: "Preset Dihapus", description: "Quick preset berhasil dihapus." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Menghapus Preset", description: error.message });
    }
  };

  const handleSave = async () => {
    if (!formData.department_id || !formData.nama_form) {
      return toast({ variant: "destructive", title: "Data Tidak Lengkap", description: "Departemen dan Nama Form wajib diisi." });
    }

    try {
      setLoading(true);
      const payload = {
        nama_form: formData.nama_form,
        nomor_form: formData.nomor_form,
        link_form: formData.link_form,
        department_id: formData.department_id,
        input_schema: serializeInputSchema(formData.input_schema),
      };

      const { error } = selectedForm 
        ? await supabase.from("master_forms").update(payload).eq("id", selectedForm.id)
        : await supabase.from("master_forms").insert([payload]);

      if (error) throw error;
      toast({ title: "Berhasil", description: "Data template telah disimpan." });
      setIsModalOpen(false);
      loadInitialData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.message });
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus template ini secara permanen?")) return;
    try {
      setLoading(true);
      const { error } = await supabase.from("master_forms").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Dihapus", description: "Template berhasil dihapus." });
      loadInitialData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Gagal Menghapus", description: error.message });
    } finally { setLoading(false); }
  };

  const filteredForms = forms.filter(f => 
    f.nama_form?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.master_departments?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.nomor_form?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-700">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary rounded-2xl shadow-glow">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-gradient uppercase">Master Template</h1>
          </div>
          <p className="text-muted-foreground font-medium mt-2 ml-1">Pusat kendali template dokumen per departemen</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Cari nama form, dept, atau kode..." 
              className="pl-10 h-12 bg-card/40 border-border/50 rounded-2xl" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button onClick={() => handleOpenModal()} className="h-12 px-6 gap-2 font-black text-xs uppercase rounded-2xl glow-effect">
            <Plus className="w-4 h-4" /> Tambah Form
          </Button>
        </div>
      </div>

      {/* TABLE */}
      <div className="glass-card rounded-[2rem] overflow-hidden border-border/20 shadow-2xl bg-card/30 backdrop-blur-xl">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-[220px] py-6 px-8 font-black text-[10px] tracking-widest uppercase">Departemen</TableHead>
              <TableHead className="font-black text-[10px] tracking-widest uppercase">Detail Dokumen</TableHead>
              <TableHead className="text-right px-8 font-black text-[10px] tracking-widest uppercase">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && forms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-32">
                  <Loader2 className="animate-spin mx-auto w-12 h-12 text-primary opacity-20"/>
                </TableCell>
              </TableRow>
            ) : filteredForms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-24 text-muted-foreground text-sm">
                  Tidak ada template ditemukan.
                </TableCell>
              </TableRow>
            ) : filteredForms.map((form) => (
              <TableRow key={form.id} className="border-border/20 hover:bg-primary/[0.03] transition-all group">
                <TableCell className="px-8">
                  <div className="flex flex-col gap-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-black w-fit uppercase">
                      {form.master_departments?.code || "N/A"}
                    </span>
                    <span className="text-sm font-bold text-foreground/80">
                      {form.master_departments?.name || "Tanpa Departemen"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-sm truncate max-w-[320px]">{form.nama_form}</span>
                      <span className={cn(
                        "mt-1 w-fit rounded-md px-2 py-0.5 text-[9px] font-black uppercase",
                        hasPlaceDateMapping(normalizeInputSchema(form.input_schema))
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500"
                      )}>
                        {hasPlaceDateMapping(normalizeInputSchema(form.input_schema)) ? "Tempat/Tanggal dimapping" : "Tempat/Tanggal belum dimapping"}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground uppercase">{form.nomor_form || '—'}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right px-8">
                  <div className="flex justify-end gap-2">
                    {form.link_form && (
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-blue-500/10 group/btn" asChild title="Buka Template">
                        <a href={form.link_form} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-4 h-4 text-blue-500 group-hover/btn:scale-110 transition-transform" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-amber-500/10" onClick={() => handleOpenModal(form)}>
                      <Pencil className="w-4 h-4 text-amber-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-destructive/10" onClick={() => handleDelete(form.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* MODAL */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto glass-card border-border/30 shadow-elevated rounded-[2.5rem] p-8 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black tracking-tighter uppercase italic">
              {selectedForm ? "Konfigurasi Template" : "Registrasi Template Baru"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-6 py-6">
            {/* Upload */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Upload File Template (.xlsx)</Label>
              <div 
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed border-border/50 rounded-[2rem] p-8 transition-all flex flex-col items-center justify-center gap-3 overflow-hidden",
                  formData.link_form ? "border-emerald-500/30 bg-emerald-500/[0.02]" : "hover:border-primary/50 hover:bg-primary/[0.02]",
                  isUploading && "cursor-not-allowed opacity-80"
                )}
              >
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls" disabled={isUploading} />
                
                {isUploading && (
                  <div className="absolute bottom-0 left-0 h-1 bg-primary/20 w-full">
                    <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}

                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <span className="text-[10px] font-bold text-primary">{uploadProgress}%</span>
                  </div>
                ) : formData.link_form ? (
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 animate-in zoom-in" />
                ) : (
                  <Upload className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors" />
                )}

                <div className="text-center">
                  <p className="text-sm font-black uppercase italic tracking-tighter">
                    {isUploading ? "Mengunggah..." : formData.link_form ? "File Siap Digunakan" : "Klik untuk Pilih File Excel"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                    {formData.link_form ? "Nama form telah terisi otomatis" : "Link & Nama akan terisi otomatis"}
                  </p>
                </div>
              </div>
            </div>

            {/* Departemen */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 text-emerald-500">Departemen</Label>
              <Select value={formData.department_id} onValueChange={(v) => setFormData({...formData, department_id: v})}>
                <SelectTrigger className="bg-background/40 border-border/50 rounded-2xl h-12 focus:ring-emerald-500/50">
                  <SelectValue placeholder="Pilih Departemen" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border/50 shadow-2xl">
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="rounded-lg">{d.code} - {d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nama Form */}
            <div className="space-y-3">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nama Form Resmi</Label>
              <Input 
                value={formData.nama_form} 
                onChange={(e) => setFormData({...formData, nama_form: e.target.value})} 
                placeholder="Misal: Form Pengajuan Dana (PGD)"
                className="bg-background/40 border-border/50 rounded-2xl h-12 font-bold focus:ring-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Kode Form</Label>
                <Input 
                  value={formData.nomor_form} 
                  onChange={(e) => setFormData({...formData, nomor_form: e.target.value})} 
                  placeholder="MBN-FIN-01"
                  className="bg-background/40 border-border/50 rounded-2xl h-12 font-mono text-[11px]"
                />
              </div>
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 opacity-50 italic">URL Link (Read-Only)</Label>
                <Input 
                  value={formData.link_form} 
                  readOnly
                  placeholder="Auto-filled via Upload"
                  className="bg-muted/30 border-border/30 rounded-2xl h-12 text-[10px] text-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-border/50 bg-muted/20 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <Label className="text-[10px] font-black uppercase tracking-widest text-primary">Input Sistem</Label>
                  <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                    Field ini akan diisi user di aplikasi lalu ditempelkan ke cell Excel template.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={handleSavePreset}>
                    <Save className="mr-1 h-3 w-3" /> Simpan Jadi Preset
                  </Button>
                  <Button type="button" variant="default" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={applyPgdPreset}>
                    Quick Preset PGD
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={() => addInputField("manual")}>
                    <Plus className="mr-1 h-3 w-3" /> Field Manual
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={() => addInputField("requester_nik")}>
                    + NIK
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={() => addInputField("request_place_date")}>
                    + Tempat, Tanggal
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={() => addInputField("request_place")}>
                    + Tempat
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="rounded-xl text-[10px] font-black uppercase" onClick={() => addInputField("request_date")}>
                    + Tanggal
                  </Button>
                </div>
              </div>

              {presets.length > 0 && (
                <div className="rounded-2xl border border-border/40 bg-background/40 p-3">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Preset Tersimpan</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => (
                      <div key={preset.id} className="flex items-center overflow-hidden rounded-xl border border-border/50 bg-card">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-none px-3 text-[10px] font-black uppercase"
                          onClick={() => applyInputSchemaPreset(normalizeInputSchema(preset.input_schema), preset.name)}
                          title={preset.description || preset.name}
                        >
                          {preset.name}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-none text-destructive"
                          onClick={() => handleDeletePreset(preset.id)}
                          title="Hapus preset"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formData.input_schema.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Belum ada field input. Tambahkan field untuk mengaktifkan pengisian by sistem.
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.input_schema.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-3 rounded-2xl border border-border/50 bg-background/50 p-4">
                      <div className="col-span-12 flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Field {index + 1}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeInputField(field.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="col-span-12 md:col-span-3 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Label</Label>
                        <Input className="h-9 text-xs" value={field.label} onChange={(e) => updateInputField(field.id, "label", e.target.value)} />
                      </div>
                      <div className="col-span-6 md:col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Key</Label>
                        <Input className="h-9 font-mono text-xs" value={field.key} onChange={(e) => updateInputField(field.id, "key", e.target.value.replace(/\s+/g, "_").toLowerCase())} />
                      </div>
                      <div className="col-span-6 md:col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Tipe</Label>
                        <Select value={field.type} onValueChange={(v) => updateInputFieldType(field.id, v as TemplateInputType)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="textarea">Textarea</SelectItem>
                            <SelectItem value="date">Tanggal</SelectItem>
                            <SelectItem value="number">Angka</SelectItem>
                            <SelectItem value="currency">Rupiah</SelectItem>
                            <SelectItem value="table">Tabel</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-6 md:col-span-2 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Sumber</Label>
                        <Select value={field.defaultSource} onValueChange={(v) => updateInputField(field.id, "defaultSource", v as TemplateDefaultSource)}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual User</SelectItem>
                            <SelectItem value="requester_name">Nama User</SelectItem>
                            <SelectItem value="requester_nik">NIK User</SelectItem>
                            <SelectItem value="requester_job_title">Jabatan User</SelectItem>
                            <SelectItem value="department_name">Departemen</SelectItem>
                            <SelectItem value="office_name">Kantor/Cabang</SelectItem>
                            <SelectItem value="project_name">Proyek</SelectItem>
                            <SelectItem value="entity_name">PT/Entitas</SelectItem>
                            <SelectItem value="letter_number">Nomor Surat</SelectItem>
                            <SelectItem value="letter_title">Perihal</SelectItem>
                            <SelectItem value="request_place_date">Tempat, Tanggal</SelectItem>
                            <SelectItem value="request_place">Tempat</SelectItem>
                            <SelectItem value="request_date">Tanggal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3 md:col-span-1 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Cell</Label>
                        <Input className="h-9 font-mono text-xs uppercase" placeholder="D10" value={field.cell} onChange={(e) => updateInputField(field.id, "cell", e.target.value.toUpperCase())} />
                      </div>
                      <div className="col-span-3 md:col-span-1 space-y-1">
                        <Label className="text-[9px] font-black uppercase text-muted-foreground">Sheet</Label>
                        <Input className="h-9 text-xs" type="number" min={1} value={field.sheet} onChange={(e) => updateInputField(field.id, "sheet", Number(e.target.value || 1))} />
                      </div>
                      <label className="col-span-12 flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                        <input type="checkbox" checked={field.required} onChange={(e) => updateInputField(field.id, "required", e.target.checked)} />
                        Wajib diisi
                      </label>
                      {field.type !== "table" && (
                        <div className="col-span-12 grid grid-cols-12 gap-3 rounded-xl border border-border/40 bg-muted/20 p-3">
                          <div className="col-span-6 md:col-span-2 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Merge Range</Label>
                            <Input
                              className="h-9 font-mono text-xs uppercase"
                              placeholder="B28:N31"
                              value={field.merge_range || ""}
                              onChange={(e) => updateInputField(field.id, "merge_range", e.target.value.toUpperCase())}
                            />
                          </div>
                          <div className="col-span-6 md:col-span-2 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Horizontal</Label>
                            <Select value={field.horizontal || "left"} onValueChange={(v) => updateInputField(field.id, "horizontal", v as TemplateHorizontalAlign)}>
                              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="left">Kiri</SelectItem>
                                <SelectItem value="center">Tengah</SelectItem>
                                <SelectItem value="right">Kanan</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-6 md:col-span-2 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Vertical</Label>
                            <Select value={field.vertical || "top"} onValueChange={(v) => updateInputField(field.id, "vertical", v as TemplateVerticalAlign)}>
                              <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="top">Atas</SelectItem>
                                <SelectItem value="middle">Tengah</SelectItem>
                                <SelectItem value="bottom">Bawah</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-6 md:col-span-2 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Font</Label>
                            <Input
                              className="h-9 text-xs"
                              placeholder="Arial"
                              value={field.font_name || ""}
                              onChange={(e) => updateInputField(field.id, "font_name", e.target.value)}
                            />
                          </div>
                          <div className="col-span-3 md:col-span-1 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Pt</Label>
                            <Input
                              className="h-9 text-xs"
                              type="number"
                              min={1}
                              value={field.font_size || ""}
                              onChange={(e) => updateInputField(field.id, "font_size", e.target.value ? Number(e.target.value) : undefined)}
                            />
                          </div>
                          <div className="col-span-3 md:col-span-1 space-y-1">
                            <Label className="text-[9px] font-black uppercase text-muted-foreground">Row</Label>
                            <Input
                              className="h-9 text-xs"
                              type="number"
                              min={1}
                              value={field.row_height || ""}
                              onChange={(e) => updateInputField(field.id, "row_height", e.target.value ? Number(e.target.value) : undefined)}
                            />
                          </div>
                          <label className="col-span-4 md:col-span-1 flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                            <input type="checkbox" checked={field.horizontal === "center"} onChange={(e) => updateInputField(field.id, "horizontal", e.target.checked ? "center" : "left")} />
                            Center
                          </label>
                          <label className="col-span-4 md:col-span-1 flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                            <input type="checkbox" checked={field.wrap === true} onChange={(e) => updateInputField(field.id, "wrap", e.target.checked)} />
                            Wrap
                          </label>
                          <label className="col-span-4 md:col-span-1 flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                            <input type="checkbox" checked={field.shrink === true} onChange={(e) => updateInputField(field.id, "shrink", e.target.checked)} />
                            Shrink
                          </label>
                        </div>
                      )}
                      {field.type === "table" && field.table_config && (
                        <div className="col-span-12 space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-[10px] font-black uppercase text-primary">Konfigurasi Tabel</p>
                              <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                                Setiap baris user akan ditulis ke row Excel dari start sampai end.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-xl text-[10px] font-black uppercase"
                              onClick={() => addTableColumn(field.id)}
                            >
                              <Plus className="mr-1 h-3 w-3" /> Kolom
                            </Button>
                          </div>

                          <div className="grid grid-cols-12 gap-3">
                            <div className="col-span-4 md:col-span-2 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-muted-foreground">Start Row</Label>
                              <Input
                                className="h-9 text-xs"
                                type="number"
                                min={1}
                                value={field.table_config.start_row}
                                onChange={(e) => updateTableConfig(field.id, { start_row: Number(e.target.value || 1) })}
                              />
                            </div>
                            <div className="col-span-4 md:col-span-2 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-muted-foreground">End Row</Label>
                              <Input
                                className="h-9 text-xs"
                                type="number"
                                min={1}
                                value={field.table_config.end_row}
                                onChange={(e) => updateTableConfig(field.id, { end_row: Number(e.target.value || 1) })}
                              />
                            </div>
                            <div className="col-span-4 md:col-span-2 space-y-1">
                              <Label className="text-[9px] font-black uppercase text-muted-foreground">Kolom No</Label>
                              <Input
                                className="h-9 font-mono text-xs uppercase"
                                placeholder="A"
                                value={field.table_config.no_column || ""}
                                onChange={(e) => updateTableConfig(field.id, { no_column: e.target.value.toUpperCase() })}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            {field.table_config.columns.map((column, columnIndex) => (
                              <div key={`${field.id}-${columnIndex}`} className="grid grid-cols-12 gap-2 rounded-xl border border-border/40 bg-background/60 p-3">
                                <div className="col-span-12 flex items-center justify-between">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Kolom {columnIndex + 1}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => removeTableColumn(field.id, columnIndex)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="col-span-12 md:col-span-3 space-y-1">
                                  <Label className="text-[9px] font-black uppercase text-muted-foreground">Label</Label>
                                  <Input
                                    className="h-9 text-xs"
                                    value={column.label}
                                    onChange={(e) => updateTableColumn(field.id, columnIndex, { label: e.target.value })}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2 space-y-1">
                                  <Label className="text-[9px] font-black uppercase text-muted-foreground">Key</Label>
                                  <Input
                                    className="h-9 font-mono text-xs"
                                    value={column.key}
                                    onChange={(e) => updateTableColumn(field.id, columnIndex, { key: e.target.value.replace(/\s+/g, "_").toLowerCase() })}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-1 space-y-1">
                                  <Label className="text-[9px] font-black uppercase text-muted-foreground">Cell</Label>
                                  <Input
                                    className="h-9 font-mono text-xs uppercase"
                                    placeholder="C"
                                    value={column.column}
                                    onChange={(e) => updateTableColumn(field.id, columnIndex, { column: e.target.value.toUpperCase() })}
                                  />
                                </div>
                                <div className="col-span-6 md:col-span-2 space-y-1">
                                  <Label className="text-[9px] font-black uppercase text-muted-foreground">Tipe</Label>
                                  <Select value={column.type || "text"} onValueChange={(v) => updateTableColumn(field.id, columnIndex, { type: v as "text" | "number" })}>
                                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Text</SelectItem>
                                      <SelectItem value="number">Angka</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <label className="col-span-6 md:col-span-2 flex items-center gap-2 text-[10px] font-bold uppercase text-muted-foreground">
                                  <input
                                    type="checkbox"
                                    checked={column.required === true}
                                    onChange={(e) => updateTableColumn(field.id, columnIndex, { required: e.target.checked })}
                                  />
                                  Wajib
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-3 pt-4 border-t border-border/20">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-2xl h-12 px-8 font-black text-xs uppercase">Batal</Button>
            <Button 
              onClick={handleSave} 
              disabled={loading || isUploading} 
              className="rounded-2xl h-12 px-10 font-black bg-primary text-primary-foreground hover:glow-effect transition-all flex-1 uppercase text-xs"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Simpan Konfigurasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
