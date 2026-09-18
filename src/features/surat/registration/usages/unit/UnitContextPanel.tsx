import React, { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { UsageModuleContext } from "../usage-contract";
import type { ProjectOption, ProjectRaw } from "@/components/surat/form/surat-form-types";

export function UnitContextPanel({ ctx }: { ctx: UsageModuleContext }) {
  const { input, generatedNoSurat, externalRevision, setInputValue, requestExternalOptions } = ctx;
  const [externalProjects, setExternalProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  const [projectUnitAvailability, setProjectUnitAvailability] = useState<{
    loading: boolean;
    count: number | null;
    error: string | null;
  }>({ loading: false, count: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    requestExternalOptions("marison_projects")
      .then(options => { if (!cancelled) setExternalProjects(options as ProjectOption[]); })
      .catch(err => { if (!cancelled) setProjectsError(err.message); })
      .finally(() => { if (!cancelled) setProjectsLoading(false); });
    return () => { cancelled = true; };
  }, [requestExternalOptions]);

  const requestedProject = input.requested_project as ProjectRaw | undefined;
  const projectId = String(requestedProject?.id || "").trim();

  useEffect(() => {
    if (!projectId) {
      setProjectUnitAvailability({ loading: false, count: null, error: null });
      return;
    }
    let cancelled = false;
    setProjectUnitAvailability({ loading: true, count: null, error: null });
    requestExternalOptions("marison_units_by_project", {
      project_id: projectId,
      requested_project: requestedProject,
    })
      .then(options => { if (!cancelled) setProjectUnitAvailability({ loading: false, count: options.length, error: null }); })
      .catch(err => { if (!cancelled) setProjectUnitAvailability({ loading: false, count: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [projectId, requestedProject, requestExternalOptions]);

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
  const availableCount = Number(projectUnitAvailability.count ?? 0);
  const exceedsAvailability = requestedProject?.code && projectUnitAvailability.count != null && requestedCount > availableCount;

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-5 md:p-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-primary">Pengajuan Unit</p>
        <p className="text-xs font-medium text-muted-foreground">
          Pemohon hanya mengajukan jumlah unit. Perencanaan akan memilih unit spesifik saat approval.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">Proyek</Label>
          <Select
            value={(input.requested_project as { value?: string } | undefined)?.value || ""}
            onValueChange={handleExternalProjectChange}
            disabled={projectsLoading || !!generatedNoSurat}
          >
            <SelectTrigger className="h-12 bg-background/70 text-sm">
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
              projectUnitAvailability.error ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
            )}>
              {projectUnitAvailability.loading
                ? "Memuat jumlah unit tersedia..."
                : projectUnitAvailability.error
                  ? "Jumlah unit tersedia belum termuat."
                  : `Kapasitas tersedia saat ini: ${projectUnitAvailability.count ?? 0} unit.`}
            </p>
          ) : (
            <p className="text-[11px] font-medium text-muted-foreground">Pilih proyek untuk melihat jumlah unit tersedia.</p>
          )}
          {exceedsAvailability && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Jumlah yang diajukan melebihi kapasitas unit yang sedang termuat. Pengajuan tetap bisa dilanjutkan, tetapi tim pemeriksa perlu menyesuaikan alokasi.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground">Jumlah Unit Diajukan</Label>
          <Input
            type="number"
            min={1}
            value={String(input.requested_unit_count ?? "")}
            onChange={(e) => handleRequestedUnitCountChange(e.target.value)}
            disabled={!!generatedNoSurat && !(externalRevision && ctx.category === "unit")}
            className="h-12 bg-background/70 text-sm"
            placeholder="Contoh: 10"
          />
        </div>
      </div>
    </div>
  );
}
