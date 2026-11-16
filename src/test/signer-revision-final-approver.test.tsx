import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SignerRevisionFinalApprover } from "@/components/surat/SignerRevisionFinalApprover";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
const candidates = [
  { id:"di",full_name:"Direktur Satu",job_title:"Direktur I",is_active:true },
  { id:"du",full_name:"Direktur Utama",job_title:"Direktur Utama",is_active:true },
];
const policy = {keu10_config:{disposition:"tactical_land"}};
const items = (amount: number) => [{nama_barang:"Biaya",jumlah:1,sat:"Unit",estimasi_harga_satuan:amount}];
function mount(amount:number,onChange: (id:string)=>void) {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  return render(<QueryClientProvider client={client}><SignerRevisionFinalApprover signatureId="signature" policy={{...policy,keu10_config:{version:1,disposition:"tactical_land",approval_threshold:2_000_000,purposes:[{code:"land",label:"Lahan"}]}}}
    signatures={[{step_order:4,user_id:"di"}]} items={items(amount)} value="di" onChange={onChange} /></QueryClientProvider>);
}
describe("signer revision final approver",()=>{
  it("replaces an ineligible director when the revised amount crosses the limit",async()=>{
    rpc.mockResolvedValue({data:candidates,error:null});
    const change=vi.fn(); mount(2_500_000,change);
    await waitFor(()=>expect(change).toHaveBeenLastCalledWith("du"));
    expect(rpc).toHaveBeenCalledWith("get_signer_revision_final_candidates",{p_sig_id:"signature"});
    expect(screen.getByRole("combobox")).toHaveTextContent("Direktur Utama");
  });
  it("fails closed when authoritative candidates cannot be loaded",async()=>{
    rpc.mockResolvedValue({data:null,error:new Error("Unavailable")});
    const change=vi.fn(); mount(1_000_000,change);
    expect(await screen.findByRole("alert")).toHaveTextContent("Penyetuju gagal dimuat");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(change).toHaveBeenLastCalledWith("");
  });
});
