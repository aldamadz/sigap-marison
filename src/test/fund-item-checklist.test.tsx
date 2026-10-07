import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FundItemChecklist } from "@/components/surat/FundItemChecklist";
import { FUND_ITEM_CHECKLIST_SCHEMA, isFundItemChecklistComplete, normalizeCheckerInputSchema, readFundItemChecks } from "@/features/surat/inbox/lib/checker-input";
afterEach(cleanup);
const items = [{ id: "a", nama_barang: "Air", nominal: 100 }, { id: "b", nama_barang: "Material", nominal: 200 }];
describe("fund item checklist", () => {
  it("preserves per-usage checklist mode when admin saves configuration", () => {
    expect(normalizeCheckerInputSchema(FUND_ITEM_CHECKLIST_SCHEMA)).toEqual(FUND_ITEM_CHECKLIST_SCHEMA);
  });
  it("requires every current item, and rejects stale amounts, duplicates and malformed JSON", () => {
    const checks = items.map((item, item_index) => ({ item, item_index, checked: true, note: "" }));
    expect(isFundItemChecklistComplete(items, JSON.stringify(checks))).toBe(true);
    expect(isFundItemChecklistComplete(items, JSON.stringify(checks.map(check => ({ ...check, item: { nominal: check.item.nominal, nama_barang: check.item.nama_barang, id: check.item.id } }))))).toBe(true);
    expect(isFundItemChecklistComplete(items, JSON.stringify(checks.slice(0, 1)))).toBe(false);
    expect(isFundItemChecklistComplete([{ ...items[0], nominal: 101 }, items[1]], JSON.stringify(checks))).toBe(false);
    expect(isFundItemChecklistComplete(items, JSON.stringify([checks[0], checks[0]]))).toBe(false);
    expect(readFundItemChecks("invalid")).toEqual([]);
    expect(isFundItemChecklistComplete([], "[]")).toBe(false);
  });
  it("renders a checkbox and optional note per item without editing requested values", () => {
    const onChange = vi.fn();
    render(<FundItemChecklist items={items} value="" readOnly={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Item 1 sudah diperiksa" }));
    const checks = readFundItemChecks(onChange.mock.calls[0][0]);
    expect(checks[0]).toEqual({ item_index: 0, item: items[0], checked: true, note: "" });
    expect(checks[1].checked).toBe(false);
    expect(screen.getByLabelText("Catatan pemeriksaan item 1")).toBeEnabled();
  });
  it("shows signer the saved results read-only", () => {
    render(<FundItemChecklist items={items} value={JSON.stringify(items.map((item, item_index) => ({ item, item_index, checked: true, note: "checked" })))} readOnly onChange={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Item 1 sudah diperiksa" })).toBeDisabled();
    expect(screen.getByLabelText("Catatan pemeriksaan item 1")).toHaveAttribute("readonly");
  });
});
