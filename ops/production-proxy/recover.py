"""Scoped Caddy origin recovery. Run inside the authorized proxy host, not the app.

Private full-config evidence stays on the operator host. Only a single verified
SIGAP reverse-proxy dial is patched, using Caddy's root ETag to reject races.
"""
import copy
import datetime
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.request

HOST = "sigap.marisoncloud.com"
PROXY = "marisdrive-upload-proxy"
OLD = "10.10.10.246:3010"
NEW = "192.168.0.251:3010"
APP_SHA = "aec4be43b3f0d7fe3839af6ad49a51b3dccebd82"
SOURCE = Path("/opt/marisdrive-upload-proxy/Caddyfile")


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def sigap_dial_paths(config):
    result = []

    def collect(node, path):
        if isinstance(node, dict):
            if node.get("handler") == "reverse_proxy":
                for i, upstream in enumerate(node.get("upstreams", [])):
                    if "dial" in upstream:
                        result.append((path + ["upstreams", i, "dial"], upstream["dial"]))
            for key, value in node.items():
                collect(value, path + [key])
        elif isinstance(node, list):
            for i, value in enumerate(node):
                collect(value, path + [i])

    def visit(node, path):
        if isinstance(node, dict):
            matching = [m for m in node.get("match", []) if isinstance(m, dict) and HOST in m.get("host", [])]
            if matching:
                # A host group shared with another domain is not safe to edit.
                assert all(isinstance(m, dict) and m.get("host") == [HOST] for m in node["match"]), "Shared host matcher; manual review required"
                collect(node.get("handle", []), path + ["handle"])
                return
            for key, value in node.items():
                visit(value, path + [key])
        elif isinstance(node, list):
            for i, value in enumerate(node):
                visit(value, path + [i])

    visit(config, [])
    return result


def candidate(config):
    paths = sigap_dial_paths(config)
    old = [path for path, value in paths if value == OLD]
    assert len(old) == 1, "Expected exactly one retired SIGAP origin; stop on drift"
    path = old[0]
    updated = copy.deepcopy(config)
    parent = updated
    for key in path[:-1]:
        parent = parent[key]
    parent[path[-1]] = NEW
    return updated, path


class ResponseSocket:
    def __init__(self, value):
        self.value = value

    def makefile(self, *_args, **_kwargs):
        return io.BytesIO(self.value)


def admin(method="GET", path="/config/", payload=None, etag=None):
    # Netcat runs inside the proxy: the admin listener remains loopback-only.
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = [f"{method} {path} HTTP/1.1", "Host: localhost:2019", "Connection: close", "Content-Type: application/json", f"Content-Length: {len(body)}"]
    if etag:
        assert "\r" not in etag and "\n" not in etag
        headers.append("If-Match: " + etag)
    request = ("\r\n".join(headers) + "\r\n\r\n").encode() + body
    process = subprocess.run(["docker", "exec", "-i", PROXY, "nc", "-w", "15", "127.0.0.1", "2019"], input=request, capture_output=True, timeout=25)
    assert process.returncode == 0, "Private Caddy admin connection failed"
    response = http.client.HTTPResponse(ResponseSocket(process.stdout))
    response.begin()
    value = response.read()
    if response.status >= 400:
        raise RuntimeError(f"Caddy admin HTTP{response.status}; configuration not overwritten")
    return (json.loads(value) if value else None), response.getheader("Etag")


def source_sigap_targets(text):
    lines = text.splitlines()
    targets = []
    blocks = 0
    for i, line in enumerate(lines):
        if not re.match(r"^\s*sigap\.marisoncloud\.com\s*\{", line):
            continue
        blocks += 1
        depth = 0
        for line in lines[i:]:
            depth += line.count("{") - line.count("}")
            match = re.search(r"^\s*reverse_proxy\s+([^\s{]+)", line)
            if match:
                targets.append(match[1])
            if depth == 0:
                break
    assert blocks == 1, "Missing or ambiguous persisted SIGAP host block"
    return targets


def read_public(path):
    # Match the established operator curl transport (TLS/HTTP2 and edge handling).
    accept = "text/html" if path == "/" else "application/json"
    process = subprocess.run(["curl", "--silent", "--show-error", "--connect-timeout", "8", "--max-time", "20", "-H", "Accept: " + accept, "-H", "Cache-Control: no-cache", "-w", "\nSIGAP_STATUS:%{http_code}", "https://" + HOST + path], capture_output=True, timeout=25)
    assert process.returncode == 0, "Public TLS/network acceptance failed"
    body, marker, status = process.stdout.rpartition(b"\nSIGAP_STATUS:")
    assert marker and len(status) == 3, "Invalid public probe result"
    return int(status), body


def main(mode):
    assert mode in ("preflight", "apply")
    os.umask(0o077)
    before, etag = admin()
    assert etag, "Missing Caddy ETag; cannot safely patch"
    updated, path = candidate(before)
    source = SOURCE.read_bytes()
    source_targets = source_sigap_targets(source.decode())
    assert NEW in source_targets and OLD not in source_targets, "Persisted source still unsafe; stop before mutation"
    with urllib.request.urlopen("http://" + NEW + "/health/version", timeout=10) as response:
        assert response.status == 200 and json.load(response)["gitSha"] == APP_SHA, "App source identity mismatch"
    proof = {"environment": "production", "oldOrigin": OLD, "newOrigin": NEW, "path": "/config/" + "/".join(map(str, path)), "sourceAlreadyCorrect": True, "appSha": APP_SHA}
    if mode == "preflight":
        print(json.dumps({**proof, "mutated": False, "etagAvailable": True}))
        return

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = Path("/root/sigap-proxy-recovery-20261023") / stamp
    backup.mkdir(parents=True, mode=0o700)
    (backup / "active-before.json").write_text(json.dumps(before))
    (backup / "candidate.json").write_text(json.dumps(updated))
    (backup / "Caddyfile.host-before").write_bytes(source)
    mounted = subprocess.check_output(["docker", "exec", PROXY, "cat", "/etc/caddy/Caddyfile"])
    (backup / "Caddyfile.mounted-before").write_bytes(mounted)
    (backup / "proof-before.json").write_text(json.dumps(proof))
    # Do not replace the source file's inode or publish unrelated pending edits.
    assert SOURCE.read_bytes() == source, "Source changed during preparation"
    current, current_etag = admin()
    assert current_etag == etag and current == before, "Active proxy changed; stop on concurrent operator work"
    changed = False
    try:
        changed = True
        admin("PATCH", proof["path"], NEW, etag)
        after, _ = admin()
        assert after == updated, "Unexpected changes outside the single SIGAP dial"
        (backup / "active-after.json").write_text(json.dumps(after))
        assert SOURCE.read_bytes() == source, "Host Caddyfile was changed"
        statuses = {}
        for endpoint in ["/", "/health/live", "/health/ready", "/health/version", "/api/auth/session", "/api/maintenance/status"]:
            status, body = read_public(endpoint)
            statuses[endpoint] = status
            assert status == 200, "Public acceptance failed: " + endpoint + " HTTP" + str(status)
            if endpoint == "/health/version":
                assert json.loads(body)["gitSha"] == APP_SHA
            if endpoint == "/api/maintenance/status":
                assert json.loads(body).get("phase") == "none", "Unexpected maintenance schedule"
        proof.update(mutated=True, publicStatus=statuses, onlyOneDialChanged=True, sourceUnchanged=True, backup=str(backup), candidateHash=digest(updated))
        (backup / "proof.json").write_text(json.dumps(proof))
        print(json.dumps(proof))
    except Exception:
        # Only roll back our own unchanged candidate, never overwrite a later edit.
        if changed:
            live, live_etag = admin()
            if live == updated:
                admin("PATCH", proof["path"], OLD, live_etag)
                (backup / "rolled-back.txt").write_text("Acceptance failed; only the original dial was restored.")
        raise


if __name__ == "__main__":
    main(sys.argv[1])
