import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type {
  RecommendationAction,
  RecommendationAttachment,
  RecommendationDetail,
  RecommendationMultiDetail,
  RecommendationParentItem,
} from "@sigap/shared";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createRecommendationDetail,
  createRecommendationClientId,
  recommendationActionDescription,
  recommendationMultiDetailErrors,
} from "@/components/surat/recommendation-multi-detail";

type DirectoryRecord = {
  id: string;
  name?: string;
  full_name?: string;
  job_title?: string;
  office_id?: string;
  department_id?: string;
  kedudukan?: string;
};

type UploadSource = "upload" | "paste" | "drop";

type Props = {
  model: RecommendationMultiDetail;
  onChange: (model: RecommendationMultiDetail) => void;
  users: DirectoryRecord[];
  offices: DirectoryRecord[];
  departments: DirectoryRecord[];
  uploadingKey: string | null;
  onUpload: (parentId: string, detailId: string, files: File[], source: UploadSource) => Promise<void>;
  onDeleteAttachment: (parentId: string, detailId: string, attachment: RecommendationAttachment) => Promise<void>;
  onDeleteDetail: (parentId: string, detail: RecommendationDetail) => Promise<void>;
};

class RecommendationEditorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Recommendation multi-detail editor failed", error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="border-l-4 border-l-red-500 bg-red-500/5 p-4" role="alert">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">Editor rekomendasi perlu dimuat ulang</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Draft tetap tersimpan. Muat ulang editor untuk melanjutkan tanpa mengulang data sebelumnya.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => this.setState({ failed: false })}
          >
            Muat Ulang Editor
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ACTIONS: Array<{ value: RecommendationAction; label: string }> = [
  { value: "purchase_new", label: "Beli Baru" },
  { value: "replace", label: "Ganti Komponen" },
  { value: "service", label: "Servis" },
];

const updateParent = (
  model: RecommendationMultiDetail,
  parentId: string,
  updater: (parent: RecommendationParentItem) => RecommendationParentItem,
): RecommendationMultiDetail => ({
  ...model,
  items: model.items.map((parent) => parent.id === parentId ? updater(parent) : parent),
});

const updateDetail = (
  parent: RecommendationParentItem,
  detailId: string,
  updater: (detail: RecommendationDetail) => RecommendationDetail,
): RecommendationParentItem => ({
  ...parent,
  details: parent.details.map((detail) => detail.id === detailId ? updater(detail) : detail),
});

const attachmentMetadata = (attachment: RecommendationAttachment) => attachment.metadata || {};

function RecommendationMultiDetailEditorContent({
  model,
  onChange,
  users,
  offices,
  departments,
  uploadingKey,
  onUpload,
  onDeleteAttachment,
  onDeleteDetail,
}: Props) {
  const [activeParentId, setActiveParentId] = useState(model.items[0]?.id || "");
  const [picOpen, setPicOpen] = useState(false);
  const activeParent = model.items.find((parent) => parent.id === activeParentId) || model.items[0];
  const errors = recommendationMultiDetailErrors(model);
  const parentErrors = activeParent
    ? errors.filter((error) => error.startsWith(`Item ${activeParent.order + 1}`))
    : [];

  const officeNames = useMemo(() => new Map(offices.map((office) => [office.id, office.name || ""])), [offices]);
  const officePositions = useMemo(() => new Map(offices.map((office) => [office.id, office.kedudukan || ""])), [offices]);
  const departmentNames = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name || ""])),
    [departments],
  );

  if (!activeParent) return null;

  const setParent = (updater: (parent: RecommendationParentItem) => RecommendationParentItem) => {
    onChange(updateParent(model, activeParent.id, updater));
  };

  const setDetail = (detailId: string, updater: (detail: RecommendationDetail) => RecommendationDetail) => {
    setParent((parent) => updateDetail(parent, detailId, updater));
  };

  const selectPic = (user: DirectoryRecord) => {
    const officeName = officeNames.get(user.office_id || "") || "";
    const departmentName = departmentNames.get(user.department_id || "") || "";
    const location = officePositions.get(user.office_id || "") === "Pusat"
      ? departmentName
      : officeName || departmentName;
    setParent((parent) => ({
      ...parent,
      pic: user.full_name || user.name || "",
      location: location || parent.location,
      legacy_fields: { ...parent.legacy_fields, pic_user_id: user.id },
    }));
    setPicOpen(false);
  };

  const handleFiles = (detailId: string, files: FileList | File[], source: UploadSource) => {
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length > 0) void onUpload(activeParent.id, detailId, images, source);
  };

  return (
    <div className="space-y-4" data-testid="recommendation-multi-detail-editor">
      <div className="border-y border-border bg-muted/30 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Detail Rekomendasi per Item</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pecah satu item menjadi beberapa komponen atau spesifikasi bila diperlukan.
            </p>
          </div>
          <span className={cn(
            "text-xs font-semibold",
            errors.length === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
          )}>
            {errors.length === 0 ? "Semua item lengkap" : `${errors.length} data perlu dilengkapi`}
          </span>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {model.items.map((parent, index) => {
            const active = parent.id === activeParent.id;
            const incomplete = errors.some((error) => error.startsWith(`Item ${index + 1}`));
            return (
              <button
                key={parent.id}
                type="button"
                onClick={() => setActiveParentId(parent.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "min-w-[180px] rounded-md border px-3 py-2 text-left transition-colors",
                  active ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    !incomplete ? "bg-emerald-600 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}>
                    {!incomplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">{parent.applicant_original.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {parent.status === "not_recommended" ? "Tidak direkomendasikan" : `${parent.details.length} detail`}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className={cn(
        "border-l-4 px-4 py-1",
        activeParent.status === "not_recommended" ? "border-l-red-500" : "border-l-primary",
      )}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Item permohonan {activeParent.order + 1}</p>
            <h3 className="mt-1 text-base font-semibold text-foreground">{activeParent.applicant_original.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Jumlah {activeParent.applicant_original.quantity}
              {activeParent.applicant_original.notes ? ` · ${activeParent.applicant_original.notes}` : ""}
            </p>
          </div>
          <div className="inline-flex self-start rounded-md border border-border bg-background p-1">
            <button
              type="button"
              onClick={() => setParent((parent) => ({
                ...parent,
                status: "recommended",
                rejection_reason: "",
                details: parent.details.length ? parent.details : [createRecommendationDetail(parent)],
              }))}
              className={cn(
                "rounded px-3 py-2 text-xs font-semibold",
                activeParent.status === "recommended" ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              Direkomendasikan
            </button>
            <button
              type="button"
              onClick={() => setParent((parent) => ({ ...parent, status: "not_recommended" }))}
              className={cn(
                "rounded px-3 py-2 text-xs font-semibold",
                activeParent.status === "not_recommended" ? "bg-red-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              Tidak Direkomendasikan
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Lokasi *</Label>
            <Input
              value={activeParent.location}
              onChange={(event) => setParent((parent) => ({ ...parent, location: event.target.value }))}
              placeholder="Contoh: Kantor Pusat / Departemen PO"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">PIC *</Label>
            <Popover open={picOpen} onOpenChange={setPicOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-10 w-full justify-between font-normal">
                  <span className="truncate">{activeParent.pic || "Pilih PIC"}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cari nama PIC..." />
                  <CommandList className="max-h-[280px]">
                    <CommandEmpty>PIC tidak ditemukan.</CommandEmpty>
                    <CommandGroup>
                      {users.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.full_name || user.name || ""} ${user.job_title || ""}`}
                          onSelect={() => selectPic(user)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{user.full_name || user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{user.job_title || "Tanpa jabatan"}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {activeParent.status === "not_recommended" ? (
          <div className="mt-4 space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-4">
            <Label className="text-xs font-semibold text-red-800 dark:text-red-300">Alasan tidak direkomendasikan *</Label>
            <Textarea
              value={activeParent.rejection_reason}
              onChange={(event) => setParent((parent) => ({ ...parent, rejection_reason: event.target.value }))}
              placeholder="Jelaskan alasan agar pemohon memahami keputusan tim rekomendasi."
              className="min-h-24 bg-background"
            />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {[...activeParent.details].sort((a, b) => a.order - b.order).map((detail, detailIndex) => {
              const uploadId = `${activeParent.id}:${detail.id}`;
              const isUploading = uploadingKey === uploadId;
              return (
                <div key={detail.id} className="border-t border-border pt-5" data-testid={`recommendation-detail-${detail.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-primary">{activeParent.order + 1}.{detailIndex + 1}</p>
                      <p className="text-sm font-semibold text-foreground">Detail rekomendasi</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Naikkan detail"
                        disabled={detailIndex === 0}
                        onClick={() => setParent((parent) => {
                          const details = [...parent.details].sort((a, b) => a.order - b.order);
                          [details[detailIndex - 1], details[detailIndex]] = [details[detailIndex], details[detailIndex - 1]];
                          return { ...parent, details: details.map((item, order) => ({ ...item, order })) };
                        })}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Turunkan detail"
                        disabled={detailIndex === activeParent.details.length - 1}
                        onClick={() => setParent((parent) => {
                          const details = [...parent.details].sort((a, b) => a.order - b.order);
                          [details[detailIndex], details[detailIndex + 1]] = [details[detailIndex + 1], details[detailIndex]];
                          return { ...parent, details: details.map((item, order) => ({ ...item, order })) };
                        })}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title="Hapus detail"
                        aria-label={`Hapus detail ${activeParent.order + 1}.${detailIndex + 1}`}
                        disabled={activeParent.details.length === 1}
                        onClick={() => void onDeleteDetail(activeParent.id, detail)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_140px]">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Nama / spesifikasi *</Label>
                      <Input
                        value={detail.name}
                        onChange={(event) => setDetail(detail.id, (item) => ({ ...item, name: event.target.value }))}
                        placeholder="Contoh: Intel Core i7-14700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Jumlah *</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={detail.quantity}
                        onChange={(event) => setDetail(detail.id, (item) => ({ ...item, quantity: Math.max(1, Number(event.target.value) || 1) }))}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label className="text-xs font-semibold">Tindakan *</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {ACTIONS.map((action) => (
                        <button
                          key={action.value}
                          type="button"
                          onClick={() => setDetail(detail.id, (item) => ({
                            ...item,
                            action: action.value,
                            description: item.description_manually_edited ? item.description : recommendationActionDescription(action.value),
                          }))}
                          className={cn(
                            "min-h-10 rounded-md border px-2 text-xs font-semibold",
                            detail.action === action.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted",
                          )}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Uraian *</Label>
                      <Input
                        value={detail.description}
                        onChange={(event) => setDetail(detail.id, (item) => ({
                          ...item,
                          description: event.target.value,
                          description_manually_edited: true,
                        }))}
                        placeholder="Contoh: Pembelian baru / service adaptor / ganti unit"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Label className="text-xs font-semibold">Keterangan *</Label>
                    <Textarea
                      value={detail.notes}
                      onChange={(event) => setDetail(detail.id, (item) => ({ ...item, notes: event.target.value }))}
                      placeholder="Catatan pemeriksaan atau alasan pemilihan spesifikasi."
                      className="min-h-20"
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Link referensi</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetail(detail.id, (item) => ({
                            ...item,
                            reference_links: [...item.reference_links, {
                              id: createRecommendationClientId(),
                              order: item.reference_links.length,
                              url: "",
                            }],
                          }))}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Link
                        </Button>
                      </div>
                      {detail.reference_links.length === 0 && (
                        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Belum ada link referensi.</p>
                      )}
                      {detail.reference_links.map((link, linkIndex) => (
                        <div key={link.id} className="flex gap-2">
                          <div className="relative flex-1">
                            <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={link.url}
                              onChange={(event) => setDetail(detail.id, (item) => ({
                                ...item,
                                reference_links: item.reference_links.map((entry) => entry.id === link.id ? { ...entry, url: event.target.value } : entry),
                              }))}
                              className="pl-9"
                              placeholder={`https://... (${linkIndex + 1})`}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Hapus link ${linkIndex + 1}`}
                            onClick={() => setDetail(detail.id, (item) => ({
                              ...item,
                              reference_links: item.reference_links.filter((entry) => entry.id !== link.id).map((entry, order) => ({ ...entry, order })),
                            }))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <Label className="text-xs font-semibold">Lampiran gambar *</Label>
                      <div
                        onPaste={(event) => {
                          const files = Array.from(event.clipboardData.files || []);
                          if (files.some((file) => file.type.startsWith("image/"))) {
                            event.preventDefault();
                            handleFiles(detail.id, files, "paste");
                          }
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleFiles(detail.id, event.dataTransfer.files, "drop");
                        }}
                        className="rounded-md border border-dashed border-border bg-muted/20 p-3"
                      >
                        {detail.attachments.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {detail.attachments.map((attachment, imageIndex) => (
                              <div key={attachment.id} className="group relative overflow-hidden rounded-md border border-border bg-background">
                                {attachment.storage_path ? (
                                  <img
                                    src={attachment.storage_path}
                                    alt={`Lampiran gambar rekomendasi item ${activeParent.order + 1}`}
                                    className="aspect-square w-full object-contain"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="flex aspect-square items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                                )}
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="icon"
                                  aria-label={`Hapus lampiran gambar item ${activeParent.order + 1}`}
                                  className="absolute right-1 top-1 h-7 w-7"
                                  onClick={() => void onDeleteAttachment(activeParent.id, detail.id, attachment)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <p className="truncate border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
                                  {String(attachmentMetadata(attachment).file_name || attachment.caption || `Gambar ${imageIndex + 1}`)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center px-3 py-5 text-center">
                            {isUploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-primary" />}
                            <p className="mt-2 text-xs font-semibold">Tempel, tarik, atau pilih beberapa gambar</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">PDF akan menyusun maksimal 6 gambar per halaman.</p>
                          </div>
                        )}
                        <Input
                          id={`images-${detail.id}`}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          multiple
                          aria-label={`Pilih gambar item ${activeParent.order + 1}`}
                          className="hidden"
                          disabled={isUploading}
                          onChange={(event) => {
                            if (event.target.files) handleFiles(detail.id, event.target.files, "upload");
                            event.currentTarget.value = "";
                          }}
                        />
                        <label
                          htmlFor={`images-${detail.id}`}
                          className={cn(
                            "mt-3 flex min-h-10 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-muted",
                            isUploading && "pointer-events-none opacity-60",
                          )}
                        >
                          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                          Tambah Gambar
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              aria-label={`Tambah detail untuk item ${activeParent.order + 1}`}
              onClick={() => setParent((parent) => ({
                ...parent,
                details: [...parent.details, createRecommendationDetail(parent)],
              }))}
              className="w-full border-dashed"
            >
              <Plus className="mr-2 h-4 w-4" /> Tambah Detail pada {activeParent.applicant_original.name}
            </Button>
          </div>
        )}

        {parentErrors.length > 0 && (
          <div className="mt-4 border-t border-border pt-3" role="status">
            {parentErrors.slice(0, 3).map((error) => (
              <p key={error} className="text-xs text-amber-700 dark:text-amber-400">{error}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function RecommendationMultiDetailEditor(props: Props) {
  return (
    <RecommendationEditorBoundary>
      <RecommendationMultiDetailEditorContent {...props} />
    </RecommendationEditorBoundary>
  );
}
