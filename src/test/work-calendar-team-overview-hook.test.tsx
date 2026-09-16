import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useWorkTeamOverview } from "@/features/work-calendar/hooks/use-work-team-overview";
import {
  WORK_CALENDAR_FIXTURE_TEAM_MEMBERS,
  WORK_CALENDAR_FIXTURE_TODAY,
  createFixtureWorkEntry,
  createFixtureWorkTeamOverviewRepository,
} from "@/features/work-calendar/testing/work-calendar-fixtures";
import type { WorkEntry } from "@/features/work-calendar/types/work-calendar";
import type { WorkTeamOverviewOption } from "@/features/work-calendar/types/work-team-overview";

/**
 * Membangun seed dengan 30 anggota agar paginasi dan clamp offset benar-benar
 * teruji pada level hook, bukan hanya pada level mapper.
 */
function createPagedMembers(): {
  entries: WorkEntry[];
  members: WorkTeamOverviewOption[];
} {
  const members: WorkTeamOverviewOption[] = Array.from({ length: 30 }, (_, index) => ({
    kind: "member",
    id: `member-${String(index + 1).padStart(2, "0")}`,
    label: `Anggota ${String(index + 1).padStart(2, "0")}`,
    sublabel: "Staf",
    officeId: "office-a",
    departmentId: null,
    memberCount: 0,
  }));

  const entries = members.map((member, index) =>
    createFixtureWorkEntry({
      id: `entry-${index}`,
      ownerId: member.id,
      workDate: WORK_CALENDAR_FIXTURE_TODAY,
      title: `Pekerjaan ${index}`,
      status: "planned",
    }),
  );

  return { entries, members };
}

describe("useWorkTeamOverview — paginasi, tanggal, dan hasil basi", () => {
  it("mengosongkan data lama saat tanggal berubah (tidak ada hasil basi)", async () => {
    const { entries, members } = createPagedMembers();
    const repository = createFixtureWorkTeamOverviewRepository(entries, {
      members,
      delayMs: 20,
    });

    const { result, rerender } = renderHook(
      ({ workDate }: { workDate: string }) =>
        useWorkTeamOverview({
          repository,
          enabled: true,
          workDate,
          pageSize: 25,
        }),
      { initialProps: { workDate: WORK_CALENDAR_FIXTURE_TODAY } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.members).toHaveLength(25);

    // Tanggal berubah: data lama harus hilang sebelum data baru tiba.
    act(() => {
      rerender({ workDate: "2026-03-11" });
    });
    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data?.totalCount).toBe(30);
  });

  it("tidak menyimpulkan total 0 hanya karena halaman di luar rentang", async () => {
    const { entries, members } = createPagedMembers();
    const repository = createFixtureWorkTeamOverviewRepository(entries, { members });

    const { result } = renderHook(() =>
      useWorkTeamOverview({
        repository,
        enabled: true,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        pageSize: 25,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Halaman 9 tidak punya data, tetapi server menjepitnya ke halaman terakhir
    // dan total_count tetap 30 — bukan 0.
    act(() => result.current.setPage(9));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(result.current.data?.totalCount).toBe(30);
    expect(result.current.data?.members.length).toBeGreaterThan(0);
  });

  it("menutup detail anggota terbuka saat filter berubah", async () => {
    const { entries, members } = createPagedMembers();
    const repository = createFixtureWorkTeamOverviewRepository(entries, { members });

    const { result } = renderHook(() =>
      useWorkTeamOverview({
        repository,
        enabled: true,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        pageSize: 25,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.toggleMember("member-01"));
    await waitFor(() => expect(result.current.expandedMemberId).toBe("member-01"));

    act(() => result.current.setFilter({ type: "status", value: "completed" }));
    await waitFor(() => expect(result.current.expandedMemberId).toBeNull());
  });

  it("tidak pernah mencari anggota sebelum pemilih diaktifkan", async () => {
    const { entries, members } = createPagedMembers();
    let searches = 0;
    const base = createFixtureWorkTeamOverviewRepository(entries, { members });
    const repository = {
      ...base,
      async searchTeamMembers(query: Parameters<typeof base.searchTeamMembers>[0]) {
        searches += 1;
        return base.searchTeamMembers(query);
      },
    };

    const { result } = renderHook(() =>
      useWorkTeamOverview({
        repository,
        enabled: true,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        pageSize: 25,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(searches).toBe(0);
    expect(result.current.memberOptions).toHaveLength(0);

    act(() => result.current.activateMemberSearch());
    await waitFor(() => expect(searches).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.memberOptions.length).toBeGreaterThan(0));
    // Hasil pencarian tetap dibatasi, bukan seluruh roster.
    expect(result.current.memberOptions.length).toBeLessThanOrEqual(20);
    expect(result.current.memberSearchTotal).toBe(30);
    expect(result.current.hasMoreMembers).toBe(true);

    act(() => result.current.loadMoreMembers());
    await waitFor(() => expect(result.current.memberOptions.length).toBe(30));
    expect(result.current.hasMoreMembers).toBe(false);
  });

  it("menu anggota tidak menyertakan anggota di luar seed", async () => {
    const { entries, members } = createPagedMembers();
    const repository = createFixtureWorkTeamOverviewRepository(entries, { members });

    const { result } = renderHook(() =>
      useWorkTeamOverview({
        repository,
        enabled: true,
        workDate: WORK_CALENDAR_FIXTURE_TODAY,
        pageSize: 25,
      }),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(WORK_CALENDAR_FIXTURE_TEAM_MEMBERS.length).toBeGreaterThan(0);
    expect(members).toHaveLength(30);
  });
});
