import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignerRevisionSummary } from "@/components/surat/SignerRevisionSummary";
import { revisionSnapshotForDisplay } from "@/services/revision-evidence.service";
import { summarizeRequesterRevision } from "@/lib/requester-revision-summary";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/services/revision-evidence.service", async (original) => ({ ...await original<typeof import("@/services/revision-evidence.service")>(), getRevisionEvidence: load }));
const history = { id:"history",revision_event_id:"event",requested_by:"actor",submitted_by:"owner",submitted_at:"2026-10-14T08:00:00Z",reason:"Detail spesifikasi",
  before_snapshot:{document:{created_by:"owner",form_input_data:{items:[{id:"a",nama_barang:"Komputer",jumlah:5,status:1}]}},attachments:[{file_url:"old",file_name:"Foto lama.pdf"}]},
  after_snapshot:{document:{created_by:"owner",requester_snapshot:{full_name:"Pemohon Contoh"},form_input_data:{items:[{id:"a",nama_barang:"Komputer Baru",jumlah:3,status:2}]}},attachments:[{file_url:"new",file_name:"RAB.pdf"}]},
};
describe("named revision evidence",()=>{
  it("shows actual actor and complex recorded before/after changes",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"document",actor_id:"actor",actor_name:"Pemeriksa Contoh"}],histories:[history]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Lengkapi spesifikasi",changes:{signer_revision_required:true}}} />);
    expect(await screen.findByRole("heading",{name:"Revisi oleh Pemeriksa Contoh"})).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Perbaikan oleh Pemohon Contoh"})).toBeInTheDocument();
    for(const name of ["Komputer Baru","Foto lama.pdf","RAB.pdf"]) expect(screen.getAllByText(new RegExp(name.replace('.','\\.'))).length).toBeGreaterThan(0);
    expect(screen.queryByText("Revisi oleh Penandatangan")).not.toBeInTheDocument();
  });
  it("does not accept the actor from another document",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"other",actor_id:"actor",actor_name:"Nama asing"}],histories:[]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Koreksi",changes:{signer_revision_required:true}}} />);
    expect(await screen.findByRole("heading",{name:"Revisi"})).toBeInTheDocument();
    expect(screen.queryByText(/Nama asing/)).not.toBeInTheDocument();
  });
  it("retains values for added/deleted items and ignores snapshot internals",()=>{
    const before=revisionSnapshotForDisplay({document:{created_by:"owner",form_input_data:{items:[{id:"old",nama_barang:"Dihapus",jumlah:5,status:1}]}},attachments:[]});
    const after=revisionSnapshotForDisplay({document:{created_by:"owner",form_input_data:{items:[{id:"new",nama_barang:"Ditambahkan",jumlah:3,status:2}]}},attachments:[]});
    const summary=summarizeRequesterRevision(before,after);
    expect(summary.items.find(row=>row.action==="deleted")?.fields.some(field=>field.field==="jumlah"&&field.before==="5")).toBe(true);
    expect(summary.items.find(row=>row.action==="added")?.fields.some(field=>field.field==="jumlah"&&field.after==="3")).toBe(true);
    expect(summary.fields.some(field=>field.field==="created_by")).toBe(false);
  });
});
