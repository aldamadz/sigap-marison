import { spawn } from "node:child_process";
import { request } from "node:http";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseEnvironment = {
  ...process.env,
  NODE_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "benchmark-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "benchmark-service-role-key",
  SESSION_SECRET: "benchmark-session-secret-32-characters",
  STORAGE_MODE: "self_hosted_supabase",
  STORAGE_SUPABASE_URL: "https://storage.example.com",
  STORAGE_SUPABASE_SERVICE_ROLE_KEY: "benchmark-storage-role-key",
  STORAGE_PUBLIC_BASE_URL: "https://storage.example.com/storage/v1/object/public",
  MARISON_DEPLOYMENT_ENVIRONMENT: "staging",
};

const requestOnce = (port, agent) => new Promise((resolveRequest, reject) => {
  const pending = request({
    agent,
    hostname: "127.0.0.1",
    port,
    path: "/api/auth/session",
    method: "GET",
  }, (response) => {
    response.resume();
    response.on("end", () => resolveRequest(response.statusCode));
  });
  pending.on("error", reject);
  pending.end();
});

const waitUntilReady = async (port, agent) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if (await requestOnce(port, agent) === 200) return;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Server pada port ${port} tidak siap.`);
};

const benchmark = async (port, agent, total = 3000, concurrency = 50) => {
  let completed = 0;
  let failed = 0;
  const startedAt = performance.now();
  const worker = async () => {
    while (completed + failed < total) {
      const sequence = completed + failed;
      if (sequence >= total) return;
      failed += 1;
      const status = await requestOnce(port, agent);
      failed -= 1;
      if (status !== 200) throw new Error(`Status benchmark tidak valid: ${status}`);
      completed += 1;
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const durationMs = performance.now() - startedAt;
  return { requests: completed, durationMs, requestsPerSecond: completed / (durationMs / 1000) };
};

const legacyPort = 3191;
const fastifyPort = 3192;
const legacy = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: { ...baseEnvironment, PORT: String(legacyPort) },
  stdio: "ignore",
});
const fastify = spawn(process.execPath, ["backend/dist/index.js"], {
  cwd: root,
  env: { ...baseEnvironment, PORT: String(fastifyPort) },
  stdio: "ignore",
});
const agent = new (await import("node:http")).Agent({ keepAlive: true, maxSockets: 100 });

try {
  await Promise.all([waitUntilReady(legacyPort, agent), waitUntilReady(fastifyPort, agent)]);
  await benchmark(legacyPort, agent, 300, 25);
  await benchmark(fastifyPort, agent, 300, 25);
  const legacyResult = await benchmark(legacyPort, agent);
  const fastifyResult = await benchmark(fastifyPort, agent);
  const improvementPercent = ((fastifyResult.requestsPerSecond / legacyResult.requestsPerSecond) - 1) * 100;
  console.log(JSON.stringify({ legacy: legacyResult, fastify: fastifyResult, improvementPercent }, null, 2));
} finally {
  agent.destroy();
  legacy.kill();
  fastify.kill();
}
