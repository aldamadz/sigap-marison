import { useId } from "react";
import {
  summarizeRequesterRevision,
  type RequesterRevisionFieldChange,
  type RequesterRevisionSnapshot,
} from "@/lib/requester-revision-summary";

export interface RequesterRevisionSummaryProps {
  baseline: RequesterRevisionSnapshot;
  current: RequesterRevisionSnapshot;
  showNoChanges?: boolean;
}

function FieldChange({ field }: { field: RequesterRevisionFieldChange }) {
  return <span><span className="font-medium">{field.label}:</span> {field.before} menjadi {field.after}</span>;
}

export function RequesterRevisionSummary({ baseline, current, showNoChanges = false }: RequesterRevisionSummaryProps) {
  const headingId = useId();
  const summary = summarizeRequesterRevision(baseline, current);
  if (!summary.hasChanges && !showNoChanges) return null;
  const actions = { added: "Ditambahkan", changed: "Diubah", deleted: "Dihapus", removed: "Dihapus" };
  const { counts } = summary;
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 border-t py-4 text-sm [overflow-wrap:anywhere]">
      <h3 id={headingId} className="font-semibold text-foreground">Ringkasan perubahan</h3>
      {!summary.hasChanges ? <p className="text-muted-foreground">Belum ada perubahan data atau lampiran.</p> : <>
        {counts.fields > 0 && <div className="space-y-1">
          <h4 className="font-medium">Data surat ({counts.fields} diubah)</h4>
          <ul className="space-y-1 text-muted-foreground">
            {summary.fields.map((field, index) => <li key={`${field.field}-${index}`}><FieldChange field={field} /></li>)}
          </ul>
          {summary.omitted.fields > 0 && <p className="text-muted-foreground">{summary.omitted.fields} perubahan data lainnya tidak ditampilkan.</p>}
        </div>}
        {counts.itemsAdded + counts.itemsChanged + counts.itemsDeleted > 0 && <div className="space-y-1">
          <h4 className="font-medium">Item: {counts.itemsAdded} ditambahkan, {counts.itemsChanged} diubah, {counts.itemsDeleted} dihapus</h4>
          <ul className="space-y-2">
            {summary.items.map(item => <li key={`${item.action}-${item.beforeIndex ?? "new"}-${item.afterIndex ?? "deleted"}`}>
              <p className="font-medium">{actions[item.action]}: {item.name}</p>
              {item.fields.map((field, index) => <p key={`${field.field}-${index}`} className="text-muted-foreground"><FieldChange field={field} /></p>)}
              {item.omittedFields > 0 && <p className="text-muted-foreground">{item.omittedFields} perubahan kolom lainnya tidak ditampilkan.</p>}
            </li>)}
          </ul>
          {summary.omitted.items > 0 && <p className="text-muted-foreground">{summary.omitted.items} perubahan item lainnya tidak ditampilkan.</p>}
        </div>}
        {counts.attachmentsAdded + counts.attachmentsRemoved > 0 && <div className="space-y-1">
          <h4 className="font-medium">Lampiran: {counts.attachmentsAdded} ditambahkan, {counts.attachmentsRemoved} dihapus</h4>
          <ul className="space-y-1 text-muted-foreground">
            {summary.attachments.map((file, index) => <li key={`${file.action}-${index}`}>
              {actions[file.action]}: {file.name}{file.requirementKey ? ` (${file.requirementKey})` : ""}
            </li>)}
          </ul>
          {summary.omitted.attachments > 0 && <p className="text-muted-foreground">{summary.omitted.attachments} perubahan lampiran lainnya tidak ditampilkan.</p>}
        </div>}
      </>}
    </section>
  );
}
