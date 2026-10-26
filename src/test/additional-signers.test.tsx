import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SignerPlanEditor } from "@/components/surat/SignerPlanEditor";
import type { SignerAssignment } from "@/components/surat/form/surat-form-types";
import { addSigner, mergeAdditionalSigners, moveSigner, removeAdditionalSigner } from "@/features/surat/registration/lib/additional-signers";

const base: SignerAssignment[] = [
  { step_order: 1, role_name: "membuat", label_jabatan: "Pemohon", user_id: "requester", form_usage_step_id: "maker" },
  { step_order: 2, role_name: "memeriksa", label_jabatan: "Manager", user_id: "manager", form_usage_step_id: "checker" },
  { step_order: 3, role_name: "menyetujui", label_jabatan: "Direktur", user_id: "director", form_usage_step_id: "approver" },
];
const uuid = "12345678-1234-4234-8234-123456789012";

describe("additional signer plan", () => {
  it("inserts within a role and swaps with an existing mandatory signer", () => {
    const added = addSigner(base, "memeriksa", uuid);
    expect(added.map(item => item.form_usage_step_id || item.client_id)).toEqual(["maker", "checker", uuid, "approver"]);
    const moved = moveSigner(added, 2, -1);
    expect(moved.map(item => item.form_usage_step_id || item.client_id)).toEqual(["maker", uuid, "checker", "approver"]);
    expect(moved.map(item => item.step_order)).toEqual([1, 2, 3, 4]);
    expect(moveSigner(moved, 1, -1)).toBe(moved);
    expect(moveSigner(base, 1, -1)).toBe(base);
  });
  it("cannot delete mandatory rows and caps the existing supported route size", () => {
    expect(removeAdditionalSigner(base, 1)).toBe(base);
    expect(removeAdditionalSigner(addSigner(base, "membuat", uuid), 1)).toEqual(base);
    let signers = base;
    for (let index = 0; index < 5; index++) signers = addSigner(signers, "memeriksa", String(index));
    expect(signers).toHaveLength(8);
    expect(addSigner(signers, "membuat", "overflow")).toBe(signers);
  });
  it("restores the added row and position while refreshing mandatory metadata", () => {
    const draft = moveSigner(addSigner(base, "memeriksa", uuid), 2, -1);
    draft[1].user_id = "extra";
    const updated = base.map(item => ({ ...item, label_jabatan: `${item.label_jabatan} baru` }));
    const restored = mergeAdditionalSigners(updated, JSON.parse(JSON.stringify(draft)));
    expect(restored[1]).toMatchObject({ client_id: uuid, user_id: "extra", is_additional: true, step_order: 2 });
    expect(restored[2].label_jabatan).toBe("Manager baru");
    expect(mergeAdditionalSigners(updated, restored)).toEqual(restored);
  });
  it("does not resurrect removed additions or turn stale mandatory rows into additions", () => {
    expect(mergeAdditionalSigners(base, base)).toEqual(base);
    expect(mergeAdditionalSigners(base, [...base, { ...base[0], is_additional: true, client_id: uuid }])).toEqual(base);
  });
});

describe("grouped signer editor", () => {
  it("groups roles, protects mandatory rows and supports add, move and remove", () => {
    function Harness() {
      const [signers, setSigners] = useState(base);
      return <SignerPlanEditor signers={signers} onChange={setSigners} editingEnabled>
        {signer => <span>{signer.user_id || "Belum dipilih"}</span>}
      </SignerPlanEditor>;
    }
    render(<Harness />);
    expect(screen.getAllByText("Wajib")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Hapus penandatangan/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tambah penandatangan memeriksa" }));
    const group = screen.getByRole("region", { name: "Penandatangan memeriksa" });
    expect(within(group).getByText("Tambahan")).toBeVisible();
    fireEvent.click(within(group).getByRole("button", { name: "Pindahkan ke atas tahap 3" }));
    expect(within(group).getByRole("button", { name: "Hapus penandatangan tambahan tahap 2" })).toBeVisible();
    fireEvent.click(within(group).getByRole("button", { name: "Hapus penandatangan tambahan tahap 2" }));
    expect(within(group).queryByText("Tambahan")).toBeNull();
  });
  it("freezes additions and ordering on an existing revision", () => {
    render(<SignerPlanEditor signers={addSigner(base, "membuat", uuid)} onChange={() => {}} editingEnabled={false}>
      {signer => <span>{signer.user_id}</span>}
    </SignerPlanEditor>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
