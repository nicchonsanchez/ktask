"""docker compose up -d --force-recreate no servico api,
pra que ele carregue as envs Evolution novas do prod.env.
"""
import os
import time
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

# Pega tag exata atual e cria alias :latest local pra compose enxergar
rc, current_image, _ = run(client, 'docker inspect ktask-api --format "{{.Config.Image}}"')
current_image = current_image.strip()
run(client, f'docker tag {current_image} ghcr.io/kharis-edu/ktask-api:latest')

# up -d --force-recreate --pull never so do servico api
run(client,
    'cd /opt/ktask/infra && docker compose -f docker-compose.prod.yml --env-file prod.env up -d --force-recreate --no-deps --pull never api',
    timeout=180)

# Espera healthy
for i in range(6):
    time.sleep(8)
    rc, out, _ = run(client, 'docker ps --format "{{.Names}}\t{{.Status}}" | grep ktask-api')
    if 'healthy' in out:
        break

# Confirma env nova
run(client, 'docker exec ktask-api env | grep -i evolution | sed "s/API_KEY=.*/API_KEY=***/"')

client.close()
