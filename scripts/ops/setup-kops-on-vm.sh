#!/bin/bash
# Idempotente — pode rodar varias vezes. Roda como root no servidor.
# Cria/repara a conta 'kops' com chave SSH autorizada e sudo NOPASSWD.

set -e

echo "[1/6] Garantindo user kops..."
if ! id kops >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" kops
fi

echo "[2/6] Adicionando kops aos grupos docker e sudo..."
usermod -aG docker,sudo kops

echo "[3/6] Configurando sudo NOPASSWD..."
cat > /etc/sudoers.d/kops <<'EOF'
kops ALL=(ALL) NOPASSWD:ALL
EOF
chmod 440 /etc/sudoers.d/kops

echo "[4/6] Preparando ~/.ssh..."
mkdir -p /home/kops/.ssh
chmod 700 /home/kops/.ssh

echo "[5/6] Autorizando chaves SSH..."
cat > /home/kops/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIE/vLsDS573Ydgds3p7rRybRx9SHnK/jb+Z48MldQJv desenvolvimento@agenciakharis.com.br
EOF
chmod 600 /home/kops/.ssh/authorized_keys
chown -R kops:kops /home/kops/.ssh

echo "[6/6] Verificacao..."
ls -la /home/kops/.ssh/
echo "===setup OK==="
