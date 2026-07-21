import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, ".env.local");
const viteEntry = resolve(root, "node_modules", "vite", "bin", "vite.js");

if (!existsSync(envFile)) {
  console.error(".env.local tidak ditemukan. Siapkan konfigurasi development sebelum menjalankan aplikasi.");
  process.exit(1);
}

const childEnvironment = {
  ...process.env,
  NODE_ENV: "development",
};

const services = [
  {
    name: "BFF",
    process: spawn(process.execPath, ["--env-file=.env.local", "server.mjs"], {
      cwd: root,
      env: childEnvironment,
      stdio: "inherit",
    }),
  },
  {
    name: "Vite",
    process: spawn(process.execPath, [viteEntry], {
      cwd: root,
      env: childEnvironment,
      stdio: "inherit",
    }),
  },
];

let shuttingDown = false;

const stopAll = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const service of services) {
    if (!service.process.killed) service.process.kill();
  }
  setTimeout(() => process.exit(exitCode), 250).unref();
};

for (const service of services) {
  service.process.on("error", (error) => {
    console.error(`${service.name} gagal dijalankan: ${error.message}`);
    stopAll(1);
  });
  service.process.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `kode ${code ?? 1}`;
    console.error(`${service.name} berhenti (${reason}). Development server dihentikan.`);
    stopAll(code ?? 1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
