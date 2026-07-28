import React, { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/lib/supabase";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, Pencil, Loader2, Settings2, X, Database, 
  Trash2, ChevronRight, Layers, Building2, Globe, Search, GripVertical
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";
import { useAppDialog } from "@/components/app/AppDialogProvider";

interface TTDConfig {
  roleName: string; 
  labelJabatan: string; 
  ttd: string;          
  nama: string;         
  jabatan: string;      
  sheet: number;
  requires_unit_allocation?: boolean;
}

type RoleName = "membuat" | "memeriksa" | "menyetujui";
type RequestCategory = "asset" | "unit" | "non_unit";
type MatrixConfigItem = TTDConfig & { id: string };

interface QuickPresetCell {
  ttd: string;
  nama: string;
  jabatan: string;
  sheet: number;
}

interface QuickPreset {
  label: string;
  description: string;
  cells: QuickPresetCell[];
}

const ROLE_SEQUENCE: RoleName[] = ["membuat", "memeriksa", "menyetujui"];

const ROLE_LABELS: Record<RoleName, string> = {
  membuat: "Membuat",
  memeriksa: "Memeriksa",
  menyetujui: "Menyetujui",
};

const REQUEST_CATEGORY_OPTIONS: Array<{ value: RequestCategory; label: string; description: string }> = [
  { value: "asset", label: "Aset", description: "Dokumen aset dan inventaris" },
  { value: "unit", label: "Unit", description: "Permohonan/order bangun unit" },
  { value: "non_unit", label: "Non Unit", description: "Dokumen umum selain unit" },
];

const normalizeRequestCategories = (value: unknown): RequestCategory[] => {
  const values = Array.isArray(value) ? value : [];
  const normalized = values.filter((item): item is RequestCategory =>
    item === "asset" || item === "unit" || item === "non_unit"
  );
  return normalized.length > 0 ? normalized : ["asset", "non_unit"];
};

const sanitizeRoleName = (value: any): RoleName => {
  const v = String(value ?? "").toLowerCase().trim();
  if (v === "membuat" || v === "memeriksa" || v === "menyetujui") return v as RoleName;
  if (v.includes("setuju") || v.includes("approve") || v.includes("approval") || v.includes("otoris") || v.includes("final")) return "menyetujui";
  if (v.includes("periksa") || v.includes("review") || v.includes("verifikasi") || v.includes("cek") || v.includes("paraf")) return "memeriksa";
  if (v.includes("buat") || v.includes("draft") || v.includes("pemohon") || v.includes("request")) return "membuat";
  return "membuat";
};

const createConfigId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeTTDConfig = (ttdConfig: any): MatrixConfigItem[] => {
  if (Array.isArray(ttdConfig)) {
    return ttdConfig.map((item: any, index: number) => ({
      id: item.id || createConfigId(),
      roleName: sanitizeRoleName(item.roleName || item.role_name),
      labelJabatan: item.labelJabatan || item.jabatan || item.roleName || `Kotak ${index + 1}`,
      ttd: item.ttd || "",
      nama: item.nama || "",
      jabatan: item.jabatan || "",
      sheet: Number(item.sheet || 1),
      requires_unit_allocation: item.requires_unit_allocation === true || item.requiresUnitAllocation === true,
    }));
  }
  if (typeof ttdConfig === "string") {
    try {
      const parsed = JSON.parse(ttdConfig || "[]");
      return Array.isArray(parsed) ? normalizeTTDConfig(parsed) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getLevelCount = (item: any) => normalizeTTDConfig(item.ttd_config).length;

const mergeTTDConfigOrder = (items: MatrixConfigItem[]) =>
  ROLE_SEQUENCE.flatMap(role => items.filter(item => item.roleName === role));

const serializeTTDConfig = (items: MatrixConfigItem[]) =>
  mergeTTDConfigOrder(items).map(({ id, ...rest }) => rest);

const SortableMatrixCard = ({
  item,
  onChange,
  onRemove,
}: {
  item: MatrixConfigItem;
  onChange: <K extends keyof Pick<MatrixConfigItem, "ttd" | "nama" | "jabatan" | "sheet" | "requires_unit_allocation">>(
    id: string,
    field: K,
    value: MatrixConfigItem[K]
  ) => void;
  onRemove: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "elevated-card rounded-lg p-5 grid grid-cols-12 gap-4 items-end relative group border border-border/50",
        isDragging && "opacity-60 ring-2 ring-primary/40"
      )}
    >
      <div className="col-span-1 flex items-center justify-center">
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="h-8 w-8 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${item.labelJabatan}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <div className="col-span-2">
        <p className="text-[9px] font-extrabold text-primary uppercase tracking-tighter mb-1">{item.roleName}</p>
        <p className="text-xs font-bold truncate text-foreground">{item.labelJabatan}</p>
      </div>
      <div className="col-span-2">
        <Label className="text-[8px] font-bold uppercase text-muted-foreground">TTD Cell</Label>
        <Input
          className="h-8 text-[10px] font-mono mt-1 uppercase"
          placeholder="e.g. C20"
          value={item.ttd}
          onChange={(e) => onChange(item.id, "ttd", e.target.value)}
        />
      </div>
      <div className="col-span-2">
        <Label className="text-[8px] font-bold uppercase text-muted-foreground">Name Cell</Label>
        <Input
          className="h-8 text-[10px] font-mono mt-1 uppercase"
          placeholder="e.g. C25"
          value={item.nama}
          onChange={(e) => onChange(item.id, "nama", e.target.value)}
        />
      </div>
      <div className="col-span-2">
        <Label className="text-[8px] font-bold uppercase text-muted-foreground">Job Cell</Label>
        <Input
          className="h-8 text-[10px] font-mono mt-1 uppercase"
          placeholder="e.g. C26"
          value={item.jabatan}
          onChange={(e) => onChange(item.id, "jabatan", e.target.value)}
        />
      </div>
      <div className="col-span-2">
        <Label className="text-[8px] font-bold uppercase text-muted-foreground">Sheet Index</Label>
        <Input
          type="number"
          className="h-8 text-[10px] mt-1"
          value={item.sheet}
          onChange={(e) => onChange(item.id, "sheet", Number.parseInt(e.target.value) || 1)}
        />
      </div>
      <label className="col-span-11 col-start-2 flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-[10px] font-bold uppercase text-muted-foreground">
        <input
          type="checkbox"
          checked={item.requires_unit_allocation === true}
          onChange={(e) => onChange(item.id, "requires_unit_allocation", e.target.checked)}
        />
        Wajib alokasi unit sebelum setuju
      </label>
      <div className="col-span-1 text-right">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
          onClick={() => onRemove(item.id)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "3 Kotak",
    description: "H35, K35, N35",
    cells: [
      { ttd: "H35", nama: "H38", jabatan: "H39", sheet: 1 },
      { ttd: "K35", nama: "K38", jabatan: "K39", sheet: 1 },
      { ttd: "N35", nama: "N38", jabatan: "N39", sheet: 1 },
    ],
  },
  {
    label: "4 Kotak",
    description: "G35 sampai N35",
    cells: [
      { ttd: "G35", nama: "G38", jabatan: "G39", sheet: 1 },
      { ttd: "H35", nama: "H38", jabatan: "H39", sheet: 1 },
      { ttd: "K35", nama: "K38", jabatan: "K39", sheet: 1 },
      { ttd: "N35", nama: "N38", jabatan: "N39", sheet: 1 },
    ],
  },
  {
    label: "5 Kotak",
    description: "E35, G35, H35, K35, N35",
    cells: [
      { ttd: "E35", nama: "E38", jabatan: "E39", sheet: 1 },
      { ttd: "G35", nama: "G38", jabatan: "G39", sheet: 1 },
      { ttd: "H35", nama: "H38", jabatan: "H39", sheet: 1 },
      { ttd: "K35", nama: "K38", jabatan: "K39", sheet: 1 },
      { ttd: "N35", nama: "N38", jabatan: "N39", sheet: 1 },
    ],
  },
  {
    label: "6 Kotak",
    description: "Tambah baris bawah",
    cells: [
      { ttd: "G35", nama: "G38", jabatan: "G39", sheet: 1 },
      { ttd: "H35", nama: "H38", jabatan: "H39", sheet: 1 },
      { ttd: "K35", nama: "K38", jabatan: "K39", sheet: 1 },
      { ttd: "N35", nama: "N38", jabatan: "N39", sheet: 1 },
      { ttd: "K41", nama: "K44", jabatan: "K45", sheet: 1 },
      { ttd: "N41", nama: "N44", jabatan: "N45", sheet: 1 },
    ],
  },
];

export default function WorkflowDetailManagementPage({
  embedded = false,
  documentationOnly = true,
}: {
  embedded?: boolean;
  documentationOnly?: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const appDialog = useAppDialog();
  const [details, setDetails] = useState<any[]>([]);
  const [masterForms, setMasterForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pusat' | 'cabang'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");

  const [formData, setFormData] = useState({
    membuat: "",
    memeriksa: "",
    menyetujui: "",
    form_id: "",
    is_cabang: false,
    request_categories: ["asset", "non_unit"] as RequestCategory[],
    ttd_config: [] as MatrixConfigItem[]
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: formsData } = await supabase.from("master_forms").select("id, nama_form");
      setMasterForms(formsData || []);

      const { data: workflowData, error } = await supabase
        .from("master_penggunaan_detail")
        .select(`*, master_forms!fk_master_forms (nama_form)`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDetails(workflowData || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const normalizeSearchText = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b[mca]\s*:\s*/g, " ")
      .replace(/[,/|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const buildSearchTokens = (value: string) =>
    normalizeSearchText(value)
      .split(" ")
      .map(token => token.trim())
      .filter(token => token.length > 0);

  const filteredDetails = useMemo(() => {
    const queryTokens = buildSearchTokens(searchQuery);

    return details.filter(item => {
      if (activeFilter === 'cabang' && item.is_cabang !== true) return false;
      if (activeFilter === 'pusat' && !(item.is_cabang === false || item.is_cabang === null)) return false;

      const levelCount = getLevelCount(item);
      if (levelFilter !== "all" && String(levelCount) !== levelFilter) return false;

      if (queryTokens.length === 0) return true;

      const workflowText = [
        item.membuat,
        item.memeriksa,
        item.menyetujui,
      ]
        .filter(Boolean)
        .join(", ");

      const configText = normalizeTTDConfig(item.ttd_config)
        .flatMap((t: any) => [t.roleName, t.labelJabatan, t.nama, t.jabatan, t.ttd])
        .filter(Boolean)
        .join(" ");

      const haystack = normalizeSearchText([
        workflowText,
        item.master_forms?.nama_form,
        item.is_cabang ? "cabang" : "pusat",
        ...normalizeRequestCategories(item.request_categories),
        `level ${levelCount}`,
        configText
      ]
        .filter(Boolean)
        .join(" "));

      return queryTokens.every(token => haystack.includes(token));
    });
  }, [activeFilter, details, levelFilter, searchQuery]);

  const availableLevels = useMemo(() => {
    const levels = new Set<number>();
    details.forEach(item => {
      const level = getLevelCount(item);
      if (level > 0) levels.add(level);
    });
    return Array.from(levels).sort((a, b) => a - b);
  }, [details]);

  const cleanCommaInput = (val: string) => val.split(',').map(s => s.trim()).filter(s => s !== "").join(', ');

  const toggleRequestCategory = (category: RequestCategory) => {
    setFormData(prev => {
      const exists = prev.request_categories.includes(category);
      if (exists && prev.request_categories.length === 1) {
        toast({
          variant: "destructive",
          title: "Kategori wajib tersedia",
          description: "Matrix harus mendukung minimal satu kategori registrasi.",
        });
        return prev;
      }
      return {
        ...prev,
        request_categories: exists
          ? prev.request_categories.filter(item => item !== category)
          : [...prev.request_categories, category],
      };
    });
  };

  const getConfigsForRole = (roleName: RoleName) =>
    formData.ttd_config.filter(item => item.roleName === roleName);

  const splitLabels = (value: string) =>
    value.split(",").map(label => label.trim()).filter(Boolean);

  const collectRoleLabels = () => ([
    { roleName: "membuat", labels: splitLabels(formData.membuat) },
    { roleName: "memeriksa", labels: splitLabels(formData.memeriksa) },
    { roleName: "menyetujui", labels: splitLabels(formData.menyetujui) },
  ] as const).flatMap(group =>
    group.labels.map(label => ({
      roleName: group.roleName,
      labelJabatan: label,
    }))
  );

  const getRoleNameByIndex = (index: number) => {
    const roleGroups = [
      { roleName: "membuat", count: splitLabels(formData.membuat).length },
      { roleName: "memeriksa", count: splitLabels(formData.memeriksa).length },
      { roleName: "menyetujui", count: splitLabels(formData.menyetujui).length },
    ];

    let cursor = 0;
    for (const group of roleGroups) {
      cursor += group.count;
      if (index < cursor) return group.roleName;
    }
    return "menyetujui";
  };

  const updateConfigField = <K extends keyof Pick<MatrixConfigItem, "ttd" | "nama" | "jabatan" | "sheet" | "requires_unit_allocation">>(
    id: string,
    field: K,
    value: MatrixConfigItem[K]
  ) => {
    setFormData(prev => ({
      ...prev,
      ttd_config: mergeTTDConfigOrder(
        prev.ttd_config.map(item => (item.id === id ? { ...item, [field]: value } : item))
      ),
    }));
  };

  const handleDeleteConfig = (id: string) => {
    setFormData(prev => ({
      ...prev,
      ttd_config: mergeTTDConfigOrder(prev.ttd_config.filter(item => item.id !== id)),
    }));
  };

  const handleDragEnd = (roleName: RoleName, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setFormData(prev => {
      const roleItems = prev.ttd_config.filter(item => item.roleName === roleName);
      const oldIndex = roleItems.findIndex(item => item.id === active.id);
      const newIndex = roleItems.findIndex(item => item.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;

      const reorderedRoleItems = arrayMove(roleItems, oldIndex, newIndex);
      const nextItems = [
        ...prev.ttd_config.filter(item => item.roleName !== roleName),
        ...reorderedRoleItems,
      ];

      return {
        ...prev,
        ttd_config: mergeTTDConfigOrder(nextItems),
      };
    });
  };

  const applyQuickPreset = (preset: QuickPreset) => {
    const labels = collectRoleLabels();
    const nextConfigs = preset.cells.map((cell, index) => {
      const label = labels[index];
      return {
        id: createConfigId(),
        roleName: label?.roleName || getRoleNameByIndex(index),
        labelJabatan: label?.labelJabatan || `Kotak ${index + 1}`,
        ttd: cell.ttd,
        nama: cell.nama,
        jabatan: cell.jabatan,
        sheet: cell.sheet,
      };
    }) as MatrixConfigItem[];

    setFormData(prev => ({ ...prev, ttd_config: mergeTTDConfigOrder(nextConfigs) }));
  };

  const handleOpenModal = (item: any = null) => {
    if (item) {
      setSelectedItem(item);
      setFormData({ 
        membuat: item.membuat || "",
        memeriksa: item.memeriksa || "",
        menyetujui: item.menyetujui || "",
        form_id: item.form_id || "",
        is_cabang: item.is_cabang || false,
        request_categories: normalizeRequestCategories(item.request_categories),
        ttd_config: normalizeTTDConfig(item.ttd_config)
      });
    } else {
      setSelectedItem(null);
      setFormData({
        membuat: "", memeriksa: "", menyetujui: "",
        form_id: masterForms[0]?.id || "",
        is_cabang: false,
        request_categories: ["asset", "non_unit"],
        ttd_config: []
      });
    }
    setIsModalOpen(true);
  };

  const syncTTDMapping = (roleKey: string, labelInput: string) => {
    const labels = splitLabels(labelInput);
    if (labels.length === 0) return;

    setFormData(prev => {
      const roleItems = prev.ttd_config.filter(item => item.roleName === roleKey);
      const otherItems = prev.ttd_config.filter(item => item.roleName !== roleKey);

      const nextRoleItems: MatrixConfigItem[] = labels.map((label, index) => {
        const existing = roleItems[index];
        if (existing) {
          return {
            ...existing,
            labelJabatan: label,
          };
        }

        return {
          id: createConfigId(),
          roleName: roleKey,
          labelJabatan: label,
          ttd: "",
          nama: "",
          jabatan: "",
          sheet: 1,
        };
      });

      return {
        ...prev,
        ttd_config: mergeTTDConfigOrder([...otherItems, ...nextRoleItems]),
      };
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const payload = {
        membuat: cleanCommaInput(formData.membuat),
        memeriksa: cleanCommaInput(formData.memeriksa),
        menyetujui: cleanCommaInput(formData.menyetujui),
        form_id: formData.form_id,
        is_cabang: formData.is_cabang,
        request_categories: formData.request_categories,
        ttd_config: serializeTTDConfig(formData.ttd_config)
      };
      
      const { error } = selectedItem
        ? await supabase.from("master_penggunaan_detail").update(payload).eq("id", selectedItem.id)
        : await supabase.from("master_penggunaan_detail").insert([payload]);
      if (error) throw error;

      toast({ title: "Success", description: "Workflow configuration saved." });
      setIsModalOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          {!embedded && (
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
              <Layers className="h-6 w-6 text-primary"/> Alur Persetujuan
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari matrix, form, role, atau jabatan..."
                className="pl-9 h-10 w-[320px] max-w-full"
              />
            </div>

            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">Semua Level</option>
              {availableLevels.map((level) => (
                <option key={level} value={String(level)}>
                  Level {level}
                </option>
              ))}
            </select>

            <div className="flex bg-muted rounded-lg p-1 border border-border">
              {(['all', 'pusat', 'cabang'] as const).map((f) => (
                <button 
                  key={f} 
                  onClick={() => setActiveFilter(f)} 
                  className={`px-4 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${activeFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
        {!documentationOnly && (
          <Button onClick={() => handleOpenModal()} className="h-11 px-6 font-bold">
            <Plus className="mr-2 h-4 w-4"/> Tambah Alur
          </Button>
        )}
      </div>

      {/* Table Section */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-b border-border">
              <TableHead className="w-32 text-center font-bold text-xs">SCOPE</TableHead>
              <TableHead className="font-bold text-xs uppercase">Workflow Sequence</TableHead>
              <TableHead className="font-bold text-xs uppercase">Coordinate Matrix Mapping</TableHead>
              <TableHead className="text-right px-8 font-bold text-xs uppercase">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && details.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center">
                  <Loader2 className="animate-spin h-6 w-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : filteredDetails.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-40 text-center text-sm text-muted-foreground">
                  Tidak ada matrix yang cocok dengan pencarian atau filter saat ini.
                </TableCell>
              </TableRow>
            ) : filteredDetails.map((item) => (
              <TableRow key={item.id} className="border-b border-border/50 transition-colors hover:bg-muted/10">
                <TableCell className="text-center">
                  <Badge className={`px-3 py-1 text-[10px] font-bold ${item.is_cabang ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'}`}>
                    {item.is_cabang ? 'CABANG' : 'PUSAT'}
                  </Badge>
                </TableCell>
                <TableCell className="py-6">
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase border-l-2 border-l-green-500">M: {item.membuat}</Badge>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase border-l-2 border-l-yellow-500">C: {item.memeriksa}</Badge>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase border-l-2 border-l-red-500">A: {item.menyetujui}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    <Database className="h-3 w-3" /> {item.master_forms?.nama_form}
                  </div>
                  <div className="mt-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">
                        Level {getLevelCount(item)}
                      </Badge>
                      {normalizeRequestCategories(item.request_categories).map((category) => (
                        <Badge key={category} variant="outline" className="text-[10px] font-bold uppercase">
                          {category === "asset" ? "Aset" : category === "unit" ? "Unit" : "Non Unit"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {normalizeTTDConfig(item.ttd_config).map((t: any, i: number) => (
                      <div key={i} className="bg-muted border border-border p-2 rounded text-[10px] min-w-[100px]">
                        <p className="font-extrabold text-primary uppercase leading-tight">{t.roleName}</p>
                        <p className="font-medium text-foreground truncate">{t.labelJabatan}</p>
                        <p className="font-mono text-warning mt-1">{t.ttd || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right px-8 space-x-2">
                  {documentationOnly ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/configuration/form-usages?source_matrix=${item.id}`)}
                    >
                      Duplikasi ke Kegunaan
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenModal(item)}>
                        <Pencil className="h-3.5 w-3.5"/>
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10" onClick={async () => {
                        const confirmed = await appDialog.confirm({
                          title: "Hapus Matrix Lama?",
                          description: "Matrix dokumentasi lama ini akan dihapus dari master penggunaan detail.",
                          confirmText: "Hapus",
                          variant: "destructive",
                        });
                        if (confirmed) supabase.from("master_penggunaan_detail").delete().eq("id", item.id).then(() => loadData());
                      }}>
                        <Trash2 className="h-3.5 w-3.5"/>
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal Section */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0 overflow-hidden glass-card border-border shadow-elevated">
          <DialogHeader className="p-6 border-b border-border bg-card">
            <DialogTitle className="flex items-center gap-2 text-xl font-extrabold uppercase tracking-tight">
              <Settings2 className="text-primary h-5 w-5"/> Workflow Configuration
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden grid grid-cols-12">
            {/* Sidebar Form */}
            <div className="col-span-4 p-6 border-r border-border overflow-y-auto space-y-6 bg-muted/20">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Form Template Target</Label>
                  <select 
                    className="w-full bg-background border border-input rounded-lg h-10 px-3 text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all" 
                    value={formData.form_id} 
                    onChange={(e) => setFormData({...formData, form_id: e.target.value})}
                  >
                    {masterForms.map(f => <option key={f.id} value={f.id}>{f.nama_form}</option>)}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Entity Scope</Label>
                  <Button 
                    variant="outline" 
                    className={`w-full font-bold h-10 text-[10px] ${formData.is_cabang ? 'border-orange-500/50 text-orange-500' : 'border-blue-500/50 text-blue-500'}`} 
                    onClick={() => setFormData({...formData, is_cabang: !formData.is_cabang})}
                  >
                    {formData.is_cabang ? <Building2 className="mr-2 h-3 w-3"/> : <Globe className="mr-2 h-3 w-3"/>}
                    {formData.is_cabang ? 'OPERASIONAL CABANG' : 'KANTOR PUSAT'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-muted-foreground">Kategori Registrasi</Label>
                  <div className="space-y-2">
                    {REQUEST_CATEGORY_OPTIONS.map((option) => {
                      const active = formData.request_categories.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleRequestCategory(option.value)}
                          className={cn(
                            "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <span className="block text-[10px] font-black uppercase">{option.label}</span>
                          <span className="mt-1 block text-[10px] font-medium">{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] leading-relaxed text-muted-foreground">
                    User memilih kategori sebelum memilih matrix. Hanya matrix yang mendukung kategori tersebut yang ditampilkan.
                  </p>
                </div>

              </div>

              <div className="space-y-4 border-t border-border pt-6">
                <p className="text-[10px] font-black text-muted-foreground uppercase mb-2 italic">* Gunakan koma untuk lebih dari 1 jabatan. Tanda &amp; dianggap 1 label.</p>
                {(['membuat', 'memeriksa', 'menyetujui'] as const).map((key) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">{key}</Label>
                    <div className="flex gap-2">
                      <Input className="text-xs h-9" placeholder="Example: Manager, Direktur..." value={formData[key]} onChange={(e) => setFormData({...formData, [key]: e.target.value})} />
                      <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => syncTTDMapping(key, formData[key])}>
                        <Plus className="h-4 w-4"/>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-border pt-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase">Quick Preset</p>
                  <span className="text-[10px] text-muted-foreground">Ambil dari pola kotak</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      className="h-auto py-3 px-3 flex flex-col items-start text-left gap-1"
                      onClick={() => applyQuickPreset(preset)}
                    >
                      <span className="text-xs font-bold uppercase">{preset.label}</span>
                      <span className="text-[10px] text-muted-foreground font-normal leading-tight">
                        {preset.description}
                      </span>
                    </Button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Tombol ini mengisi otomatis cell `ttd`, `nama`, dan `jabatan`. Label jabatan tetap diambil dari input M/C/A di atas.
                </p>
              </div>
            </div>

            {/* Matrix Board */}
            <div className="col-span-8 p-8 overflow-y-auto bg-background/50 custom-scrollbar">
              <h3 className="text-xs font-bold mb-6 flex items-center gap-2 uppercase tracking-widest text-muted-foreground">
                <Database className="h-4 w-4 text-primary"/> Coordinate Matrix Mapping
              </h3>
              <div className="space-y-5">
                {ROLE_SEQUENCE.map((roleName) => {
                  const roleItems = getConfigsForRole(roleName);
                  return (
                    <section key={roleName} className="rounded-2xl border border-border/60 bg-card/50 p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{ROLE_LABELS[roleName]}</p>
                          <p className="text-[10px] text-muted-foreground">Geser kartu di section ini untuk mengubah urutan.</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase">{roleItems.length} item</Badge>
                      </div>

                      {roleItems.length === 0 ? (
                        <div className="h-24 border-2 border-dashed border-border rounded-xl flex items-center justify-center text-muted-foreground text-xs font-medium">
                          Belum ada item {ROLE_LABELS[roleName].toLowerCase()}.
                        </div>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleDragEnd(roleName, event)}
                        >
                          <SortableContext
                            items={roleItems.map(item => item.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-3">
                              {roleItems.map((item) => (
                                <SortableMatrixCard
                                  key={item.id}
                                  item={item}
                                  onChange={updateConfigField}
                                  onRemove={handleDeleteConfig}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 border-t border-border bg-card">
            <Button variant="ghost" className="font-bold text-xs" onClick={() => setIsModalOpen(false)}>CANCEL</Button>
            <Button onClick={handleSave} disabled={loading} className="px-8 font-extrabold text-xs glow-effect">
              {loading ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : 'SAVE WORKFLOW MATRIX'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
