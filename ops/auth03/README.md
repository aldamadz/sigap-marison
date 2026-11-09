# AUTH-03 SMTP Recovery

Operator-only scripts; require explicit environment authorization. Never put a
password in argv, logs, Git, a PR, or chat. Read a restricted local credential file
and pipe it over SSH on stdin. Mailbox creation/password entry is a user handoff.
Helpers refuse `-O`, `-OO` and `PYTHONOPTIMIZE` before operator work. Safety gates
use explicit exceptions, not removable assertions; Auth drift still triggers
the existing rollback. Offline regression tests: `python3 -B ops/auth03/test_safety_guards.py`.

`smtp-recovery.py <staging|production> <check|install|verify>` asserts the exact
host, container, deployment environment, public URL, Hostinger hostname/port/TLS
and dedicated `noreply@marison.id` sender. `check` validates the candidate with
Nodemailer inside the existing app container without sending a message. `install`
requires `ACK_SMTP_INSTALL=<environment>`, verifies first, preserves a protected
`before.env`, and atomically changes only `SMTP_PASS`, preserving the original
owner/group and0600/0640 access mode. It does not restart anything.
`verify` uses the actual loaded runtime password after the canonical app deploy.

The production guest has no host Node executable. Use Python3 there; Nodemailer
stays inside the existing application container. Do not install another runtime.

`auth-mailer-recovery.py` is restricted to production CT110, its existing Auth
container and Compose project. It requires `ACK_AUTH_MAILER_RELOAD=production`,
verifies candidate login over validated STARTTLS587, and changes only
`GOTRUE_SMTP_PASS`. Four historical duplicate mailer blocks were explicitly audited;
all four password entries are aligned, no unrelated environment cleanup. Compose
rendering is compared against the current image and full effective environment.
Only the mailer password may differ. Auth alone is recreated using the same local
image, without pulling/upgrading dependencies. A failure restores the previous
environment and Auth. Other container IDs must remain unchanged.

Protected backups/proofs are in each environment's `auth03-smtp-20261109` operator
directory. They are NOT repo artifacts. These helpers never reset a SIGAP user's
password, generate a recovery link, submit a document or take an outbound job.

Application changes follow the normal selective staging/main PR and live staging
ancestry gate. Reload the app through its guarded deployment so it loads the new
password; no worker rollout or database migration is required. A separate one-off
technical self-mail can validate provider acceptance/delivery without contacting
employees or generating recovery links. Do not repeat it automatically on an
ambiguous SMTP outcome.

`mail-delivery-proof.py` runs on Proxmox, sends at most one technical self-mail
from the actual production app runtime, and checks only its unique header in
the service mailbox over validated IMAP993 with read-only EXAMINE. A started-send
journal prevents repeating an uncertain submission. If an accepted journal is
already present, rerunning checks delivery only and does not send another mail.
