# OPS-21: Controlled Production PDF Load Test

Date: 17 November 2026, Asia/Jakarta. Issue: #1001.
Outcome: test completed with actionable findings, not an unrestricted capacity certification.

## Scope and Safety

The user explicitly requested the production hardware, with access remaining open.
No application image, schema, worker configuration or concurrency was changed.
App and PDF worker stayed at main `505a3d37b5c2c147747e052f5286ee077b1cbd23`,
image `sha256:7a11ca82c067e027a7b41d346f1f8dc365705a66daeef5a9aa5ba6e65de4c91d`.
Worker concurrency stayed at six; CT104 exposes four logical CPUs.

- A deployment lock was held throughout the measured window.
- Baseline observation preceded the test. Initial real and synthetic queues were empty.
- Existing triggers and an insert inside a rolled-back transaction were inspected first.
- Eighty-five synthetic PGD drafts were inserted in batches of 5, 10, 20 and 50.
  Each had 50 synthetic items, no signatures, no recommendation and no external dispatch.
  Test document numbers started with `UJI-OPS21-`; business numbering was not reserved.
- Only test-marked drafts were changed. No real document or approval was processed.
- Informational disruption notice: 15:21-15:51 WIB estimate; completed early at 15:24 WIB.
  Maintenance did not block normal access. Hosting status synchronization independently
  preserved the completed schedule in the public maintenance history.
- Stop conditions included repeated public failures/slow responses, lost monitoring,
  an expired processing lease, an old queued real job, and sustained resource thresholds.
  A phase had a 180-second deadline. Cancellation targeted only queued test jobs;
  processing jobs would have been allowed to drain. No stop condition fired.

The initial operator preflight attempts did not enqueue documents: a deployment-lock
path was corrected, then the notice start was moved beyond the live minimum lead time.
Those setup failures are not application request failures or load-test results.

## Results

Primary observation window: 15:19:21-15:24:36 WIB. Harness finished 15:24:40 WIB.
Elapsed times below cover enqueue through verified completion, not renderer CPU time.

| Batch | Current PDFs completed | Whole batch | Current-job attempts |
| --- | --- | --- | --- |
| 5 documents | 5/5 | 3.918 s | One each |
| 10 documents | 10/10 | 6.955 s | One each |
| 20 documents | 20/20 | 9.715 s | One each |
| 50 documents plus 10 replacement jobs | 50/50 | 40.427 s | One each |

In the last batch, three jobs observed processing and seven observed queued had their
draft source changed from v1 to v2. The harness explicitly enqueued ten replacements.
All ten obsolete jobs ended failed without publishing; seven used one attempt and
three used two. All 50 final document pointers matched their current-source done jobs.
The failed obsolete jobs are audit evidence, not pending user documents.

Public GET samples used `/health/ready` and `/login` from the operator workstation:

| Observation | Samples | Failures | Median | p95 | Maximum |
| --- | --- | --- | --- | --- | --- |
| Baseline | 46 | 0 | 169 ms | 570 ms | 1,640 ms |
| Batch 50 | 34 | 0 | 166 ms | 813 ms | 1,539 ms |
| Entire window | 246 | 0 | See phase-level raw evidence | See phase-level raw evidence | 3,095 ms |

The overall maximum occurred in the announcement period, before PDF load. This is
not proof of its network cause. These short samples do not establish a long-term SLA.
An authenticated admin also opened the all-office dashboard and an existing submission
detail without changing it. Calendar reload completed during the batch-50 window.
This was one interactive session, not a multi-user browser capacity test.

Thirty-four resource samples showed:

- At most six processing jobs; full queue trace peaked at 56 queued jobs after replacements.
- No expired leases or idle-in-transaction sessions in sampled observations.
- No real queued job older than 30 seconds in sampled observations.
- Database connections peaked at 38 against a configured maximum of 100.
- PDF worker sampled peak CPU: 187.13% (about 1.87 logical CPUs, not 187% of the CT).
  Worker memory peaked at 202.5 MiB. App memory peaked at 139.3 MiB.
- Combined app/worker sampled CPU peaked at 189.99%. Sampling can miss short peaks.
- App and PDF worker restart counts remained zero; their image IDs were unchanged.
- CT104 remained at 60% disk use with approximately 45 GiB available.

## Findings

### DOC-15: Deterministic Source Mismatch Causes Retry Flood

Three already-processing obsolete jobs reached the bounded 20-second I/O timeout.
Database logs independently recorded 62,234 `Native PDF source changed` errors:
20,707, 20,739 and 20,788 errors across three database backend PIDs, each over about
20 seconds. Each stream ended with a single lease-ownership rejection after the
worker's failure transition. No active queue or ongoing retry stream remained afterward.

The installed REST server is PostgREST v14.17. The live
`complete_document_pdf_job_pre_keu10` raises SQLSTATE `40001` for deterministic source
mismatch. Client-side SDK retries are disabled, and POST RPC retries are not performed
by that SDK. Server transaction retry behavior is therefore the relevant layer, not
an SDK replay. PostgREST's later changelog explicitly records fixing automatic
40001 transaction retries: https://github.com/PostgREST/postgrest/pull/3673.

Follow-up #1002: use a stable, non-serialization error for deterministic obsolete
sources and classify it terminally in the worker. Preserve source/lease guards and
real serialization-conflict handling. Verify through the actual REST server, not
only mock tests. No such migration, dependency upgrade or worker fix was applied here.

### DOC-15: Fixed-Batch Scheduling Wastes Available Slots

Of 380 queue snapshots in batch 50, 267 showed queued work with only one to five
processing jobs. Source confirms the worker waits for the whole batch to settle
before claiming another batch. A slow stale-source completion consequently leaves
otherwise available slots idle. This is not proof of exhausted CPU or RAM.

Follow-up #1002: a bounded replenishing pool, claiming only available slots, with
proper shutdown and lease handling. Raising concurrency alone does not fix batching.

### OPS-22: Database Docker Log Growth

CT110 was 63% full: approximately 47 GiB total, 28 GiB used and 17 GiB available.
Its PostgreSQL Docker JSON log measured 24,045,874,377 bytes (about 22.4 GiB).
Container logging configuration was `json-file` with no explicit size/file limits.
This total includes prior history; it must not be attributed entirely to this test.
No log, database volume, secret or business document was deleted or truncated.
Follow-up #1003 records archival, bounded logging and coordinated-operation review.

## Recovery and Verification

- Final global queue: 409 done, 35 historical/terminal failed, zero queued/processing.
  Starting counts were 324 done and 25 failed; the difference is 85 current successes
  and 10 intentionally obsolete test failures, not ten failed current documents.
- All 85 test drafts were marked CANCELLED after draining; evidence and PDFs retained.
- Test signatures: zero. Test outbound dispatches: zero.
- Downloaded one PDF from every batch, checked PDF headers, and inspected all three
  pages of the batch-50 sample. Its 50 items contained VERSION 2, not VERSION 1.
- Public status showed services operational, no active maintenance, and the completed
  15:21-15:24 WIB test schedule in history. No incident was invented for a simulated failure.

## Limits and Evidence

This is a bounded production queue/race test, not a destructive stress-to-failure test.
It does not measure 50 simultaneous employees, authenticated API p95, recommendation
attachments, large images, KEU10 snapshots, full approval RPCs, mail or external APIs.
No signer was impersonated. Automatic newest-job enqueue was not validated because
the harness explicitly created replacement jobs. Historical signed PDF behavior was
not re-certified by these unsigned fixtures. Long-tail public routing is still a
separate investigation. These results cannot certify 99.99% availability.

Private operator evidence lives under
`C:/Users/Aldama/.codex/private-ops/production-load-20261117/`:
`run.mjs`, `phase.mjs`, `report.json`, per-phase queue traces, downloaded sample PDFs,
rendered pages, announcement screenshot, and a read-only database-log summarizer.
Secrets, tokens and business-document payloads are not included in this report.
No further production load was added after identifying the retry flood.
