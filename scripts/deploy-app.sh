#!/usr/bin/env bash
set -euo pipefail

environment="${1:-}"
target_sha="${2:-}"
mode="${3:-}"
[[ -z "$mode" || "$mode" == --check-only || "$mode" =~ ^[0-9]{14}(,[0-9]{14})*$ ]] || { echo 'Invalid deploy mode.' >&2; exit 2; }
case "$environment" in
  staging)
    service=agenda-flow-staging
    project=agenda-flow-staging
    image=agenda-flow:staging
    container=agenda-flow-staging
    domain=https://sigap.marison-testing.biz.id
    supabase_ref=wrufczusfopgvwvxsmjk
    ;;
  production)
    service=agenda-flow
    project=agenda-flow-production
    image=agenda-flow:production
    container=agenda-flow-prod
    domain=https://sigap.marisoncloud.com
    supabase_ref=xuhyodtmgwteyslhrkfx
    ;;
  *) echo 'Usage: deploy-app.sh staging|production <git-sha>' >&2; exit 2 ;;
esac

[[ "$target_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid target SHA.' >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$target_sha" ]] || { echo 'Checkout does not match target SHA.' >&2; exit 1; }

env_file="/home/marison/sigap-deploy/$environment/.env.$environment"
env_link=".env.$environment"
compose_file="docker-compose.$([[ "$environment" == production ]] && echo prod || echo staging).yml"
[[ -f "$env_file" ]] || { echo "Missing host $environment environment file." >&2; exit 1; }
[[ ! -e "$env_link" && ! -L "$env_link" ]] || { echo 'Workspace environment file already exists.' >&2; exit 1; }

previous_sha="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
  "$domain/health/version" | node -e '
    let body = "";
    process.stdin.on("data", chunk => { body += chunk; });
    process.stdin.on("end", () => {
      const sha = JSON.parse(body).gitSha;
      if (!/^[0-9a-f]{40}$/.test(sha)) process.exit(1);
      process.stdout.write(sha);
    });
  ')"
git cat-file -e "${previous_sha}^{commit}" || { echo 'Live SHA is absent from checkout history.' >&2; exit 1; }
git merge-base --is-ancestor "$previous_sha" "$target_sha" || { echo 'Target is not a descendant of live runtime.' >&2; exit 1; }

node scripts/deploy-migration-gate.mjs "$previous_sha" "$target_sha" "$mode"

worker_changes="$(git diff --name-only "$previous_sha" "$target_sha" -- \
  pdf-worker.mjs pgd-pdf-renderer.mjs recommendation-pdf.mjs recommendation-native-pdf.mjs \
  document-layout-rules.mjs server/pdf-worker-job.mjs server/marison-sync-worker.mjs \
  server/marison-outbound-worker.mjs)"
if [[ -n "$worker_changes" ]]; then
  echo 'Worker code changed since live runtime; coordinated worker rollout is required.' >&2
  exit 1
fi

ln -s "$env_file" "$env_link"
started=0
previous_image="$(docker inspect --format '{{.Image}}' "$container")"
export DEPLOY_GIT_SHA="$target_sha"
compose=(docker compose --project-name "$project" -f "$compose_file" --env-file "$env_link")

cleanup() {
  result=$?
  if [[ "$result" -ne 0 && "$started" -eq 1 ]]; then
    echo 'Deployment failed; restoring the previous app image.' >&2
    docker image tag "$previous_image" "$image"
    export DEPLOY_GIT_SHA="$previous_sha"
    "${compose[@]}" up -d --no-deps --no-build --force-recreate "$service" || true
  fi
  rm -f "$env_link"
}
trap cleanup EXIT

"${compose[@]}" config --quiet
"${compose[@]}" config --format json | node -e '
  let body = "";
  process.stdin.on("data", chunk => { body += chunk; });
  process.stdin.on("end", () => {
    const config = JSON.parse(body);
    const service = config.services[process.argv[1]];
    const expectedHost = `${process.argv[2]}.supabase.co`;
    const expectedEnvironment = process.argv[3];
    const expectedUrl = process.argv[4];
    const env = service?.environment;
    if (!env || new URL(env.SUPABASE_URL).hostname !== expectedHost ||
        new URL(env.VITE_SUPABASE_URL).hostname !== expectedHost ||
        env.MARISON_DEPLOYMENT_ENVIRONMENT !== expectedEnvironment ||
        env.APP_PUBLIC_URL !== expectedUrl) {
      console.error("Deployment environment identity mismatch.");
      process.exitCode = 1;
    }
  });
' "$service" "$supabase_ref" "$environment" "$domain"

if [[ "$mode" == --check-only ]]; then
  echo "$environment deployment preflight passed; no container was changed."
  exit 0
fi

if [[ "$previous_sha" == "$target_sha" ]]; then
  echo "$environment is already at $target_sha."
  exit 0
fi

"${compose[@]}" build "$service"
image_sha="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")"
[[ "$image_sha" == "$target_sha" ]] || { echo 'Built image revision mismatch.' >&2; exit 1; }

started=1
"${compose[@]}" up -d --no-deps --no-build "$service"
for attempt in {1..36}; do
  state="$(docker inspect --format '{{.State.Health.Status}}' "$container")"
  [[ "$state" == healthy ]] && break
  sleep 5
done
[[ "$state" == healthy ]] || { echo 'App container did not become healthy.' >&2; exit 1; }

container_sha="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$container")"
[[ "$container_sha" == "$target_sha" ]] || { echo 'Running image revision mismatch.' >&2; exit 1; }

for attempt in {1..12}; do
  live_sha="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
    "$domain/health/version" | node -e '
      let body = "";
      process.stdin.on("data", chunk => { body += chunk; });
      process.stdin.on("end", () => process.stdout.write(JSON.parse(body).gitSha || ""));
    ')" || live_sha=""
  [[ "$live_sha" == "$target_sha" ]] && break
  sleep 5
done
[[ "$live_sha" == "$target_sha" ]] || { echo 'Public runtime revision mismatch.' >&2; exit 1; }
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 --output /dev/null "$domain/health/live"
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 --output /dev/null "$domain/health/ready"
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 --output /dev/null "$domain/"
echo "$environment app deployed at $target_sha; workers were not restarted."
