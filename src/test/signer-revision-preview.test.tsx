import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SignerRevisionSummary } from "@/components/surat/SignerRevisionSummary";
import { getRevisionItemChanges, type ActiveRevision } from "@/components/surat/revision-utils";

afterEach(cleanup);
describe("Signer revision evidence", () => {
  it("shows requested 5, approved 3 and the reason separately from a request for specifications", () => {
    render(<SignerRevisionSummary revision={{ reason:"Kebutuhan aktual hanya tiga unit.",changes:{
      signer_revision_required:true,item_revisions:[{index:0,nama_barang:"Komputer",action:"adjust",value_type:"quantity",
        nilai_diajukan:"5",nilai_disetujui:"3",alasan:"Kebutuhan aktual hanya tiga unit."}],
    } }} />);
    expect(screen.getByRole("columnheader",{name:"Diajukan"})).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"5"})).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"3"})).toBeInTheDocument();
    expect(screen.getByRole("cell",{name:"Kebutuhan aktual hanya tiga unit."})).toBeInTheDocument();
  });
  it("does not imply a rejection when requesting missing specifications", () => {
    render(<SignerRevisionSummary revision={{reason:"Lengkapi merek dan tipe barang.",changes:{requester_edit_required:true}}} />);
    expect(screen.getByRole("heading",{name:"Permintaan perbaikan"})).toBeInTheDocument();
    expect(screen.queryByText("Tidak disetujui")).not.toBeInTheDocument();
  });
  it("includes every changed quantity, price, description, unit, addition and deletion in a KEU proposal", () => {
    const revision:ActiveRevision={reason:"Sesuaikan kebutuhan dan harga.",changes:{keu10_finance_proposal:true,
      keu10_base:{document_snapshot:{form_input_data:{items:[
        {id:"a",keterangan:"Komputer awal",jumlah:5,satuan:"Unit",estimasi_harga_satuan:500000},
        {id:"b",keterangan:"Item dihapus",jumlah:1,satuan:"Unit",estimasi_harga_satuan:100000},
      ]}}},
      keu10_proposed_input:{items:[
        {id:"a",keterangan:"Komputer revisi",jumlah:3,satuan:"Paket",estimasi_harga_satuan:400000},
        {id:"c",keterangan:"Keyboard baru",jumlah:1,satuan:"Unit",estimasi_harga_satuan:50000},
      ]}}};
    expect(getRevisionItemChanges(revision)).toHaveLength(3);
    render(<SignerRevisionSummary revision={revision} />);
    const content=screen.getByRole("table").textContent;
    for(const expected of ["Jumlah: 5","Jumlah: 3","Rp 500.000","Rp 400.000","Rp 1.200.000",
      "Komputer awal","Komputer revisi","Satuan: Paket","Ditambahkan: Keyboard baru","Item dihapus","Tidak disetujui"]) {
      expect(content).toContain(expected);
    }
  });
});
