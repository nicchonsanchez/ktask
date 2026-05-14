"""Lista o path do .env da producao + valores Evolution atuais (mascarando key)."""
import os
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_FILE = os.path.join(ROOT, '.env.ops')


def load_env(path):
    env = {}
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


env = load_env(ENV_FILE)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(env['DEPLOY_HOST'], username='root', password=env['ROOT_PASSWORD'], timeout=15)

cmds = [
    'ls -la /opt/ktask/ | head -20',
    'ls -la /opt/ktask/.env* 2>/dev/null',
    'docker ps --format "{{.Names}}\t{{.Status}}\t{{.Image}}"',
    'grep -E "^EVOLUTION_DEFAULT_(URL|INSTANCE)=" /opt/ktask/.env 2>/dev/null',
    'grep -E "^EVOLUTION_DEFAULT_API_KEY=" /opt/ktask/.env 2>/dev/null | sed "s/=.*$/=***/"',
]

for cmd in cmds:
    print(f'\n$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=20)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f'(stderr) {err}')

client.close()
