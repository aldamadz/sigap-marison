"""Exercise real Caddy path selection on loopback, without changing staging routes."""
import base64
import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from recover import APP, HOST, candidate, owned_route
from test_recover import config

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMFEAAAAASUVORK5CYII=')


class Mock(BaseHTTPRequestHandler):
    def do_GET(self):
        image = self.server.server_port == 13084
        body = PNG if image else b'app'
        self.send_response(200)
        self.send_header('Content-Type', 'image/png' if image else 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def main():
    before = config()
    after, _ = candidate(before)
    server = after['apps']['http']['servers']['srv0']
    server['listen'] = ['127.0.0.1:13082']
    server['automatic_https'] = {'disable': True}
    routes = owned_route(after)[0]['handle'][0]['routes']
    routes[0]['handle'][0]['upstreams'][0]['dial'] = '127.0.0.1:13084'
    routes[1]['handle'][0]['upstreams'][0]['dial'] = '127.0.0.1:13083'
    after['admin'] = {'disabled': True}
    mocks = [ThreadingHTTPServer(('127.0.0.1', port), Mock) for port in (13083, 13084)]
    for mock in mocks:
        threading.Thread(target=mock.serve_forever, daemon=True).start()
    name = 'sigap-image-routing-741-qa'
    with tempfile.TemporaryDirectory(prefix='sigap-image-741-') as directory:
        path = Path(directory)/'caddy.json'
        path.write_text(json.dumps(after))
        subprocess.run(['docker', 'run', '--rm', '-d', '--network', 'host', '--name', name,
                        '-v', str(path)+':/etc/caddy/qa.json:ro', 'caddy:2.11.7-alpine',
                        'caddy', 'run', '--config', '/etc/caddy/qa.json'], check=True, capture_output=True)
        try:
            time.sleep(2)
            def get(path):
                req = urllib.request.Request('http://127.0.0.1:13082'+path, headers={'Host': HOST})
                with urllib.request.urlopen(req, timeout=10) as response:
                    return response.headers.get_content_type(), response.read()
            assert get('/storage/v1/object/public/lampiran_surat/photo.png') == ('image/png', PNG)
            for path in ('/health/live', '/storage/v1/object/authenticated/lampiran_surat/private.png',
                         '/storage/v1/object/sign/lampiran_surat/private.png', '/supabase/auth/v1/verify'):
                assert get(path) == ('text/plain', b'app'), 'Only public storage must reach relay'
            print(json.dumps({'stagingIsolatedCaddy': 'PASS', 'publicImage': True,
                              'privatePathsNotRelayed': True, 'publicPortsOpened': False,
                              'stagingAppUnchanged': True}))
        finally:
            subprocess.run(['docker', 'stop', name], check=True, capture_output=True)
            for mock in mocks:
                mock.shutdown()


if __name__ == '__main__':
    main()
