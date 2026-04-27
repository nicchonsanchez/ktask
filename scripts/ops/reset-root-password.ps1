# Reseta a senha root do servidor de producao via Hetzner Cloud API.
# Imprime a senha gerada (mostrada uma unica vez pela API).
#
# Uso:
#   pnpm reset-root-password   (alias) — ou
#   .\scripts\ops\reset-root-password.ps1

. (Join-Path $PSScriptRoot '_load-env.ps1')

if (-not $env:HCLOUD_TOKEN) {
    Write-Error "HCLOUD_TOKEN ausente. Adicione em .env.ops."
    exit 1
}
if (-not $env:HCLOUD_SERVER_ID) {
    Write-Error "HCLOUD_SERVER_ID ausente. Adicione em .env.ops."
    exit 1
}

$confirm = Read-Host "ATENCAO: vai resetar a senha root do servidor $env:HCLOUD_SERVER_ID. Continuar? (digite SIM)"
if ($confirm -ne 'SIM') {
    Write-Host "Cancelado."
    exit 0
}

$resp = Invoke-RestMethod -Method POST `
    -Headers @{ Authorization = "Bearer $env:HCLOUD_TOKEN" } `
    -Uri "https://api.hetzner.cloud/v1/servers/$env:HCLOUD_SERVER_ID/actions/reset_password"

Write-Host ""
Write-Host "Nova senha root: $($resp.root_password)" -ForegroundColor Green
Write-Host ""
Write-Host "Use ela pra logar via Console da Hetzner ou SSH:"
Write-Host "  ssh root@$env:DEPLOY_HOST"
Write-Host ""
Write-Host "A senha so eh exibida agora. Anote num lugar seguro." -ForegroundColor Yellow
