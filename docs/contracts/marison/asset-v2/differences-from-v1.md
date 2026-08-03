# Differences From Asset Contract v1

| Area | v1 | v2.0.0 |
| --- | --- | --- |
| Version | `vendor-openapi-1.0.0` | `vendor-asset-2.0.0` |
| Top-level attachments | Missing | Required; final Asset PDF, combined recommendation PDF, and general requester files |
| Item request identity | `items[].request_number` required | Removed; one `submission_number` covers all items |
| Item recommendation | Missing | `recommendation_action`, `recommendation_description`, and `recommendation_notes` required |
| Item attachments | Unscoped attachment list | Item-only recommendation images, technical files, and external references |
| Recommendation PDF | Repeated on every item by old behavior | Top-level once only |
| Approval scope | Ambiguous | Exactly parent Asset request approvals; example has Staff IT / Aldama, Manager PO, Manager HRD & GA, Direktur 1, and Direktur Utama; recommendation signers excluded |
| Requester identity | Optional `submitted_by` | Required and sourced from requester profile mapping; example uses Andreas (`A 144`) |
| Submission time | Optional `submitted_at` | Required confirmation/registration time |
| Category | Free text | `Pengajuan Pusat` or `Pengajuan Cabang` |
| File policy | Not explicit | Active/final only, path dedupe, external gateway link, fail closed before POST |
| Retry safety | No key requirement | Vendor support requested for `Idempotency-Key` |

The canonical example uses `branch_id: 1` for `Pengajuan Pusat`. Approval
`notes` is optional. Every example item has at least one item attachment, and
top-level attachments include the final request PDF, combined recommendation PDF,
and general requester attachment only.

## Compatibility

This is a breaking contract. SIGAP will not send v2 payloads to a v1 endpoint.
Vendor must confirm staging deployment and endpoint version handling before any
runtime implementation PR.

## Requested vendor confirmation

1. Confirm `POST /asset-purchase-requests` accepts contract `vendor-asset-2.0.0`.
2. Confirm response shapes and field-path errors in the supplied examples.
3. Confirm `Idempotency-Key` is accepted, persisted, and replay-safe.
4. Confirm HTTPS file-gateway links are reachable from staging.
5. Provide staging endpoint/version metadata and a test response ID.

After confirmation, SIGAP will prepare a separate implementation PR containing
runtime schema changes, contract tests, and staging acceptance only. No production
dispatch is part of that step.
