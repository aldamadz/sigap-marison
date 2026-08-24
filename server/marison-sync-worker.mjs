import { createHash } from "node:crypto";

const endpoint = String(
  process.env.MARISON_SYNC_INTERNAL_URL
  || "http://agenda-flow-staging/api/internal/marison/directory-sync"
);
const token = String(
  process.env.MARISON_SYNC_CRON_TOKEN
  || createHash("sha256")
    .update(`marison-directory-sync:${process.env.SESSION_SECRET || ""}`)
    .digest("hex")
);
const enabled = String(process.env.MARISON_SYNC_ENABLED || "false").toLowerCase() === "true";
const timeZone = "Asia/Jakarta";
const checkIntervalMs = 30_000;

if (enabled && token.length < 32) {
  throw new Error("MARISON_SYNC_CRON_TOKEN minimal 32 karakter saat cron aktif.");
}

const jakartaParts = () => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date())
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value])
);

let lastRunDate = "";
let running = false;

const runSync = async (dateKey) => {
  if (running) return;
  running = true;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Internal-Sync-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trigger: "cron" }),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Sinkronisasi gagal dengan HTTP ${response.status}`);
    }
    lastRunDate = dateKey;
    console.info("Marison directory cron selesai", {
      date: dateKey,
      status: payload.status,
      directoryCreated: payload.directory?.created ?? payload.created ?? 0,
      directoryUpdated: payload.directory?.updated ?? payload.updated ?? 0,
      directoryFailed: payload.directory?.failed ?? payload.failed ?? 0,
      projectCreated: payload.projects?.created ?? 0,
      projectUpdated: payload.projects?.updated ?? 0,
      projectFailed: payload.projects?.failed ?? 0,
    });
  } catch (error) {
    console.error("Marison directory cron gagal", {
      date: dateKey,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    running = false;
  }
};

const tick = () => {
  const parts = jakartaParts();
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (enabled && parts.hour === "00" && parts.minute === "00" && lastRunDate !== dateKey) {
    void runSync(dateKey);
  }
};

console.info("Marison directory cron worker aktif", { enabled, timeZone, schedule: "00:00" });
tick();
setInterval(tick, checkIntervalMs);
