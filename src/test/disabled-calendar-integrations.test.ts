import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("disabled work calendar integrations", () => {
  it("enables the approved calendar release in both environments", () => {
    expect(source("docker-compose.prod.yml")).toContain('VITE_WORK_CALENDAR_ENABLED: "true"');
    expect(source("docker-compose.staging.yml")).toContain('VITE_WORK_CALENDAR_ENABLED: "true"');
  });

  it("does not fetch or render the dashboard widget when disabled", () => {
    const dashboard = source("src/components/dashboard/Dashboard.tsx");
    expect(dashboard).toContain("enabled: isWorkCalendarEnabled && isReady && !!selectedUserId");
    expect(dashboard).toContain("{isWorkCalendarEnabled && (");
    expect(dashboard).toContain("<WorkCalendarDashboardWidget");
  });

  it("does not call calendar notification or activity RPCs when disabled", () => {
    const notifications = source("src/services/notification.service.ts");
    const activities = source("src/services/dashboard.service.ts");
    expect(notifications).toContain("if (!isWorkCalendarEnabled) return 0");
    expect(activities).toMatch(/isWorkCalendarEnabled\s*\? workCalendarRepository\.listRecentActivity/u);
  });
});
