#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  staging) domain=https://sigap.marison-testing.biz.id ;;
  production) domain=https://sigap.marisoncloud.com ;;
  *) echo 'Usage: quality-live-base.sh staging|production' >&2; exit 2 ;;
esac

base_sha="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 \
  "$domain/health/version" | node -e '
    let body = "";
    process.stdin.on("data", chunk => { body += chunk; });
    process.stdin.on("end", () => {
      const sha = JSON.parse(body).gitSha;
      if (!/^[0-9a-f]{40}$/.test(sha)) process.exit(1);
      process.stdout.write(sha);
    });
  ')"
git cat-file -e "${base_sha}^{commit}"
git merge-base --is-ancestor "$base_sha" HEAD || {
  echo 'Live runtime is not an ancestor of the deploy target.' >&2
  exit 1
}
printf 'BASE_SHA=%s\n' "$base_sha" >> "$GITHUB_ENV"
echo "Affected tests will cover live $1 runtime through target HEAD."
