# Marison Cloud Terms Maintenance

## 2026-11-03 Group Privacy And Landing Follow-up

The owner explicitly extended Privacy to all official group systems. Privacy
v2.0 (`ops/status-page/privacy.mjs`) now replaces the old Absensi-only public
notice; TOS v1.2 refers to it. This supersedes the scope/hosting statements
below that described the earlier release. See `PRIVACY_REVIEW.md` for evidence
and limits; original Absensi source is retained unmodified in its repository.

The public edge Worker serves `/privacy[/]` and `/terms[/]`, plus legal assets.
Only a successful HTML GET on the main host `/` is enhanced with same-origin
stylesheet/script and a no-JavaScript fallback footer. The existing React
landing and all its assets remain at origin; its header/footer gain links
after mounting. No login/session/form data is inspected. Non-HTML responses,
origin failures, non-root paths and business API requests pass through.
Keep CSP/security headers; discard body validators on transformed HTML.
Staging `/_preview/landing` is an explicit navigation fixture, not a copy of
the live application, and must return 404 in production. Verify the actual
production landing after release, including its existing access button.

Main-host route `marisoncloud.com/*` is required because Cloudflare route
patterns cannot contain query parameters. The handler itself limits rewriting
to exact root HTML, serves the listed policy paths, and passes every other
path/method through unchanged. The pre-existing Terms prefix and unrelated
zone routes remain unchanged. Roll back by removing only the new main-host
route and restoring the previous page Worker; never change DNS or origin data.

## Owner And Scope

2026-11-03 [Codex], user correction: Terms apply only to services owned or
officially operated by Marison Regency Group. Public wording must not name
unaffiliated applications or imply ownership merely from a shared domain.
This supersedes the earlier named-exclusion approach. Keep Terms aligned with
future service changes. Source: `ops/status-page/terms.mjs`. Canonical page:
`https://marisoncloud.com/terms`. The privacy link remains the user-supplied
`https://marisoncloud.com/privacy`; that page currently covers Absensi only.

## Required Release Review

For every service change, include a TOS-impact check in the worklog/PR:

1. Identify changes to features, account/access rules, data collection/sharing,
   AI/provider handling, notifications, retention, availability or user duties.
2. If user-facing terms change, edit the relevant source section, advance the
   version/date, and add a dated summary to `TERMS.history`. Preserve earlier
   history; retain prior wording through Git and archive the prior source when
   introducing a new version. Do not backdate changes.
3. If no TOS change is needed, record why (for example, an internal bugfix with
   no changed behavior or data practice). Do not introduce unrelated legal
   changes simply to change the version number.
4. Verify facts with the service owner. Do not invent fees, guarantees, legal
   entities, contact details, blanket waivers or retroactive user consent.
   Material legal/commercial changes require owner/legal review before release.
5. Check the privacy notice's actual scope. A general TOS does not silently
   broaden the Absensi privacy policy. Request a separate privacy-policy review
   if new data practices need it.
6. Test rendering, theme behavior, mobile overflow, exclusion, version/history,
   canonical URL, policy links, and bundled output in staging before production.
7. Publish the update with the relevant release notes/notice. The checklist is
   a maintenance obligation, not an autonomous legal-policy publishing agent.

## Hosting Boundary

The Terms page is edge-hosted by `marison-status-page` on route
`marisoncloud.com/terms*`. Only `/terms`, `/terms/`, `/terms/theme.js`, and
`/terms/logo.png` are edge-owned. Other main-host paths pass through to the
existing origin; no application rebuild is required. Existing routes and main
root/privacy response hashes must be preserved in a scoped rollout.

Do not rebuild the dirty `D:/Koding/marisdrive` checkout to publish this page.
Its changes belong to other work. Coordinate any future move of the legal
page into the main application with that repository's owner/release process.
