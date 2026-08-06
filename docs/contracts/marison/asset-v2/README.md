# Marison Asset Contract v2.0.0

Status: superseded by the vendor OpenAPI published on 6 August 2026. This proposal
is retained as design history and must not be used by the runtime. The active
vendor contract uses top-level `request_number`, has no top-level `attachments`,
and accepts only the documented fields inside each item.

## Endpoint

`POST /asset-purchase-requests`

Contract version: `vendor-asset-2.0.0`

Request header requested from vendor:

`Idempotency-Key: <unique key per submission attempt>`

Vendor should persist the key for the accepted request and return the original
result for a repeated key, including after a client timeout. A key must not be
reused for a different `submission_number` or payload.

## Files

- `asset-purchase-request.schema.json`: strict JSON Schema.
- `asset-purchase-request.example.json`: complete example with two items.
- `success-response.example.json`: successful response example.
- `validation-422-response.example.json`: field-path validation error example.
- `differences-from-v1.md`: change list and rollout request.

## Document rules

- SIGAP sends active/final documents only.
- SIGAP deduplicates documents by storage path.
- Every link is an external file-gateway URL that can be opened by Marison.
- If an active document cannot produce a file-gateway link, SIGAP holds payload
  before POST.
- Draft, temporary, replaced, and deleted files are excluded.
- General attachments contain the final Asset request PDF, combined
  recommendation PDF, and all general requester attachments.
- Recommendation documents are not repeated in each item.
- Item attachments contain recommendation images/screenshots/photos, technical
  item documents, and external reference links.
- Approval or recommendation-signature snapshots are not attachments.
- The canonical center-submission example uses `branch_id: 1` and requester
  Andreas (`A 144`).

## Approval rules

- `approvals` contains approvals for the parent Asset request only.
- The example includes, in order, Staff IT (`A 114`; Aldama is named in notes), Manager PO,
  Manager HRD & GA, Direktur 1, and Direktur Utama.
- Recommendation signers are excluded.
- If one person signs both documents, only the parent-request signature is sent.
- `submitted_by` is requester profile external NIK/mapping.
- `approvals[].nik` is the external NIK of each parent-request signer.
- Requester mapping is never copied to signer fields.

## Rollout outcome

The vendor did not publish this proposal verbatim. SIGAP follows the active
OpenAPI instead and places active request/recommendation documents in
`items[].attachments`. Internal outbox uniqueness remains inside SIGAP; no
`Idempotency-Key` header is sent to the vendor. Production remains unchanged.
