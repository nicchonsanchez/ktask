# Scripts de operação

Scripts PowerShell pra rodar contra a infra (Hetzner, etc) sem precisar
abrir o painel web. Cada script carrega `.env.ops` da raiz automaticamente
via `_load-env.ps1`.

## Setup inicial (1x)

```powershell
# Copia o template
Copy-Item .env.ops.example .env.ops

# Edita .env.ops e preenche HCLOUD_TOKEN (gerado em Hetzner Console > Security > API Tokens)
notepad .env.ops
```

`.env.ops` está no `.gitignore` — credenciais ficam só na sua máquina.

## Scripts disponíveis

### `reset-root-password.ps1`

Reseta a senha root do servidor de produção via Hetzner Cloud API. Útil
quando você esqueceu a senha ou precisa de acesso emergencial.

```powershell
.\scripts\ops\reset-root-password.ps1
```

A senha nova é mostrada **uma única vez**. Não afeta o deploy do GitHub
Actions (que usa SSH key, não senha).

## Por que `.env.ops` em vez de `.env`

- `.env` / `apps/api/.env` são lidos pelo runtime do app (Node/Next/Nest).
  Variáveis erradas lá quebram dev local.
- `.env.ops` é só pra scripts manuais de operação. Separar evita conflito
  e deixa óbvio onde cada credencial vive.
