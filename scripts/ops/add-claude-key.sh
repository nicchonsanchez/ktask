#!/bin/bash
# Adiciona chave SSH do agente ao authorized_keys do root, idempotente.
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIE/vLsDS573Ydgds3p7rRybRx9SHnK/jb+Z48MldQJv desenvolvimento@agenciakharis.com.br'
touch /root/.ssh/authorized_keys
if ! grep -qF "$KEY" /root/.ssh/authorized_keys; then
  echo "$KEY" >> /root/.ssh/authorized_keys
  echo "Chave adicionada."
else
  echo "Chave ja presente."
fi
chmod 600 /root/.ssh/authorized_keys
ls -la /root/.ssh/authorized_keys
