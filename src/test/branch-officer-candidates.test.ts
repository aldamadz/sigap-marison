import { describe, expect, it } from "vitest";
import { branchOfficerRank, getBranchOfficerCandidates } from "@/features/surat/registration/lib/branch-officer-candidates";
import type { MakerCandidate } from "@/features/surat/registration/lib/first-maker-candidates";

const offices = [{ id: "hq", kedudukan: "Pusat" }, { id: "kc", kedudukan: "KC", parent_id: "hq" },
  { id: "kcp", kedudukan: "KCP", parent_id: "kc" }, { id: "other", kedudukan: "KC" }];
const context = { requesterId: "self", officeId: "kcp", departmentId: "tech", offices };
const self: MakerCandidate = { id: "self", office_id: "kcp", job_title: "Staff", is_active: true };
const bm: MakerCandidate = { id: "bm", office_id: "kc", job_title: "Branch Manager", is_active: true };
const abm: MakerCandidate = { id: "abm", office_id: "kc", job_title: "Assistant Branch Manager", is_active: true };
const tech: MakerCandidate = { id: "tech", office_id: "kc", department_id: "tech", job_title: "Supervisor Teknik", is_active: true };
const marketing: MakerCandidate = { id: "marketing", office_id: "kc", department_id: "marketing", job_title: "SPV Marketing", is_active: true };
const ids = (users: MakerCandidate[], departmentId = "tech") => getBranchOfficerCandidates(users, { ...context, departmentId }).map(user => user.id);

describe("related branch officer candidates", () => {
  it("offers the parent KC BM at the reviewing stage, ahead of ABM and SPV", () => {
    expect(ids([self, tech, abm, bm])).toEqual(["bm"]);
  });
  it("falls back to Assistant BM, then matching-department SPV", () => {
    expect(ids([self, tech, marketing, abm])).toEqual(["abm"]);
    expect(ids([self, tech, marketing])).toEqual(["tech"]);
  });
  it("offers both SPVs for general finance with no matching department", () => {
    expect(ids([self, tech, marketing], "finance")).toEqual(["tech", "marketing"]);
    expect(ids([self, marketing], "finance")).toEqual(["marketing"]);
  });
  it("uses own KCP at the same rank, but never over a higher KC officer", () => {
    const local = { ...tech, id: "local", office_id: "kcp" };
    expect(ids([self, local, tech])).toEqual(["local"]);
    expect(ids([self, local, abm])).toEqual(["abm"]);
  });
  it("fails closed for conflicting managers rather than delegating lower", () => {
    expect(ids([self, bm, { ...bm, id: "second" }, abm])).toEqual([]);
    expect(ids([self, abm, { ...abm, id: "second" }, tech])).toEqual([]);
  });
  it("rejects inactive/deleted/foreign officers and does not assign peers or self", () => {
    expect(ids([self, { ...bm, is_active: false }, { ...abm, deleted_at: "today" }, { ...tech, office_id: "other" }])).toEqual([]);
    expect(ids([{ ...self, job_title: "Supervisor Teknik" }, tech, marketing])).toEqual([]);
    expect(ids([self])).toEqual([]);
  });
  it("requires an active requester and a valid KC hierarchy", () => {
    expect(ids([{ ...self, is_active: false }, bm])).toEqual([]);
    expect(getBranchOfficerCandidates([self, bm], { ...context, officeId: "hq" })).toEqual([]);
    expect(getBranchOfficerCandidates([self, bm], { ...context, offices: [{ id: "kcp", kedudukan: "KCP", parent_id: "kcp" }] })).toEqual([]);
  });
  it.each([["BM", 3], ["Assistant BM", 2], ["Asisten Branch Manager", 2], ["Assistent BM", 2],
    ["SPV Teknik", 1], ["NonSupervisor", 0], ["Manager Teknik", 0]])("classifies %s without broad role matching", (title, rank) => {
    expect(branchOfficerRank(title)).toBe(rank);
  });
});
