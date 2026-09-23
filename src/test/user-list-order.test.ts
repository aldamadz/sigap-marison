import { describe, expect, it } from "vitest";
import { compareUserListOrder } from "@/lib/user-list-order";

const user = (id: string, fullName: string, is_active: boolean, jobTitle = "Staff") => ({ id, fullName, is_active, jobTitle });

describe("user list ordering", () => {
  it("places active users A-Z before inactive users A-Z", () => {
    const ordered = [
      user("inactive-a", "Andi", false),
      user("active-z", "Zahra", true),
      user("inactive-z", "Zaki", false),
      user("active-a", "Ayu", true),
    ].sort((left, right) => compareUserListOrder(left, right, "name_asc"));

    expect(ordered.map((entry) => entry.id)).toEqual(["active-a", "active-z", "inactive-a", "inactive-z"]);
  });

  it("keeps active users first when a secondary sort is selected", () => {
    const ordered = [
      user("inactive-manager", "Ayu", false, "Manager"),
      user("active-manager", "Budi", true, "Manager"),
      user("active-staff", "Ayu", true, "Staff"),
    ].sort((left, right) => compareUserListOrder(left, right, "job_asc"));

    expect(ordered.map((entry) => entry.id)).toEqual(["active-manager", "active-staff", "inactive-manager"]);
  });
});
