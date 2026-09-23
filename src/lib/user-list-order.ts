export type UserListSort = "name_asc" | "job_asc" | "department_asc" | "office_asc" | "status_asc";

type UserListItem = {
  id: string;
  fullName: string;
  jobTitle?: string | null;
  departmentName?: string | null;
  officeName?: string | null;
  is_active?: boolean | null;
};

const compareText = (left: string | null | undefined, right: string | null | undefined) =>
  String(left || "").localeCompare(String(right || ""), "id");

export const compareUserListOrder = (left: UserListItem, right: UserListItem, sort: UserListSort) => {
  const activeLeft = left.is_active !== false ? 0 : 1;
  const activeRight = right.is_active !== false ? 0 : 1;
  if (activeLeft !== activeRight) return activeLeft - activeRight;

  if (sort === "job_asc") {
    const result = compareText(`${left.jobTitle || ""} ${left.fullName}`, `${right.jobTitle || ""} ${right.fullName}`);
    if (result !== 0) return result;
  }
  if (sort === "department_asc") {
    const result = compareText(`${left.departmentName || ""} ${left.fullName}`, `${right.departmentName || ""} ${right.fullName}`);
    if (result !== 0) return result;
  }
  if (sort === "office_asc") {
    const result = compareText(`${left.officeName || ""} ${left.fullName}`, `${right.officeName || ""} ${right.fullName}`);
    if (result !== 0) return result;
  }

  const nameResult = compareText(left.fullName, right.fullName);
  return nameResult !== 0 ? nameResult : compareText(left.id, right.id);
};
