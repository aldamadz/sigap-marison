import type { HTTPMethods, FastifyInstance } from "fastify";
import { handleRequest } from "../domain-runtime.js";

type DomainRoute = { method: HTTPMethods; url: string };

const routes: DomainRoute[] = [
  { method: "GET", url: "/api/events" },
  { method: "GET", url: "/api/profile/avatar/file" },
  { method: "GET", url: "/api/documents/:suratId/pdf" },
  { method: "GET", url: "/api/pdf-jobs/:jobId" },
  { method: "GET", url: "/api/documents/:suratId/file" },
  { method: "POST", url: "/api/documents/:suratId/file-token" },
  { method: "GET", url: "/api/files/view/:token" },
  { method: "GET", url: "/api/files/view/:token/*" },
  { method: "POST", url: "/api/auth/password-reset" },
  { method: "GET", url: "/api/integrations/marison/status" },
  { method: "POST", url: "/api/integrations/marison/outbound-overrides" },
  { method: "POST", url: "/api/integrations/marison/test" },
  { method: "GET", url: "/api/integrations/marison/employees/preview" },
  { method: "GET", url: "/api/integrations/marison/branches/preview" },
  { method: "POST", url: "/api/integrations/marison/branches/sync" },
  { method: "POST", url: "/api/integrations/marison/employees/sync" },
  { method: "POST", url: "/api/internal/marison/directory-sync" },
  { method: "GET", url: "/api/integrations/marison/dispatches" },
  { method: "GET", url: "/api/integrations/marison/dispatches/:dispatchId/preflight" },
  { method: "POST", url: "/api/integrations/marison/dispatches/:dispatchId/reconcile" },
  { method: "GET", url: "/api/integrations/marison/dispatches/:dispatchId/replacement-preflight" },
  { method: "POST", url: "/api/integrations/marison/dispatches/:dispatchId/replacement" },
  { method: "POST", url: "/api/integrations/marison/surat/:suratId/dispatch" },
  { method: "POST", url: "/api/internal/marison/outbound/:jobId/build" },
  { method: "POST", url: "/api/admin/recommendation-file-links/:suratId/revoke" },
  { method: "POST", url: "/api/admin/template-preview" },
  { method: "GET", url: "/api/admin/marison-payload-mappings" },
  { method: "GET", url: "/api/admin/marison-payload-mapping-catalog" },
  { method: "POST", url: "/api/admin/marison-payload-mappings" },
  { method: "GET", url: "/api/admin/template-preview/:token" },
  { method: "GET", url: "/api/surat/inbox" },
  { method: "GET", url: "/api/surat/inbox/:signatureId/detail" },
  { method: "GET", url: "/api/attention/state" },
  { method: "GET", url: "/api/push/public-key" },
  { method: "POST", url: "/api/push/subscribe" },
  { method: "POST", url: "/api/push/unsubscribe" },
  { method: "POST", url: "/api/storage/upload" },
  { method: "POST", url: "/api/profile/avatar" },
  { method: "GET", url: "/api/dashboard/department-activity" },
  { method: "POST", url: "/api/surat/attachments/replace" },
  { method: "POST", url: "/api/notifications/email" },
  { method: "POST", url: "/api/notifications/send" },
  { method: "POST", url: "/api/data-sources/:sourceKey/query" },
];

export const registerDomainRoutes = async (app: FastifyInstance) => {
  for (const route of routes) {
    app.route({
      ...route,
      onRequest: async (request, reply) => {
        reply.hijack();
        await handleRequest(request.raw, reply.raw);
      },
      handler: async () => undefined,
    });
  }
};
