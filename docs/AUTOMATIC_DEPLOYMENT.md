# Automatic app deployment

`staging` pushes run the full quality gate, then deploy only `agenda-flow-staging`.
`main` pushes and successful staging deployments check that the *live* staging
runtime contains the current `main` commit. Only then can the production app
deploy. Both jobs use the repo-scoped `sigap-deploy` runner on the Ubuntu host.
The runner is a `marison` user service (`ops/sigap-github-runner.service`), and
the two `.env` files remain only in `/home/marison/sigap-deploy/{staging,production}`.
GitHub has no copy of them or of an SSH private key.

Deploys are app-only. They do not execute migrations or recreate PDF, sync, or
outbound workers. A migration or worker-source change since the live runtime
stops the automatic deploy. Apply and verify migrations, or plan a coordinated
worker rollout, then deploy that release manually; do not bypass the guard by
editing an applied migration or marking an unapplied migration as applied.
The deploy script checks the checkout SHA, environment identity, image revision,
container health, and public `/health/version`, then smoke-tests live/ready and
the root page. On a failed recreation, it restores the previous app image.

The production workflow also runs when the staging workflow succeeds. A push to
`main` that has not yet been merged and deployed to staging is skipped, not
silently released. After the regular `main` -> `staging` synchronization and
successful staging deploy, production is retried automatically. Jobs are
serialized per environment and do not cancel a running deploy.

The private repository's current GitHub plan does not provide branch protection
or environment approval rules. Only trusted maintainers should be able to push
to `main` or `staging`; never run pull-request code on the deployment runner.
The runner has Docker access on a host shared by staging and production, so
repository write access is a sensitive infrastructure privilege. For stronger
isolation, move deployment to separate runners/hosts with restricted identities
before adding more maintainers or accepting external contributions.
