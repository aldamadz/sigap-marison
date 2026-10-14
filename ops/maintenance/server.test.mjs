import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createMaintenanceServer, renderMaintenancePage } from "./server.mjs";

test("maintenance content escapes operator text and does not invent an ETA", () => {
  const html = renderMaintenancePage({ reference: '<script>alert("x")</script>', startedAt: "2026-10-14T03:00:00Z" });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("10.00 WIB"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("Asia/Jakarta"));
  assert.ok(!html.slice(html.indexOf("<body>")).includes("100%"));
  assert.throws(() => renderMaintenancePage({ startedAt: "invalid" }));
});

test("independent maintenance server blocks writes, protects caching and handles HEAD", async (context) => {
  const server = createMaintenanceServer({ logo: Buffer.from("test-image") });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  context.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/", "/calendar", "/surat/registrasi"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 503);
    assert.match(await response.text(), /SIGAP sedang dalam pemeliharaan/);
    assert.equal(response.headers.get("retry-after"), "120");
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
  }
  for (const path of ["/api", "/api/auth/login", "/api/events", "/supabase/auth/v1/token"]) {
    const response = await fetch(base + path, { method: "POST", body: "private-input" });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "maintenance");
  }
  const head = await fetch(base, { method: "HEAD" });
  assert.equal(head.status, 503);
  assert.equal(await head.text(), "");
  const live = await fetch(base + "/health/live");
  assert.equal(live.status, 200);
  assert.equal((await live.json()).service, "sigap-maintenance");
  const image = await fetch(base + "/maintenance-logo.png");
  assert.equal(image.status, 200);
  assert.equal(await image.text(), "test-image");
  assert.equal((await fetch(base + "/maintenance-logo.png/../.env")).status, 503);
});

test("Retry-After cannot become a header injection", () => {
  assert.throws(() => createMaintenanceServer({ retryAfter: "1\r\nX-Injected: yes" }));
  assert.throws(() => createMaintenanceServer({ retryAfter: 0 }));
});

test("external API surface returns JSON even for routes outside /api", async (context) => {
  const server = createMaintenanceServer({ apiOnly: true });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  context.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["/", "/access-token", "/submission-decisions"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "maintenance");
  }
  assert.throws(() => createMaintenanceServer({ apiOnly: "api" }));
});

test("local illustration preserves animations and provides a static reduced-motion image", async (context) => {
  const animation = readFileSync(new URL("../../public/maintenance-animation.svg", import.meta.url));
  const staticIllustration = readFileSync(new URL("../../public/maintenance-illustration-static.svg", import.meta.url));
  assert.match(animation.toString(), /<animateTransform/);
  assert.doesNotMatch(staticIllustration.toString(), /<animate(?:Transform|Motion)?\b/);
  for (const svg of [animation, staticIllustration]) {
    assert.doesNotMatch(svg.toString(), /<(?:script|foreignObject|iframe)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:)/i);
  }
  assert.match(renderMaintenancePage(), /prefers-reduced-motion: reduce/);
  const server = createMaintenanceServer({ animation, staticIllustration });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  context.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const [path, expected] of [["/maintenance-animation.svg", animation], ["/maintenance-illustration-static.svg", staticIllustration]]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/svg+xml");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
    const head = await fetch(base + path, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
  }
  assert.equal((await fetch(base + "/public/maintenance-animation.svg")).status, 503);
});
