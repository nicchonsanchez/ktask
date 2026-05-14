"""Aplica scripts/move-history-tecnologia.sql contra o Postgres da VM via
docker exec ktask-postgres psql.

Le DEPLOY_HOST/ROOT_PASSWORD de .env.ops, conecta via SSH+senha (root) e
envia o SQL pelo stdin do psql. Reporta stdout/stderr/exit code.
"""
import os
import sys
import paramiko

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV_FILE = os.path.join(ROOT, '.env.ops')
SQL_FILE = os.path.join(ROOT, 'scripts', 'move-history-tecnologia.sql')


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

    with open(SQL_FILE, 'r', encoding='utf-8', newline='\n') as f:
        sql = f.read()

    print(f'Conectando em root@{host}...')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username='root', password=password, timeout=15)

    # Pipe SQL stdin -> docker exec -i ktask-postgres psql
    cmd = 'docker exec -i ktask-postgres psql -U ktask -d ktask -v ON_ERROR_STOP=1'
    print(f'Executando: {cmd}')
    print(f'Tamanho do SQL: {len(sql)} bytes ({sql.count(chr(10))} linhas)')

    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    stdin.write(sql)
    stdin.channel.shutdown_write()

    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    rc = stdout.channel.recv_exit_status()

    print('--- STDOUT ---')
    print(out if out else '(vazio)')
    if err:
        print('--- STDERR ---')
        print(err)
    print(f'exit code: {rc}')

    client.close()
    sys.exit(rc)


if __name__ == '__main__':
    main()
