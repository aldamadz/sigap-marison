#!/usr/bin/env bash
set -euo pipefail

require_ready="${1:-}"
main_sha="$(git rev-parse HEAD)"
git fetch --quiet origin +refs/heads/staging:refs/remotes/origin/staging

ready=false
if git merge-base --is-ancestor "$main_sha" origin/staging; then
  staging_sha="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
    https://sigap.marison-testing.biz.id/health/version | node -e '
      let body = "";
      process.stdin.on("data", chunk => { body += chunk; });
      process.stdin.on("end", () => {
        const sha = JSON.parse(body).gitSha;
        if (!/^[0-9a-f]{40}$/.test(sha)) process.exit(1);
        process.stdout.write(sha);
      });
    ')"
  if git cat-file -e "${staging_sha}^{commit}" 2>/dev/null && \
     git merge-base --is-ancestor "$main_sha" "$staging_sha" && \
     git merge-base --is-ancestor "$staging_sha" origin/staging; then
    ready=true
  fi
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  printf 'ready=%s\n' "$ready" >> "$GITHUB_OUTPUT"
fi

if [[ "$ready" != true ]]; then
  echo "Production deploy waiting: live staging does not yet contain main $main_sha."
  [[ "$require_ready" != --require-ready ]]
else
  echo "Live staging contains main $main_sha."
fi
