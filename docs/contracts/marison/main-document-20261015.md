# Main Document Contract - 15 October 2026

Primary source: https://external.marisonregency.id/docs

The inline OpenAPI 3.1 document was inspected on 15 October 2026. All four
existing SIGAP outbound endpoints expose the same top-level property:

```json
{
  "main_document": {
    "type": "string",
    "format": "uri",
    "description": "URL dokumen utama pengajuan (opsional)."
  }
}
```

| Endpoint | Main document | Supplementary attachments |
| --- | --- | --- |
| `/unit-submissions` | `main_document` URL | `attachments[]` objects with `name`, `link` |
| `/non-unit-submissions` | `main_document` URL | `attachments[]` objects with `name`, `link` |
| `/asset-purchase-requests` | `main_document` URL | `items[].attachments[]` objects with `name`, `link` |
| `/fund-submissions` | `main_document` URL | `attachments[]` objects with `name`, `link` |

Example delta (not a complete request):

```json
{
  "main_document": "https://sigap.example.test/api/files/view/EXAMPLE/form.pdf",
  "attachments": [
    { "name": "RAB", "link": "https://sigap.example.test/api/files/view/EXAMPLE/rab.pdf" }
  ]
}
```

For Asset requests the attachment array belongs to each item, not the root.
Recommendation PDFs remain supplementary Asset item attachments. They must not
replace the parent application's main document. KEU 1 and KEU 10 use Fund's
existing endpoint and receive the same separation as PGD Dana.

SIGAP requires a canonical final PDF when preparing a fresh payload; the vendor
property remains optional in the validator so old frozen jobs are compatible.
Never promote a RAB, native source marker, spreadsheet or recommendation PDF
to the main document when the parent final PDF is unavailable. Keep the native
PDF preparation/retry gate. Missing or invalid main links fail before POST.
Persistent application-domain file links retain existing document authorization;
storage endpoints and secrets are not exposed. Diagnostics redact bearer URLs.

New contract versions include `2026-10-15-main-document`. Historical fixtures and
frozen payloads/hashes remain unchanged; deployment does not retry rejected jobs.
Published documentation does not prove vendor production schema deployment.
Issue #604's already-POSTed rejection needs vendor confirmation and separate
authorized recovery. No migration or worker source change is required here.
