import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const appUrl = "https://sigap.marison-testing.biz.id";
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const storageUrl = process.env.STORAGE_SUPABASE_URL;
const storageKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
const internalToken = process.env.MARISON_OUTBOUND_INTERNAL_TOKEN;
const runId = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(4).toString("hex")}`;
const marker = `REC03-ACCEPT-${runId}`;
const ids = Object.fromEntries([
  "requester", "signer", "admin", "entity", "office", "department", "letterType", "form", "usage", "usageStep",
  "parent", "child", "rejectedParent", "rejectedChild", "reservation", "rejectedReservation", "task", "rejectedTask",
  "childSignature", "parentSignature", "link", "dispatch", "transportAttempt",
].map((name) => [name, randomUUID()]));
const objectPrefix = `staging/rec03-accept/${runId}`;
const manifestPath = process.env.REC03_MANIFEST_PATH || join(process.cwd(), `.rec03-accept-${runId}.json`);
const password = `R3!${randomBytes(18).toString("base64url")}`;
const emails = {
  requester: `rec03.accept.${runId}.requester@staging.test`,
  signer: `rec03.accept.${runId}.signer@staging.test`,
  admin: `rec03.accept.${runId}.admin@staging.test`,
};
const storageObjects = { dokumen_surat: [], lampiran_surat: [] };
const results = {};
let rawBearer = null;

if (!supabaseUrl || !serviceKey || !publishableKey || !storageUrl || !storageKey || !internalToken) {
  throw new Error("Staging Supabase, storage, and outbound internal credentials are required.");
}
if (!supabaseUrl.includes("wrufczusfopgvwvxsmjk") || process.env.MARISON_DEPLOYMENT_ENVIRONMENT !== "staging") {
  throw new Error("REC-03 acceptance is locked to Supabase staging and MARISON_DEPLOYMENT_ENVIRONMENT=staging.");
}
if (process.env.STORAGE_PATH_PREFIX !== "staging" || !objectPrefix.startsWith("staging/rec03-accept/")) {
  throw new Error("REC-03 acceptance storage namespace is not staging-scoped.");
}

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const storage = createClient(storageUrl, storageKey, { auth: { persistSession: false, autoRefreshToken: false } });
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const expectNoError = (response, label) => {
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
};
const exactDelete = async (table, column, values) => {
  if (!values?.length) return;
  const response = await admin.from(table).delete().in(column, values);
  if (response.error) throw new Error(`cleanup ${table}: ${response.error.message}`);
};
const countExact = async (table, column, values) => {
  const response = await admin.from(table).select("*", { count: "exact", head: true }).in(column, values);
  if (response.error) throw new Error(`count ${table}: ${response.error.message}`);
  return response.count || 0;
};
const upload = async (bucket, path, body, contentType) => {
  assert.ok(path.startsWith(objectPrefix));
  expectNoError(await storage.storage.from(bucket).upload(path, body, { contentType, upsert: false }), `upload ${bucket}/${path}`);
  storageObjects[bucket].push(path);
  return `${bucket}/${path}`;
};
const makeWorkbook = async (label) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pengajuan");
  sheet.getCell("A1").value = marker;
  sheet.getCell("A2").value = label;
  sheet.getCell("A3").value = "REC-03 staging acceptance source";
  return Buffer.from(await workbook.xlsx.writeBuffer());
};
const makeImage = async (index) => sharp({
  create: { width: 1400 + index * 10, height: 900 + index * 5, channels: 3, background: { r: 20 + index * 12, g: 80, b: 140 } },
}).png().composite([{ input: Buffer.from(`<svg width="1400" height="900"><text x="80" y="180" font-size="72" fill="white">${marker} IMAGE ${index}</text></svg>`) }]).toBuffer();
const queryOne = async (table, columns, id) => expectNoError(await admin.from(table).select(columns).eq("id", id).single(), `read ${table}`);
const waitFor = async (label, load, predicate, timeoutMs = 180000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await load();
    if (predicate(value)) return value;
    await pause(2000);
  }
  throw new Error(`Timeout waiting for ${label}.`);
};
const login = async (email) => {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const data = expectNoError(await client.auth.signInWithPassword({ email, password }), `login ${email}`);
  return { client, token: data.session.access_token };
};
const appJson = async (path, { method = "GET", token, body, internal = false } = {}) => {
  const response = await fetch(`${appUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(internal ? { "x-internal-outbound-token": internalToken } : {}),
      ...(body ? { "content-type": "application/json", Origin: appUrl } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${value?.error || value?.message || "request failed"}`);
  return { status: response.status, value };
};

const manifest = {
  runId, marker, ids, emails, objectPrefix, createdAt: new Date().toISOString(),
  tables: ["auth.users", "profiles", "master_entities", "master_offices", "master_departments", "master_letter_types", "master_forms", "form_usages", "form_usage_steps", "form_usage_departments", "form_usage_step_users", "surat_registrasi", "surat_reservations", "surat_recommendation_tasks", "surat_signatures", "surat_attachments", "document_pdf_jobs", "surat_linked_documents", "file_view_tokens", "file_view_token_audit", "marison_outbound_dispatches"],
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify({ phase: "manifest", path: manifestPath, runId, marker, ids, objectPrefix }));

const cleanup = async () => {
  const errors = [];
  const attempt = async (label, fn) => { try { await fn(); } catch (error) { errors.push(`${label}: ${error.message}`); } };
  await attempt("token audit", async () => {
    const tokens = expectNoError(await admin.from("file_view_tokens").select("id").in("surat_id", [ids.child, ids.rejectedChild]), "list fixture tokens") || [];
    await exactDelete("file_view_token_audit", "token_id", tokens.map((row) => row.id));
  });
  await attempt("tokens", () => exactDelete("file_view_tokens", "surat_id", [ids.child, ids.rejectedChild]));
  await attempt("replacement events", async () => {
    await exactDelete("marison_outbound_replacement_events", "surat_id", [ids.parent, ids.rejectedParent]);
    await exactDelete("marison_outbound_reconciliation_events", "surat_id", [ids.parent, ids.rejectedParent]);
  });
  await attempt("dispatches", () => exactDelete("marison_outbound_dispatches", "surat_id", [ids.parent, ids.rejectedParent]));
  await attempt("notifications", () => exactDelete("notifications", "user_id", [ids.requester, ids.signer, ids.admin]));
  await attempt("pdf jobs", () => exactDelete("document_pdf_jobs", "surat_id", [ids.parent, ids.child, ids.rejectedParent, ids.rejectedChild]));
  await attempt("attachments", () => exactDelete("surat_attachments", "surat_id", [ids.parent, ids.child, ids.rejectedParent, ids.rejectedChild]));
  await attempt("links", async () => {
    await exactDelete("surat_linked_documents", "parent_surat_id", [ids.parent, ids.rejectedParent]);
  });
  await attempt("tasks", () => exactDelete("surat_recommendation_tasks", "id", [ids.task, ids.rejectedTask]));
  await attempt("signatures", () => exactDelete("surat_signatures", "surat_id", [ids.parent, ids.child, ids.rejectedParent, ids.rejectedChild]));
  await attempt("surat", () => exactDelete("surat_registrasi", "id", [ids.child, ids.rejectedChild, ids.parent, ids.rejectedParent]));
  await attempt("reservations", () => exactDelete("surat_reservations", "id", [ids.reservation, ids.rejectedReservation]));
  await attempt("usage candidates", () => exactDelete("form_usage_step_users", "usage_step_id", [ids.usageStep]));
  await attempt("usage departments", () => exactDelete("form_usage_departments", "usage_id", [ids.usage]));
  await attempt("usage steps", () => exactDelete("form_usage_steps", "id", [ids.usageStep]));
  await attempt("usage", () => exactDelete("form_usages", "id", [ids.usage]));
  await attempt("form", () => exactDelete("master_forms", "id", [ids.form]));
  await attempt("profiles", () => exactDelete("profiles", "id", [ids.requester, ids.signer, ids.admin]));
  await attempt("letter type", () => exactDelete("master_letter_types", "id", [ids.letterType]));
  await attempt("department", () => exactDelete("master_departments", "id", [ids.department]));
  await attempt("office", () => exactDelete("master_offices", "id", [ids.office]));
  await attempt("entity", () => exactDelete("master_entities", "id", [ids.entity]));
  await attempt("activity logs", () => exactDelete("activity_logs", "record_id", Object.values(ids)));
  for (const [bucket, paths] of Object.entries(storageObjects)) {
    await attempt(`storage ${bucket}`, async () => { if (paths.length) expectNoError(await storage.storage.from(bucket).remove(paths), `remove ${bucket}`); });
  }
  for (const userId of [ids.admin, ids.signer, ids.requester]) {
    await attempt(`auth ${userId}`, async () => { const response = await admin.auth.admin.deleteUser(userId); if (response.error && !/not found/i.test(response.error.message)) throw response.error; });
  }
  if (errors.length) throw new Error(errors.join(" | "));
  const residue = {
    profiles: await countExact("profiles", "id", [ids.requester, ids.signer, ids.admin]),
    entities: await countExact("master_entities", "id", [ids.entity]),
    offices: await countExact("master_offices", "id", [ids.office]),
    departments: await countExact("master_departments", "id", [ids.department]),
    letterTypes: await countExact("master_letter_types", "id", [ids.letterType]),
    forms: await countExact("master_forms", "id", [ids.form]),
    usages: await countExact("form_usages", "id", [ids.usage]),
    surat: await countExact("surat_registrasi", "id", [ids.parent, ids.child, ids.rejectedParent, ids.rejectedChild]),
    reservations: await countExact("surat_reservations", "id", [ids.reservation, ids.rejectedReservation]),
    tasks: await countExact("surat_recommendation_tasks", "id", [ids.task, ids.rejectedTask]),
    signatures: await countExact("surat_signatures", "id", [ids.childSignature, ids.parentSignature]),
    links: await countExact("surat_linked_documents", "parent_surat_id", [ids.parent, ids.rejectedParent]),
    pdfJobs: await countExact("document_pdf_jobs", "surat_id", [ids.parent, ids.child, ids.rejectedParent, ids.rejectedChild]),
    tokens: await countExact("file_view_tokens", "surat_id", [ids.child, ids.rejectedChild]),
    dispatches: await countExact("marison_outbound_dispatches", "surat_id", [ids.parent, ids.rejectedParent]),
    activityLogs: await countExact("activity_logs", "record_id", Object.values(ids)),
  };
  assert.equal(Object.values(residue).reduce((sum, count) => sum + count, 0), 0, `Fixture residue: ${JSON.stringify(residue)}`);
  const authResidue = [];
  for (const userId of [ids.requester, ids.signer, ids.admin]) {
    const response = await admin.auth.admin.getUserById(userId);
    if (!response.error && response.data.user) authResidue.push(userId);
  }
  assert.deepEqual(authResidue, []);
  return residue;
};

try {
  for (const [kind, role] of [["requester", "user"], ["signer", "user"], ["admin", "admin"]]) {
    const created = expectNoError(await admin.auth.admin.createUser({ id: ids[kind], email: emails[kind], password, email_confirm: true, user_metadata: { full_name: `${marker} ${kind}` } }), `create auth ${kind}`);
    assert.equal(created.user.id, ids[kind]);
    expectNoError(await admin.from("profiles").upsert({
      id: ids[kind],
      nik: `${marker}-${kind}`.slice(0, 60), full_name: `${marker} ${kind}`, job_title: kind === "signer" ? "Approver" : "Tester", role,
      department_id: null, office_id: null, is_active: true, deleted_at: null, marison_employee_id: 910000 + ["requester", "signer", "admin"].indexOf(kind), marison_synced_at: new Date().toISOString(),
    }, { onConflict: "id" }), `upsert profile ${kind}`);
  }

  expectNoError(await admin.from("master_entities").insert({ id: ids.entity, code: `R3E${runId.slice(-6)}`, name: marker }), "entity");
  expectNoError(await admin.from("master_offices").insert({ id: ids.office, code: `R3O${runId.slice(-6)}`, name: marker, kedudukan: "Pusat", marison_branch_id: 920000 + Number.parseInt(runId.slice(-2), 16), marison_synced_at: new Date().toISOString() }), "office");
  expectNoError(await admin.from("master_departments").insert({ id: ids.department, code: `R3D${runId.slice(-6)}`, name: marker, dept_index: 900000 + Number.parseInt(runId.slice(-2), 16) }), "department");
  expectNoError(await admin.from("master_letter_types").insert({ id: ids.letterType, code: `R3L${runId.slice(-6)}`, name: marker, type_index: 900000 + Number.parseInt(runId.slice(-2), 16) }), "letter type");
  expectNoError(await admin.from("master_forms").insert({ id: ids.form, nama_form: marker, nomor_form: marker, department_id: ids.department, input_schema: [] }), "form");
  expectNoError(await admin.from("form_usages").insert({ id: ids.usage, form_id: ids.form, name: marker, request_category: "asset", scope_type: "all", status: "active", sort_order: 999999 }), "usage");
  expectNoError(await admin.from("form_usage_departments").insert({ usage_id: ids.usage, department_id: ids.department }), "usage department");
  expectNoError(await admin.from("form_usage_steps").insert({ id: ids.usageStep, usage_id: ids.usage, step_order: 1, role_name: "menyetujui", label: "REC03 Approver", candidate_scope: "manual" }), "usage step");
  expectNoError(await admin.from("form_usage_step_users").insert({ usage_step_id: ids.usageStep, user_id: ids.signer }), "usage candidate");
  expectNoError(await admin.from("profiles").update({ department_id: ids.department, office_id: ids.office }).in("id", [ids.requester, ids.signer, ids.admin]), "assign fixture masters");

  const parentPath = await upload("dokumen_surat", `${objectPrefix}/parent.xlsx`, await makeWorkbook("Parent"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const childPath = await upload("dokumen_surat", `${objectPrefix}/child-final.xlsx`, await makeWorkbook("Child recommendation"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const imagePaths = [];
  for (let index = 1; index <= 7; index += 1) imagePaths.push(await upload("lampiran_surat", `${objectPrefix}/image-${index}.png`, await makeImage(index), "image/png"));
  const recommendedItems = [
    { id: `${marker}-P1`, nama_barang: "Komputer", quantity: 2 },
    { id: `${marker}-P2`, nama_barang: "Printer", quantity: 1 },
    { id: `${marker}-P3`, nama_barang: "Server lama", quantity: 1 },
  ];
  const recommendation = {
    version: 1,
    items: [
      { id: recommendedItems[0].id, order: 0, status: "recommended", applicant_original: { name: "Komputer", quantity: 2, notes: "" }, location: "", pic: "", rejection_reason: "", details: [
        { id: `${marker}-D11`, order: 0, parent_item_id: recommendedItems[0].id, name: "RAM 32 GB", quantity: 2, action: "service", description: "Detail 1.1", description_manually_edited: false, notes: "", estimated_price: 12345, attachments: imagePaths.map((path, index) => ({ id: `${marker}-IMG${index + 1}`, order: index, storage_path: path })), reference_links: [] },
        { id: `${marker}-D12`, order: 1, parent_item_id: recommendedItems[0].id, name: "SSD 2 TB", quantity: 1, action: "replace", description: "Detail 1.2", description_manually_edited: false, notes: "", estimated_price: 23456, attachments: [], reference_links: [] },
      ] },
      { id: recommendedItems[1].id, order: 1, status: "recommended", applicant_original: { name: "Printer", quantity: 1, notes: "" }, location: "", pic: "", rejection_reason: "", details: [
        { id: `${marker}-D21`, order: 0, parent_item_id: recommendedItems[1].id, name: "Printer laser", quantity: 1, action: "purchase_new", description: "Detail 2.1", description_manually_edited: false, notes: "", estimated_price: 34567, attachments: [], reference_links: [] },
      ] },
      { id: recommendedItems[2].id, order: 2, status: "not_recommended", applicant_original: { name: "Server lama", quantity: 1, notes: "" }, location: "Gudang", pic: "PIC REC03", rejection_reason: "Tidak ekonomis", details: [] },
    ],
  };

  const parentBase = { entity_id: ids.entity, office_id: ids.office, dept_id: ids.department, letter_type_id: ids.letterType, form_usage_id: ids.usage, created_by: ids.requester, current_step: 1, status: "PROSES", requester_snapshot: { profile_id: ids.requester, nik: `${marker}-requester` }, location_snapshot: { office: { id: ids.office } }, policy_snapshot: {} };
  expectNoError(await admin.from("surat_registrasi").insert({ ...parentBase, id: ids.parent, no_surat: `${marker}/PARENT`, judul_surat: marker, file_path: parentPath, form_input_data: { request_category: "asset", items: recommendedItems, catatan: marker } }), "parent surat");
  expectNoError(await admin.from("surat_reservations").insert({ id: ids.reservation, entity_id: ids.entity, type_id: ids.letterType, year: new Date().getUTCFullYear(), no_urut: 900000 + Number.parseInt(runId.slice(-3), 16), status: "PENDING", reserved_by: ids.signer, office_id: ids.office, dept_id: ids.department }), "reservation");
  expectNoError(await admin.from("surat_recommendation_tasks").insert({ id: ids.task, parent_surat_id: ids.parent, reservation_id: ids.reservation, no_surat: `${marker}/REC`, no_urut: 1, entity_id: ids.entity, office_id: ids.office, department_id: ids.department, letter_type_id: ids.letterType, form_id: ids.form, usage_id: ids.usage, required_before_step: 2, status: "claimed", candidate_snapshot: [{ user_id: ids.signer, marker }], claimed_by: ids.signer, claimed_at: new Date().toISOString(), created_by: ids.requester }), "task");
  expectNoError(await admin.from("surat_registrasi").insert({ ...parentBase, id: ids.child, no_surat: `${marker}/CHILD`, judul_surat: `${marker} child`, created_by: ids.signer, file_path: childPath, form_input_data: { linked_document_type: "recommendation", linked_parent_surat_id: ids.parent, task_id: ids.task, reservation_id: ids.reservation, recommendation_multi_detail: recommendation } }), "child surat");
  expectNoError(await admin.from("surat_signatures").insert({ id: ids.childSignature, surat_id: ids.child, user_id: ids.signer, form_usage_step_id: ids.usageStep, is_signed: false, status: "PENDING" }), "child signature");
  expectNoError(await admin.from("surat_signatures").insert({ id: ids.parentSignature, surat_id: ids.parent, user_id: ids.signer, form_usage_step_id: ids.usageStep, is_signed: true, signed_at: new Date().toISOString(), status: "APPROVED", signer_snapshot: { nik: `${marker}-signer`, job_title: "Approver" } }), "parent signature");

  const signer = await login(emails.signer);
  const adminLogin = await login(emails.admin);
  const completed = expectNoError(await signer.client.rpc("complete_recommendation_task", { p_task_id: ids.task, p_child_surat_id: ids.child }), "complete recommendation task");
  assert.equal(completed.status, "submitted");
  const approval = expectNoError(await signer.client.rpc("handle_approve_surat_v2", { p_sig_id: ids.childSignature, p_surat_id: ids.child, p_note: marker, p_file_path: childPath }), "final recommendation approval");
  assert.deepEqual({ pdfPending: approval.pdfPending, isDone: approval.isDone }, { pdfPending: true, isDone: false });
  const pendingChild = await queryOne("surat_registrasi", "id,status,pdf_path,pdf_bucket,pdf_object_path,pdf_storage_origin", ids.child);
  assert.equal(pendingChild.status, "PDF_PENDING");
  assert.equal(pendingChild.pdf_path, null);
  const queuedJobs = expectNoError(await admin.from("document_pdf_jobs").select("*").eq("surat_id", ids.child), "queued PDF jobs");
  assert.equal(queuedJobs.length, 1);
  assert.equal(queuedJobs[0].status, "queued");
  results.pdfPending = true;
  results.durablePdfJobCount = queuedJobs.length;

  const doneJob = await waitFor("PDF worker publication", async () => queryOne("document_pdf_jobs", "*", queuedJobs[0].id), (job) => ["done", "failed"].includes(job.status));
  if (doneJob.status === "failed") throw new Error(`Fixture PDF worker failed: ${doneJob.error_message}`);
  const doneChild = await queryOne("surat_registrasi", "id,status,pdf_path,pdf_bucket,pdf_object_path,pdf_storage_origin", ids.child);
  assert.equal(doneChild.status, "DONE");
  assert.equal(doneChild.pdf_path, doneJob.pdf_url);
  assert.equal(doneChild.pdf_bucket, doneJob.pdf_bucket);
  assert.equal(doneChild.pdf_object_path, doneJob.pdf_object_path);
  assert.equal(doneChild.pdf_storage_origin, doneJob.pdf_storage_origin);
  storageObjects.dokumen_surat.push(doneChild.pdf_object_path);
  results.atomicPdfPublication = true;

  const downloaded = expectNoError(await storage.storage.from(doneChild.pdf_bucket).download(doneChild.pdf_object_path), "download combined PDF");
  const pdfBytes = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  const pdfEvidencePath = join(process.cwd(), `.rec03-accept-${runId}.pdf`);
  await writeFile(pdfEvidencePath, pdfBytes);
  results.combinedPdf = { bytes: pdfBytes.length, sha256: sha256(pdfBytes), evidencePath: pdfEvidencePath };

  expectNoError(await admin.from("surat_registrasi").update({ status: "DONE" }).eq("id", ids.parent), "finalize parent");
  const parentDispatch = await waitFor("parent outbound dispatch", async () => {
    const response = await admin.from("marison_outbound_dispatches").select("*").eq("surat_id", ids.parent).maybeSingle();
    return expectNoError(response, "read parent dispatch");
  }, Boolean, 30000);
  ids.dispatch = parentDispatch.id;
  const fixtureLease = randomUUID();
  const claimedDispatch = expectNoError(await admin.from("marison_outbound_dispatches").update({
    status: "processing", lease_token: fixtureLease, lease_acquired_at: new Date().toISOString(), lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).eq("id", ids.dispatch).eq("status", "pending").select("id").single(), "claim exact fixture dispatch");
  assert.equal(claimedDispatch.id, ids.dispatch);
  const logical = await appJson(`/api/internal/marison/outbound/${ids.dispatch}/build`, { method: "POST", internal: true, body: { leaseToken: fixtureLease, transport: false } });
  const logicalPayload = logical.value.payload;
  assert.deepEqual(logicalPayload.items.map((item) => item.asset_name), ["RAM 32 GB", "SSD 2 TB", "Printer laser"]);
  assert.equal(logicalPayload.items.some((item) => item.asset_name === "Komputer" || item.asset_name === "Server lama"), false);
  assert.equal(JSON.stringify(logicalPayload).includes("estimated_price"), false);
  results.logicalPayload = { itemCount: logicalPayload.items.length, estimatedPriceAbsent: true, rejectedAbsent: true, parentNotExtraItem: true };
  const transport = await appJson(`/api/internal/marison/outbound/${ids.dispatch}/build`, { method: "POST", internal: true, body: { leaseToken: fixtureLease, transport: true, materializationAttemptId: ids.transportAttempt } });
  assert.equal(transport.value.mintedTokens.length, 1);
  const transportPayload = JSON.parse(transport.value.payloadBody);
  const links = transportPayload.items.flatMap((item) => item.attachments || []).map((item) => item.link);
  assert.equal(new Set(links).size, 1);
  assert.equal(links.length, 3);
  rawBearer = links[0];
  assert.equal(JSON.stringify(await queryOne("marison_outbound_dispatches", "payload_body,response", ids.dispatch)).includes(rawBearer), false);
  const tokenRows = expectNoError(await admin.from("file_view_tokens").select("id,token_hash").eq("transport_attempt_id", ids.transportAttempt), "fixture tokens");
  assert.equal(tokenRows.length, 1);
  assert.equal(tokenRows[0].token_hash.length, 64);
  results.materialization = { tokenCount: 1, sharedLinkCount: links.length, rawBearerNotPersisted: true };

  const beforeRevoke = await fetch(rawBearer);
  assert.equal(beforeRevoke.status, 200);
  assert.match(beforeRevoke.headers.get("content-type") || "", /application\/pdf/i);
  assert.equal(sha256(Buffer.from(await beforeRevoke.arrayBuffer())), sha256(pdfBytes));
  const revoked = await appJson(`/api/admin/recommendation-file-links/${ids.child}/revoke`, { method: "POST", token: adminLogin.token, body: { reason: `${marker} revoke` } });
  assert.equal(revoked.status, 200);
  assert.equal((await fetch(rawBearer)).status, 410);
  results.fileLink = { beforeRevoke: 200, revoke: 200, afterRevoke: 410 };

  const staleAttempt = randomUUID();
  const staleTransport = await appJson(`/api/internal/marison/outbound/${ids.dispatch}/build`, { method: "POST", internal: true, body: { leaseToken: fixtureLease, transport: true, materializationAttemptId: staleAttempt } });
  const staleUrl = JSON.parse(staleTransport.value.payloadBody).items[0].attachments[0].link;
  expectNoError(await admin.from("surat_registrasi").update({ pdf_object_path: `${objectPrefix}/missing-stale.pdf` }).eq("id", ids.child), "stale pointer mutation");
  assert.equal((await fetch(staleUrl)).status, 410);
  expectNoError(await admin.from("surat_registrasi").update({ pdf_object_path: doneChild.pdf_object_path }).eq("id", ids.child), "restore pointer");
  results.stalePointer = { status: 410, storageObjectIntentionallyMissing: true };

  const rejectedItems = [{ id: `${marker}-ALL-REJECTED`, order: 0, status: "not_recommended", applicant_original: { name: "Rejected", quantity: 1, notes: "" }, location: "Gudang", pic: "PIC", rejection_reason: "Ditolak", details: [] }];
  expectNoError(await admin.from("surat_registrasi").insert({ ...parentBase, id: ids.rejectedParent, no_surat: `${marker}/REJECTED-PARENT`, judul_surat: `${marker} rejected parent`, status: "DONE", form_input_data: { request_category: "asset", items: [{ id: rejectedItems[0].id, nama_barang: "Rejected", quantity: 1 }] }, data_snapshot: { recommendation_decisions: rejectedItems } }), "all rejected parent");
  const noDispatch = expectNoError(await admin.rpc("ensure_marison_outbound_dispatch", { p_surat_id: ids.rejectedParent, p_environment: "staging" }), "all rejected no dispatch");
  assert.equal(noDispatch.no_dispatch, true);
  const rejectedCount = expectNoError(await admin.from("marison_outbound_dispatches").select("id", { count: "exact" }).eq("surat_id", ids.rejectedParent), "all rejected rows");
  assert.equal(rejectedCount.length, 0);
  results.allRejected = { noDispatch: true, dispatchRows: 0 };

  const persisted = await queryOne("marison_outbound_dispatches", "payload_body,response,post_started_at", ids.dispatch);
  assert.equal(persisted.post_started_at, null);
  assert.equal(JSON.stringify(persisted).includes(rawBearer), false);
  results.vendorPost = { postStartedAt: null, businessPost: false };
  console.log(JSON.stringify({ phase: "acceptance", runId, marker, results }));
} finally {
  rawBearer = null;
  const residue = await cleanup();
  console.log(JSON.stringify({ phase: "cleanup", runId, marker, complete: true, residue }));
}
