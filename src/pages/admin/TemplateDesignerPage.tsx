import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Archive,
  BadgeCheck,
  Boxes,
  Braces,
  CaseSensitive,
  Copy,
  FilePlus2,
  Grip,
  Hand,
  Image,
  LayoutTemplate,
  ListChecks,
  Minimize2,
  MousePointer2,
  Plus,
  Rows3,
  Save,
  Send,
  Signature,
  Square,
  Table2,
  Trash2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BUILTIN_BINDINGS,
  DATA_SOURCES,
  SAMPLE_DATA,
  createDefaultDefinition,
  createDefaultInputSchema,
  sanitizeTemplateDefinition,
  templateBuilderService,
} from "@/services/template-builder.service";
import type {
  DocumentTemplateBuilderVersion,
  TemplateBindingSource,
  TemplateBuilderRecord,
  TemplateDefinition,
  TemplateElement,
  TemplateElementType,
  TemplateInputField,
  TemplateInputSchema,
  TemplateStyle,
  TemplateTableColumn,
  TemplateTextAlign,
} from "@/types/template-builder";

const SCALE = 3;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.25;
const ALIGNMENT_SNAP_THRESHOLD_MM = 1.75;

type AlignmentGuides = {
  vertical: number | null;
  horizontal: number | null;
};

const findAlignmentSnap = (
  position: number,
  size: number,
  targets: number[],
): { position: number; guide: number | null } => {
  const anchors = [position, position + size / 2, position + size];
  let closest: { delta: number; guide: number } | null = null;

  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target - anchor;
      if (
        Math.abs(delta) <= ALIGNMENT_SNAP_THRESHOLD_MM
        && (!closest || Math.abs(delta) < Math.abs(closest.delta))
      ) {
        closest = { delta, guide: target };
      }
    }
  }

  return closest
    ? { position: position + closest.delta, guide: closest.guide }
    : { position, guide: null };
};

const describeTemplateLoadError = (error: unknown) => {
  const candidate = error as { code?: string; message?: string } | null;
  const code = candidate?.code || "";
  const message = candidate?.message || "";

  if (code === "42P01" || code === "PGRST205") {
    return {
      title: "Template Builder belum tersedia",
      description: "Struktur database Template Builder belum ditemukan. Hubungi administrator sistem.",
    };
  }

  if (code === "42501" || /permission|policy|access denied/i.test(message)) {
    return {
      title: "Akses Template Builder ditolak",
      description: "Akun ini tidak memiliki izin administrator untuk membaca konfigurasi template.",
    };
  }

  return {
    title: "Template Builder gagal dimuat",
    description: message || "Terjadi gangguan saat mengambil konfigurasi template dari database.",
  };
};

const elementCatalog: Array<{
  type: TemplateElementType;
  label: string;
  description: string;
  icon: typeof CaseSensitive;
}> = [
  { type: "text", label: "Teks", description: "Label, judul, atau teks statis.", icon: CaseSensitive },
  { type: "field", label: "Field Data", description: "Nomor surat, pengaju, kantor, proyek.", icon: Braces },
  { type: "logo", label: "Logo", description: "Logo Marison atau gambar header.", icon: Image },
  { type: "repeater_table", label: "Tabel Berulang", description: "Barang, unit, rekomendasi, lampiran.", icon: Table2 },
  { type: "note_box", label: "Catatan", description: "Area teks panjang dengan border.", icon: Rows3 },
  { type: "signature_grid", label: "Tanda Tangan", description: "Kotak tanda tangan dari data signer.", icon: Signature },
  { type: "box", label: "Kotak", description: "Panel, border, atau area visual.", icon: Square },
  { type: "line", label: "Garis", description: "Pembatas horizontal/vertikal.", icon: Grip },
];

const pageSizeMm = (definition: TemplateDefinition) => {
  const base = definition.page.size === "F4" ? { width: 210, height: 330 } : { width: 210, height: 297 };
  return definition.page.orientation === "landscape"
    ? { width: base.height, height: base.width }
    : base;
};

const getByPath = (source: unknown, path?: string) => {
  if (!path) return "";
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return "";
  }, source);
};

const sampleValue = (element: TemplateElement) => {
  const source = element.source || "surat";
  const value = getByPath(SAMPLE_DATA[source], element.binding);
  if (value === null || value === undefined || value === "") return element.content || element.label;
  return String(value);
};

const formatCell = (row: unknown, column: TemplateTableColumn, index: number) => {
  if (column.format === "index" || column.binding === "_index") return String(index + 1);
  const value = getByPath(row, column.binding);
  if (column.format === "checkmark") return value ? "V" : "";
  if (column.format === "currency") {
    const number = Number(value);
    return Number.isFinite(number) ? `Rp ${number.toLocaleString("id-ID")}` : String(value || "");
  }
  return String(value ?? "");
};

const pageStyle = (definition: TemplateDefinition) => {
  const size = pageSizeMm(definition);
  return {
    width: size.width * SCALE,
    height: size.height * SCALE,
  };
};

const styleToCss = (style?: TemplateStyle): React.CSSProperties => ({
  fontSize: `${style?.fontSize || 10}px`,
  fontWeight:
    style?.fontWeight === "bold" ? 700 : style?.fontWeight === "semibold" ? 600 : style?.fontWeight === "medium" ? 500 : 400,
  fontStyle: style?.italic ? "italic" : "normal",
  textAlign: style?.align || "left",
  color: style?.color || "#111827",
  backgroundColor: style?.backgroundColor === "transparent" ? "transparent" : style?.backgroundColor || "transparent",
  borderColor: style?.borderColor || "#111827",
  borderWidth: style?.borderWidth || 0,
  borderStyle: (style?.borderWidth || 0) > 0 ? "solid" : "none",
  borderRadius: style?.radius || 0,
  padding: (style?.padding || 0) * SCALE * 0.3,
  lineHeight: style?.lineHeight || 1.25,
});

const createElement = (type: TemplateElementType, position = { x: 12, y: 12 }): TemplateElement => {
  const id = crypto.randomUUID();
  const baseStyle: TemplateStyle = {
    fontSize: 9,
    fontWeight: "normal",
    align: "left",
    verticalAlign: "middle",
    color: "#111827",
    backgroundColor: "transparent",
    borderColor: "#111827",
    borderWidth: type === "text" ? 0 : 1,
    padding: 2,
    lineHeight: 1.25,
  };

  if (type === "repeater_table") {
    return {
      id,
      type,
      label: "Tabel Berulang",
      rect: { x: position.x, y: position.y, width: 180, height: 58 },
      source: "items",
      minRows: 5,
      maxRows: 30,
      rowHeight: 7,
      repeatHeader: true,
      style: baseStyle,
      columns: [
        { id: crypto.randomUUID(), label: "No", binding: "_index", width: 12, align: "center", format: "index" },
        { id: crypto.randomUUID(), label: "Nama", binding: "nama_barang", width: 90, align: "left", format: "text" },
        { id: crypto.randomUUID(), label: "Jumlah", binding: "jumlah", width: 25, align: "center", format: "number" },
      ],
    };
  }

  if (type === "signature_grid") {
    return {
      id,
      type,
      label: "Tanda Tangan",
      rect: { x: position.x, y: position.y, width: 150, height: 32 },
      source: "signers",
      signaturePattern: "auto",
      signatureAutoSize: true,
      style: { ...baseStyle, align: "center", fontSize: 8 },
    };
  }

  return {
    id,
    type,
    label:
      type === "field"
        ? "Field Data"
        : type === "logo"
          ? "Logo"
          : type === "note_box"
            ? "Catatan"
            : type === "line"
              ? "Garis"
              : type === "box"
                ? "Kotak"
                : "Teks",
    rect:
      type === "line"
        ? { x: position.x, y: position.y, width: 80, height: 1 }
        : type === "logo"
          ? { x: position.x, y: position.y, width: 38, height: 18 }
          : type === "note_box"
            ? { x: position.x, y: position.y, width: 120, height: 24 }
            : { x: position.x, y: position.y, width: 70, height: 10 },
    source: type === "field" ? "surat" : "static",
    binding: type === "field" ? "no_surat" : "",
    content: type === "text" ? "Teks baru" : type === "field" ? "Label :" : type === "note_box" ? "Catatan :" : "",
    imageUrl: type === "logo" ? "/logo-marison-regency-group.png" : "",
    style: baseStyle,
  };
};

const mmStyle = (element: TemplateElement, selected: boolean): React.CSSProperties => ({
  position: "absolute",
  left: element.rect.x * SCALE,
  top: element.rect.y * SCALE,
  width: element.rect.width * SCALE,
  height:
    (element.type === "signature_grid" && element.signatureAutoSize !== false
      ? signatureAutoHeight(element.rect.width, element.signaturePattern)
      : element.rect.height) * SCALE,
  outline: selected ? "2px solid hsl(var(--primary))" : undefined,
  outlineOffset: selected ? 2 : undefined,
  cursor: element.locked ? "default" : "grab",
  overflow: "hidden",
  ...styleToCss(element.style),
});

const signatureFormation = (pattern = "auto"): { top: number; bottom: number; topRight?: boolean } => {
  const formations: Record<string, { top: number; bottom: number; topRight?: boolean }> = {
    "3-right": { top: 3, bottom: 0, topRight: true },
    "4": { top: 4, bottom: 0 },
    "3-2": { top: 3, bottom: 2 },
    "3-3": { top: 3, bottom: 3 },
    "4-3": { top: 4, bottom: 3 },
    "4-4": { top: 4, bottom: 4 },
  };
  return formations[pattern] || { top: Math.min(4, (SAMPLE_DATA.signers as unknown[]).length), bottom: 0 };
};

const signatureAutoHeight = (width: number, pattern = "auto") => {
  const formation = signatureFormation(pattern);
  const topSlots = formation.topRight ? 4 : Math.max(1, formation.top);
  const rowHeight = Math.min(38, Math.max(24, width / topSlots / 1.75));
  return rowHeight * (formation.bottom > 0 ? 2 : 1) + (formation.bottom > 0 ? 2 : 0);
};

const effectiveElementHeight = (element: TemplateElement) =>
  element.type === "signature_grid" && element.signatureAutoSize !== false
    ? signatureAutoHeight(element.rect.width, element.signaturePattern)
    : element.rect.height;

const isOutsidePrintArea = (definition: TemplateDefinition) => {
  const size = pageSizeMm(definition);
  const margin = definition.page.margin;
  return definition.elements.some((element) => (
    element.rect.x < margin
    || element.rect.y < margin
    || element.rect.x + element.rect.width > size.width - margin
    || element.rect.y + effectiveElementHeight(element) > size.height - margin
  ));
};

const fitElementsToPrintArea = (definition: TemplateDefinition): TemplateDefinition => {
  if (definition.elements.length === 0) return definition;
  const size = pageSizeMm(definition);
  const margin = definition.page.margin;
  const availableWidth = Math.max(1, size.width - margin * 2);
  const availableHeight = Math.max(1, size.height - margin * 2);
  const minX = Math.min(...definition.elements.map((element) => element.rect.x));
  const minY = Math.min(...definition.elements.map((element) => element.rect.y));
  const maxX = Math.max(...definition.elements.map((element) => element.rect.x + element.rect.width));
  const maxY = Math.max(...definition.elements.map((element) => element.rect.y + effectiveElementHeight(element)));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const scale = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight);
  const scaledContentWidth = contentWidth * scale;
  const scaledContentHeight = contentHeight * scale;
  const originX = margin + Math.max(0, (availableWidth - scaledContentWidth) / 2);
  const originY = margin + Math.max(0, (availableHeight - scaledContentHeight) / 2);

  return sanitizeTemplateDefinition({
    ...definition,
    elements: definition.elements.map((element) => {
      const width = element.rect.width * scale;
      const scaledHeight = effectiveElementHeight(element) * scale;
      return {
        ...element,
        rect: {
          x: originX + (element.rect.x - minX) * scale,
          y: originY + (element.rect.y - minY) * scale,
          width,
          height: element.signatureAutoSize !== false && element.type === "signature_grid"
            ? signatureAutoHeight(width, element.signaturePattern)
            : scaledHeight,
        },
        style: element.style
          ? {
              ...element.style,
              fontSize: Math.max(7, (element.style.fontSize || 10) * scale),
              padding: Math.max(0, (element.style.padding || 0) * scale),
            }
          : element.style,
        rowHeight: element.rowHeight ? Math.max(4, element.rowHeight * scale) : element.rowHeight,
        columns: element.columns?.map((column) => ({ ...column, width: Math.max(20, column.width * scale) })),
      };
    }),
  });
};

const previewSigners = (count: number) => {
  const samples = SAMPLE_DATA.signers as Array<Record<string, string>>;
  return Array.from({ length: count }, (_, index) => samples[index] || {
    label: index < 2 ? "Memeriksa" : "Menyetujui",
    nama: `Penandatangan ${index + 1}`,
    jabatan: `Jabatan ${index + 1}`,
  });
};

const ElementPreview = ({
  element,
  selected,
  onPointerDown,
}: {
  element: TemplateElement;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) => {
  if (element.type === "line") {
    return (
      <div
        role="button"
        tabIndex={0}
        style={mmStyle(element, selected)}
        className="bg-current"
        onPointerDown={onPointerDown}
      />
    );
  }

  if (element.type === "logo") {
    return (
      <div
        role="button"
        tabIndex={0}
        style={mmStyle(element, selected)}
        className="flex items-center justify-center"
        onPointerDown={onPointerDown}
      >
        {element.imageUrl ? (
          <img src={element.imageUrl} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
        ) : (
          <span className="text-[9px] text-muted-foreground">Logo</span>
        )}
      </div>
    );
  }

  if (element.type === "repeater_table") {
    const rows = Array.isArray(SAMPLE_DATA[element.source || "items"])
      ? (SAMPLE_DATA[element.source || "items"] as unknown[])
      : [];
    const minRows = Math.max(element.minRows || 0, rows.length);
    const displayRows = Array.from({ length: minRows }, (_, index) => rows[index] || {});
    const columns = element.columns || [];

    return (
      <div
        role="button"
        tabIndex={0}
        style={mmStyle(element, selected)}
        className="bg-white"
        onPointerDown={onPointerDown}
      >
        <table className="h-full w-full table-fixed border-collapse text-[8px]">
          <colgroup>
            {columns.map((column) => {
              const totalWidth = columns.reduce((sum, item) => sum + Math.max(1, item.width), 0) || 1;
              return <col key={column.id} style={{ width: `${(Math.max(1, column.width) / totalWidth) * 100}%` }} />;
            })}
          </colgroup>
          <thead>
            <tr className="bg-emerald-50">
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="border border-black/80 px-1 py-0.5 font-semibold"
                  style={{ textAlign: column.headerAlign || column.align || "left" }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ height: (element.rowHeight || 7) * SCALE }}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className="border border-black/80 px-1"
                    style={{ textAlign: column.bodyAlign || column.align || "left" }}
                  >
                    {formatCell(row, column, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (element.type === "signature_grid") {
    const formation = signatureFormation(element.signaturePattern);
    const signers = previewSigners(formation.top + formation.bottom);
    const top = signers.slice(0, formation.top);
    const bottom = signers.slice(formation.top);
    const renderRow = (row: Array<Record<string, string>>, widthPercent = 100) => (
      <div
        className="grid flex-1 self-end"
        style={{
          gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
          width: `${widthPercent}%`,
        }}
      >
        {row.map((signer, index) => (
          <div key={`${signer.nama}-${index}`} className="flex flex-col border border-black/80 text-center">
            <div className="border-b border-black/80 bg-emerald-50 px-1 py-0.5 text-[8px] font-semibold">{signer.label}</div>
            <div className="flex flex-1 flex-col justify-end px-1 py-1">
              <div className="text-[8px] font-semibold">{signer.nama}</div>
              <div className="text-[7px]">{signer.jabatan}</div>
            </div>
          </div>
        ))}
      </div>
    );

    return (
      <div
        role="button"
        tabIndex={0}
        style={mmStyle(element, selected)}
        className="flex flex-col gap-1 bg-white"
        onPointerDown={onPointerDown}
      >
        {renderRow(top, formation.topRight ? 75 : 100)}
        {bottom.length > 0 && renderRow(bottom, (bottom.length / formation.top) * 100)}
      </div>
    );
  }

  const content = element.type === "field" ? `${element.content || ""} ${sampleValue(element)}` : element.content || element.label;
  return (
    <div
      role="button"
      tabIndex={0}
      style={mmStyle(element, selected)}
      className={cn(
        "flex",
        element.style?.verticalAlign === "top" && "items-start",
        element.style?.verticalAlign === "middle" && "items-center",
        element.style?.verticalAlign === "bottom" && "items-end",
      )}
      onPointerDown={onPointerDown}
    >
      <span className="w-full whitespace-pre-wrap break-words">{content}</span>
    </div>
  );
};

const latestVersion = (template?: TemplateBuilderRecord | null) =>
  [...(template?.document_template_builder_versions || [])].sort((a, b) => b.version_number - a.version_number)[0];

export default function TemplateDesignerPage() {
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [definition, setDefinition] = useState<TemplateDefinition>(() => createDefaultDefinition());
  const [inputSchema, setInputSchema] = useState<TemplateInputSchema>(() => createDefaultInputSchema());
  const [selectedElementId, setSelectedElementId] = useState<string>("");
  const [zoom, setZoom] = useState(0.85);
  const [canvasTool, setCanvasTool] = useState<"select" | "pan">("select");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuides>({
    vertical: null,
    horizontal: null,
  });
  const [dragState, setDragState] = useState<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportPan, setViewportPan] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ["document-template-builders"],
    queryFn: templateBuilderService.listTemplates,
  });

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );
  const selectedVersion = useMemo(() => latestVersion(selectedTemplate), [selectedTemplate]);
  const selectedElement = definition.elements.find((element) => element.id === selectedElementId) || null;
  const page = pageStyle(definition);
  const validation = useMemo(() => validateDefinition(definition), [definition]);
  const hasPrintOverflow = useMemo(() => isOutsidePrintArea(definition), [definition]);

  useEffect(() => {
    if (!selectedTemplateId && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!selectedVersion) return;
    setDefinition(sanitizeTemplateDefinition(selectedVersion.definition || createDefaultDefinition()));
    setInputSchema(selectedVersion.input_schema || createDefaultInputSchema());
    setSelectedElementId("");
  }, [selectedVersion?.id]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (event: PointerEvent) => {
      const dx = (event.clientX - dragState.startX) / SCALE / zoom;
      const dy = (event.clientY - dragState.startY) / SCALE / zoom;
      const movingElement = definition.elements.find((element) => element.id === dragState.id);
      if (!movingElement) return;

      const pageSize = pageSizeMm(definition);
      const otherElements = definition.elements.filter((element) => element.id !== dragState.id);
      const verticalTargets = [
        pageSize.width / 2,
        ...otherElements.flatMap((element) => [
          element.rect.x,
          element.rect.x + element.rect.width / 2,
          element.rect.x + element.rect.width,
        ]),
      ];
      const horizontalTargets = [
        pageSize.height / 2,
        ...otherElements.flatMap((element) => [
          element.rect.y,
          element.rect.y + element.rect.height / 2,
          element.rect.y + element.rect.height,
        ]),
      ];
      const xSnap = findAlignmentSnap(
        Math.max(0, dragState.originX + dx),
        movingElement.rect.width,
        verticalTargets,
      );
      const ySnap = findAlignmentSnap(
        Math.max(0, dragState.originY + dy),
        movingElement.rect.height,
        horizontalTargets,
      );

      setAlignmentGuides({ vertical: xSnap.guide, horizontal: ySnap.guide });
      updateElement(dragState.id, {
        rect: {
          ...movingElement.rect,
          x: xSnap.position,
          y: ySnap.position,
        },
      });
    };
    const onUp = () => {
      setDragState(null);
      setAlignmentGuides({ vertical: null, horizontal: null });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [definition.elements, dragState, zoom]);

  useEffect(() => {
    if (!viewportPan) return;
    const onMove = (event: PointerEvent) => {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = viewportPan.scrollLeft - (event.clientX - viewportPan.startX);
      viewport.scrollTop = viewportPan.scrollTop - (event.clientY - viewportPan.startY);
    };
    const onUp = () => setViewportPan(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [viewportPan]);

  const startViewportPan = (event: React.PointerEvent) => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    setViewportPan({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  };

  const updateElement = useCallback((elementId: string, patch: Partial<TemplateElement>) => {
    setDefinition((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId
          ? sanitizeTemplateDefinition({
              ...current,
              elements: [{ ...element, ...patch }],
            }).elements[0]
          : element,
      ),
    }));
  }, []);

  const addElement = (type: TemplateElementType) => {
    const next = createElement(type, { x: definition.page.margin + 4, y: definition.page.margin + 4 });
    setDefinition((current) => ({ ...current, elements: [...current.elements, next] }));
    setSelectedElementId(next.id);
  };

  const duplicateElement = () => {
    if (!selectedElement) return;
    const copy = {
      ...selectedElement,
      id: crypto.randomUUID(),
      label: `${selectedElement.label} Copy`,
      rect: {
        ...selectedElement.rect,
        x: selectedElement.rect.x + 4,
        y: selectedElement.rect.y + 4,
      },
    };
    setDefinition((current) => ({ ...current, elements: [...current.elements, copy] }));
    setSelectedElementId(copy.id);
  };

  const removeElement = () => {
    if (!selectedElementId) return;
    setDefinition((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== selectedElementId),
    }));
    setSelectedElementId("");
  };

  const createTemplate = async () => {
    try {
      setSaving(true);
      const template = await templateBuilderService.createTemplate({
        name: newTemplateName,
        definition,
        input_schema: inputSchema,
      });
      await queryClient.invalidateQueries({ queryKey: ["document-template-builders"] });
      setSelectedTemplateId(template.id);
      setCreateOpen(false);
      setNewTemplateName("");
      toast.success("Template builder dibuat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat template.");
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!selectedTemplate) {
      setCreateOpen(true);
      return;
    }
    try {
      setSaving(true);
      const nextVersion = selectedVersion?.version_number || 1;
      await templateBuilderService.saveVersion({
        template_id: selectedTemplate.id,
        version_number: nextVersion,
        status: "draft",
        definition,
        input_schema: inputSchema,
      });
      await queryClient.invalidateQueries({ queryKey: ["document-template-builders"] });
      toast.success("Draft template disimpan");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan draft.");
    } finally {
      setSaving(false);
    }
  };

  const saveAsNewVersion = async () => {
    if (!selectedTemplate) return;
    try {
      setSaving(true);
      await templateBuilderService.saveVersion({
        template_id: selectedTemplate.id,
        status: "draft",
        definition,
        input_schema: inputSchema,
      });
      await queryClient.invalidateQueries({ queryKey: ["document-template-builders"] });
      toast.success("Versi baru dibuat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membuat versi baru.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!selectedTemplate || !selectedVersion) return;
    if (validation.errors.length > 0) {
      toast.error("Template belum valid", { description: validation.errors[0] });
      return;
    }
    try {
      setPublishing(true);
      const version = await templateBuilderService.saveVersion({
        template_id: selectedTemplate.id,
        version_number: selectedVersion.version_number,
        status: "published",
        definition,
        input_schema: inputSchema,
      });
      await templateBuilderService.publishVersion(selectedTemplate.id, version.id);
      await queryClient.invalidateQueries({ queryKey: ["document-template-builders"] });
      toast.success("Template dipublish");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal publish template.");
    } finally {
      setPublishing(false);
    }
  };

  const addSchemaField = () => {
    setInputSchema((current) => ({
      fields: [
        ...current.fields,
        {
          id: crypto.randomUUID(),
          key: `field_${current.fields.length + 1}`,
          label: `Field ${current.fields.length + 1}`,
          type: "text",
          required: false,
          source: "surat",
        },
      ],
    }));
  };

  const updateSchemaField = (fieldId: string, patch: Partial<TemplateInputField>) => {
    setInputSchema((current) => ({
      fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  };

  const removeSchemaField = (fieldId: string) => {
    setInputSchema((current) => ({
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  };

  if (error) {
    const loadError = describeTemplateLoadError(error);
    return (
      <div className="space-y-4">
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
          <CardHeader>
            <CardTitle>{loadError.title}</CardTitle>
            <CardDescription>{loadError.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["document-template-builders"] })}>
              Coba Muat Ulang
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/15 bg-gradient-to-r from-primary/8 via-card to-card">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Native Template Builder</Badge>
              <Badge variant="outline">{selectedVersion ? `Versi ${selectedVersion.version_number}` : "Belum ada versi"}</Badge>
              {selectedTemplate?.status && <Badge variant={selectedTemplate.status === "published" ? "default" : "secondary"}>{selectedTemplate.status}</Badge>}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Rancang template dokumen dari nol</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Susun logo, field data, tabel berulang, catatan, dan tanda tangan dalam satu canvas. Data berulang cukup dibuat sekali lewat elemen tabel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <FilePlus2 className="h-4 w-4" />
              Template Baru
            </Button>
            <Button variant="outline" onClick={saveAsNewVersion} disabled={!selectedTemplate || saving}>
              <Copy className="h-4 w-4" />
              Versi Baru
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? "Menyimpan..." : "Simpan Draft"}
            </Button>
            <Button onClick={publish} disabled={!selectedTemplate || publishing || validation.errors.length > 0}>
              <Send className="h-4 w-4" />
              {publishing ? "Publish..." : "Publish"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <Card className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              Template
            </CardTitle>
            <CardDescription>Pilih template atau tambah elemen baru.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto">
            <div className="space-y-2">
              <Label>Template aktif</Label>
              <Select value={selectedTemplateId || "none"} onValueChange={(value) => setSelectedTemplateId(value === "none" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoading ? "Memuat..." : "Pilih template"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Template baru lokal</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="grid gap-2">
              {elementCatalog.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => addElement(item.type)}
                    className="group flex min-h-[64px] items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition hover:border-primary/35 hover:bg-primary/5"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MousePointer2 className="h-4 w-4 text-primary" />
                Canvas Preview
              </CardTitle>
              <CardDescription>Geser elemen langsung di canvas, lalu rapikan ukuran dari panel properti.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={hasPrintOverflow ? "default" : "outline"}
                disabled={!hasPrintOverflow}
                aria-label="Sesuaikan semua elemen ke area cetak"
                title={hasPrintOverflow ? "Sesuaikan semua elemen ke area cetak" : "Semua elemen sudah berada di area cetak"}
                onClick={() => {
                  setDefinition((current) => fitElementsToPrintArea(current));
                  toast.success("Seluruh elemen sudah disesuaikan ke area cetak");
                }}
              >
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden 2xl:inline">Sesuaikan Semua</span>
              </Button>
              <div className="flex rounded-md border border-border p-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant={canvasTool === "select" ? "secondary" : "ghost"}
                  className="h-7 w-7"
                  aria-label="Mode pilih elemen"
                  title="Pilih elemen"
                  onClick={() => setCanvasTool("select")}
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={canvasTool === "pan" ? "secondary" : "ghost"}
                  className="h-7 w-7"
                  aria-label="Mode geser canvas"
                  title="Geser canvas"
                  onClick={() => setCanvasTool("pan")}
                >
                  <Hand className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 0.1))}>
                -
              </Button>
              <span className="w-14 text-center text-xs font-semibold text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 0.1))}>
                +
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {validation.errors.length > 0 && (
              <div className="mb-4 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
                {validation.errors[0]}
              </div>
            )}
            <div
              ref={canvasViewportRef}
              className={cn(
                "overflow-auto rounded-lg border border-border bg-muted/45 p-4",
                canvasTool === "pan" && (viewportPan ? "cursor-grabbing select-none" : "cursor-grab"),
              )}
              onPointerDown={(event) => {
                if (canvasTool === "pan" || event.button === 1) startViewportPan(event);
              }}
            >
              <div
                className="origin-top-left transition-transform"
                style={{ width: page.width * zoom, height: page.height * zoom }}
              >
                <div
                  ref={canvasRef}
                  className="relative bg-white text-slate-950 shadow-xl"
                  style={{ ...page, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  onPointerDown={(event) => {
                    if (canvasTool === "select" && event.target === event.currentTarget) {
                      setSelectedElementId("");
                    }
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute z-0 border border-dashed border-emerald-500/55"
                    style={{
                      left: definition.page.margin * SCALE,
                      top: definition.page.margin * SCALE,
                      width: (pageSizeMm(definition).width - definition.page.margin * 2) * SCALE,
                      height: (pageSizeMm(definition).height - definition.page.margin * 2) * SCALE,
                    }}
                  />
                  {definition.elements.map((element) => (
                    <ElementPreview
                      key={element.id}
                      element={element}
                      selected={selectedElementId === element.id}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (canvasTool === "pan" || event.button === 1) {
                          startViewportPan(event);
                          return;
                        }
                        setSelectedElementId(element.id);
                        if (element.locked) return;
                        setDragState({
                          id: element.id,
                          startX: event.clientX,
                          startY: event.clientY,
                          originX: element.rect.x,
                          originY: element.rect.y,
                        });
                      }}
                    />
                  ))}
                  {alignmentGuides.vertical !== null && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 z-50 w-px bg-primary shadow-[0_0_0_1px_hsl(var(--background)/0.75)]"
                      style={{ left: alignmentGuides.vertical * SCALE }}
                    />
                  )}
                  {alignmentGuides.horizontal !== null && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-50 h-px bg-primary shadow-[0_0_0_1px_hsl(var(--background)/0.75)]"
                      style={{ top: alignmentGuides.horizontal * SCALE }}
                    />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" />
              Properti
            </CardTitle>
            <CardDescription>{selectedElement ? selectedElement.label : "Pilih elemen untuk mengatur detail."}</CardDescription>
          </CardHeader>
          <CardContent className="xl:max-h-[calc(100dvh-13rem)] xl:overflow-y-auto">
            <Tabs defaultValue="element">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="element">Elemen</TabsTrigger>
                <TabsTrigger value="schema">Input</TabsTrigger>
                <TabsTrigger value="page">Halaman</TabsTrigger>
              </TabsList>

              <TabsContent value="element" className="space-y-4 pt-3">
                {selectedElement ? (
                  <ElementInspector
                    element={selectedElement}
                    onChange={(patch) => updateElement(selectedElement.id, patch)}
                    onFitPrintArea={() => {
                      const size = pageSizeMm(definition);
                      const margin = definition.page.margin;
                      const width = Math.max(20, size.width - margin * 2);
                      const height = signatureAutoHeight(width, selectedElement.signaturePattern);
                      updateElement(selectedElement.id, {
                        rect: {
                          ...selectedElement.rect,
                          x: margin,
                          width,
                          height,
                          y: Math.min(selectedElement.rect.y, Math.max(margin, size.height - margin - height)),
                        },
                        signatureAutoSize: true,
                      });
                    }}
                    onDuplicate={duplicateElement}
                    onRemove={removeElement}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-5 text-center">
                    <MousePointer2 className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-semibold">Belum ada elemen dipilih</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Klik elemen pada canvas atau tambahkan dari panel kiri.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="schema" className="space-y-4 pt-3">
                <InputSchemaPanel
                  schema={inputSchema}
                  onAdd={addSchemaField}
                  onUpdate={updateSchemaField}
                  onRemove={removeSchemaField}
                />
              </TabsContent>

              <TabsContent value="page" className="space-y-4 pt-3">
                <PageInspector definition={definition} onChange={setDefinition} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Template Baru</DialogTitle>
            <DialogDescription>Template akan dibuat sebagai draft dan bisa dipublish setelah valid.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="template-name">Nama Template</Label>
            <Input
              id="template-name"
              value={newTemplateName}
              onChange={(event) => setNewTemplateName(event.target.value)}
              placeholder="Contoh: Form Permohonan Operasional"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button onClick={createTemplate} disabled={saving || newTemplateName.trim().length < 3}>
              Buat Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ElementInspector({
  element,
  onChange,
  onFitPrintArea,
  onDuplicate,
  onRemove,
}: {
  element: TemplateElement;
  onChange: (patch: Partial<TemplateElement>) => void;
  onFitPrintArea: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const updateRect = (patch: Partial<TemplateElement["rect"]>) => {
    const nextRect = { ...element.rect, ...patch };
    if (element.type === "signature_grid" && element.signatureAutoSize !== false && patch.width !== undefined) {
      nextRect.height = signatureAutoHeight(nextRect.width, element.signaturePattern);
    }
    onChange({ rect: nextRect });
  };
  const updateStyle = (patch: Partial<TemplateStyle>) => onChange({ style: { ...element.style, ...patch } });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
          Duplikat
        </Button>
        <Button variant="outline" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
          Hapus
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Nama Elemen</Label>
        <Input value={element.label} onChange={(event) => onChange({ label: event.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.rect.x} onChange={(value) => updateRect({ x: value })} />
        <NumberField label="Y" value={element.rect.y} onChange={(value) => updateRect({ y: value })} />
        <NumberField label="Lebar" value={element.rect.width} onChange={(value) => updateRect({ width: value })} />
        <NumberField label="Tinggi" value={element.rect.height} onChange={(value) => updateRect({ height: value })} />
      </div>

      {["text", "field", "note_box"].includes(element.type) && (
        <div className="space-y-2">
          <Label>{element.type === "field" ? "Label Awal" : "Isi Teks"}</Label>
          <Textarea value={element.content || ""} onChange={(event) => onChange({ content: event.target.value })} />
        </div>
      )}

      {element.type === "logo" && (
        <div className="space-y-2">
          <Label>URL Logo</Label>
          <Input value={element.imageUrl || ""} onChange={(event) => onChange({ imageUrl: event.target.value })} />
        </div>
      )}

      {element.type === "field" && (
        <div className="grid gap-2">
          <Label>Binding Data</Label>
          <Select value={`${element.source || "surat"}.${element.binding || ""}`} onValueChange={(value) => {
            const [source, ...path] = value.split(".");
            onChange({ source: source as TemplateBindingSource, binding: path.join(".") });
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUILTIN_BINDINGS.map((binding) => (
                <SelectItem key={`${binding.source}.${binding.value}`} value={`${binding.source}.${binding.value}`}>
                  {binding.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {element.type === "repeater_table" && (
        <TableInspector element={element} onChange={onChange} />
      )}

      {element.type === "signature_grid" && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <Label>Formasi Tanda Tangan</Label>
          <Select
            value={element.signaturePattern || "auto"}
            onValueChange={(signaturePattern) => onChange({
              signaturePattern,
              rect: element.signatureAutoSize !== false
                ? {
                    ...element.rect,
                    height: signatureAutoHeight(element.rect.width, signaturePattern),
                  }
                : element.rect,
            })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Otomatis dari jumlah signer</SelectItem>
              <SelectItem value="3-right">3 kotak kanan</SelectItem>
              <SelectItem value="4">4 kotak</SelectItem>
              <SelectItem value="3-2">3 atas, 2 bawah</SelectItem>
              <SelectItem value="3-3">3 atas, 3 bawah</SelectItem>
              <SelectItem value="4-3">4 atas, 3 bawah</SelectItem>
              <SelectItem value="4-4">4 atas, 4 bawah</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between rounded-md bg-muted/45 px-3 py-2">
            <Label className="text-xs">Tinggi otomatis</Label>
            <Switch
              checked={element.signatureAutoSize !== false}
              onCheckedChange={(signatureAutoSize) => onChange({
                signatureAutoSize,
                rect: signatureAutoSize
                  ? {
                      ...element.rect,
                      height: signatureAutoHeight(element.rect.width, element.signaturePattern),
                    }
                  : element.rect,
              })}
            />
          </div>
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onFitPrintArea}>
            Sesuaikan area cetak
          </Button>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Font" value={element.style?.fontSize || 9} onChange={(value) => updateStyle({ fontSize: value })} />
          <NumberField label="Padding" value={element.style?.padding || 0} onChange={(value) => updateStyle({ padding: value })} />
          <NumberField label="Border" value={element.style?.borderWidth || 0} onChange={(value) => updateStyle({ borderWidth: value })} />
          <NumberField label="Radius" value={element.style?.radius || 0} onChange={(value) => updateStyle({ radius: value })} />
        </div>

        <div className="space-y-2">
          <Label>Perataan</Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["left", AlignLeft],
              ["center", AlignCenter],
              ["right", AlignRight],
            ] as Array<[TemplateTextAlign, typeof AlignLeft]>).map(([align, Icon]) => (
              <Button
                key={align}
                type="button"
                variant={element.style?.align === align ? "default" : "outline"}
                size="sm"
                onClick={() => updateStyle({ align })}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Teks" value={element.style?.color || "#111827"} onChange={(value) => updateStyle({ color: value })} />
          <ColorField label="Background" value={element.style?.backgroundColor || "#ffffff"} onChange={(value) => updateStyle({ backgroundColor: value })} />
          <ColorField label="Border" value={element.style?.borderColor || "#111827"} onChange={(value) => updateStyle({ borderColor: value })} />
        </div>
      </div>
    </div>
  );
}

function TableInspector({ element, onChange }: { element: TemplateElement; onChange: (patch: Partial<TemplateElement>) => void }) {
  const columns = element.columns || [];
  const updateColumn = (columnId: string, patch: Partial<TemplateTableColumn>) => {
    onChange({ columns: columns.map((column) => (column.id === columnId ? { ...column, ...patch } : column)) });
  };
  const renderAlignControl = (
    column: TemplateTableColumn,
    key: "headerAlign" | "bodyAlign",
  ) => (
    <div className="grid grid-cols-3 gap-1">
      {(["left", "center", "right"] as TemplateTextAlign[]).map((align) => {
        const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
        const current = column[key] || column.align || "left";
        return (
          <Button
            key={align}
            type="button"
            size="icon"
            variant={current === align ? "secondary" : "outline"}
            className="h-8 w-full"
            aria-label={`${key === "headerAlign" ? "Header" : "Isi"} rata ${align}`}
            title={`Rata ${align}`}
            onClick={() => updateColumn(column.id, { [key]: align })}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label>Sumber Data</Label>
          <Select value={element.source || "items"} onValueChange={(source) => onChange({ source: source as TemplateBindingSource })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_SOURCES.filter((item) => item.value !== "surat" && item.value !== "pengaju").map((source) => (
                <SelectItem key={source.value} value={source.value}>
                  {source.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumberField label="Min baris" value={element.minRows || 0} onChange={(value) => onChange({ minRows: value })} />
        <NumberField label="Max baris" value={element.maxRows || 20} onChange={(value) => onChange({ maxRows: value })} />
        <NumberField label="Tinggi baris" value={element.rowHeight || 7} onChange={(value) => onChange({ rowHeight: value })} />
      </div>

      <div className="flex items-center justify-between rounded-md bg-muted/45 px-3 py-2">
        <Label className="text-xs">Ulang header saat page break</Label>
        <Switch checked={element.repeatHeader !== false} onCheckedChange={(repeatHeader) => onChange({ repeatHeader })} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Kolom ({columns.length})</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                columns: [
                  ...columns,
                  {
                    id: crypto.randomUUID(),
                    label: `Kolom ${columns.length + 1}`,
                    binding: "",
                    width: 35,
                    align: "left",
                    headerAlign: "center",
                    bodyAlign: "left",
                    format: "text",
                  },
                ],
              })
            }
          >
            <Plus className="h-4 w-4" />
            Kolom
          </Button>
        </div>
        {columns.map((column) => (
          <div key={column.id} className="space-y-2 rounded-md border border-border p-2">
            <Input value={column.label} onChange={(event) => updateColumn(column.id, { label: event.target.value })} placeholder="Label" />
            <div className="grid grid-cols-[1fr_72px] gap-2">
              <Input value={column.binding} onChange={(event) => updateColumn(column.id, { binding: event.target.value })} placeholder="binding" />
              <Input
                type="number"
                value={column.width}
                onChange={(event) => updateColumn(column.id, { width: Number(event.target.value) || 20 })}
              />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Select value={column.format || "text"} onValueChange={(format: TemplateTableColumn["format"]) => updateColumn(column.id, { format })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Teks</SelectItem>
                  <SelectItem value="index">Nomor otomatis</SelectItem>
                  <SelectItem value="number">Angka</SelectItem>
                  <SelectItem value="currency">Rupiah</SelectItem>
                  <SelectItem value="date">Tanggal</SelectItem>
                  <SelectItem value="checkmark">Centang</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => onChange({ columns: columns.filter((item) => item.id !== column.id) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Align header</Label>
                {renderAlignControl(column, "headerAlign")}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Align isi</Label>
                {renderAlignControl(column, "bodyAlign")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InputSchemaPanel({
  schema,
  onAdd,
  onUpdate,
  onRemove,
}: {
  schema: TemplateInputSchema;
  onAdd: () => void;
  onUpdate: (fieldId: string, patch: Partial<TemplateInputField>) => void;
  onRemove: (fieldId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Field input user</p>
          <p className="text-xs text-muted-foreground">Ini yang nanti muncul saat registrasi memakai template.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Field
        </Button>
      </div>
      {schema.fields.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Belum ada field input.</div>
      )}
      {schema.fields.map((field) => (
        <div key={field.id} className="space-y-2 rounded-lg border border-border p-3">
          <Input value={field.label} onChange={(event) => onUpdate(field.id, { label: event.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input value={field.key} onChange={(event) => onUpdate(field.id, { key: event.target.value })} />
            <Select value={field.type} onValueChange={(type: TemplateInputField["type"]) => onUpdate(field.id, { type })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="textarea">Textarea</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="select">Select</SelectItem>
                <SelectItem value="file">File</SelectItem>
                <SelectItem value="table">Table</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/45 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Wajib diisi</span>
            <Switch checked={Boolean(field.required)} onCheckedChange={(required) => onUpdate(field.id, { required })} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => onRemove(field.id)}
          >
            <Trash2 className="h-4 w-4" />
            Hapus Field
          </Button>
        </div>
      ))}
    </div>
  );
}

function PageInspector({
  definition,
  onChange,
}: {
  definition: TemplateDefinition;
  onChange: (definition: TemplateDefinition) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Ukuran Kertas</Label>
        <Select value={definition.page.size} onValueChange={(size: "A4" | "F4") => onChange({ ...definition, page: { ...definition.page, size } })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A4">A4</SelectItem>
            <SelectItem value="F4">F4</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Orientasi</Label>
        <Select
          value={definition.page.orientation}
          onValueChange={(orientation: "portrait" | "landscape") => onChange({ ...definition, page: { ...definition.page, orientation } })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="portrait">Portrait</SelectItem>
            <SelectItem value="landscape">Landscape</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <NumberField label="Margin mm" value={definition.page.margin} onChange={(margin) => onChange({ ...definition, page: { ...definition.page, margin } })} />

      <div className="rounded-lg border border-border bg-muted/35 p-3">
        <p className="text-sm font-semibold">Catatan integrasi</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Template ini sudah siap menjadi sumber JSON native. Integrasi ke generator PDF produksi bisa membaca definisi yang sama agar Uji PDF, Buat Ulang PDF, dan dokumen baru konsisten.
        </p>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Input type="color" value={value === "transparent" ? "#ffffff" : value} onChange={(event) => onChange(event.target.value)} className="w-12 p-1" />
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  );
}

function validateDefinition(definition: TemplateDefinition) {
  const errors: string[] = [];
  if (!definition.elements.some((element) => element.type === "repeater_table")) {
    errors.push("Template belum memiliki tabel berulang. Tambahkan tabel jika dokumen memuat item 1, item 2, dan seterusnya.");
  }
  if (!definition.elements.some((element) => element.type === "signature_grid")) {
    errors.push("Template belum memiliki area tanda tangan.");
  }
  definition.elements.forEach((element) => {
    if (element.type === "repeater_table" && (!element.columns || element.columns.length === 0)) {
      errors.push(`Tabel "${element.label}" belum memiliki kolom.`);
    }
    if (element.type === "field" && !element.binding) {
      errors.push(`Field "${element.label}" belum memiliki binding data.`);
    }
  });
  return { errors };
}
