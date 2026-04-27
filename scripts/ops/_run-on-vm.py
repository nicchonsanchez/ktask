"""Executa o setup-kops-on-vm.sh no servidor de producao via SSH password.
Le HCLOUD_TOKEN/ROOT_PASSWORD/DEPLOY_HOST de .env.ops na raiz do repo.
"""
import os
import sys
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_FILE = os.path.join(ROOT, '.env.ops')
SCRIPT_FILE = os.path.join(os.path.dirname(__file__), 'setup-kops-on-vm.sh')


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


def main():
    env = load_env(ENV_FILE)
    host = env.get('DEPLOY_HOST')
    password = env.get('ROOT_PASSWORD')
    if not host or not password:
        print('ERRO: DEPLOY_HOST ou ROOT_PASSWORD ausentes em .env.ops')
        sys.exit(1)

    with open(SCRIPT_FILE, 'r', encoding='utf-8', newline='\n') as f:
        script = f.read()

    print(f'Conectando em root@{host}...')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username='root', password=password, timeout=15)

    print('Executando setup-kops-on-vm.sh remoto...')
    stdin, stdout, stderr = client.exec_command('bash -s', timeout=60)
    stdin.write(script)
    stdin.channel.shutdown_write()

    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    rc = stdout.channel.recv_exit_status()

    print('--- STDOUT ---')
    print(out)
    if err:
        print('--- STDERR ---')
        print(err)
    print(f'exit code: {rc}')

    client.close()
    sys.exit(rc)


if __name__ == '__main__':
    main()
