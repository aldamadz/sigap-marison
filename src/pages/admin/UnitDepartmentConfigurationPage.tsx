import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Check, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Department = {
  id: string;
  name: string;
  code: string | null;
};

type UnitWorkflow = {
  id: string;
  membuat: string | null;
  memeriksa: string | null;
  menyetujui: string | null;
  is_cabang: boolean | null;
  master_forms?: { nama_form?: string | null } | null;
};

type Permission = {
  workflow_id: string;
  department_id: string;
};

export default function UnitDepartmentConfigurationPage() {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workflows, setWorkflows] = useState<UnitWorkflow[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [departmentResult, workflowResult, permissionResult] = await Promise.all([
        supabase.from("master_departments").select("id, name, code").order("name"),
        supabase
          .from("master_penggunaan_detail")
          .select("id, membuat, memeriksa, menyetujui, is_cabang, master_forms!fk_master_forms(nama_form)")
          .contains("request_categories", ["unit"])
          .order("created_at", { ascending: false }),
        supabase
          .from("workflow_allowed_departments")
          .select("workflow_id, department_id"),
      ]);

      if (departmentResult.error) throw departmentResult.error;
      if (workflowResult.error) throw workflowResult.error;
      if (permissionResult.error) throw permissionResult.error;

      const nextDepartments = departmentResult.data || [];
      setDepartments(nextDepartments);
      setWorkflows((workflowResult.data || []) as UnitWorkflow[]);
      setPermissions(permissionResult.data || []);
      setSelectedDepartmentId(current =>
        current && nextDepartments.some(item => item.id === current)
          ? current
          : nextDepartments[0]?.id || ""
      );
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Gagal Memuat Konfigurasi Unit",
        description: error instanceof Error ? error.message : "Data konfigurasi tidak dapat dimuat.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("unit-department-configuration")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_allowed_departments" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "master_penggunaan_detail" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const filteredDepartments = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return departments;
    return departments.filter(department =>
      `${department.code || ""} ${department.name}`.toLowerCase().includes(query)
    );
  }, [departments, search]);

  const selectedDepartment = departments.find(item => item.id === selectedDepartmentId);
  const allowedWorkflowIds = useMemo(
    () => new Set(
      permissions
        .filter(permission => permission.department_id === selectedDepartmentId)
        .map(permission => permission.workflow_id)
    ),
    [permissions, selectedDepartmentId]
  );

  const togglePermission = async (workflowId: string, enabled: boolean) => {
    if (!selectedDepartmentId) return;
    const key = `${selectedDepartmentId}:${workflowId}`;
    setSavingKey(key);
    try {
      if (enabled) {
        const { error } = await supabase
          .from("workflow_allowed_departments")
          .upsert({
            workflow_id: workflowId,
            department_id: selectedDepartmentId,
          });
        if (error) throw error;
        setPermissions(current => [
          ...current.filter(item => !(item.workflow_id === workflowId && item.department_id === selectedDepartmentId)),
          { workflow_id: workflowId, department_id: selectedDepartmentId },
        ]);
      } else {
        const { error } = await supabase
          .from("workflow_allowed_departments")
          .delete()
          .eq("workflow_id", workflowId)
          .eq("department_id", selectedDepartmentId);
        if (error) throw error;
        setPermissions(current => current.filter(
          item => !(item.workflow_id === workflowId && item.department_id === selectedDepartmentId)
        ));
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Konfigurasi Gagal Disimpan",
        description: error instanceof Error ? error.message : "Izin Unit tidak dapat diperbarui.",
      });
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Cari departemen..."
            className="pl-9"
          />
        </div>

        <div className="max-h-[500px] space-y-1 overflow-y-auto pr-1">
          {filteredDepartments.map(department => {
            const permissionCount = permissions.filter(
              permission => permission.department_id === department.id
            ).length;
            return (
              <button
                key={department.id}
                type="button"
                onClick={() => setSelectedDepartmentId(department.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                  selectedDepartmentId === department.id
                    ? "border-primary bg-primary/10"
                    : "border-transparent hover:border-border hover:bg-background"
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{department.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {department.code || "Tanpa kode"} · {permissionCount} matrix Unit
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="p-5 lg:p-6">
        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !selectedDepartment ? (
          <div className="flex min-h-[420px] items-center justify-center text-sm text-muted-foreground">
            Pilih departemen untuk mengatur akses Unit.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Izin Pengajuan Unit
                </p>
                <h3 className="mt-1 text-lg font-bold">{selectedDepartment.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aktifkan matrix yang boleh dipakai oleh akun dari departemen ini.
                </p>
              </div>
              <Badge variant="outline" className="w-fit">
                {allowedWorkflowIds.size} dari {workflows.length} aktif
              </Badge>
            </div>

            {workflows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Belum ada matrix Alur Persetujuan yang mendukung kategori Unit.
              </div>
            ) : (
              <div className="space-y-3">
                {workflows.map(workflow => {
                  const enabled = allowedWorkflowIds.has(workflow.id);
                  const key = `${selectedDepartmentId}:${workflow.id}`;
                  return (
                    <div
                      key={workflow.id}
                      className={cn(
                        "flex flex-col gap-4 rounded-lg border p-4 transition-colors sm:flex-row sm:items-center",
                        enabled ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold">
                            {workflow.master_forms?.nama_form || "Template belum ditentukan"}
                          </p>
                          <Badge variant="secondary" className="text-[9px] font-bold uppercase">
                            {workflow.is_cabang ? "Cabang" : "Pusat"}
                          </Badge>
                          {enabled && (
                            <Badge className="text-[9px] font-bold uppercase">
                              <Check className="mr-1 h-3 w-3" /> Diizinkan
                            </Badge>
                          )}
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                          {workflow.membuat || "-"} → {workflow.memeriksa || "-"} → {workflow.menyetujui || "-"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">
                          {savingKey === key ? "Menyimpan..." : enabled ? "Aktif" : "Nonaktif"}
                        </span>
                        <Switch
                          checked={enabled}
                          disabled={savingKey === key}
                          onCheckedChange={checked => togglePermission(workflow.id, checked)}
                          aria-label={`Izin Unit ${workflow.master_forms?.nama_form || workflow.id}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
