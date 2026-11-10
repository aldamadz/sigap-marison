#!/usr/bin/env bash
set -euo pipefail
[[ "$(hostname)" == sigap-app-prod-01 && "$(cat /run/systemd/container 2>/dev/null)" == lxc ]] || {
  echo 'Production lock requires CT104.' >&2; exit 1;
}
[[ -d /opt/sigap/image-retention && ! -L /opt/sigap/image-retention ]] || {
  echo 'Install retention state directory before a production rollout.' >&2; exit 1;
}
exec 9>/opt/sigap/image-retention/deployment.lock
flock --exclusive --nonblock 9 || { echo 'Another production rollout/cleanup holds the host lock.' >&2; exit 75; }
export SIGAP_PRODUCTION_LOCK=1
exec "$@"
