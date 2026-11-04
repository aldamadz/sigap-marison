# SIGAP Desktop Staging Contract

2026-10-22 [Codex], AUTH-09 / Issue #718.

## Scope and Status

Base URL: `https://sigap.marison-testing.biz.id`.
Public client identifier: `sigap-desktop-staging` (not a secret).
Staging pilot only; production routes are disabled. Release/acceptance evidence
is appended to `docs/WORKLOG.md`; code existing in Git is not deployment proof.

SIGAP remains the account authority. This is a narrow, versioned SIGAP device
pairing protocol, **not** a general OAuth/OIDC server or a Supabase access token.
It uses browser consent, an eight-digit confirmation code and an S256 proof.
No desktop client secret, SIGAP password, Supabase key or browser cookie belongs
in the desktop app. Its token cannot call the web BFF or approval/admin APIs.

## Pairing

1. Rust creates a cryptographically random verifier (43-128 URL-safe characters),
   `BASE64URL_NO_PAD(SHA256(verifier))`, and an installation UUID persisted per
   OS-user/application installation. Hostname is display metadata, not identity.
2. `POST /api/desktop/pairings`, JSON:

```json
{
  "client_id": "sigap-desktop-staging",
  "installation_id": "11111111-1111-4111-8111-111111111111",
  "device_name": "LAPTOP-FINANCE",
  "platform": "windows",
  "code_challenge": "<43-character-base64url-sha256>",
  "code_challenge_method": "S256"
}
```

`platform` is `windows` or `macos`, device name 1-100 characters without control
characters. Success200: `device_code`, `user_code` (eight digits, keep leading
zeros), `verification_uri`, `expires_in:300`, `interval:5`, `client_id`.
The request secret and verifier stay in Rust memory, not logs/URLs/JavaScript.

3. Display `user_code`; open the returned URI in the **system browser** after
   validating HTTPS, exact staging host, `/desktop/authorize` and a UUID `request`
   query. Do not accept arbitrary URLs from remote content. User logs in to
   SIGAP if needed, enters the code from their app and explicitly approves.
   No redirect/deep-link registration or local HTTP listener is needed.
4. Poll no faster than every five seconds:

```http
POST /api/desktop/token
Content-Type: application/json
```

```json
{
  "client_id": "sigap-desktop-staging",
  "device_code": "<from-step-2>",
  "code_verifier": "<original-Rust-verifier>"
}
```

202 `{"error":"authorization_pending"}` means wait. 429 `slow_down` includes
`Retry-After:5`; back off. 401 `access_denied`, `expired_request`, `invalid_grant`
or `invalid_session` stops the attempt. Restart from step1 when appropriate.
The code is single-use; a lost successful exchange requires fresh pairing.

Success200 returns `token_type:Bearer`, `access_token`, `refresh_token`,
`expires_in` (at most600 seconds), `session_id`, `user_id`,
`session_expires_at` (absolute30 days) and
`scope:"profile:read notifications:read notifications:mark_read"`.

## Desktop APIs

Send credentials only to the exact staging origin via Rust HTTPS, using
`Authorization: Bearer <access_token>`. Never query parameters or cookie sharing.
Every response has `Cache-Control:no-store`. Do not follow credential-bearing
redirects to other origins. No permissive browser CORS has been enabled.

| Method / Path | Response / Behavior |
| --- | --- |
| GET `/api/desktop/me` | Minimal own `user:{id,full_name}`, `device:{id,name}` |
| GET `/api/desktop/notifications` | `items`, `next_cursor`, `poll_interval:30`, `server_time` |
| GET `/api/desktop/notifications?before=<next_cursor>` | Next page, maximum50, descending `(created_at,id)` |
| POST `/api/desktop/notifications/:id/read` | Marks an owned notification read; foreign/missing ID404 |
| POST `/api/desktop/refresh` | JSON `client_id`, `refresh_token`; rotates both credentials |
| POST `/api/desktop/logout` | Revokes current desktop session; does not log out web |

Notification items contain only `id,type,title,message,is_read,created_at,read_at,path`.
`path` is a safe relative SIGAP dashboard/calendar/letter path, or null. Never
execute message HTML or infer privileges from its text. No raw `data` field,
private attachment link, arbitrary external URL or other user's notifications.

Refresh before expiry with a **single-flight Rust operation**. Persist the new
refresh token atomically before allowing a second refresh. Do not blindly retry
a timed-out refresh with the old credential: reused refresh credentials revoke
the entire device session. Lost/uncertain refresh response requires pairing
again. Refresh never extends the30-day absolute lifetime. A disabled, deleted,
banned account, password change, expired or revoked session fails401.

## Notification Delivery

Initial pilot uses the existing notification inbox with a30-second fetch while
the desktop process is running, not a new duplicate notification producer or
vendor push service. Each client polls once per account, not once per window.
Use jitter, backoff on429/5xx/offline, never tight-loop, resume on network return.

On first login, fetch/paginate inbox to establish baseline and show unread
history in-app; do not generate a flood of old OS notifications. Subsequently
fetch newest page and continue through `next_cursor` until reaching previously
seen IDs. For a large offline backlog finish pagination and queue it before
advancing the baseline; persist seen IDs and delivery state per origin/user.
Display newly discovered notifications oldest-first, at most once per ID.
Receiving/displaying is **not** mark-read: call `/read` only on user interaction.
Read status is shared with web; OS popup delivery cannot be guaranteed by SIGAP.

For desktop app in tray/menu bar this loop can continue; fully quitting stops
it. Notifications while the process is fully closed require a separate future
APNs/WNS/push design. Existing web SSE is not a supported desktop endpoint.

On click open only the fixed staging origin plus validated `path` in the system
browser. Browser may independently ask for SIGAP login; do not inject desktop
tokens, cookies or passwords into the URL/browser. Lock-screen notification
previews should default to a generic message; let the user opt in to detail.

## Web Consent and Revocation

These are **SIGAP same-origin browser-cookie APIs**, not desktop Bearer APIs:

| Method / Path | Authorization |
| --- | --- |
| GET `/api/desktop/pairings/:id` | Active SIGAP web account, pending nonexpired request |
| POST `/api/desktop/pairings/:id/decision` | Same account, JSON `user_code`, `approve`; max5 incorrect codes |
| GET `/api/desktop/devices` | Own latest200 sessions, metadata only |
| POST `/api/desktop/devices/:id/revoke` | Own session only |
| GET `/api/desktop/admin/devices` | Active SIGAP web admin, latest200 sessions |
| POST `/api/desktop/admin/devices/:id/revoke` | Active SIGAP web admin |

UI: Settings > Perangkat terhubung; admin Konfigurasi > Perangkat Desktop.
Revocation is enforced on the next API call, without waiting for token expiry.
Web sign-out does not revoke independent desktop sessions. Changing the SIGAP
password invalidates existing desktop sessions; users must reconnect them.
Pairing tables/session/used-refresh hashes are private service-role-only, with
RLS, explicit grants, no browser access. No plaintext credentials stored in DB.

## Release Boundary

Migration: `20261022120000_desktop_notification_sessions.sql`, additive.
App rollout only; no worker, vendor, email or approval change. Rollback app
routes to disabled; revoke pilot sessions and retain audit metadata. Never undo
production auth or replay migrations. Production requires separate approval,
client/origin configuration review and acceptance from the actual signed apps.

## Tauri References

- [Notifications](https://v2.tauri.app/plugin/notification/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [System opener](https://v2.tauri.app/plugin/opener/)

Use official current Tauri2 docs for the team's installed version. Windows/macOS
native permissions, app identity, packaging and signing must be tested by the
desktop team; a browser toast is not proof of native notification delivery.

## Staging Activation Evidence

2026-10-22 [Codex]: activated at runtime
`cb56ddceca371a25078040d667141dc496ac35d0` (PR #719/#720), with the selected
migration20261022120000 applied and private-table/RPC grants verified.
Earlier404 responses came from the pre-AUTH-09 runtime, not a Tauri client error.

All seven desktop endpoints passed authenticated public acceptance: pairing,
token exchange, profile, notification list, mark-read, refresh and logout.
53 temporary tester notifications traversed two pages without loss; foreign
read attempts404, missing desktop credentials401, and non-admin device admin403.
Fixtures were removed and acceptance device sessions revoked. No existing
notification, document, approval, vendor job or production data was changed.

Real browser approval and admin revocation passed, including1440px desktop and
390px mobile light/dark layouts. Admin revocation immediately rejects the device
token. Native Windows/macOS app delivery remains the desktop team's acceptance.

Clean exact-merge Linux checks:27 targeted tests, PostgreSQL17 assertions and
concurrent single-use exchange, lint/typecheck/frontend/backend build passed.
Hosted CI could not start due account billing/spending; it is not reported as
CI success. Four existing moderate development advisories remain; no high or
critical advisory. The app-only rollout left all four staging workers/services
on their previous container IDs/images. Production remains unchanged.
