"""Procura onde estao definidas as envs EVOLUTION_DEFAULT_* no servidor."""
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
    # 1. Procura arquivos .env, .env.prod etc em /opt
    'find /opt -maxdepth 4 -type f \\( -name ".env" -o -name "*.env" -o -name "prod.env" -o -name ".env.prod" \\) 2>/dev/null',
    # 2. Conteudo do docker-compose pra ver env_file/environment
    'ls /opt/ktask/infra/ 2>/dev/null',
    # 3. Procura "EVOLUTION_DEFAULT" no projeto
    'grep -rn "EVOLUTION_DEFAULT" /opt/ktask/ --include="*.yml" --include="*.yaml" --include=".env*" 2>/dev/null | head',
    # 4. Inspeciona env do container ktask-api
    'docker exec ktask-api env 2>/dev/null | grep -i evolution | sed "s/API_KEY=.*/API_KEY=***/"',
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
