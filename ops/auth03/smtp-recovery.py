# Operator-only recovery: candidate secrets travel on stdin, never argv or logs.
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys

os.umask(0o077)
environment, mode = sys.argv[1:]
assert environment in ('staging', 'production') and mode in ('check', 'install', 'verify')
production = environment == 'production'
assert socket.gethostname() == ('sigap-app-prod-01' if production else 'marisonserver')
if production:
    assert Path('/run/systemd/container').read_text().strip() == 'lxc'
container = 'agenda-flow-prod' if production else 'agenda-flow-staging'
env_file = Path('/opt/sigap/secrets/.env.production' if production else '/home/marison/sigap-deploy/staging/.env.staging')
root = Path('/opt/sigap/rollouts/auth03-smtp-20261109' if production else '/home/marison/sigap-deploy/builds/auth03-smtp-20261109')
inspected = json.loads(subprocess.run(['docker', 'inspect', container], check=True, capture_output=True, text=True).stdout)[0]
env = dict(value.split('=', 1) for value in inspected['Config']['Env'] if '=' in value)
assert env['MARISON_DEPLOYMENT_ENVIRONMENT'] == environment
assert env['APP_PUBLIC_URL'] == ('https://sigap.marisoncloud.com' if production else 'https://sigap.marison-testing.biz.id')
assert env['SMTP_HOST'] == 'smtp.hostinger.com' and env['SMTP_USER'] == 'noreply@marison.id'
assert env['SMTP_PORT'] == '465' and env['SMTP_SECURE'] == 'true'
password = '' if mode == 'verify' else sys.stdin.read().strip()
assert mode == 'verify' or re.fullmatch(r'[A-Za-z0-9!_-]{32,128}', password), 'Unexpected candidate secret format'
probe = """const n=require('nodemailer'),fs=require('node:fs'),e=process.env;
const candidate=fs.readFileSync(0,'utf8').trim();
(async()=>{const t=n.createTransport({host:e.SMTP_HOST,port:Number(e.SMTP_PORT),secure:true,auth:{user:e.SMTP_USER,pass:candidate||e.SMTP_PASS},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000,logger:false,debug:false});
try{await t.verify();console.log(JSON.stringify({authenticated:true,emailSent:false}));}
catch(x){console.log(JSON.stringify({authenticated:false,emailSent:false,code:x.code,responseCode:x.responseCode}));}
finally{t.close();}})();"""
result = json.loads(subprocess.run(['docker', 'exec', '-i', container, 'node', '-e', probe], input=password, check=True, capture_output=True, text=True, timeout=40).stdout)
if not result['authenticated']:
    print(json.dumps(dict(result, environment=environment, mode=mode)))
    sys.exit(1)
if mode == 'install':
    assert os.environ.get('ACK_SMTP_INSTALL') == environment, 'Explicit install acknowledgement required'
    before = env_file.read_bytes()
    pattern = rb'^SMTP_PASS=[^\r\n]*'
    assert len(re.findall(pattern, before, re.MULTILINE)) == 1, 'Expected exactly one managed SMTP_PASS'
    after = re.sub(pattern, b'SMTP_PASS=' + password.encode(), before, flags=re.MULTILINE)
    redact = lambda content: re.sub(pattern, b'SMTP_PASS=<redacted>', content, flags=re.MULTILINE)
    assert redact(before) == redact(after), 'Unrelated configuration changed'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    backup = root / 'before.env'
    if before != after:
        if backup.exists():
            assert re.sub(pattern, b'SMTP_PASS=<redacted>', backup.read_bytes(), flags=re.MULTILINE) == redact(before), 'Prior recovery baseline mismatch'
            raise RuntimeError('Retain prior backup; audit before a second credential update')
        with backup.open('xb') as file:
            file.write(before)
        metadata = env_file.stat()
        assert stat.S_IMODE(metadata.st_mode) in (0o600, 0o640), 'Audit environment access mode before changing secrets'
        temporary = env_file.with_name(env_file.name + '.auth03-new')
        with temporary.open('xb') as file:
            file.write(after)
            file.flush()
            os.fsync(file.fileno())
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        os.chmod(temporary, stat.S_IMODE(metadata.st_mode))
        os.replace(temporary, env_file)
    proof = dict(result, environment=environment, mode=mode, onlySmtpPasswordChanged=True, runtimeReloadRequired=env.get('SMTP_PASS') != password)
    (root / 'install-proof.json').write_text(json.dumps(proof))
    print(json.dumps(proof))
else:
    print(json.dumps(dict(result, environment=environment, mode=mode)))
