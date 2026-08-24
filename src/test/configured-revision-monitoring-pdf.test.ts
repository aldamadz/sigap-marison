import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const usagePage = read("src/pages/admin/FormUsageManagementPage.tsx");
const monitoringPage = read("src/pages/surat/MonitoringPage.tsx");
const monitoringService = read("src/services/surat-monitoring.service.ts");
const suratForm = read("src/components/surat/SuratForm.tsx");
const suratService = read("src/services/surat.service.ts");
const inboxPage = read("src/pages/surat/InboxPage.tsx");
const migration = read(
  "supabase/migrations/20260824100000_configurable_external_revision_and_proactive_pdf.sql",
);

describe("configured external revision routing", () => {
  it("persists recipient and approval restart policy in usage and document snapshots", () => {
    expect(usagePage).toContain("external_revision_policy: formData.external_revision_policy");
    expect(usagePage).toContain("Perbaikan dikembalikan kepada");
    expect(usagePage).toContain("Tanda tangan ulang dimulai dari");
    expect(suratForm).toContain("external_revision_policy");
    expect(suratService).toContain("external_revision_policy: configContext.usage?.external_revision_policy");
  });

  it("routes to an active configured signer and restarts only the configured suffix", () => {
    expect(migration).toContain("v_surat.policy_snapshot->'external_revision_policy'");
    expect(migration).toContain("profile.is_active is true");
    expect(migration).toContain("current_signature.step_order < v_restart_step");
    expect(migration).toContain("step_order >= v_restart_step");
    expect(migration).toContain("coalesce((v_result->>'idempotent')::boolean, false) is true");
    expect(inboxPage).toContain("approval revisi dimulai sesuai konfigurasi kegunaan");
  });
});

describe("monitoring detail readiness", () => {
  it("keeps an immutable selected ID and rejects stale detail responses", () => {
    expect(monitoringPage).toContain('const [selectedSuratId, setSelectedSuratId] = useState("")');
    expect(monitoringPage).toContain("selectedDetail?.id === selectedSuratId");
    expect(monitoringPage).toContain("queryFn: ({ signal }) => suratMonitoringService.getDetail(selectedSuratId, signal)");
    expect(monitoringService).toContain("query = query.abortSignal(signal)");
  });

  it("shows deterministic loading, retry, and error states without a page refresh", () => {
    expect(monitoringPage).toContain("Memuat detail pengajuan...");
    expect(monitoringPage).toContain("Detail pengajuan gagal dimuat");
    expect(monitoringPage).toContain("void refetchDetail()");
    expect(monitoringPage).toContain("retry: 2");
  });
});

describe("proactive native PDF generation", () => {
  it("queues native PDFs on registration and signed-step transitions", () => {
    expect(migration).toContain("enqueue_native_document_pdf_for_registration");
    expect(migration).toContain("enqueue_native_document_pdf_for_signature");
    expect(migration).toContain("after insert on public.surat_registrasi");
    expect(migration).toContain("after update of is_signed on public.surat_signatures");
  });

  it("deduplicates jobs and leaves recommendation PDFs on their canonical pipeline", () => {
    expect(migration).toContain("job.status in ('queued', 'processing', 'done')");
    expect(migration).toContain("linked_parent_surat_id");
    expect(migration).toContain("link.link_type = 'recommendation'");
  });
});
