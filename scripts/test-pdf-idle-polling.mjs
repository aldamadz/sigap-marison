import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
const settings = source.slice(source.indexOf("const pollIntervalMs ="), source.indexOf("const maxAttempts ="));
const evaluate = (environment = {}) => vm.runInNewContext(`${settings}\n({pollIntervalMs, maxIdlePollIntervalMs});`, { process: { env: environment } }, { timeout: 1000 });

test("idle queue wait defaults to five seconds rather than thirty", () => {
  const values = evaluate();
  assert.equal(values.pollIntervalMs, 2000);
  assert.equal(values.maxIdlePollIntervalMs, 5000);
});
test("deployment overrides and the base polling lower bound are preserved", () => {
  const values = evaluate({ PDF_WORKER_POLL_INTERVAL_MS: "3000", PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS: "1000" });
  assert.equal(values.maxIdlePollIntervalMs, 3000);
  assert.equal(evaluate({ PDF_WORKER_POLL_INTERVAL_MS: "1" }).pollIntervalMs, 500);
  assert.equal(evaluate({ PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS: "12000" }).maxIdlePollIntervalMs, 12000);
});
test("staging and standalone production compose defaults agree", () => {
  for (const file of ["docker-compose.staging.yml", "docker-compose.worker.yml"]) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS:\s*"\$\{PDF_WORKER_MAX_IDLE_POLL_INTERVAL_MS:-5000\}"/);
  }
});
