import { CircleCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  VERIFIER_ADDITIONAL_ATTACHMENT_KEY,
  validateOptionalAttachmentFiles,
} from "@/lib/optional-surat-attachments";
import { cn } from "@/lib/utils";

export interface ApprovalAttachmentRequirement {
  requirement_key: string;
  label?: string;
  is_required?: boolean;
  allow_multiple?: boolean;
  max_files?: number;
  allowed_types?: string[];
  max_size_bytes?: number;
}

interface ExistingAttachment {
  id?: string;
  file_url?: string;
  file_name?: string;
}

interface Props {
  requirement: ApprovalAttachmentRequirement;
  files: File[];
  existingFiles: ExistingAttachment[];
  disabled: boolean;
  onChange: (files: File[]) => void;
  onError: (message: string) => void;
}

function sameFile(left: File, right: File) {
  return left.name === right.name && left.size === right.size &&
    left.type === right.type && left.lastModified === right.lastModified;
}

export function ApprovalAttachmentPicker({
  requirement, files, existingFiles, disabled, onChange, onError,
}: Props) {
  const label = requirement.label || requirement.requirement_key;
  const optional = requirement.requirement_key === VERIFIER_ADDITIONAL_ATTACHMENT_KEY;
  const maximum = Number(requirement.max_files || 1);
  const multiple = Boolean(requirement.allow_multiple || maximum > 1);
  // Configured attachments replace the old set on save; optional evidence appends.
  const usedSlots = files.length + (optional ? existingFiles.length : 0);
  const satisfied = files.length > 0 || existingFiles.length > 0;
  const displayedExistingFiles = optional || files.length === 0 ? existingFiles : [];

  const addFiles = (selected: File[]) => {
    if (selected.length === 0) return;
    try {
      const next = multiple ? [...files] : [];
      for (const file of selected) {
        if (!next.some(queued => sameFile(queued, file))) next.push(file);
      }
      if (optional) validateOptionalAttachmentFiles(next);
      if (next.length + (optional ? existingFiles.length : 0) > maximum) {
        throw new Error(`Maksimal ${maximum} file untuk ${label}.`);
      }
      for (const file of selected) {
        if (requirement.allowed_types?.length && file.type && !requirement.allowed_types.includes(file.type)) {
          throw new Error(`Tipe file ${file.name} tidak diizinkan.`);
        }
        if (requirement.max_size_bytes && file.size > requirement.max_size_bytes) {
          throw new Error(`Ukuran file ${file.name} melebihi batas.`);
        }
      }
      onChange(next);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Lampiran tidak valid.");
    }
  };

  return (
    <div className={cn("rounded-lg border p-3", satisfied ? "border-emerald-500/30 bg-emerald-500/5" : "border-border")}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {label}{requirement.is_required && <span className="ml-1 text-destructive">*</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {files.length
              ? `${files.length} file siap diunggah${optional ? "" : "; mengganti lampiran lama"}`
              : existingFiles.length ? `${existingFiles.length} file sudah tersimpan` : "Belum ada file"}
          </p>
          <p className="text-xs text-muted-foreground">Maksimal {maximum} file</p>
        </div>
        {satisfied && <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" />}
      </div>
      {displayedExistingFiles.map((file, index) => (
        <div key={file.id || file.file_url || index} className="mb-2 flex justify-between gap-2 rounded bg-background px-2 py-2 text-xs">
          <span className="min-w-0 truncate">{file.file_name || "Lampiran tersimpan"}</span>
          <span className="shrink-0 text-muted-foreground">Tersimpan</span>
        </div>
      ))}
      {files.map((file, index) => (
        <div key={index} className="mb-2 flex items-center justify-between gap-2 rounded bg-background px-2 py-1 text-xs">
          <div className="min-w-0">
            <p className="truncate">{file.name}</p>
            <p className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <Button
            type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0"
            disabled={disabled} aria-label={`Hapus ${file.name}`} title={`Hapus ${file.name}`}
            onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Input
        type="file" aria-label={`Unggah ${label}`} multiple={multiple}
        accept={requirement.allowed_types?.join(",")} className="min-h-11 text-xs"
        disabled={disabled || (multiple && usedSlots >= maximum) || (optional && usedSlots >= maximum)}
        onChange={event => {
          const selected = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          addFiles(selected);
        }}
      />
    </div>
  );
}
