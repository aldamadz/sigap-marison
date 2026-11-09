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

if not __debug__ or sys.flags.optimize:
    raise SystemExit('Refusing Python optimisation (-O/-OO/PYTHONOPTIMIZE) for operator safety')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


os.umask(0o077)
require(socket.gethostname() == 'sigap-db-auth-prod-01', 'Unexpected production Auth host')
require(Path('/run/systemd/container').read_text().strip() == 'lxc', 'Expected LXC guest')
require(os.environ.get('ACK_AUTH_MAILER_RELOAD') == 'production', 'Explicit Auth mailer reload acknowledgement required')
password = sys.stdin.read().strip()
require(re.fullmatch(r'[A-Za-z0-9!_-]{32,128}', password), 'Unexpected candidate secret format')
root = Path('/opt/sigap-supabase/rollouts/auth03-smtp-20261109')
root.mkdir(parents=True, exist_ok=True, mode=0o700)
root.chmod(0o700)


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=90).stdout


container = 'sigap-supabase-auth'
before = json.loads(run(['docker', 'inspect', container]))[0]
env = dict(value.split('=', 1) for value in before['Config']['Env'] if '=' in value)
labels = before['Config']['Labels']
require(labels['com.docker.compose.project'] == 'sigap-db-auth-production', 'Unexpected Compose project')
require(labels['com.docker.compose.service'] == 'auth', 'Unexpected Compose service')
require(labels['com.docker.compose.project.config_files'] == '/opt/sigap-supabase/compose.yml', 'Unexpected Compose file')
require(env['GOTRUE_SMTP_HOST'] == 'smtp.hostinger.com' and env['GOTRUE_SMTP_USER'] == 'noreply@marison.id', 'SMTP sender mismatch')
require(env['GOTRUE_SMTP_PORT'] == '587', 'SMTP transport mismatch')
with smtplib.SMTP(env['GOTRUE_SMTP_HOST'], 587, timeout=15) as smtp:
    smtp.ehlo()
    smtp.starttls(context=ssl.create_default_context())
    smtp.ehlo()
    smtp.login(env['GOTRUE_SMTP_USER'], password)

env_file = Path('/opt/sigap-supabase/.env')
original = env_file.read_bytes()
pattern = rb'^GOTRUE_SMTP_PASS=[^\r\n]*'
# Four existing historical mailer blocks were audited; align only their password values.
require(len(re.findall(pattern, original, re.MULTILINE)) == 4, 'Expected exactly four audited SMTP password blocks')
updated = re.sub(pattern, b'GOTRUE_SMTP_PASS=' + password.encode(), original, flags=re.MULTILINE)
require(re.sub(pattern, b'<redacted>', updated, flags=re.MULTILINE) == re.sub(pattern, b'<redacted>', original, flags=re.MULTILINE), 'Unrelated configuration changed')
backup = root / 'before.env'
require(not backup.exists(), 'Retain original recovery backup')
with backup.open('xb') as file:
    file.write(original)
metadata = env_file.stat()
require(stat.S_IMODE(metadata.st_mode) in (0o600, 0o640), 'Audit environment access mode before changing secrets')


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
    require(image['Id'] == before['Image'], 'Do not upgrade Auth during mailer recovery')
    expected = dict(value.split('=', 1) for value in image['Config']['Env'] if '=' in value)
    expected.update({key: str(value) for key, value in config['environment'].items()})
    changes = {key for key in set(env) | set(expected) if env.get(key) != expected.get(key)}
    require(changes <= {'GOTRUE_SMTP_PASS'}, 'Unexpected Auth configuration drift')
    reload_started = True
    run(compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'auth'])
    for attempt in range(30):
        after = json.loads(run(['docker', 'inspect', container]))[0]
        if after['State'].get('Health', {}).get('Status') == 'healthy':
            break
        time.sleep(2)
    require(after['State'].get('Health', {}).get('Status') == 'healthy', 'Auth is not healthy after reload')
    require(after['Image'] == before['Image'], 'Auth image changed during reload')
    after_env = dict(value.split('=', 1) for value in after['Config']['Env'] if '=' in value)
    require({key for key in set(env) | set(after_env) if env.get(key) != after_env.get(key)} <= {'GOTRUE_SMTP_PASS'}, 'Unexpected Auth configuration drift after reload')
    require(after_env['GOTRUE_SMTP_PASS'] == password, 'Runtime SMTP password mismatch')
    current_ids = {row['Names']: row['ID'] for row in (json.loads(line) for line in run(['docker', 'ps', '--format', '{{json .}}']).splitlines()) if row['Names'] != container}
    require(current_ids == other_ids, 'Non-Auth containers changed')
except Exception:
    replace_env(original)
    if reload_started:
        run(compose + ['up', '-d', '--no-deps', '--no-build', '--pull', 'never', '--force-recreate', 'auth'])
    raise
proof = {'environment': 'production', 'smtpAuthenticated': True, 'emailSent': False, 'authHealthy': True, 'onlySmtpPasswordChanged': True, 'authImageUnchanged': True, 'otherContainersUnchanged': True}
(root / 'apply-proof.json').write_text(json.dumps(proof))
print(json.dumps(proof))
