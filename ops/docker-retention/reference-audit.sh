#!/bin/sh
set -eu
[ "$#" -eq 0 ] || { echo 'No arguments allowed.' >&2; exit 2; }
exec /usr/local/bin/node /usr/local/lib/sigap-image-retention/ops/docker-retention/reference-audit.mjs
