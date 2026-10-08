import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPgdDocumentDefinition, isPgdDocument, normalizePgdDocumentData, renderPgdPdf } from "../pgd-pdf-renderer.mjs";
import { buildKeu1DocumentDefinition, isKeu1Document, normalizeKeu1DocumentData, renderKeu1Pdf } from "../keu1-pdf-renderer.mjs";
import { buildKeu10DocumentDefinition, isKeu10Document, normalizeKeu10DocumentData, renderKeu10Pdf } from "../keu10-pdf-renderer.mjs";
import { createPgdJobHandler, createKeu1JobHandler, createKeu10JobHandler, createRecommendationJobHandler } from "../server/pdf-worker-job.mjs";
import { normalizeRecommendationDocumentData, renderRecommendationPdf, buildRecommendationDocumentDefinition } from "../recommendation-native-pdf.mjs";

const renderers = [
  ["PGD", normalizePgdDocumentData, buildPgdDocumentDefinition, renderPgdPdf],
  ["KEU1", normalizeKeu1DocumentData, buildKeu1DocumentDefinition, renderKeu1Pdf],
  ["KEU10", normalizeKeu10DocumentData, buildKeu10DocumentDefinition, renderKeu10Pdf],
];
const roles = ["membuat", "memeriksa", "verifikator", "menyetujui"];
const signatures = (statuses, signed = true) => statuses.map((status, index) => ({
  id: `signature-${index + 1}`,
  step_order: index + 1,
  role_name: roles[index],
  status,
  is_signed: Array.isArray(signed) ? signed[index] : signed,
  signed_at: `2026-10-08T0${index + 1}:00:00Z`,
  signer_snapshot: { full_name: `Signer ${index + 1}`, job_title: roles[index] },
}));
const source = (name, status = "PROSES") => ({
  no_surat: "001/TEST/X/2026",
  status,
  request_date: "2026-10-08",
  request_place: "Magelang",
  resolved_master_form: { nomor_form: name === "KEU10" ? "FM-UAI.KEU-10-00" : name === "KEU1" ? "FM-UAI.KEU-01-00" : "FM-UAI.PGD-01-00" },
  form_input_data: { items: [{ nama_barang: "Komputer", keterangan: "Komputer", jumlah: 3, satuan: "Unit", estimasi_harga_satuan: 500000 }] },
  data_snapshot: { applied_revision: { changes: { signer_revision_required: true, item_revisions: [
    { index: 0, nama_barang: "Komputer", action: "adjust", value_type: "quantity", nilai_diajukan: "5", nilai_disetujui: "3", alasan: "Kebutuhan aktual tiga unit." },
  ] } } },
});

const stampCells = (definition) => {
  const cells = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.fontSize === 6.5 && value.alignment === "center" && value.margin?.[1] === 5) cells.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(definition);
  assert.equal(cells.length, 4, "all four signature slots remain present");
  return cells;
};

const pdfTextAvailable = !spawnSync("pdftotext", ["-v"]).error;
const checkPdf = async (t, render, data, checkText) => {
  const buffer = await render(data);
  assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(buffer.length > 10000);
  if (!pdfTextAvailable) {
    t.diagnostic("pdftotext unavailable: checked document definition and native PDF rendering only");
    return;
  }
  const directory = mkdtempSync(join(tmpdir(), "sigap-pdf-rejection-"));
  const pdfPath = join(directory, "document.pdf");
  const textPath = join(directory, "document.txt");
  try {
    writeFileSync(pdfPath, buffer);
    const result = spawnSync("pdftotext", ["-raw", pdfPath, textPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    checkText(readFileSync(textPath, "utf8").replace(/\s+/g, " "));
  } finally {
    for (const path of [pdfPath, textPath]) if (existsSync(path)) unlinkSync(path);
    rmdirSync(directory);
  }
};

for (const [name, normalize, definition, render] of renderers) {
  test(`${name}: rejected signer is not approved; main PDF explicitly rejected`, async (t) => {
    const data = normalize(source(name, "REJECTED"), { signatures: signatures(
      ["APPROVED", "REJECTED", "PENDING", "PENDING"], [true, true, false, false],
    ) });
    assert.equal(data.isRejected, true);
    assert.equal(data.signatures[1].status, "REJECTED");
    const document = definition(data);
    const cells = stampCells(document);
    assert.match(cells[0].text, /^DISETUJUI SISTEM\n/);
    assert.match(cells[1].text, /^DITOLAK SISTEM\n/);
    assert.equal(cells[1].color, "#991b1b");
    assert.deepEqual(cells.slice(2).map((cell) => cell.text), ["", ""]);
    const serialized = JSON.stringify(document);
    assert.ok(serialized.includes("STATUS DOKUMEN: DITOLAK"));
    for (const evidence of ["Diajukan: 5", "Disetujui: 3", "Kebutuhan aktual tiga unit."]) {
      assert.ok(serialized.includes(evidence), `${name}: revisionNotes retained: ${evidence}`);
    }
    await checkPdf(t, render, data, (text) => {
      assert.match(text, /STATUS DOKUMEN: DITOLAK/);
      assert.equal(text.match(/DITOLAK SISTEM/g)?.length, 1);
      assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 1);
    });
  });

  test(`${name}: unsigned stamps stay blank, even with status/timestamp present`, async (t) => {
    const data = normalize(source(name), { signatures: signatures(["PENDING", "APPROVED", "REJECTED", undefined], false) });
    assert.deepEqual(stampCells(definition(data)).map((cell) => cell.text), ["", "", "", ""]);
    assert.ok(data.signatures.every((signature) => signature.signedAt === null));
    await checkPdf(t, render, data, (text) => {
      assert.doesNotMatch(text, /(?:DISETUJUI|DITOLAK) SISTEM/);
    });
  });

  test(`${name}: approved stamps remain approved`, async (t) => {
    const data = normalize(source(name, "DONE"), { signatures: signatures(Array(4).fill("APPROVED")) });
    assert.equal(data.isRejected, false);
    for (const cell of stampCells(definition(data))) {
      assert.match(cell.text, /^DISETUJUI SISTEM\n/);
      assert.equal(cell.color, "#166534");
    }
    await checkPdf(t, render, data, (text) => {
      assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 4);
      assert.doesNotMatch(text, /DITOLAK/);
    });
  });

  test(`${name}: completed action alone never implies approval`, () => {
    const data = normalize(source(name), { signatures: signatures([undefined, "PENDING", "REVISION", "unknown"]) });
    assert.equal(data.isRejected, false);
    assert.deepEqual(stampCells(definition(data)).map((cell) => cell.text), ["", "", "", ""]);
  });

  test(`${name}: main rejection comes from document status or signer decision`, () => {
    for (const status of ["REJECTED", " ditolak "]) {
      const data = normalize(source(name, status), { signatures: signatures(Array(4).fill("PENDING"), false) });
      assert.equal(data.isRejected, true);
      assert.ok(JSON.stringify(definition(data)).includes("STATUS DOKUMEN: DITOLAK"));
      assert.ok(stampCells(definition(data)).every((cell) => cell.text === ""));
    }
    const data = normalize(source(name), { signatures: signatures(["APPROVED", " rejected ", "PENDING", "PENDING"], [true, true, false, false]) });
    assert.equal(data.isRejected, true);
    assert.match(stampCells(definition(data))[1].text, /^DITOLAK SISTEM/);
  });

  test(`${name}: historical target step excludes later rejection`, () => {
    const options = { signatures: signatures(["APPROVED", "REJECTED", "PENDING", "PENDING"], [true, true, false, false]) };
    const before = normalize(source(name, "REJECTED"), { ...options, targetStep: 1 });
    assert.equal(before.isRejected, false);
    assert.equal(before.signatures[1].status, "PENDING");
    assert.equal(before.signatures[1].signedAt, null);
    const cells = stampCells(definition(before));
    assert.match(cells[0].text, /^DISETUJUI SISTEM/);
    assert.deepEqual(cells.slice(1).map((cell) => cell.text), ["", "", ""]);
    assert.ok(!JSON.stringify(definition(before)).includes("DITOLAK"));
    const rejected = normalize(source(name, "REJECTED"), { ...options, targetStep: 2 });
    assert.equal(rejected.isRejected, true);
    assert.match(stampCells(definition(rejected))[1].text, /^DITOLAK SISTEM/);
  });
}

const workers = [
  ["PGD", createPgdJobHandler, "Pgd", isPgdDocument, normalizePgdDocumentData, buildPgdDocumentDefinition, renderPgdPdf],
  ["KEU1", createKeu1JobHandler, "Keu1", isKeu1Document, normalizeKeu1DocumentData, buildKeu1DocumentDefinition, renderKeu1Pdf],
  ["KEU10", createKeu10JobHandler, "Keu10", isKeu10Document, normalizeKeu10DocumentData, buildKeu10DocumentDefinition, renderKeu10Pdf],
];

// Project actual selected columns, so omitting status changes observed behavior.
const projectedClient = (document, rows) => ({
  from(table) {
    assert.ok(["surat_registrasi", "surat_signatures"].includes(table), `unexpected live table ${table}`);
    let columns;
    const result = () => {
      const project = (row) => Object.fromEntries(columns.map((key) => [key, row[key]]));
      return { data: table === "surat_registrasi" ? project(document) : rows.map(project), error: null };
    };
    const chain = {
      select(selection) { columns = selection.split(",").map((column) => column.trim()); return chain; },
      eq(column, value) { assert.equal(value, document.id); return chain; },
      order() { return chain; },
      maybeSingle: async () => result(),
      then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  },
});

for (const [name, factory, suffix, detect, normalize, definition, render] of workers) {
  for (const scenario of ["rejected", "unsigned", "approved", "document-rejected"]) {
    test(`${name} live worker: selected decision columns reach native PDF (${scenario})`, async (t) => {
      const document = { ...source(name, scenario.includes("rejected") ? "REJECTED" : "PROSES"), id: "worker-document" };
      document.location_snapshot = { form: { ...document.resolved_master_form, nama_form: name === "PGD" ? "FORM PERMINTAAN BARANG & JASA" : "" } };
      const rows = scenario === "rejected" ? signatures(["APPROVED", "REJECTED", "PENDING", "PENDING"], [true, true, false, false])
        : signatures(Array(4).fill(scenario === "approved" ? "APPROVED" : "PENDING"), scenario === "approved");
      const handler = factory({
        supabase: projectedClient(document, rows),
        [`is${suffix}Document`]: detect,
        [`normalize${suffix}DocumentData`]: normalize,
        [`render${suffix}Pdf`]: async (data) => ({ data, buffer: await render(data) }),
      });
      const { data, buffer } = await handler({ surat_id: document.id, signature_id: null });
      assert.equal(data.isRejected, scenario.includes("rejected"));
      const cells = stampCells(definition(data));
      if (scenario === "rejected") {
        assert.match(cells[0].text, /^DISETUJUI SISTEM/);
        assert.match(cells[1].text, /^DITOLAK SISTEM/);
        assert.deepEqual(cells.slice(2).map((cell) => cell.text), ["", ""]);
      } else if (scenario === "approved") {
        assert.ok(cells.every((cell) => cell.text.startsWith("DISETUJUI SISTEM")));
      } else {
        assert.ok(cells.every((cell) => cell.text === ""));
      }
      await checkPdf(t, async () => buffer, data, (text) => {
        if (scenario.includes("rejected")) assert.match(text, /STATUS DOKUMEN: DITOLAK/);
        else assert.doesNotMatch(text, /DITOLAK/);
        if (scenario === "rejected") assert.match(text, /DITOLAK SISTEM/);
        if (scenario === "approved") assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 4);
        if (["unsigned", "document-rejected"].includes(scenario)) assert.doesNotMatch(text, /(?:DISETUJUI|DITOLAK) SISTEM/);
      });
    });
  }
}

test("KEU10 frozen worker: decisions come only from immutable payload, never live rows", async () => {
  for (const targetStep of [0, 1, 2]) {
    const document = { ...source("KEU10", "REJECTED"), id: "frozen-document" };
    const payload = { kind: "keu10", generation: 1, document,
      signatures: signatures(["APPROVED", "REJECTED", "PENDING", "PENDING"], [true, true, false, false]) };
    const original = structuredClone(payload);
    const handler = createKeu10JobHandler({
      supabase: { from() { throw new Error("Immutable decisions must not reread live rows"); } },
      isKeu10Document,
      normalizeKeu10DocumentData,
      renderKeu10Pdf: async (data) => data,
    });
    const data = await handler({ surat_id: document.id, render_payload: payload,
      signature_id: targetStep ? payload.signatures[targetStep - 1].id : null });
    assert.equal(data.isRejected, targetStep !== 1);
    const cells = stampCells(buildKeu10DocumentDefinition(data));
    assert.match(cells[0].text, /^DISETUJUI SISTEM/);
    if (targetStep === 1) assert.equal(cells[1].text, "");
    else assert.match(cells[1].text, /^DITOLAK SISTEM/);
    assert.deepEqual(payload, original, "rendering never mutates frozen evidence");
  }
});

for (const scenario of ["approved", "rejected", "unsigned"]) {
  test(`Recommendation worker renders explicit ${scenario} decisions in actual PDF`, async (t) => {
    const rows = signatures(Array(4).fill(scenario === "approved" ? "APPROVED" : scenario === "rejected" ? "REJECTED" : "PENDING"), scenario !== "unsigned");
    const document = { ...source("RECOMMENDATION"), id: "recommendation" };
    let captured;
    const handler = createRecommendationJobHandler({
      supabase: projectedClient(document, rows), normalizeRecommendationDocumentData,
      renderRecommendationPdf: async (data, options) => { captured = data; return renderRecommendationPdf(data, options); },
      downloadStorageFile: () => { throw new Error("No images in this fixture"); },
    });
    const buffer = await handler({ surat_id: document.id }, { items: [] });
    const cells = stampCells(buildRecommendationDocumentDefinition(captured, []));
    assert.ok(cells.every((cell) => scenario === "unsigned" ? cell.text === ""
      : cell.text.startsWith(scenario === "approved" ? "DISETUJUI SISTEM" : "DITOLAK SISTEM")));
    await checkPdf(t, async () => buffer, captured, (text) => {
      if (scenario === "unsigned") assert.doesNotMatch(text, /(?:DISETUJUI|DITOLAK) SISTEM/);
      else assert.equal(text.match(scenario === "approved" ? /DISETUJUI SISTEM/g : /DITOLAK SISTEM/g)?.length, 4);
    });
  });
}

const legacyFixture = () => {
  const document = { ...source("KEU10", "DONE"), id: "legacy", file_path: "native://document/legacy/generation/1" };
  document.data_snapshot.keu10_generation = 1;
  const rows = signatures(Array(4).fill("APPROVED")).map((row) => ({ ...row, user_id: `user-${row.step_order}`,
    file_path_snap: `${document.file_path}/approval/${row.id}` }));
  const canonical = { ...structuredClone(document), surat_signatures: structuredClone(rows) };
  const frozenDocument = structuredClone(document);
  delete frozenDocument.status;
  delete frozenDocument.file_path;
  const frozenRows = rows.map(({ status, file_path_snap, ...row }) => row);
  const payload = { kind: "keu10", generation: 1, document: frozenDocument, signatures: frozenRows };
  return { canonical, rows, payload, job: { surat_id: document.id, source_file_path: document.file_path, render_payload: payload } };
};

const legacyClient = (current, versions = []) => ({
  from(table) {
    assert.ok(["surat_registrasi", "surat_external_revision_history"].includes(table), "Only canonical version data may hydrate decisions");
    const response = { data: structuredClone(table === "surat_registrasi" ? current : versions), error: null };
    const chain = {
      select(columns) {
        if (table === "surat_registrasi") assert.ok(columns.includes("surat_signatures(") && columns.includes("status, is_signed"));
        else assert.equal(columns, "document_snapshot, signatures_snapshot");
        return chain;
      },
      eq(key, value) { assert.equal(value, "legacy"); return chain; },
      maybeSingle: async () => response,
      then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
    };
    return chain;
  },
});
const legacyHandler = (client, render = async (data) => data) => createKeu10JobHandler({
  supabase: client, isKeu10Document, normalizeKeu10DocumentData, renderKeu10Pdf: render,
});

test("Legacy approved queued KEU10: verified canonical statuses reach real PDF without mutating payload", async (t) => {
  const fixture = legacyFixture();
  const original = structuredClone(fixture.payload);
  let captured;
  const buffer = await legacyHandler(legacyClient(fixture.canonical), async (data) => {
    captured = data; return renderKeu10Pdf(data);
  })(fixture.job);
  assert.ok(captured.signatures.every((row) => row.status === "APPROVED"));
  assert.equal(captured.isRejected, false);
  await checkPdf(t, async () => buffer, captured, (text) => {
    assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 4);
    assert.doesNotMatch(text, /DITOLAK/);
  });
  assert.deepEqual(fixture.payload, original);
});

test("Legacy KEU10: archived canonical version survives later generation/rejection unchanged", async (t) => {
  const fixture = legacyFixture();
  const original = structuredClone(fixture.payload);
  const later = structuredClone(fixture.canonical);
  later.data_snapshot.keu10_generation = 2;
  later.status = "REJECTED";
  later.surat_signatures[0].status = "REJECTED";
  const history = [{ document_snapshot: fixture.canonical, signatures_snapshot: fixture.rows }];
  const data = await legacyHandler(legacyClient(later, history))(fixture.job);
  assert.ok(data.signatures.every((row) => row.status === "APPROVED"));
  assert.equal(data.isRejected, false);
  await checkPdf(t, renderKeu10Pdf, data, (text) => {
    assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 4);
    assert.doesNotMatch(text, /DITOLAK/);
  });
  assert.deepEqual(fixture.payload, original);
});

test("Legacy signer snapshot: later rejection in same generation cannot rewrite frozen history", async () => {
  const fixture = legacyFixture();
  for (let index = 1; index < 4; index += 1) {
    fixture.payload.signatures[index].is_signed = false;
    fixture.payload.signatures[index].signed_at = null;
  }
  fixture.canonical.status = "REJECTED";
  fixture.canonical.file_path += "/rejection/later";
  fixture.canonical.surat_signatures[1].status = "REJECTED";
  const job = { ...fixture.job, signature_id: "signature-1", source_file_path: fixture.rows[0].file_path_snap };
  const original = structuredClone(fixture.payload);
  const data = await legacyHandler(legacyClient(fixture.canonical))(job);
  assert.equal(data.isRejected, false);
  const cells = stampCells(buildKeu10DocumentDefinition(data));
  assert.match(cells[0].text, /^DISETUJUI SISTEM/);
  assert.deepEqual(cells.slice(1).map((cell) => cell.text), ["", "", ""]);
  assert.deepEqual(fixture.payload, original);
});

test("Legacy rejected snapshot: explicit canonical rejection, not signed flag, supplies decision", async (t) => {
  const fixture = legacyFixture();
  fixture.canonical.status = "REJECTED";
  fixture.canonical.surat_signatures[3].status = "REJECTED";
  const data = await legacyHandler(legacyClient(fixture.canonical))(fixture.job);
  assert.equal(data.isRejected, true);
  await checkPdf(t, renderKeu10Pdf, data, (text) => {
    assert.match(text, /STATUS DOKUMEN: DITOLAK/);
    assert.equal(text.match(/DITOLAK SISTEM/g)?.length, 1);
    assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 3);
  });
});

test("Legacy ambiguous or stale KEU10: fail closed instead of inferring approval", async () => {
  for (const mutate of [
    (current) => { delete current.surat_signatures[0].status; },
    (current) => { current.surat_signatures[0].signed_at = "2026-10-09T01:00:00Z"; },
    (current) => { current.surat_signatures[0].user_id = "replacement"; },
    (current) => { current.data_snapshot.keu10_generation = 2; },
    (current) => { current.form_input_data.items[0].jumlah = 8; },
    (current) => { current.status = "REJECTED"; },
    (current) => { current.file_path += "/rejection/later"; },
  ]) {
    const fixture = legacyFixture();
    mutate(fixture.canonical);
    await assert.rejects(legacyHandler(legacyClient(fixture.canonical), () => {
      throw new Error("Ambiguous decisions must not reach renderer");
    })(fixture.job), /lama tidak dapat diverifikasi/);
  }
});

const decisionSql = readFileSync(new URL("../supabase/tests/pdf_approval_decision_status.integration.sql", import.meta.url), "utf8");
test("Disposable PostgreSQL: canonical rejection invalidation, enqueue, frozen decisions and stale publication", {
  skip: !process.argv.includes("--sql"), timeout: 240000,
}, async (t) => {
  // Reuse the parent's real canonical fixture without editing its owned runner.
  const runner = readFileSync(new URL("./test-keu10-workflow-sql.mjs", import.meta.url), "utf8");
  const anchor = '    const revisionOutput = run(psqlArgs, read("supabase/tests/requester_data_attachment_revision.integration.sql"));';
  assert.ok(runner.includes(anchor), "Parent SQL runner integration anchor must remain exact");
  const migration = 'read(migrationRoot + "20261008110000_pdf_approval_decision_status.sql")';
  const augmented = runner.replace(anchor, () => `
    run(psqlArgs, canonical("20260818153000_reject_surat_by_document_number.sql", "reject_surat_by_document_number"));
    run(psqlArgs, ${migration});
    run(psqlArgs, ${migration});
    process.stdout.write(run(psqlArgs, ${JSON.stringify(decisionSql)}));
${anchor}`);
  const result = spawnSync(process.execPath, ["--input-type=module", "-", "--requester-edit"], {
    input: augmented, encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)),
    timeout: 230000, maxBuffer: 8000000, windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /PDF decision SQL: all assertions passed/);
  const payloadLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith("PDF_DECISION_PAYLOAD:"));
  assert.ok(payloadLine, "Actual database-frozen payload returned");
  const payload = JSON.parse(payloadLine.slice("PDF_DECISION_PAYLOAD:".length));
  let captured;
  const handler = createKeu10JobHandler({
    supabase: { from() { throw new Error("Database-frozen decisions cannot reread live state"); } },
    isKeu10Document, normalizeKeu10DocumentData,
    renderKeu10Pdf: async (data) => { captured = data; return renderKeu10Pdf(data); },
  });
  const buffer = await handler({ surat_id: payload.document.id, render_payload: payload });
  assert.equal(captured.isRejected, true);
  await checkPdf(t, async () => buffer, captured, (text) => {
    assert.match(text, /STATUS DOKUMEN: DITOLAK/);
    assert.equal(text.match(/DISETUJUI SISTEM/g)?.length, 1);
    assert.equal(text.match(/DITOLAK SISTEM/g)?.length, 1);
  });
  t.diagnostic("Actual migration applied twice; canonical rejection/cache/publication and database-frozen PDF passed");
});
