export const isVerificationTask = (item: any) => item?.task_type === "verification";

// A signature can yield two independent inbox tasks when its assigned signer
// is also a verifier. The task type is therefore part of every UI identity.
export const getInboxTaskKey = (item: any): string | null => {
  const signatureId = typeof item?.id === "string" ? item.id : "";
  const taskType = item?.task_type;
  if (!signatureId || (taskType !== "approval" && taskType !== "verification")) return null;
  return `${taskType}:${signatureId}`;
};

export const getInboxTaskSignatureId = (taskKey: string): string | null => {
  const separator = taskKey.indexOf(":");
  if (separator < 1) return null;
  const taskType = taskKey.slice(0, separator);
  const signatureId = taskKey.slice(separator + 1);
  return (taskType === "approval" || taskType === "verification") && signatureId ? signatureId : null;
};

export const hasVerifierTargets = (item: any) =>
  Array.isArray(item?.verifier_snapshot) && item.verifier_snapshot.some((entry: any) => entry?.user_id);

export const getVerifierDisplayName = (item: any) => {
  const names = Array.isArray(item?.verifier_snapshot)
    ? item.verifier_snapshot
        .map((entry: any) => String(entry?.full_name || entry?.name || entry?.display_name || "").trim())
        .filter(Boolean)
    : [];
  const uniqueNames = Array.from(new Set(names));
  if (uniqueNames.length === 0) return "tim pemeriksa";
  if (uniqueNames.length === 1) return uniqueNames[0];
  if (uniqueNames.length === 2) return `${uniqueNames[0]} dan ${uniqueNames[1]}`;
  return `${uniqueNames.slice(0, 2).join(", ")} dan ${uniqueNames.length - 2} lainnya`;
};

export const isWaitingVerification = (item: any) =>
  item?.verification_required === true && item?.verification_status !== "verified";

export const isPreparedByVerifier = (item: any) =>
  item?.verification_required === true && item?.verification_status === "verified";

export const shouldSignerInputStageData = (item: any) =>
  !item?.verification_required || isVerificationTask(item);

export const getTaskAction = (item: any) => {
  if (isVerificationTask(item)) return "verification";
  if (item.requires_unit_allocation) return "unit";
  if ((item.attachment_requirements_snapshot || []).length > 0) return "attachment";
  return "approval";
};
