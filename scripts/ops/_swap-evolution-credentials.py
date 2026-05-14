"""Troca credenciais Evolution em /opt/ktask/infra/prod.env:
- INSTANCE -> KharisWhatsapp
- API_KEY  -> 1069C0955C1E-4C1D-8B4C-634E1C0DC545
- URL mantem (https://whats.agenciakharis.com.br)

Faz backup do prod.env antes. Restart do container ktask-api no fim.
"""
import os
import time
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_FILE = os.path.join(ROOT, '.env.ops')

NEW_INSTANCE = 'KharisWhatsapp'
NEW_API_KEY = '1069C0955C1E-4C1D-8B4C-634E1C0DC545'
NEW_URL = 'https://whats.agenciakharis.com.br'


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


def run(client, cmd, timeout=30):
    print(f'\n$ {cmd}')
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    rc = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f'(stderr) {err}')
    print(f'(exit {rc})')
    return rc, out, err


env = load_env(ENV_FILE)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(env['DEPLOY_HOST'], username='root', password=env['ROOT_PASSWORD'], timeout=15)

PROD_ENV = '/opt/ktask/infra/prod.env'
ts = int(time.time())
backup = f'{PROD_ENV}.bak.{ts}'

# 1. Backup
run(client, f'cp -a {PROD_ENV} {backup}')

# 2. Confirma backup existe
run(client, f'ls -la {backup}')

# 3. Substitui as 3 envs (sed in-place)
#    Usa | como delimitador pra evitar conflito com / da URL.
run(client, f"sed -i 's|^EVOLUTION_DEFAULT_INSTANCE=.*|EVOLUTION_DEFAULT_INSTANCE={NEW_INSTANCE}|' {PROD_ENV}")
run(client, f"sed -i 's|^EVOLUTION_DEFAULT_API_KEY=.*|EVOLUTION_DEFAULT_API_KEY={NEW_API_KEY}|' {PROD_ENV}")
run(client, f"sed -i 's|^EVOLUTION_DEFAULT_URL=.*|EVOLUTION_DEFAULT_URL={NEW_URL}|' {PROD_ENV}")

# 4. Mostra valores novos (mascarando key)
run(client, f"grep -E '^EVOLUTION_DEFAULT_(URL|INSTANCE)=' {PROD_ENV}")
run(client, f"grep -E '^EVOLUTION_DEFAULT_API_KEY=' {PROD_ENV} | sed 's/=.*$/=***/'")

# 5. Restart do container da API
run(client, 'cd /opt/ktask/infra && docker compose -f docker-compose.prod.yml restart ktask-api', timeout=120)

# 6. Aguarda alguns segundos + confirma que subiu de novo
time.sleep(8)
run(client, 'docker ps --format "{{.Names}}\t{{.Status}}" | grep ktask-api')

# 7. Confirma env nova dentro do container
run(client, 'docker exec ktask-api env | grep -i evolution | sed "s/API_KEY=.*/API_KEY=***/"')

client.close()
print('\n--- Backup mantido em:', backup)
