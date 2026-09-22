import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { UsageModuleContext } from "../usage-contract";
import type { ProjectOption, ProjectRaw } from "@/components/surat/form/surat-form-types";
import { EMPTY_UNIT_AVAILABILITY, unitAvailabilityIssues } from "./unit-availability";

export function UnitContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  const { input, generatedNoSurat, externalRevision, setInputValue, requestExternalOptions } = ctx;
  const [externalProjects, setExternalProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    requestExternalOptions("marison_projects")
      .then(options => { if (!cancelled) setExternalProjects(options as ProjectOption[]); })
      .catch(err => { if (!cancelled) setProjectsError(err.message); })
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [requestExternalOptions]);

  const requestedProject = input.requested_project as (ProjectRaw & { value?: string; label?: string }) | undefined;
  const availability = ctx.unitAvailability ?? EMPTY_UNIT_AVAILABILITY;
  const isEditableRequesterRevision = Boolean(
    generatedNoSurat && externalRevision?.eventId && ctx.category === "unit",
  );
  const isNumberedContextLocked = Boolean(generatedNoSurat && !isEditableRequesterRevision);

  const handleExternalProjectChange = (value: string) => {
    const option = externalProjects.find(item => item.value === value);
    const project = option?.raw;
    if (!option || !project?.code) return;
    const reqProject = {
      value: option.value, label: option.label,
      id: project.id, code: project.code, name: project.name,
      branch: project.branch ?? null,
    };
    const count = Number(input.requested_unit_count || 0);
    setInputValue("requested_project", reqProject);
    setInputValue("unit_request_sentence", count > 0
      ? `Nama Barang: Permohonan Order Bangun SPK Pembangunan Rumah ${count} Unit, SAT: Unit, Jumlah: ${count}, Status: 2`
      : "");
  };

  const handleRequestedUnitCountChange = (val: string) => {
    const count = Math.max(Number(val || 0), 0);
    setInputValue("requested_unit_count", count || "");
    setInputValue("unit_request_sentence", requestedProject?.name && count > 0
      ? `Nama Barang: Permohonan Order Bangun SPK Pembangunan Rumah ${count} Unit, SAT: Unit, Jumlah: ${count}, Status: 2`
      : "");
  };

  const requestedCount = Number(input.requested_unit_count || 0);
  const blockingIssue = requestedProject?.code
    ? unitAvailabilityIssues(availability, requestedCount)[0]
    : undefined;

  return (
    <div id="unit-request-context" className="scroll-mt-24 space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-5 md:p-6">
      {isEditableRequesterRevision && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-900 dark:text-amber-100">
          <p className="text-sm font-semibold">Perbaiki Proyek dan Jumlah Unit</p>
          <p className="mt-1 text-xs leading-relaxed">
            {externalRevision?.reason?.trim()
              || "Pengajuan dikembalikan agar proyek atau jumlah unit dapat disesuaikan."}
          </p>
          <p className="mt-2 text-xs font-medium">
            Kapasitas proyek akan diperiksa ulang sebelum perbaikan dapat dikirim.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-primary">Pengajuan Unit</p>
        <p className="text-xs font-medium text-muted-foreground">
          Pemohon hanya mengajukan jumlah unit. Perencanaan akan memilih unit spesifik saat approval.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="unit-request-project" className="text-xs font-semibold text-muted-foreground">Proyek</Label>
          <Select
            value={requestedProject?.value || requestedProject?.id || ""}
            onValueChange={handleExternalProjectChange}
            disabled={projectsLoading || isNumberedContextLocked}
          >
            <SelectTrigger id="unit-request-project" className="h-12 bg-background/70 text-sm">
              <SelectValue placeholder={projectsLoading ? "Memuat proyek..." : "Pilih proyek"} />
            </SelectTrigger>
            <SelectContent>
              {externalProjects.map(project => (
                <SelectItem key={project.value} value={project.value} disabled={!project.raw?.code}>
                  {project.label}{project.raw?.branch?.name ? ` - ${project.raw.branch.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {projectsError && <p className="text-[10px] font-semibold text-destructive">{projectsError}</p>}
          {requestedProject?.code ? (
            <p className={cn(
              "text-[11px] font-medium",
              availability.error ? "text-destructive" : "text-muted-foreground"
            )}>
              {availability.loading
                ? "Memuat jumlah unit tersedia..."
                : availability.error
                  ? "Jumlah unit tersedia belum termuat."
                  : `Kapasitas tersedia saat ini: ${availability.count ?? 0} unit.`}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-muted-foreground">Pilih proyek untuk melihat jumlah unit tersedia.</p>
          )}
          {blockingIssue && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              {blockingIssue.description || blockingIssue.title}. Pengajuan tidak dapat dilanjutkan sampai kapasitas unit valid untuk proyek ini.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="unit-request-count" className="text-xs font-semibold text-muted-foreground">Jumlah Unit Diajukan</Label>
          <Input
            id="unit-request-count"
            type="number"
            min={1}
            max={availability.count ?? undefined}
            value={String(input.requested_unit_count ?? "")}
            onChange={(e) => handleRequestedUnitCountChange(e.target.value)}
            disabled={isNumberedContextLocked}
            className="h-12 bg-background/70 text-sm"
            placeholder="Contoh: 10"
          />
        </div>
      </div>
    </div>
  );
}
