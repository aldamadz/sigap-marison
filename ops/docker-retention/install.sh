#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 && "$(hostname)" == sigap-app-prod-01 ]] || { echo 'CT104 root operator required.' >&2; exit 1; }
[[ $# == 1 && -d "$1" ]] || { echo 'Pass the audited bootstrap directory.' >&2; exit 2; }
bootstrap="$(realpath "$1")"
[[ "$bootstrap" == /root/sigap-retention-survey-* ]] || { echo 'Unexpected bootstrap location.' >&2; exit 1; }
[[ ! -e /opt/sigap/image-retention && ! -e /usr/local/lib/sigap-image-retention ]] || {
  echo 'Installation already exists; audit an explicit update instead.' >&2; exit 1;
}
command -v visudo >/dev/null
command -v flock >/dev/null
/usr/local/bin/node --input-type=module - "$bootstrap" <<'JS'
import { readFileSync } from 'node:fs';
import { validateState } from './scripts/docker-retention-plan.mjs';
const dir=process.argv[2], state=JSON.parse(readFileSync(dir+'/state.json','utf8'));
validateState(state);
const policy=JSON.parse(readFileSync(dir+'/policy.json','utf8'));
if(policy.keepRollbackCount!==3||policy.cacheOlderThanHours!==168)throw Error('Unexpected retention policy');
JS
install -d -m 0755 /usr/local/lib/sigap-image-retention/scripts /usr/local/lib/sigap-image-retention/ops/docker-retention
install -m 0644 scripts/docker-retention-inventory.mjs /usr/local/lib/sigap-image-retention/scripts/
install -m 0644 ops/docker-retention/reference-audit.mjs /usr/local/lib/sigap-image-retention/ops/docker-retention/
install -m 0755 ops/docker-retention/reference-audit.sh /usr/local/sbin/sigap-retention-reference-audit
install -m 0440 ops/docker-retention/sudoers /etc/sudoers.d/sigap-retention-audit
visudo -cf /etc/sudoers.d/sigap-retention-audit >/dev/null
install -d -m 0700 -o sigap-runner -g sigap-runner /opt/sigap/image-retention
install -m 0600 -o sigap-runner -g sigap-runner "$bootstrap/state.json" /opt/sigap/image-retention/state.json
install -m 0640 -o root -g sigap-runner "$bootstrap/policy.json" /opt/sigap/image-retention/policy.json
test ! -e /opt/sigap/image-retention/approval.json
echo 'Retention installed UNAPPROVED; no image or cache deletion.'
