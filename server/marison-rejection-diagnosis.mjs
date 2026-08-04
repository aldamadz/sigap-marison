const NIK_PATTERN = /\b\d{16}\b/g;

const maskNik = (text) => {
  if (typeof text !== "string") return String(text ?? "");
  return text.replace(NIK_PATTERN, (match) => `${match.slice(0, 4)}****${match.slice(-4)}`);
};

const PATH_LABELS = {
  submitted_by: "Pemohon",
  approvals: "Penandatangan",
  branch_id: "Branch external",
  project_id: "Proyek external",
  units: "Unit",
  items: "Item",
  attachments: "Lampiran",
};

const getPathLabel = (path) => {
  if (!path) return path;
  const segments = path.split(/[.[\]]/).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (PATH_LABELS[segments[i]]) return PATH_LABELS[segments[i]];
  }
  return segments[segments.length - 1] || path;
};

export const diagnoseVendorRejection = (response) => {
  if (!response || typeof response !== "object") {
    return { detailsAvailable: false, specificity: "generic", summary: "Vendor tidak memberikan detail penolakan.", issues: [] };
  }

  const issues = [];

  if (Array.isArray(response.detail) && response.detail.length > 0) {
    for (const entry of response.detail) {
      const path = typeof entry?.loc === "string" ? entry.loc : Array.isArray(entry?.loc) ? entry.loc.join(".") : "";
      const message = typeof entry?.msg === "string" ? entry.msg : String(entry?.msg ?? "");
      if (!path && !message) continue;
      issues.push({ path, label: getPathLabel(path), message: maskNik(message), specificity: "field" });
    }
  }

  if (typeof response.message === "string" && response.message.trim()) {
    const rawMessage = response.message.trim();
    const lowerMessage = rawMessage.toLowerCase();

    if (issues.length === 0) {
      if (lowerMessage.includes("nik") && lowerMessage.includes("tidak terdaftar")) {
        issues.push({ path: "", label: "Identitas external", message: maskNik(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("tipe unit") && lowerMessage.includes("tidak ditemukan")) {
        issues.push({ path: "", label: "Tipe unit", message: maskNik(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("nik")) {
        issues.push({ path: "", label: "Identitas external", message: maskNik(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("tipe") || lowerMessage.includes("type")) {
        issues.push({ path: "", label: "Tipe unit", message: maskNik(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("project") || lowerMessage.includes("proyek")) {
        issues.push({ path: "", label: "Proyek external", message: maskNik(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("branch") || lowerMessage.includes("kantor")) {
        issues.push({ path: "", label: "Branch external", message: maskNik(rawMessage), specificity: "area" });
      } else {
        issues.push({ path: "", label: "", message: maskNik(rawMessage), specificity: "generic" });
      }
    }
  }

  if (issues.length === 0) {
    const stringKeys = Object.keys(response).filter((key) => typeof response[key] === "string" && response[key].trim());
    for (const key of stringKeys) {
      if (key === "detail" || key === "message") continue;
      issues.push({ path: key, label: getPathLabel(key), message: maskNik(String(response[key])), specificity: "generic" });
    }
  }

  if (issues.length === 0) {
    return { detailsAvailable: false, specificity: "generic", summary: "Vendor tidak memberikan detail penolakan.", issues: [] };
  }

  const maxSpecificity = issues.reduce((max, issue) => {
    const order = ["generic", "area", "field"];
    return Math.max(max, order.indexOf(issue.specificity));
  }, -1);
  const specificity = ["generic", "area", "field"][maxSpecificity] || "generic";

  const summary = specificity === "field"
    ? "Vendor menolak field tertentu pada payload."
    : specificity === "area"
      ? "Identitas external ditolak vendor"
      : "Vendor menolak pengiriman.";

  return { detailsAvailable: true, specificity, summary, issues };
};

export const buildSafeContext = (payload, kind) => {
  if (!payload || typeof payload !== "object") return null;

  const context = {};

  if (payload.submitted_by || payload.approvals) {
    const roles = [];
    if (payload.submitted_by) roles.push("Pemohon");
    if (Array.isArray(payload.approvals)) {
      payload.approvals.forEach((approval, index) => {
        roles.push(`Penandatangan tahap ${index + 1}`);
      });
    }
    if (roles.length > 0) context.roles = roles;
  }

  if (kind === "unit" && Array.isArray(payload.units)) {
    const unitTypes = [...new Set(payload.units.map((unit) => unit.type).filter(Boolean))];
    if (unitTypes.length > 0) context.unitTypes = unitTypes.slice(0, 10);
  }

  if (kind === "non_unit" && Array.isArray(payload.items)) {
    const itemNames = payload.items.map((item) => item.item_name).filter(Boolean);
    if (itemNames.length > 0) context.itemNames = itemNames.slice(0, 10);
  }

  if (payload.project_id != null) context.hasProjectId = true;
  if (payload.branch_id != null) context.hasBranchId = true;
  if (Array.isArray(payload.attachments)) context.attachmentCount = payload.attachments.length;

  return Object.keys(context).length > 0 ? context : null;
};

export const comparePayloads = (oldPayload, newPayload, kind) => {
  if (!oldPayload || !newPayload) return [];

  const changes = [];

  if (oldPayload.submitted_by !== newPayload.submitted_by) {
    changes.push("Mapping pemohon berubah.");
  }

  if (Array.isArray(oldPayload.approvals) && Array.isArray(newPayload.approvals)) {
    const maxLen = Math.max(oldPayload.approvals.length, newPayload.approvals.length);
    for (let i = 0; i < maxLen; i++) {
      const oldApproval = oldPayload.approvals[i];
      const newApproval = newPayload.approvals[i];
      if (!oldApproval && newApproval) {
        changes.push(`Penandatangan tahap ${i + 1} ditambahkan.`);
      } else if (oldApproval && !newApproval) {
        changes.push(`Penandatangan tahap ${i + 1} dihapus.`);
      } else if (oldApproval && newApproval && oldApproval.nik !== newApproval.nik) {
        changes.push(`Mapping penandatangan tahap ${i + 1} berubah.`);
      }
    }
  }

  if (oldPayload.project_id !== newPayload.project_id) {
    changes.push("Proyek external berubah.");
  }

  if (oldPayload.branch_id !== newPayload.branch_id) {
    changes.push("Branch external berubah.");
  }

  if (kind === "unit" && Array.isArray(oldPayload.units) && Array.isArray(newPayload.units)) {
    const oldTypes = [...new Set(oldPayload.units.map((u) => u.type).filter(Boolean))];
    const newTypes = [...new Set(newPayload.units.map((u) => u.type).filter(Boolean))];
    if (oldTypes.join(",") !== newTypes.join(",")) {
      changes.push(`Tipe unit berubah dari ${oldTypes.join(", ") || "-"} menjadi ${newTypes.join(", ") || "-"}".`);
    }
  }

  const oldAttCount = Array.isArray(oldPayload.attachments) ? oldPayload.attachments.length : 0;
  const newAttCount = Array.isArray(newPayload.attachments) ? newPayload.attachments.length : 0;
  if (oldAttCount !== newAttCount) {
    changes.push("Lampiran aktif berubah.");
  }

  return changes;
};