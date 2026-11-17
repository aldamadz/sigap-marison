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
  it("attributes direct examination edits to the examiner without a manager approval or requester confirmation",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"document",actor_id:"actor",actor_name:"Usman Huda",changes:{examiner_direct_revision:true}}],
      histories:[{...history,submitted_by:"actor",requester_note:null}]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Jumlah stok diperbarui",changes:{examiner_direct_revision:true}}} />);
    expect(await screen.findByRole("heading",{name:"Direvisi oleh pemeriksa: Usman Huda",level:4})).toBeInTheDocument();
    expect(screen.getByText(/Pemeriksaan selesai; persetujuan tetap oleh penandatangan/)).toBeInTheDocument();
    expect(screen.queryByText(/Dikonfirmasi|Direvisi dan disetujui|Diperbaiki oleh Pemohon/)).not.toBeInTheDocument();
  });
  it("keeps the BM as author of an older proposal when the current revision is direct approval",async()=>{
    load.mockResolvedValue({events:[
      {id:"event",surat_id:"document",actor_id:"actor",actor_name:"BM Contoh",changes:{signer_full_proposal:true,signer_revision_required:true,requester_edit_required:false}},
      {id:"latest",surat_id:"document",actor_id:"actor",actor_name:"BM Contoh",changes:{signer_direct_approval:true}},
    ],histories:[history,{...history,id:"latest-history",revision_event_id:"latest",submitted_by:"actor",requester_note:null}]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"latest",reason:"Perubahan terbaru",changes:{signer_direct_approval:true}}} />);
    expect(await screen.findByRole("heading",{name:"Direvisi oleh BM Contoh",level:4})).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Direvisi dan disetujui oleh BM Contoh",level:4})).toBeInTheDocument();
    expect(screen.queryByRole("heading",{name:/oleh Pemohon Contoh/})).not.toBeInTheDocument();
    expect(screen.queryByText(/Dikonfirmasi oleh/)).not.toBeInTheDocument();
    expect(screen.getByText(/Dikirim kembali oleh pemohon: Pemohon Contoh/)).toBeInTheDocument();
  });
  it("retains genuine requester-authored repairs",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"document",actor_id:"actor",actor_name:"Pemeriksa Contoh",changes:{requester_edit_required:true}}],histories:[history]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Pemohon memperbaiki data"}} />);
    expect(await screen.findByRole("heading",{name:"Diperbaiki oleh Pemohon Contoh",level:4})).toBeInTheDocument();
  });
  it("does not attribute a historical edit using an event from another document",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"other",actor_id:"actor",actor_name:"Nama asing",changes:{signer_full_proposal:true}}],histories:[history]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Perbaikan"}} />);
    expect(await screen.findByRole("heading",{name:"Perbaikan pengajuan",level:4})).toBeInTheDocument();
    expect(screen.queryByText(/Nama asing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading",{name:/oleh Pemohon Contoh/})).not.toBeInTheDocument();
  });
  it("attributes direct edits to the signer without claiming requester confirmation",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"document",actor_id:"actor",actor_name:"Pemeriksa Contoh",changes:{signer_direct_approval:true}}],
      histories:[{...history,submitted_by:"actor",requester_note:null}]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Spesifikasi disesuaikan",changes:{signer_direct_approval:true}}} />);
    expect(await screen.findByRole("heading",{name:"Direvisi dan disetujui oleh Pemeriksa Contoh",level:4})).toBeInTheDocument();
    expect(screen.getByText("Pemohon diberi tahu; konfirmasi tidak diperlukan.")).toBeInTheDocument();
    expect(screen.queryByText(/Dikonfirmasi oleh|Diminta oleh|Perbaikan oleh Pemohon Contoh/)).not.toBeInTheDocument();
  });
  it("shows actual actor and complex recorded before/after changes",async()=>{
    load.mockResolvedValue({events:[{id:"event",surat_id:"document",actor_id:"actor",actor_name:"Pemeriksa Contoh"}],histories:[history]});
    render(<SignerRevisionSummary suratId="document" revision={{event_id:"event",reason:"Lengkapi spesifikasi",changes:{signer_revision_required:true}}} />);
    expect(await screen.findByRole("heading",{name:"Revisi oleh Pemeriksa Contoh"})).toBeInTheDocument();
    expect(screen.getByRole("heading",{name:"Perbaikan pengajuan",level:4})).toBeInTheDocument();
    expect(screen.getByText("Dikirim oleh pemohon: Pemohon Contoh.")).toBeInTheDocument();
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
