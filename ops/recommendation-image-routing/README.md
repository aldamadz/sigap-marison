# Recommendation Image Routing / REC-05 / Issue #741

## Completed Recovery (2026-10-23)

Production recommendation015/UAI/PBO.4/X/2026 retained ten valid PNG objects.
Direct storage relay returned200 and the correct bytes; the public hostname
returned404 from the application. The active shared Caddy SIGAP host lacked its
established public-storage relay. The persisted host Caddyfile already contained
the correct rule, but the active configuration and old single-file mount differed.

The recovery inserted only `/storage/v1/object/public/*` to the existing relay
`192.168.0.251:3082` before SIGAP's unchanged application handlers. Root ETag and
full configuration equality protected against concurrent/unrelated proxy edits.
Only existing public storage paths are relayed; signed/authenticated storage and
auth routes are not broadened. No bucket ACL, RLS, origin isolation, upload,
document content or attachment references were changed.

Six Python tests and real isolated Caddy acceptance on the staging operator host
passed before production mutation. All ten origin PNG hashes matched the
direct relay. Exact-file Cloudflare purges removed negative cache entries for
26 current recommendation image URLs, not the entire zone.

Chrome decoded all26 production images and six staging images with nonzero
dimensions. Desktop1440/mobile390 screenshots verified actual image rendering.
Staging uses its existing Supabase public image origin; no staging route change
was needed. Root/live/ready/version/maintenance returned200 in both environments.
The live source SHAs remained staging5fef5a38a09cf28ecdf79e23978bdb644de74dd7 and
productionb5bcb21f67781960ff93df412784b307dc524789.

This is an operations-only repair, NOT an application deployment, PDF rebuild,
approval, data repair or outbound resend. Do not merge this evidence merely to
trigger an app rollout. There is no claim of hosted CI or full application tests.

## Operator Safeguards

- Run `python -m unittest discover -s ops/recommendation-image-routing` locally.
- On the staging operator host, `staging_test.py` runs a disposable Caddy with
  loopback listeners and deterministic mock origins; it removes its container.
- Inside CT103, `recover.py preflight` accepts a JSON array of existing public
  image paths on stdin. `apply` repeats all guards and patches one route array.
- A matching active rule causes fail-closed drift rejection, not a second insert.
  This recovery is complete: do not rerun apply after success.
- Private full configuration backups/proof reside inside CT103 at
  `/root/sigap-image-routing-741/1792736914561672563`. Never commit those files.
- The old shared Caddyfile bind mount still points at an older inode. Do not
  blindly reload its in-container file or publish all host-file pending edits.
  Persisted host source already includes the public relay and was unchanged.
  Reconcile the shared mount under a separately reviewed infrastructure change.
- Add a known existing public image probe to future proxy acceptance, in
  addition to root/health: a healthy app does not prove storage routing works.
- A browser retaining a previously cached404 may require one hard refresh after
  edge purge. No file re-upload is required.
