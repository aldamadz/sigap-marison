# Vendor Main Document Schema: 2026-10-19

Owner: Codex, MRN-24 / Issue #648. Evidence collected read-only from the active
self-hosted production database, not the retired Cloud project. Raw evidence is
restricted to the operator; this report deliberately excludes SQL, connection
details, personal identifiers, bearer URLs and frozen business payloads.

## Confirmed Failures

| Letter | Generation | Last attempt (WIB) | Vendor relation |
| --- | --- | --- | --- |
| 010/UAI/06-KWS1.2.1/X/2026 | 1 | 19 Oct 2026, 11:33 | fund_submissions |
| 051/UAI/MKT.1.SGN/X/2026 | 1 | 19 Oct 2026, 11:33 | unit_submissions |
| 001/UAI/HRD.1/X/2026 | 2 | 15 Oct 2026, 10:11 | asset_purchase_requests |

All three persisted HTTP 422 responses report SQLSTATE 42703 (undefined column)
for `main_document` in the vendor database. Frozen body SHA256 checks still match
each stored payload hash. Unit contains three ready units, not thirty, consistent
with the partial examination; Fund uses `production_cost`.

The older Asset generation 2 payload does not contain `main_document` and still
fails on that column. Its generation 1 was previously accepted with a vendor
reference. Therefore removing the new field or blindly generating a fresh Asset
request would neither address the schema defect nor be duplicate-safe.

## Contract and Digivasi Handoff

The [official documentation](https://external.marisonregency.id/docs) describes
`main_document` as an optional URI string for Asset, Fund, Unit and Non Unit.
The observed rejection is a vendor schema/application mismatch, not proof that
the business data is invalid. Ask Digivasi to:

1. Verify the application release and database migration alignment for those
   three relations and the documented `main_document` contract.
2. Confirm the correction in the actual production environment, without sending
   a duplicate business submission merely to probe readiness.
3. Check whether each failed attempt left a vendor record, especially the Asset
   revision whose original submission already exists, and provide the supported
   duplicate-safe revision/recovery path.

This report does not prescribe or execute vendor SQL. The last failure does not
prove whether Digivasi has since corrected its database.

## SIGAP Change and Boundaries

The admin queue recognizes this specific historical schema error and presents a
sanitized explanation before any replacement action. Read-only preflight uses
the same safe diagnosis. Other validation errors retain their established path.
No raw response is returned to the client. Admin authorization and environment
filtering remain in place.

No payload fields are removed, no existing jobs/hashes are rewritten and no
replacement or outbound POST is performed. Production recovery still requires
separate explicit permission and vendor receipt/duplicate checks. No SIGAP or
vendor database migration is part of this change.
