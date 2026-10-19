import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UnitLandAreaField } from "@/components/surat/UnitLandAreaField";

describe("Unit examiner external land area", () => {
  it.each([
    [{ raw: { land_area: 60 } }, "60"],
    [{ raw: { land_area: " 60.50 " } }, "60.50"],
    [{ raw: { luas_tanah: "72" } }, "72"],
    [{ raw: { lt: 90 } }, "90"],
    [{ land_area: 65 }, "65"],
    [{ raw: { land_area: 0, luas_tanah: 72 } }, "0"],
  ])("displays the external value without making it editable", (unit, expected) => {
    render(<UnitLandAreaField unit={unit} label="B40" />);
    const field = screen.getByRole("textbox", { name: "LT (Luas Tanah) kavling B40" });
    expect(field).toHaveValue(expected);
    expect(field).toBeDisabled();
    expect(field).toHaveAttribute("readonly");
  });

  it.each([null, undefined, "", {}, [], true, -1, "-60", "NaN", Infinity, "<script>60</script>"])(
    "leaves missing or invalid external values empty rather than inventing zero",
    (land_area) => {
      render(<UnitLandAreaField unit={{ raw: { land_area } }} label="B40" />);
      expect(screen.getByRole("textbox")).toHaveValue("");
      expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "Belum tersedia di external");
    },
  );

  it("never substitutes an imported or saved manual area when raw external data lacks it", () => {
    render(<UnitLandAreaField unit={{ raw: { type: "30" }, land_area: 100, allocation_detail: { land_area: 200 } }} label="B40" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("updates with refreshed external data and ignores keyboard edits", async () => {
    const { rerender } = render(<UnitLandAreaField unit={{ raw: { land_area: 60 } }} label="B40" />);
    await userEvent.type(screen.getByRole("textbox"), "999");
    expect(screen.getByRole("textbox")).toHaveValue("60");
    rerender(<UnitLandAreaField unit={{ raw: { land_area: 65 } }} label="B40" />);
    expect(screen.getByRole("textbox")).toHaveValue("65");
    rerender(<UnitLandAreaField unit={{ raw: {} }} label="B40" />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("includes the read-only field in each selected unit row without changing editable allocation data", () => {
    const inbox = readFileSync("src/pages/surat/InboxPage.tsx", "utf8");
    expect(inbox).toContain("LT (Luas Tanah)");
    expect(inbox).toContain('<UnitLandAreaField unit={unit} label={unit.label} />');
    expect(inbox).not.toMatch(/updateAllocationDetail\([^)]*["'](?:land_area|luas_tanah|lt)["']/);
  });
});
