"""Restore only SIGAP's existing public-file relay, without a shared Caddy reload."""
import copy
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request

HOST = "sigap.marisoncloud.com"
PROXY = "marisdrive-upload-proxy"
APP = "192.168.0.251:3010"
RELAY = "192.168.0.251:3082"
PUBLIC = "/storage/v1/object/public/*"
SOURCE = Path("/opt/marisdrive-upload-proxy/Caddyfile")


def relay_route():
    return {"match": [{"path": [PUBLIC]}], "handle": [
        {"handler": "reverse_proxy", "upstreams": [{"dial": RELAY}]}], "terminal": True}


def owned_route(config):
    matches = []

    def visit(node, path):
        if isinstance(node, dict):
            if any(HOST in m.get("host", []) for m in node.get("match", []) if isinstance(m, dict)):
                assert node["match"] == [{"host": [HOST]}], "Shared or conditional host matcher"
                matches.append((node, path))
                return
            for key, value in node.items():
                visit(value, path + [key])
        elif isinstance(node, list):
            for index, value in enumerate(node):
                visit(value, path + [index])

    visit(config, [])
    assert len(matches) == 1, "Missing or ambiguous SIGAP host"
    return matches[0]


def candidate(config):
    updated = copy.deepcopy(config)
    route, path = owned_route(updated)
    handles = route.get("handle", [])
    assert len(handles) == 1 and handles[0].get("handler") == "subroute", "Unexpected SIGAP handler"
    routes = handles[0]["routes"]
    encoded = json.dumps(routes)
    assert '"dial": "' + APP + '"' in encoded, "Unexpected application target"
    assert "storage/v1" not in encoded and RELAY not in encoded, "Existing storage routing requires review"
    routes.insert(0, relay_route())
    # Existing routes and every unrelated virtual host remain byte-equivalent as JSON.
    return updated, path + ["handle", 0, "routes"]


class ResponseSocket:
    def __init__(self, value):
        self.value = value

    def makefile(self, *_args, **_kwargs):
        return io.BytesIO(self.value)


def admin(method="GET", path="/config/", payload=None, etag=None):
    body = b"" if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    headers = [f"{method} {path} HTTP/1.1", "Host: localhost:2019", "Connection: close",
               "Content-Type: application/json", f"Content-Length: {len(body)}"]
    if etag:
        assert "\r" not in etag and "\n" not in etag
        headers.append("If-Match: " + etag)
    raw = ("\r\n".join(headers) + "\r\n\r\n").encode() + body
    p = subprocess.run(["docker", "exec", "-i", PROXY, "nc", "-w", "15", "127.0.0.1", "2019"],
                       input=raw, capture_output=True, timeout=25, check=True)
    response = http.client.HTTPResponse(ResponseSocket(p.stdout))
    response.begin()
    value = response.read()
    assert response.status < 400, f"Caddy admin HTTP{response.status}"
    return json.loads(value) if value else None, response.getheader("Etag")


def at(config, path):
    for key in path:
        config = config[key]
    return config


def main(mode):
    assert mode in ("preflight", "apply")
    os.umask(0o077)
    source = SOURCE.read_bytes()
    adapted = subprocess.run(["docker", "exec", "-i", PROXY, "caddy", "adapt", "--config", "/dev/stdin",
                              "--adapter", "caddyfile"], input=source, capture_output=True, check=True)
    persisted, _ = owned_route(json.loads(adapted.stdout))
    text = json.dumps(persisted)
    assert PUBLIC in text and RELAY in text and APP in text, "Persisted SIGAP source lacks the established relay"
    before, etag = admin()
    assert etag, "Missing ETag"
    updated, path = candidate(before)
    # Probe all supplied paths before touching routing. No capability URLs are accepted.
    paths = json.loads(sys.stdin.read())
    assert 1 <= len(paths) <= 40 and len(set(paths)) == len(paths)
    hashes = {}
    for image in paths:
        assert image.startswith("/storage/v1/object/public/lampiran_surat/")
        assert "?" not in image and "#" not in image and ".." not in image
        with urllib.request.urlopen("http://" + RELAY + image, timeout=20) as response:
            data = response.read()
            assert response.status == 200 and response.headers.get_content_type().startswith("image/")
            assert data.startswith(b"\x89PNG\r\n\x1a\n") or data.startswith(b"\xff\xd8")
            hashes[image] = hashlib.sha256(data).hexdigest()
    report = {"environment": "production", "imageCount": len(paths), "sourceAlreadyCorrect": True,
              "onlyPublicRelayAdded": True, "mutated": False}
    if mode == "preflight":
        print(json.dumps(report))
        return
    root = Path("/root/sigap-image-routing-741") / str(time.time_ns())
    root.mkdir(parents=True, mode=0o700)
    for name, data in [("before", before), ("candidate", updated)]:
        (root / (name + ".json")).write_text(json.dumps(data))
    (root / "Caddyfile.source-before").write_bytes(source)
    current, current_etag = admin()
    assert current == before and current_etag == etag and SOURCE.read_bytes() == source, "Concurrent operator edit"
    endpoint = "/config/" + "/".join(map(str, path))
    try:
        admin("PATCH", endpoint, at(updated, path), etag)
        after, _ = admin()
        assert after == updated and SOURCE.read_bytes() == source, "Unexpected configuration drift"
        for image in paths:
            # Bypass Cloudflare's pre-existing negative cache, but test the actual TLS origin and host.
            p = subprocess.run(["curl", "--silent", "--show-error", "--fail", "--resolve",
                                HOST + ":443:182.253.8.205", "https://" + HOST + image],
                               capture_output=True, timeout=30, check=True)
            assert hashlib.sha256(p.stdout).hexdigest() == hashes[image], "Origin image mismatch"
        for health in ("/health/live", "/health/ready", "/health/version"):
            with urllib.request.urlopen("http://" + APP + health, timeout=15) as response:
                assert response.status == 200
        report.update(mutated=True, originImagesMatch=True, backup=str(root), sourceUnchanged=True)
        (root / "proof.json").write_text(json.dumps(report))
        print(json.dumps(report))
    except BaseException:
        live, live_etag = admin()
        if live == updated:
            admin("PATCH", endpoint, at(before, path), live_etag)
        raise


if __name__ == "__main__":
    main(sys.argv[1])
