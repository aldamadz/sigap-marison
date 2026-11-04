# Unit Revision Contract Required

Issue #797. Production051/UAI/MKT.1.SGN/X/2026 was accepted as submission_id2 in
dispatch generation2. After a vendor revision request and SIGAP reapproval,
generation3 failed locally before POST because the selected units are no longer
proven unsubmitted. Three build attempts are not three vendor submissions.

The [official OpenAPI](https://external.marisonregency.id/docs), checked
November4,2026, documents only `POST /unit-submissions` (Create Submission Unit).
It does not document an update/revision endpoint or duplicate-safe resubmission
semantics for a previously accepted submission number. Do not infer that POST
updates an existing record, invent a PUT/PATCH endpoint, or remove duplicate guards.

## Required Digivasi Confirmation

- How to revise accepted submission_id2 for the same submission_number, retaining
  its identity rather than creating another submission or order.
- Exact endpoint/method, request schema, revision identifier and allowed fields.
- How an allocated unit with has_submitted=true is associated with this accepted
  submission, and how another submission's unit remains protected.
- Idempotency/retry rules and response/lookup for confirming revision acceptance.
- Whether prior Purchasing/SPK processing must be returned or unlocked first.

Initially SIGAP generation3 remained terminal and no resend was authorized.
On November4 the user subsequently accepted the explicitly explained risk of a
duplicate submission/SPK and authorized one operator POST for051 with its existing
submission number. This is a bounded operator exception, not a reusable vendor
contract or permission to bypass the guard for other revisions. Capture payload
hash, exclusive single attempt and response; never retry an ambiguous outcome.
A general delivery fix still requires contract tests in staging.
Original accepted payload/response and examiner history remain immutable.

## Observed Authorized One-Shot Result

After staging55583dc and production2d02f73 passed deployment and acceptance,
exactly one operator POST for051 returned HTTP200 with submission_id2 (unchanged),
total_units3, total_addendum7116262 and statusreview. Canonical body SHA256:
`223dd3853ebed00c42c877cdfd2173ed8bf180012edd292996c16accb54afaf3`.
The actual receipt is audited on generation3, without reopening the queue or
altering accepted generation2. There was no second business POST or automatic retry.
This establishes acceptance for this case only: it does not document concurrency,
idempotency, unit ownership or downstream Purchasing/SPK effects. Keep the general
revision guard until those contracts and staging tests are available.
