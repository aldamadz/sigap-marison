import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Keu10RequesterRevision } from "@/components/surat/Keu10RequesterRevision";

const mocks = vi.hoisted(() => ({
  accept: vi.fn().mockResolvedValue(true),
  profiles: [
    { id: "di", full_name: "Direktur Pertama", job_title: "Direktur I", is_active: true, department_id: "dir", kedudukan: "Pusat" },
    { id: "du", full_name: "Direktur Utama", job_title: "Direktur Utama", is_active: true, department_id: "dir", kedudukan: "Pusat" },
  ],
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.profiles, isFetching: false, isError: false }),
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: () => Promise<unknown>; onSuccess: () => Promise<void> }) => ({
    isPending: false, mutate: () => mutationFn().then(onSuccess),
  }),
}));
vi.mock("@/services/surat.service", () => ({ suratService: { acceptKeu10RequesterRevision: mocks.accept } }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

const items = (price: number) => [{ id: "a", keterangan: "Pengamanan lahan", jumlah: 1, satuan: "Paket", estimasi_harga_satuan: price }];
const policy = {
  keu10_config: { version: 1, disposition: "tactical_land", purposes: [{ code: "p", label: "Pengamanan" }], approval_threshold: 2_000_000 },
  keu10_steps: [{ id: "final", role_name: "menyetujui", signer_department_id: "dir", candidate_user_ids: ["di", "du"] }],
};
const signatures = [{ form_usage_step_id: "final", user_id: "di" }];

describe("KEU10 requester revision", () => {
  beforeEach(() => vi.clearAllMocks());
  it("confirms Finance's immutable proposal and reroutes above threshold", async () => {
    render(<Keu10RequesterRevision eventId="event" input={{ items: items(1_000_000) }}
      changes={{ keu10_finance_proposal: true, keu10_proposed_input: { items: items(3_000_000) } }}
      policy={policy} signatures={signatures} onSuccess={async () => {}} />);
    expect(screen.queryByLabelText("Jumlah")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Direktur Utama");
    fireEvent.click(screen.getByRole("button", { name: "Terima koreksi dan lanjutkan" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("event", { items: undefined, note: "", finalSignerId: "du" }));
  });
  it("allows ordinary return edits, requires a note and recomputes the final signer", async () => {
    render(<Keu10RequesterRevision eventId="event" input={{ items: items(1_500_000) }} changes={{}}
      policy={policy} signatures={signatures} onSuccess={async () => {}} />);
    const save = screen.getByRole("button", { name: "Simpan perbaikan dan lanjutkan" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Jumlah"), { target: { value: "2" } });
    expect(screen.getByRole("combobox")).toHaveTextContent("Direktur Utama");
    fireEvent.change(screen.getByLabelText("Catatan perbaikan"), { target: { value: "Koreksi jumlah" } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("event", expect.objectContaining({
      finalSignerId: "du", items: [expect.objectContaining({ jumlah: "2" })], note: "Koreksi jumlah",
    })));
  });
  it("fails closed when the frozen route has no eligible final signer", () => {
    render(<Keu10RequesterRevision eventId="event" input={{ items: items(1_000_000) }} changes={{}}
      policy={{ ...policy, keu10_steps: [] }} signatures={[]} onSuccess={async () => {}} />);
    // No frozen candidates may be considered even if a cached directory is available.
    expect(screen.getByRole("button", { name: "Simpan perbaikan dan lanjutkan" })).toBeDisabled();
  });
});
