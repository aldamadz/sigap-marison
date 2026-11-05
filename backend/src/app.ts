import { resolve } from "node:path";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController } from "fastify";
import { getEnvironment } from "./config/env.js";
import { registerErrorHandler } from "./plugins/errors.js";
import { registerNotificationJobs } from "./plugins/notification-jobs.js";
import {
  pathnameFromUrl,
  shouldServeSpaIndex,
} from "./plugins/spa-fallback.js";
import { registerAuthRoutes } from "./routes/auth.routes.js";
import { registerBffRoutes } from "./routes/bff.routes.js";
import { registerDomainRoutes } from "./routes/domain.routes.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerSuratRoutes } from "./routes/surat.routes.js";
import { registerMaintenanceRoutes } from "./routes/maintenance.routes.js";
import { registerDesktopRoutes } from "./routes/desktop.routes.js";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

export const buildApp = async () => {
  const env = getEnvironment();
  const app = Fastify({
    bodyLimit: env.MAX_UPLOAD_BYTES,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: env.TRUST_PROXY,
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-internal-outbound-token", "res.headers.set-cookie"],
    },
    requestIdHeader: "x-request-id",
  });

  await app.register(cookie);
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(rateLimit, { global: false, hook: "preHandler" });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-Id", request.id);
    for (const [name, value] of Object.entries(securityHeaders)) reply.header(name, value);
    if (env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  registerErrorHandler(app);
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerDesktopRoutes(app);
  await registerMaintenanceRoutes(app);
  await registerBffRoutes(app);
  await registerSuratRoutes(app);
  await registerDomainRoutes(app);
  await registerNotificationJobs(app);

  await app.register(fastifyStatic, {
    root: resolve(env.DIST_DIR),
    wildcard: false,
    cacheControl: true,
    maxAge: env.NODE_ENV === "production" ? "1h" : 0,
    immutable: false,
    setHeaders: (response, filePath) => {
      const normalized = filePath.replace(/\\/g, "/");
      if (normalized.includes("/assets/")) {
        response.header("Cache-Control", "public, max-age=31536000, immutable");
      } else if (normalized.endsWith("/index.html") || normalized.endsWith("/sigap-sw.js")) {
        response.header("Cache-Control", "no-cache, must-revalidate");
      }
    },
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (shouldServeSpaIndex({ method: request.method, pathname: pathnameFromUrl(request.url) })) {
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found", requestId: request.id });
  });

  return app;
};
