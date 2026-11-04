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

SIGAP generation3 remains terminal and unmodified; no resend or new generation
is authorized. A future delivery fix requires contract tests in staging and
separate explicit permission to recover/send the real production revision.
Original accepted payload/response and examiner history remain immutable.
