import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SignerAssignment } from "@/components/surat/form/surat-form-types";
import {
  addSigner, canMoveSigner, excludedSignerSteps, MAX_SUBMISSION_SIGNERS, moveSigner, removeSigner, signerRemovalIssue,
  SIGNER_GROUPS, signerGroup,
} from "@/features/surat/registration/lib/additional-signers";
import { useAppDialog } from "@/components/app/AppDialogProvider";

type Props = {
  signers: SignerAssignment[];
  onChange: (signers: SignerAssignment[]) => void;
  editingEnabled: boolean;
  onRestore?: () => void;
  protectedStepIds?: string[];
  children: (signer: SignerAssignment, index: number) => ReactNode;
};

export function SignerPlanEditor({ signers, onChange, editingEnabled, onRestore, protectedStepIds = [], children }: Props) {
  const dialog = useAppDialog();
  const remove = async (index: number) => {
    if (!(await dialog.confirm({ title: "Hapus penandatangan?", description: `${signers[index].label_jabatan} tidak akan mengikuti persetujuan pengajuan ini.`, confirmText: "Hapus penandatangan" }))) return;
    onChange(removeSigner(signers, index));
  };
  return <div className="mx-auto max-w-3xl space-y-6">
    {editingEnabled && onRestore && excludedSignerSteps(signers).length > 0 && <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" onClick={onRestore}><RotateCcw className="mr-1 h-4 w-4" />Pulihkan penandatangan bawaan</Button>
    </div>}
    {SIGNER_GROUPS.map(group => <section key={group} aria-label={`Penandatangan ${group}`} className="space-y-3">
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-sm font-semibold capitalize">{group}</h3>
        {editingEnabled && <Button type="button" variant="outline" size="sm"
          disabled={signers.length >= MAX_SUBMISSION_SIGNERS}
          onClick={() => onChange(addSigner(signers, group, crypto.randomUUID()))}
          aria-label={`Tambah penandatangan ${group}`}>
          <Plus className="mr-1 h-4 w-4" />Tambah penandatangan
        </Button>}
      </div>
      {signers.map((signer, index) => signerGroup(signer) !== group ? null : <div
        key={signer.client_id || signer.form_usage_step_id || index}
        className="flex items-start gap-3 rounded-lg border bg-card p-3 sm:p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
          {signer.step_order}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-primary">{signer.label_jabatan}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {signer.is_additional === true ? "Tambahan" : "Bawaan kegunaan"}
            </span>
          </div>
          {children(signer, index)}
          {editingEnabled && <div className="flex justify-end gap-1">
            {([-1, 1] as const).map(direction => <Button key={direction} type="button" variant="ghost" size="icon"
              className="h-8 w-8" disabled={!canMoveSigner(signers, index, direction)}
              title={direction === -1 ? "Pindahkan ke atas" : "Pindahkan ke bawah"}
              aria-label={`${direction === -1 ? "Pindahkan ke atas" : "Pindahkan ke bawah"} tahap ${signer.step_order}`}
              onClick={() => onChange(moveSigner(signers, index, direction))}>
              {direction === -1 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </Button>)}
            <Button type="button" variant="ghost" size="icon"
              disabled={Boolean(signerRemovalIssue(signers, index)) || protectedStepIds.includes(signer.form_usage_step_id || "")}
              className="h-8 w-8 text-destructive" title={protectedStepIds.includes(signer.form_usage_step_id || "")
                ? "Langkah pemeriksaan khusus tetap diperlukan." : signerRemovalIssue(signers, index) || "Hapus penandatangan"}
              aria-label={`Hapus penandatangan tahap ${signer.step_order}`}
              onClick={() => void remove(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>}
        </div>
      </div>)}
    </section>)}
  </div>;
}
