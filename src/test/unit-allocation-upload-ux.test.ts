import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("unit allocation and requester upload UX", () => {
  it("uses the react-day-picker v9 class API and local date parsing", () => {
    const calendar = read("src/components/ui/calendar.tsx");
    const inbox = read("src/pages/surat/InboxPage.tsx");

    expect(calendar).toContain("month_caption:");
    expect(calendar).toContain("month_grid:");
    expect(calendar).toContain("day_button:");
    expect(calendar).not.toContain("nav_button_previous:");
    expect(inbox).toContain("defaultMonth={parseLocalDateInput(detail.production_date) || new Date()}");
    expect(inbox).toContain("collisionPadding={12}");
  });

  it("reports byte progress and blocks registration while requester files are active", () => {
    const storage = read("src/services/storage.service.ts");
    const service = read("src/services/surat.service.ts");
    const form = read("src/components/surat/SuratForm.tsx");

    expect(storage).toContain('request.upload.addEventListener("progress"');
    expect(service).toContain("aggregateLoaded");
    expect(service).toContain('phase: "saving"');
    expect(form).toContain("aria-valuenow={uploadState.percent}");
    expect(form).toContain("validateSuratSubmit({");
    expect(form).toContain("uploadingRequirement: Boolean(uploadingRequirement),");
  });
});
