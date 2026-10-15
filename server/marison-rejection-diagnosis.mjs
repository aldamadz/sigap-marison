const SENSITIVE_VALUE_PATTERNS = [
  { re: /\b\d{4}\d{8}\d{4}\b/g, mask: (m) => `${m.slice(0, 4)}****${m.slice(-4)}` },
  { re: /\b[A-Za-z]{1,3}\s?\d{3,}\b/g, mask: (m) => m.length <= 4 ? `${m.slice(0, 2)}***` : `${m.slice(0, 3)}***` },
];

const maskSensitiveValues = (text) => {
  if (typeof text !== "string") return String(text ?? "");
  let result = text.replace(/https?:\/\/[^\s"<>]+/giu, "[tautan disembunyikan]");
  for (const { re, mask } of SENSITIVE_VALUE_PATTERNS) {
    re.lastIndex = 0;
    result = result.replace(re, mask);
  }
  return result;
};

const PATH_LABELS = {
  submitted_by: "Pemohon",
  approvals: "Penandatangan",
  branch_id: "Branch external",
  project_id: "Proyek external",
  units: "Unit",
  items: "Item",
  attachments: "Lampiran",
  main_document: "Dokumen utama",
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

  // Database exceptions can embed connection details, SQL and private payloads.
  if (/SQLSTATE\[|PDOException|\(Connection:|\bSQL:\s/iu.test(JSON.stringify(response))) {
    return {
      detailsAvailable: true,
      specificity: "generic",
      summary: "Kendala database pada sistem Marison.",
      issues: [{ path: "", label: "", specificity: "generic", message: "Sistem Marison mengalami kendala database. Minta tim Marison memeriksa struktur data sebelum mencoba kembali." }],
    };
  }

  const issues = [];

  if (Array.isArray(response.detail) && response.detail.length > 0) {
    for (const entry of response.detail) {
      const path = typeof entry?.loc === "string" ? entry.loc : Array.isArray(entry?.loc) ? entry.loc.join(".") : "";
      const message = typeof entry?.msg === "string" ? entry.msg : String(entry?.msg ?? "");
      if (!path && !message) continue;
      issues.push({ path, label: getPathLabel(path), message: maskSensitiveValues(message), specificity: "field" });
    }
  }

  if (typeof response.message === "string" && response.message.trim()) {
    const rawMessage = response.message.trim();
    const lowerMessage = rawMessage.toLowerCase();

    if (issues.length === 0) {
      if (lowerMessage.includes("nik") && lowerMessage.includes("tidak terdaftar")) {
        issues.push({ path: "", label: "Identitas external", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("tipe unit") && lowerMessage.includes("tidak ditemukan")) {
        issues.push({ path: "", label: "Tipe unit", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("nik")) {
        issues.push({ path: "", label: "Identitas external", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("tipe") || lowerMessage.includes("type")) {
        issues.push({ path: "", label: "Tipe unit", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("project") || lowerMessage.includes("proyek")) {
        issues.push({ path: "", label: "Proyek external", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else if (lowerMessage.includes("branch") || lowerMessage.includes("kantor")) {
        issues.push({ path: "", label: "Branch external", message: maskSensitiveValues(rawMessage), specificity: "area" });
      } else {
        issues.push({ path: "", label: "", message: maskSensitiveValues(rawMessage), specificity: "generic" });
      }
    }
  }

  if (issues.length === 0) {
    const stringKeys = Object.keys(response).filter((key) => typeof response[key] === "string" && response[key].trim());
    for (const key of stringKeys) {
      if (key === "detail" || key === "message") continue;
      issues.push({ path: key, label: getPathLabel(key), message: maskSensitiveValues(String(response[key])), specificity: "generic" });
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
      : "Penolakan vendor belum spesifik.";

  return { detailsAvailable: true, specificity, summary, issues };
};

export const collectSensitiveValues = (payload) => {
  const values = new Set();
  if (!payload || typeof payload !== "object") return values;
  if (typeof payload.main_document === "string") values.add(payload.main_document);
  if (typeof payload.submitted_by === "string" && payload.submitted_by.trim()) values.add(payload.submitted_by.trim());
  if (Array.isArray(payload.approvals)) {
    for (const approval of payload.approvals) {
      if (approval && typeof approval.nik === "string" && approval.nik.trim()) values.add(approval.nik.trim());
    }
  }
  return values;
};

export const buildSafeContext = (payload, kind, sensitiveValues) => {
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
  if (payload.main_document) context.hasMainDocument = true;

  return Object.keys(context).length > 0 ? context : null;
};

export const sanitizePayloadForComparison = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const sanitized = { ...payload };
  if (sanitized.main_document) sanitized.main_document = "[tautan disembunyikan]";
  delete sanitized.submitted_by;
  if (Array.isArray(sanitized.approvals)) {
    sanitized.approvals = sanitized.approvals.map((a) => {
      const { nik, ...rest } = a;
      return rest;
    });
  }
  if (Array.isArray(sanitized.attachments)) {
    sanitized.attachments = sanitized.attachments.map((a) => {
      const { link, ...rest } = a;
      return rest;
    });
  }
  return sanitized;
};

export const comparePayloads = (oldPayload, newPayload, kind) => {
  if (!oldPayload || !newPayload) return [];

  const changes = [];
  if (Boolean(oldPayload.main_document) !== Boolean(newPayload.main_document)) {
    changes.push(newPayload.main_document ? "Dokumen utama ditambahkan." : "Dokumen utama tidak tersedia.");
  }

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
      changes.push(`Tipe unit berubah dari ${oldTypes.join(", ") || "-"} menjadi ${newTypes.join(", ") || "-"}.`);
    }
  }

  const oldAttCount = Array.isArray(oldPayload.attachments) ? oldPayload.attachments.length : 0;
  const newAttCount = Array.isArray(newPayload.attachments) ? newPayload.attachments.length : 0;
  if (oldAttCount !== newAttCount) {
    changes.push("Lampiran aktif berubah.");
  }

  return changes;
};
