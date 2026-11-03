# Marison Cloud Terms Maintenance

## Owner And Scope

2026-11-03 [Codex]: The user requires the Terms of Service to cover all Marison
Cloud services except `xau.marisoncloud.com`, and to stay aligned with future
changes. Source: `ops/status-page/terms.mjs`. Public canonical page:
`https://marisoncloud.com/terms`. Do not change the XAU exclusion without an
explicit new instruction. The privacy link remains the user-supplied
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
