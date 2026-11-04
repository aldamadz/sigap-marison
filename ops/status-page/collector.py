#!/usr/bin/env python3
"""Read-only SIGAP infrastructure observations; no job claims or business writes."""
import argparse
import concurrent.futures
import json
import os
import pathlib
import stat
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

CONTAINERS = {
    'sigap_pdf': 'agenda-pdf-worker',
    'sigap_sync': 'agenda-marison-sync',
    'sigap_outbound': 'agenda-marison-outbound',
    'sigap_external': 'agenda-flow-external-api',
}
ALLOWED_AUDIENCES = {
    'marison-status-probe-staging.aldamaaa-id.workers.dev',
    'marison-status-probe.aldamaaa-id.workers.dev',
}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None

SQL = """BEGIN READ ONLY;
SET LOCAL statement_timeout='2s';
SELECT json_build_object(
 'pdf_stalled', EXISTS(SELECT 1 FROM public.document_pdf_jobs
   WHERE (status='queued' AND created_at<now()-interval '10 minutes')
      OR (status='processing' AND coalesce(lease_expires_at,locked_at+interval '10 minutes')<now()-interval '5 minutes')),
 'outbound_enabled', coalesce((SELECT enabled FROM public.marison_outbound_settings WHERE environment='production'),false),
 'outbound_stalled', EXISTS(SELECT 1 FROM public.marison_outbound_dispatches
   WHERE environment='production' AND
     ((status IN ('pending','failed_retryable') AND next_attempt_at<now()-interval '15 minutes')
      OR (status='processing' AND lease_expires_at<now()-interval '5 minutes'))),
 'sync_success', EXISTS(SELECT 1 FROM public.marison_sync_runs WHERE environment='production'
   AND status='success' AND completed_at>now()-interval '26 hours'),
 'sync_running', EXISTS(SELECT 1 FROM public.marison_sync_runs WHERE environment='production'
   AND status='running' AND started_at>now()-interval '20 minutes')
);
ROLLBACK;
"""


def command(args, timeout=12):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=True)
    return result.stdout.strip()


def observation(component, status, reason, elapsed=None):
    return {'id': component, 'status': status, 'reason': reason,
            'latencyMs': None if elapsed is None else min(60000, round(elapsed * 1000))}


def secure_file(path):
    target = pathlib.Path(path)
    info = target.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('Operator file must be owner-only and not a symlink')
    return target


def storage_check():
    started = time.monotonic()
    # CT110 has private storage connectivity independent of the app container.
    source = """import urllib.request,json
results=[]
for url in ['http://172.20.100.5:8000/storage/v1/status']:
 try:
  with urllib.request.urlopen(url,timeout=4) as r: results.append(r.status==200)
 except Exception: results.append(False)
print(json.dumps(results))
"""
    try:
        states = json.loads(command(['pct', 'exec', '110', '--', 'python3', '-c', source], timeout=8))
        # MinIO is intentionally not exposed on the LAN; inspect its existing
        # readiness endpoint inside VM100 instead of opening a new port.
        minio = json.loads(command(['qm', 'guest', 'exec', '100', '--', 'curl', '--silent',
                                   '--max-time', '3', '--output', '/dev/null', '--write-out', '%{http_code}',
                                   'http://127.0.0.1:9000/minio/health/ready'], timeout=10))
        healthy = states == [True] and minio.get('exitcode') == 0 and minio.get('out-data', '').strip() == '200'
        return observation('sigap_storage', 'up' if healthy else 'down',
                           'healthy' if healthy else 'dependency_failed', time.monotonic() - started)
    except Exception:
        return observation('sigap_storage', 'unknown', 'check_unavailable')


def queue_check():
    try:
        output = command(['pct', 'exec', '110', '--', 'docker', 'exec', 'sigap-supabase-db',
                          'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', SQL], timeout=8)
        return next(json.loads(line) for line in output.splitlines() if line.startswith('{'))
    except Exception:
        return None


def worker_check(component, name, queues):
    started = time.monotonic()
    try:
        inspected = json.loads(command(['pct', 'exec', '104', '--', 'docker', 'inspect', name]))[0]
        state = inspected.get('State', {})
        if state.get('Status') != 'running' or state.get('Restarting') or state.get('OOMKilled'):
            return observation(component, 'down', 'process_down', time.monotonic() - started)
        processes = command(['pct', 'exec', '104', '--', 'docker', 'top', name])
        if not any(len(parts := line.split(None, 7)) == 8 and parts[7].split()[0].rsplit('/', 1)[-1] == 'node'
                   for line in processes.splitlines()[1:]):
            return observation(component, 'down', 'process_down', time.monotonic() - started)
        if component == 'sigap_external':
            result = json.loads(command(['pct', 'exec', '104', '--', 'curl', '--fail', '--silent',
                                         '--max-time', '4', 'http://172.20.100.2:3020/health']))
            healthy = result.get('status') == 'ok'
            return observation(component, 'up' if healthy else 'down',
                               'healthy' if healthy else 'dependency_failed', time.monotonic() - started)
        if queues is None:
            return observation(component, 'unknown', 'check_unavailable')
        if component == 'sigap_pdf':
            healthy = not queues['pdf_stalled']
        elif component == 'sigap_outbound':
            environment = dict(item.split('=', 1) for item in inspected['Config'].get('Env', []) if '=' in item)
            if not queues['outbound_enabled'] or environment.get('MARISON_SUBMISSION_DISPATCH_ENABLED', '').lower() != 'true':
                return observation(component, 'unknown', 'disabled')
            healthy = not queues['outbound_stalled']
        else:
            environment = dict(item.split('=', 1) for item in inspected['Config'].get('Env', []) if '=' in item)
            if environment.get('MARISON_SYNC_ENABLED', '').lower() != 'true':
                return observation(component, 'unknown', 'disabled')
            healthy = queues['sync_success'] or queues['sync_running']
        return observation(component, 'up' if healthy else 'down',
                           'healthy' if healthy else 'queue_stalled', time.monotonic() - started)
    except subprocess.CalledProcessError:
        return observation(component, 'unknown', 'check_unavailable')
    except Exception:
        return observation(component, 'unknown', 'check_unavailable')


def collect():
    observed_at = int(time.time() * 1000)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        storage = pool.submit(storage_check)
        queues = queue_check()
        workers = [pool.submit(worker_check, component, name, queues) for component, name in CONTAINERS.items()]
        components = [storage.result(), *(future.result() for future in workers)]
    return {'version': 1, 'observedAt': observed_at, 'components': components}


def publish(report, config):
    key = secure_file(config['privateKey'])
    body = json.dumps(report, separators=(',', ':')).encode()
    for endpoint in config['endpoints']:
        url = urllib.parse.urlsplit(endpoint)
        if url.scheme != 'https' or url.netloc not in ALLOWED_AUDIENCES or url.path != '/report' or url.query or url.fragment:
            raise ValueError('Collector endpoint is not allowlisted')
        stamp = str(int(time.time() * 1000))
        message = stamp.encode() + b'\n' + url.netloc.encode() + b'\n/report\n' + body
        with tempfile.TemporaryDirectory(prefix='sigap-status-') as directory:
            payload = pathlib.Path(directory) / 'payload'
            payload.write_bytes(message)
            signature = subprocess.run(['openssl', 'pkeyutl', '-sign', '-rawin', '-inkey', str(key), '-in', str(payload)],
                                       capture_output=True, check=True, timeout=5).stdout.hex()
        request = urllib.request.Request(endpoint, data=body, method='POST', headers={
            'Content-Type': 'application/json', 'User-Agent': 'SIGAP-Status-Collector/1.0',
            'X-Sigap-Timestamp': stamp, 'X-Sigap-Signature': signature})
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=12) as response:
            if response.status != 204:
                raise ValueError('Telemetry was not accepted')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    parser.add_argument('--config')
    args = parser.parse_args()
    report = collect()
    if args.publish:
        config = json.loads(secure_file(args.config).read_text())
        publish(report, config)
        print('SIGAP telemetry published')
    else:
        print(json.dumps(report))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never emit HTTP request objects, subprocess output or operator secrets.
        raise SystemExit('SIGAP collector failed; inspect restricted operator diagnostics')
