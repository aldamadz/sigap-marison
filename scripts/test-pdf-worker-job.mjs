/**
 * Behavioral tests for createPgdJobHandler (server/pdf-worker-job.mjs).
 * Uses real isPgdDocument / resolvePgdMasterForm / normalizePgdDocumentData
 * from pgd-pdf-renderer; only stubs supabase client and renderPgdPdf.
 *
 * Boundary assertion: pdf-worker.mjs must import createPgdJobHandler from
 * ./server/pdf-worker-job.mjs (checked at bottom).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPgdJobHandler, createRecommendationJobHandler } from "../server/pdf-worker-job.mjs";
import {
  isPgdDocument,
  resolvePgdMasterForm,
  normalizePgdDocumentData,
} from "../pgd-pdf-renderer.mjs";

// ─── stub helpers ────────────────────────────────────────────────────────────

const FAKE_PDF = Buffer.from("%PDF-fake");

// Builds a supabase stub. tableMap keys: table name → { data, error }
// The builder chain is thenable (for direct-await callers) and exposes maybeSingle.
const makeChain = (result) => {
  const p = Promise.resolve(result);
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
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
