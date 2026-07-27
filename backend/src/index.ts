import { buildApp } from "./app.js";
import { getEnvironment } from "./config/env.js";

const env = getEnvironment();
const app = await buildApp();
let closing = false;

const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  app.log.info({ signal }, "graceful shutdown started");
  const forceExit = setTimeout(() => process.exit(1), 15_000);
  forceExit.unref();
  await app.close();
  clearTimeout(forceExit);
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal({ err: error }, "backend startup failed");
  process.exit(1);
}
