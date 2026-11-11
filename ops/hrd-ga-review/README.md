# SUR-48 Activation

Apply migration `20261111150000` and deploy the new registration UI first.
Then invoke the private `hrd_ga_review_internal.configure(expected_count)` as
the database operator, in a bounded transaction with configuration snapshots
and unchanged business-table hashes. Expected counts: staging12, production7.
The function refuses unknown required inputs/attachments; do not bypass it.

Staging has two legacy UJI Fund usages with a required `rab` file on the HRD
manager step. The requested no-mandatory-file examination also applies to these
fixtures. Before calling configure, make ONLY these two rules optional in the
same transaction. Match an active usage whose name starts `[UJI STAGING `,
HRD & GA department, memeriksa role, label `Mgr. HRD & GA`,
`review_mode=fund_item_checklist`, and `requirement_key=rab`. Assert exactly two
matching required rules. Production has no matching UJI rules; assert zero.
Keep requirement keys, optional upload support and all old signature snapshots.
Do not weaken any other attachment rule or rewrite existing documents.

Rehearse activation with ROLLBACK before committing it. Store the full pre-change
steps, verifier pools AND attachment rules in a private operator audit file.
Check one selected examiner per new routed signature; manager approval must
remain blocked until verification. No historical business approval or resend.
