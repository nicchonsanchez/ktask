"""Smoke test: SSH na VM com senha do .env.ops e roda 'echo OK'."""
import os
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
env = {}
with open(os.path.join(ROOT, '.env.ops'), 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(env['DEPLOY_HOST'], username='root', password=env['ROOT_PASSWORD'], timeout=10)
_, stdout, _ = c.exec_command('echo OK && cat /opt/ktask/infra/prod.env | grep -i EVOLUTION')
print(stdout.read().decode())
c.close()
