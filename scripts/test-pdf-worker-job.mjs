/**
 * Behavioral tests for createPgdJobHandler (server/pdf-worker-job.mjs).
 * Uses real isPgdDocument / resolvePgdMasterForm / normalizePgdDocumentData
 * from pgd-pdf-renderer; only stubs supabase client and renderPgdPdf.
 *
 * Boundary assertion: pdf-worker.mjs must import createPgdJobHandler from
 * ./server/pdf-worker-job.mjs (checked at bottom).
 */
import test from "node:test";
import "./test-pdf-idle-polling.mjs";
import assert from "node:assert/strict";
import "../server/revision-actor-evidence.test.mjs";
import "../server/unit-allocation-evidence.test.mjs";
import { readFileSync } from "node:fs";
import { createKeu10JobHandler, createPgdJobHandler, createRecommendationJobHandler, isCanonicalRecommendationPdfJob, resolveRecommendationPdfJob, loadRequesterRevisionHistory } from "../server/pdf-worker-job.mjs";
import {
  isPgdDocument,
  resolvePgdMasterForm,
  normalizePgdDocumentData,
} from "../pgd-pdf-renderer.mjs";

// ─── stub helpers ────────────────────────────────────────────────────────────

const FAKE_PDF = Buffer.from("%PDF-fake");

const RECOMMENDATION_PAYLOAD = {
  child_input: { recommendation_items: [{ nama_barang: "Laptop", jumlah: 1 }] },
  parent_input: {},
  child_snapshot_input: {},
};
const PREVIEW_JOB = { surat_id: "recommendation", source_file_path: "native://document/recommendation/v1", signature_id: null };

test("PROSES recommendation preview resolves a canonical source and is never final publication", async () => {
  const calls = [];
  const supabase = { rpc: async (...args) => {
    calls.push(args);
    return { data: RECOMMENDATION_PAYLOAD, error: null };
  } };
  const result = await resolveRecommendationPdfJob(supabase, PREVIEW_JOB);
  assert.equal(result.finalized, false);
  assert.equal(result.items[0].applicantName, "Laptop");
  assert.equal(isCanonicalRecommendationPdfJob(PREVIEW_JOB, result), false);
  assert.deepEqual(calls, [["recommendation_pdf_render_payload", {
    p_surat_id: PREVIEW_JOB.surat_id, p_source_file_path: PREVIEW_JOB.source_file_path,
  }]]);
});

test("preview can be rendered by the recommendation handler without altering the job", async () => {
  const job = structuredClone(PREVIEW_JOB);
  const source = await resolveRecommendationPdfJob({ rpc: async () => ({ data: RECOMMENDATION_PAYLOAD, error: null }) }, job);
  const handler = createRecommendationJobHandler({
    supabase: makeSupabase({ surat_registrasi: { data: { id: job.surat_id }, error: null } }),
    normalizeRecommendationDocumentData: (_surat, options) => options,
    renderRecommendationPdf: async data => {
      assert.equal(data.items[0].applicantName, "Laptop");
      return FAKE_PDF;
    },
    downloadStorageFile: async () => { throw new Error("Unexpected download"); },
  });
  assert.deepEqual(await handler(job, source), FAKE_PDF);
  assert.deepEqual(job, PREVIEW_JOB);
});

test("final canonical recommendation keeps its immutable snapshot and publication path", async () => {
  const job = { ...PREVIEW_JOB, render_payload: RECOMMENDATION_PAYLOAD, recommendation_content_fingerprint: "frozen-fingerprint" };
  const source = await resolveRecommendationPdfJob({ rpc: () => { throw new Error("Must not read live data"); } }, job);
  assert.equal(source.finalized, true);
  assert.equal(isCanonicalRecommendationPdfJob(job, source), true);
  assert.equal(isCanonicalRecommendationPdfJob({ ...job, signature_id: "signature" }, source), false);
});

test("missing final snapshot cannot fall back to a live preview", async () => {
  await assert.rejects(resolveRecommendationPdfJob({ rpc: () => { throw new Error("Must not read live data"); } },
    { ...PREVIEW_JOB, recommendation_content_fingerprint: "frozen" }), /Snapshot PDF rekomendasi final/);
});

test("stale source or inactive recommendation link does not render guessed content", async () => {
  assert.equal(await resolveRecommendationPdfJob({ rpc: async () => ({ data: null, error: null }) }, PREVIEW_JOB), null);
  assert.equal(isCanonicalRecommendationPdfJob(PREVIEW_JOB, null), false);
});

test("canonical source lookup errors remain fail-closed", async () => {
  const error = new Error("Source lookup failed");
  await assert.rejects(resolveRecommendationPdfJob({ rpc: async () => ({ data: null, error }) }, PREVIEW_JOB), error);
});

test("KEU10 payload never becomes a recommendation", async () => {
  assert.equal(await resolveRecommendationPdfJob({ rpc: () => { throw new Error("Unexpected lookup"); } },
    { ...PREVIEW_JOB, render_payload: { kind: "keu10", child_input: {} } }), null);
});

test("worker uses source fallback and the tested canonical publication decision", () => {
  const worker = readFileSync(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
  assert.match(worker, /recommendation = await resolveRecommendationPdfJob\(supabase, job\)/);
  assert.match(worker, /isCanonicalRecommendationPdfJob\(job, recommendation\)/);
});

// Builds a supabase stub. tableMap keys: table name → { data, error }
// The builder chain is thenable (for direct-await callers) and exposes maybeSingle.
const makeChain = (result) => {
  const p = Promise.resolve(result);
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    range: () => chain,
    in: () => chain,
    maybeSingle: () => p,
    then: (res, rej) => p.then(res, rej),
    catch: (rej) => p.catch(rej),
  };
  return chain;
};

const makeSupabase = (tableMap) => ({
  from: (table) => makeChain(tableMap[table] || { data: null, error: null }),
});

test("revision history is source/time-bound and excludes later edits from signature PDFs", async () => {
  const past={submitted_at:"2026-10-01T01:00:00Z",before_snapshot:{},after_snapshot:{}};
  const future={submitted_at:"2099-10-03T01:00:00Z",before_snapshot:{},after_snapshot:{}};
  const client=makeSupabase({surat_requester_revision_history:{data:[past,future],error:null}});
  const job={surat_id:"document",source_file_path:"source",created_at:"2026-10-02T01:00:00Z"};
  assert.deepEqual(await loadRequesterRevisionHistory(client,job,{file_path:"source"}),[past]);
  assert.deepEqual(await loadRequesterRevisionHistory(client,job,{file_path:"other"}),[]);
  assert.deepEqual(await loadRequesterRevisionHistory(client,{...job,created_at:"2026-09-30T01:00:00Z"},{file_path:"source"}),[past]);
  assert.deepEqual(await loadRequesterRevisionHistory(client,job,{file_path:"other"},{file_path_snap:"source",signed_at:"2026-10-02T01:00:00Z"}),[past]);
  assert.deepEqual(await loadRequesterRevisionHistory(client,job,{file_path:"source"},{file_path_snap:"source",signed_at:null}),[]);
  await assert.rejects(loadRequesterRevisionHistory(makeSupabase({surat_requester_revision_history:{error:new Error("history unavailable")}}),job,{file_path:"source"}),/history unavailable/);
});

// Distinct nomor_form: must differ from the normalizer default "FM-UAI.PGD-01-00"
// so a missing resolved_master_form would silently produce the wrong value.
const PGD_MASTER_FORM = {
  id: "form-pgd",
  nama_form: "FORM PERMINTAAN BARANG & JASA",
  nomor_form: "FM-UAI.PGD-09-99",
};
const NON_PGD_MASTER_FORM = {
  id: "form-rec",
  nama_form: "FORM REKOMENDASI",
  nomor_form: "FM-UAI.HRD-30-00",
};

const SURAT_PGD_SNAPSHOT = {
  id: "surat-lama",
  no_surat: "001/TEST",
  is_aset: true,
  request_place: "Jakarta",
  request_date: "2026-01-01",
  form_input_data: { request_category: "asset", items: [{ nama_barang: "Laptop", jumlah: 1 }] },
  location_snapshot: {
    form: { nama_form: "FORM PERMINTAAN BARANG & JASA", nomor_form: "FM-UAI.PGD-01-00" },
  },
  data_snapshot: {},
  form_usage_id: "usage-pgd",
};

const SURAT_EMPTY_SNAPSHOT = {
  id: "surat-baru",
  no_surat: "002/TEST",
  is_aset: false,
  request_place: "Bandung",
  request_date: "2026-06-01",
  form_input_data: { request_category: "unit", items: [] },
  location_snapshot: { form: {} },
  data_snapshot: {},
  form_usage_id: "usage-pgd",
};

const PGD_USAGE_ROW = {
  id: "usage-pgd",
  form_id: "form-pgd",
  master_forms: PGD_MASTER_FORM,
};

const makeHandler = (supabase, renderPgdPdfStub = async () => FAKE_PDF, capture = {}) =>
  createPgdJobHandler({
    supabase,
    isPgdDocument,
    resolvePgdMasterForm,
    normalizePgdDocumentData,
    renderPgdPdf: async (documentData) => {
      capture.documentData = documentData;
      return renderPgdPdfStub(documentData);
    },
    logoPath: "/fake/logo.png",
  });

const JOB = (suratId) => ({ id: "job-1", surat_id: suratId, signature_id: null });

test("KEU10 worker carries canonical form and signed verifier into renderer", async () => {
  const surat = { ...SURAT_EMPTY_SNAPSHOT, form_usage_id: "usage-keu10" };
  const signatures = [{ id: "finance", user_id: "manager", role_name: "verifikator", step_order: 4, is_signed: true }];
  const capture = {};
  const result = await createKeu10JobHandler({
    supabase: makeSupabase({
      surat_registrasi: { data: surat, error: null },
      surat_signatures: { data: signatures, error: null },
      profiles: { data: [{ id: "manager", full_name: "Finance", job_title: "Manager Keuangan" }], error: null },
    }),
    isKeu10Document: source => source.resolved_master_form?.nomor_form === "FM-UAI.KEU-10-00",
    resolveKeu10MasterForm: async () => ({ nomor_form: "FM-UAI.KEU-10-00" }),
    normalizeKeu10DocumentData: (source, options) => ({ source, options }),
    renderKeu10Pdf: async data => { capture.data = data; return FAKE_PDF; },
    logoPath: "/fake/logo.png",
  })({ ...JOB(surat.id), signature_id: "finance" });
  assert.equal(result, FAKE_PDF);
  assert.equal(capture.data.source.resolved_master_form.nomor_form, "FM-UAI.KEU-10-00");
  assert.equal(capture.data.options.targetStep, 4);
  assert.equal(capture.data.options.signatures[0].role_name, "verifikator");
  assert.equal(capture.data.options.signatures[0].profile.full_name, "Finance");
});

test("KEU10 renderer is packaged and called before PGD fallback", () => {
  const docker = readFileSync(new URL("../dockerfile", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
  assert.match(docker, /COPY keu10-pdf-renderer\.mjs \.\/keu10-pdf-renderer\.mjs/);
  assert.ok(worker.indexOf("await renderDirectKeu10Job(job)") < worker.indexOf("await renderDirectPgdJob(job)"));
});

test("KEU10 snapshot rendering never rereads changed live values or signatures", async () => {
  const payload = {
    kind: "keu10", generation: 1,
    document: { id: "original", formNumber: "FM-UAI.KEU-10-00", form_input_data: { items: [{ total: 2000000 }] } },
    signatures: [{ id: "old-finance", role_name: "verifikator", step_order: 3, is_signed: true, status: "APPROVED" }],
  };
  const handler = createKeu10JobHandler({
    supabase: { from() { throw new Error("Live query forbidden for immutable snapshot"); } },
    isKeu10Document: source => source.formNumber === "FM-UAI.KEU-10-00",
    normalizeKeu10DocumentData: (document, options) => ({ document, options }),
    renderKeu10Pdf: async data => data,
  });
  const rendered = await handler({ surat_id: "original", signature_id: "old-finance", render_payload: payload });
  assert.equal(rendered.document, payload.document);
  assert.equal(rendered.options.signatures, payload.signatures);
  assert.equal(rendered.options.targetStep, 3);
  await assert.rejects(handler({ surat_id: "different", render_payload: payload }), /Snapshot PDF KEU 10 tidak valid/);
});

// ─── tests ───────────────────────────────────────────────────────────────────

test("surat not found → return null", async () => {
  const db = makeSupabase({
    surat_registrasi: { data: null, error: null },
  });
  const result = await makeHandler(db)(JOB("missing"));
  assert.equal(result, null);
});

test("surat with PGD snapshot → no lookup, renders %PDF", async () => {
  let lookupCalled = false;
  const capture = {};
  const renderStub = async () => FAKE_PDF;
  const resolveSpy = async (client, id) => {
    lookupCalled = true;
    return resolvePgdMasterForm(client, id);
  };

  const db = makeSupabase({
    surat_registrasi: { data: SURAT_PGD_SNAPSHOT, error: null },
    surat_signatures: { data: [], error: null },
    profiles: { data: [], error: null },
  });

  const handler = createPgdJobHandler({
    supabase: db,
    isPgdDocument,
    resolvePgdMasterForm: resolveSpy,
    normalizePgdDocumentData,
    renderPgdPdf: async (documentData) => {
      capture.documentData = documentData;
      return renderStub(documentData);
    },
    logoPath: "/fake/logo.png",
  });

  const buf = await handler(JOB("surat-lama"));
  assert.ok(buf, "expected a buffer");
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(lookupCalled, false, "lookup must not run when snapshot already PGD");
  assert.equal(
    capture.documentData.formNumber,
    SURAT_PGD_SNAPSHOT.location_snapshot.form.nomor_form,
    "formNumber must come from the persisted snapshot",
  );
});

test("empty snapshot + form_usage PGD → lookup called → renders %PDF with master form number", async () => {
  let lookupCalled = false;
  const capture = {};
  const renderStub = async () => FAKE_PDF;
  const resolveSpy = async (client, id) => {
    lookupCalled = true;
    return resolvePgdMasterForm(client, id);
  };

  const db = makeSupabase({
    surat_registrasi: { data: SURAT_EMPTY_SNAPSHOT, error: null },
    form_usages: { data: PGD_USAGE_ROW, error: null },
    surat_signatures: { data: [], error: null },
    profiles: { data: [], error: null },
  });

  const handler = createPgdJobHandler({
    supabase: db,
    isPgdDocument,
    resolvePgdMasterForm: resolveSpy,
    normalizePgdDocumentData,
    renderPgdPdf: async (documentData) => {
      capture.documentData = documentData;
      return renderStub(documentData);
    },
    logoPath: "/fake/logo.png",
  });

  const buf = await handler(JOB("surat-baru"));
  assert.ok(buf, "expected a buffer");
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(lookupCalled, true, "lookup must run for empty-snapshot surat");
  assert.equal(
    capture.documentData.formNumber,
    PGD_MASTER_FORM.nomor_form,
    "formNumber must come from the resolved master form, not the hardcoded default",
  );
  assert.notEqual(
    capture.documentData.formNumber,
    "FM-UAI.PGD-01-00",
    "resolved form number must not collapse to the default constant",
  );
});

test("empty snapshot + form_usage non-PGD → null (fail-closed)", async () => {
  const db = makeSupabase({
    surat_registrasi: {
      data: SURAT_EMPTY_SNAPSHOT,
      error: null,
    },
    form_usages: {
      data: { id: "usage-rec", form_id: "form-rec", master_forms: NON_PGD_MASTER_FORM },
      error: null,
    },
  });
  const result = await makeHandler(db)(JOB("surat-baru"));
  assert.equal(result, null);
});

test("empty snapshot + usage not found → null (fail-closed)", async () => {
  const db = makeSupabase({
    surat_registrasi: { data: SURAT_EMPTY_SNAPSHOT, error: null },
    form_usages: { data: null, error: null },
  });
  const result = await makeHandler(db)(JOB("surat-baru"));
  assert.equal(result, null);
});

test("empty snapshot + no form_usage_id → null", async () => {
  const surat = { ...SURAT_EMPTY_SNAPSHOT, form_usage_id: null };
  const db = makeSupabase({
    surat_registrasi: { data: surat, error: null },
  });
  const result = await makeHandler(db)(JOB("surat-baru"));
  assert.equal(result, null);
});

test("surat query error → throws original error object", async () => {
  const errObj = new Error("connection timeout");
  const db = makeSupabase({
    surat_registrasi: { data: null, error: errObj },
  });
  await assert.rejects(makeHandler(db)(JOB("surat-baru")), (err) => {
    assert.strictEqual(err, errObj);
    return true;
  });
});

test("usage query DB error → throws original error object", async () => {
  const errObj = new Error("db overload");
  const db = makeSupabase({
    surat_registrasi: { data: SURAT_EMPTY_SNAPSHOT, error: null },
    form_usages: { data: null, error: errObj },
  });
  await assert.rejects(makeHandler(db)(JOB("surat-baru")), (err) => {
    assert.strictEqual(err, errObj);
    return true;
  });
});

test("four request_category values never drive PGD detection alone", () => {
  for (const rc of ["asset", "unit", "non_unit", "non_asset"]) {
    const surat = {
      form_input_data: { request_category: rc },
      location_snapshot: { form: {} },
      data_snapshot: {},
    };
    assert.equal(isPgdDocument(surat), false, `request_category=${rc} must not make document PGD`);
  }
});

test("recommendation path: createRecommendationJobHandler returns null when surat missing", async () => {
  const db = makeSupabase({
    surat_registrasi: { data: null, error: null },
  });
  const handler = createRecommendationJobHandler({
    supabase: db,
    normalizeRecommendationDocumentData: () => ({}),
    renderRecommendationPdf: async () => FAKE_PDF,
    downloadStorageFile: async () => Buffer.alloc(0),
    logoPath: "/fake/logo.png",
  });
  await assert.rejects(handler(JOB("x"), { items: [] }), /rekomendasi/i);
});

// ─── boundary: pdf-worker.mjs must use pdf-worker-job.mjs ────────────────────
test("pdf-worker.mjs imports createPgdJobHandler from server/pdf-worker-job.mjs", () => {
  const src = readFileSync(new URL("../pdf-worker.mjs", import.meta.url), "utf8");
  assert.ok(
    src.includes("createPgdJobHandler") && src.includes("./server/pdf-worker-job.mjs"),
    "pdf-worker.mjs must import createPgdJobHandler from ./server/pdf-worker-job.mjs",
  );
  assert.ok(
    src.includes("createRecommendationJobHandler"),
    "pdf-worker.mjs must import createRecommendationJobHandler",
  );
});

// ─── regression: form_usages -> master_forms embed must be unhinted ─────────
// The FK-constraint hint "master_forms!fk_master_forms(...)" does not resolve
// on the staging schema (no such constraint name), so the lookup failed at
// runtime. The unhinted "master_forms(...)" embed is required.
test("resolvePgdMasterForm embeds master_forms without the broken FK hint", () => {
  const src = readFileSync(new URL("../pgd-pdf-renderer.mjs", import.meta.url), "utf8");
  assert.ok(
    !src.includes("master_forms!fk_master_forms"),
    "the fk_master_forms hint broke the lookup on staging and must not return",
  );
  assert.ok(
    src.includes('.select("id, form_id, master_forms(id, nama_form, nomor_form)")'),
    "the form_usages query must embed master_forms without a constraint hint",
  );
});

// ─── regression: dockerfile must package the job factory ────────────────────
// pdf-worker.mjs imports ./server/pdf-worker-job.mjs; without the COPY the
// worker crashes at startup inside the image.
test("dockerfile packages server/pdf-worker-job.mjs into the image", () => {
  const src = readFileSync(new URL("../dockerfile", import.meta.url), "utf8");
  assert.ok(
    src.includes("COPY server/pdf-worker-job.mjs ./server/pdf-worker-job.mjs"),
    "dockerfile must COPY server/pdf-worker-job.mjs so pdf-worker.mjs can import it",
  );
});
