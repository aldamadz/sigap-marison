import json
import os
from pathlib import Path
import re
import smtplib
import socket
import ssl
import stat
import subprocess
import sys
import time

os.umask(0o077)
assert socket.gethostname() == 'sigap-db-auth-prod-01'
assert Path('/run/systemd/container').read_text().strip() == 'lxc'
assert os.environ.get('ACK_AUTH_MAILER_RELOAD') == 'production'
password = sys.stdin.read().strip()
assert re.fullmatch(r'[A-Za-z0-9!_-]{32,128}', password)
root = Path('/opt/sigap-supabase/rollouts/auth03-smtp-20261109')
root.mkdir(parents=True, exist_ok=True, mode=0o700)
root.chmod(0o700)


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=90).stdout


container = 'sigap-supabase-auth'
before = json.loads(run(['docker', 'inspect', container]))[0]
env = dict(value.split('=', 1) for value in before['Config']['Env'] if '=' in value)
labels = before['Config']['Labels']
assert labels['com.docker.compose.project'] == 'sigap-db-auth-production'
assert labels['com.docker.compose.service'] == 'auth'
assert labels['com.docker.compose.project.config_files'] == '/opt/sigap-supabase/compose.yml'
assert env['GOTRUE_SMTP_HOST'] == 'smtp.hostinger.com' and env['GOTRUE_SMTP_USER'] == 'noreply@marison.id'
assert env['GOTRUE_SMTP_PORT'] == '587'
with smtplib.SMTP(env['GOTRUE_SMTP_HOST'], 587, timeout=15) as smtp:
    smtp.ehlo()
    smtp.starttls(context=ssl.create_default_context())
    smtp.ehlo()
    smtp.login(env['GOTRUE_SMTP_USER'], password)

env_file = Path('/opt/sigap-supabase/.env')
original = env_file.read_bytes()
pattern = rb'^GOTRUE_SMTP_PASS=[^\r\n]*'
# Four existing historical mailer blocks were audited; align only their password values.
assert len(re.findall(pattern, original, re.MULTILINE)) == 4
updated = re.sub(pattern, b'GOTRUE_SMTP_PASS=' + password.encode(), original, flags=re.MULTILINE)
assert re.sub(pattern, b'<redacted>', updated, flags=re.MULTILINE) == re.sub(pattern, b'<redacted>', original, flags=re.MULTILINE)
backup = root / 'before.env'
assert not backup.exists(), 'Retain original recovery backup'
with backup.open('xb') as file:
    file.write(original)
metadata = env_file.stat()
assert stat.S_IMODE(metadata.st_mode) in (0o600, 0o640)


def replace_env(content):
    temporary = env_file.with_name('.env.auth03-new')
    with temporary.open('xb') as file:
        file.write(content)
        file.flush()
        os.fsync(file.fileno())
    os.chown(temporary, metadata.st_uid, metadata.st_gid)
    os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
    os.replace(temporary, env_file)


compose = ['docker', 'compose', '--project-name', 'sigap-db-auth-production', '--env-file', str(env_file), '-f', '/opt/sigap-supabase/compose.yml']
other_ids = {row['Names']: row['ID'] for row in (json.loads(line) for line in run(['docker', 'ps', '--format', '{{json .}}']).splitlines()) if row['Names'] != container}
reload_started = False
try:
    replace_env(updated)
    config = json.loads(run(compose + ['config', '--format', 'json']))['services']['auth']
    image = json.loads(run(['docker', 'image', 'inspect', config['image']]))[0]
    assert image['Id'] == before['Image'], 'Do not upgrade Auth during mailer recovery'
    expected = dict(value.split('=', 1) for value in image['Config']['Env'] if '=' in value)
    expected.update({key: str(value) for key, value in config['environment'].items()})
    changes = {key for key in set(env) | set(expected) if env.get(key) != expected.get(key)}
    assert changes <= {'GOTRUE_SMTP_PASS'}, 'Unexpected Auth configuration drift'
    reload_started = True
    run(compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'auth'])
    for attempt in range(30):
        after = json.loads(run(['docker', 'inspect', container]))[0]
        if after['State'].get('Health', {}).get('Status') == 'healthy':
            break
        time.sleep(2)
    assert after['State'].get('Health', {}).get('Status') == 'healthy'
    assert after['Image'] == before['Image']
    after_env = dict(value.split('=', 1) for value in after['Config']['Env'] if '=' in value)
    assert {key for key in set(env) | set(after_env) if env.get(key) != after_env.get(key)} <= {'GOTRUE_SMTP_PASS'}
    assert after_env['GOTRUE_SMTP_PASS'] == password
    current_ids = {row['Names']: row['ID'] for row in (json.loads(line) for line in run(['docker', 'ps', '--format', '{{json .}}']).splitlines()) if row['Names'] != container}
    assert current_ids == other_ids, 'Non-Auth containers changed'
except Exception:
    replace_env(original)
    if reload_started:
        run(compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'auth'])
    raise
proof = {'environment': 'production', 'smtpAuthenticated': True, 'emailSent': False, 'authHealthy': True, 'onlySmtpPasswordChanged': True, 'authImageUnchanged': True, 'otherContainersUnchanged': True}
(root / 'apply-proof.json').write_text(json.dumps(proof))
print(json.dumps(proof))
