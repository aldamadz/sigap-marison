# Backend Architecture

## Runtime

SIGAP uses a Fastify 5 runtime written in TypeScript under `backend/src`.
`backend/src/index.ts` owns process startup, graceful shutdown, and the HTTP
listener. The React build is served by `@fastify/static` from the same origin.

The runtime provides:

- encrypted, HttpOnly, same-site cookie sessions;
- native Fastify routes for authentication and the browser Supabase BFF;
- Zod validation from the shared `shared/` package;
- route-level login throttling;
- compression and long-lived caching for hashed frontend assets;
- structured logs with credential redaction;
- `/health/live` and `/health/ready` probes;
- security headers and generic internal-error responses;
- graceful shutdown on `SIGINT` and `SIGTERM`.

## Modules

```text
backend/src/
  config/       Environment parsing and validation
  controllers/  HTTP boundary and response handling
  lib/          Supabase clients and encrypted sessions
  plugins/      Cross-cutting Fastify behavior
  routes/       Native Fastify route manifests
  services/     Business and integration operations
shared/src/     Runtime schemas and frontend/backend types
```

The browser API contract remains same-origin under `/api`. No Supabase key or
real access token is returned to browser JavaScript.

## Domain Runtime

Complex domain handlers for documents, PDF, storage uploads, notifications,
realtime SSE, and Marison live in `backend/src/domain-runtime.ts`. Fastify is the
only listener and registers every endpoint explicitly in
`backend/src/routes/domain.routes.ts`. Multipart uploads and SSE are delegated at
the `onRequest` stage so their streams remain available to the domain handlers.

## Scaling

The native auth and BFF path is stateless and can run in multiple containers.
Supabase Auth, PostgREST, Storage, and Realtime remain shared dependencies.
Container healthchecks target `/health/ready`, and orchestration should remove a
container from rotation before sending `SIGTERM`.

In-memory domain state, including preview tokens and some rate limits,
must be moved to a shared store before running more than one active application
replica. Until that extraction is complete, scale vertically or use sticky
routing for stateful endpoints. PDF conversion remains a separate worker.

## Performance Verification

The changes with deterministic performance benefit are schema rejection before
service work, precompiled response serialization, gzip/Brotli compression, and
one-year immutable caching for hashed frontend assets.
