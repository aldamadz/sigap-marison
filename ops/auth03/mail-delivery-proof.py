import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

if not __debug__ or sys.flags.optimize:
    raise SystemExit('Refusing Python optimisation (-O/-OO/PYTHONOPTIMIZE) for operator safety')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


os.umask(0o077)
root = Path('/root/sigap-auth03-20261109')
require(root.is_dir(), 'Expected operator proof directory')
require(subprocess.run(['pct', 'exec', '104', '--', 'hostname'], check=True, capture_output=True, text=True).stdout.strip() == 'sigap-app-prod-01', 'Unexpected production app guest')
started = root / 'self-mail-started.json'
accepted = root / 'self-mail-accepted.json'
if accepted.exists():
    marker = json.loads(accepted.read_text())['marker']
else:
    require(not started.exists(), 'Prior send outcome uncertain; do not send again')
    marker = 'AUTH03-20261109-' + uuid.uuid4().hex
    with started.open('x') as file:
        json.dump({'marker': marker}, file)
    send = """const n=require('nodemailer'),e=process.env,marker=process.argv[1];
if(e.MARISON_DEPLOYMENT_ENVIRONMENT!=='production'||e.APP_PUBLIC_URL!=='https://sigap.marisoncloud.com'||e.SMTP_USER!=='noreply@marison.id'||e.SMTP_HOST!=='smtp.hostinger.com')throw Error('Wrong sender/environment');
(async()=>{const t=n.createTransport({host:e.SMTP_HOST,port:Number(e.SMTP_PORT),secure:true,auth:{user:e.SMTP_USER,pass:e.SMTP_PASS},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000,logger:false,debug:false});
try{const r=await t.sendMail({from:e.SMTP_FROM||e.SMTP_USER,to:'noreply@marison.id',subject:'[SIGAP AUTH-03] Verifikasi pemulihan SMTP',text:'Pengujian teknis pemulihan email SIGAP. Tidak ada tautan reset kata sandi atau data pengajuan. Penanda: '+marker,headers:{'X-SIGAP-SMTP-Recovery-Test':marker}});
console.log(JSON.stringify({marker,smtpAccepted:r.accepted.includes('noreply@marison.id'),rejectedCount:r.rejected.length}));}
catch(x){console.log(JSON.stringify({marker,smtpAccepted:false,code:x.code,responseCode:x.responseCode}));}finally{t.close();}})();"""
    result = subprocess.run(['pct', 'exec', '104', '--', 'docker', 'exec', 'agenda-flow-prod', 'node', '-e', send, marker], check=True, capture_output=True, text=True, timeout=45)
    proof = json.loads(result.stdout)
    require(proof['smtpAccepted'] and proof['rejectedCount'] == 0, 'SMTP did not accept the technical self-mail')
    accepted.write_text(json.dumps(proof))

receive = """import imaplib,json,ssl,subprocess,sys,time
x=json.loads(subprocess.run(['docker','inspect','sigap-supabase-auth'],check=True,capture_output=True,text=True).stdout)[0]
e=dict(v.split('=',1) for v in x['Config']['Env'] if '=' in v)
if e['GOTRUE_SMTP_USER']!='noreply@marison.id': raise RuntimeError('Unexpected mailbox sender')
with imaplib.IMAP4_SSL('imap.hostinger.com',993,ssl_context=ssl.create_default_context(),timeout=15) as mail:
 mail.login(e['GOTRUE_SMTP_USER'],e['GOTRUE_SMTP_PASS'])
 if mail.select('INBOX',readonly=True)[0]!='OK': raise RuntimeError('Read-only mailbox selection failed')
 found=False
 for attempt in range(6):
  status,data=mail.uid('search',None,'HEADER','X-SIGAP-SMTP-Recovery-Test',sys.argv[1])
  found=status=='OK' and bool(data[0])
  if found: break
  time.sleep(5)
 print(json.dumps({'smtpAccepted':True,'imapReceived':found,'readOnlyMailboxCheck':True,'technicalSelfMailOnly':True}))
"""
result = subprocess.run(['pct', 'exec', '110', '--', 'python3', '-c', receive, marker], check=True, capture_output=True, text=True, timeout=65)
proof = json.loads(result.stdout)
(root / 'self-mail-delivery.json').write_text(json.dumps(proof))
print(json.dumps(proof))
require(proof['imapReceived'], 'SMTP accepted; delivery not yet confirmed, do not resend')
