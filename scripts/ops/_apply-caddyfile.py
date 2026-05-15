"""Copia infra/Caddyfile pra VM e faz reload do Caddy (zero downtime).
Caddy `reload` recarrega config sem matar conexoes ativas.
"""
import os
import sys
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_FILE = os.path.join(ROOT, '.env.ops')
LOCAL_CADDY = os.path.join(ROOT, 'infra', 'Caddyfile')
REMOTE_CADDY = '/opt/ktask/infra/Caddyfile'


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
host = env['DEPLOY_HOST']
password = env['ROOT_PASSWORD']

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username='root', password=password, timeout=15)

# Backup do Caddyfile atual
sftp = client.open_sftp()
print(f'Conectado em root@{host}')

# Le local
with open(LOCAL_CADDY, 'rb') as f:
    content = f.read()

# Backup remoto
import time
backup_path = f'{REMOTE_CADDY}.bak.{int(time.time())}'
client.exec_command(f'cp -a {REMOTE_CADDY} {backup_path}')
print(f'Backup: {backup_path}')

# Upload novo
with sftp.open(REMOTE_CADDY, 'wb') as f:
    f.write(content)
print(f'Novo Caddyfile escrito em {REMOTE_CADDY}')

# Valida sintaxe antes de aplicar
stdin, stdout, stderr = client.exec_command(
    f'docker exec ktask-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile',
    timeout=30,
)
val_out = stdout.read().decode('utf-8', errors='replace').strip()
val_err = stderr.read().decode('utf-8', errors='replace').strip()
val_rc = stdout.channel.recv_exit_status()
print('--- validate ---')
print(val_out or '(stdout vazio)')
if val_err:
    print('stderr:', val_err)
print(f'exit: {val_rc}')

if val_rc != 0:
    print('FATAL: sintaxe invalida. Caddyfile NAO foi aplicado em runtime.')
    client.close()
    sys.exit(1)

# Reload sem downtime
stdin, stdout, stderr = client.exec_command(
    f'docker exec ktask-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile',
    timeout=30,
)
rel_out = stdout.read().decode('utf-8', errors='replace').strip()
rel_err = stderr.read().decode('utf-8', errors='replace').strip()
rel_rc = stdout.channel.recv_exit_status()
print('\n--- reload ---')
print(rel_out or '(stdout vazio)')
if rel_err:
    print('stderr:', rel_err)
print(f'exit: {rel_rc}')

client.close()
sys.exit(rel_rc)
