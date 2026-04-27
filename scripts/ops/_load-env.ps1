# Carrega variaveis de .env.ops na raiz do repo no ambiente da sessao atual.
# Os scripts de ops fazem `. ./scripts/ops/_load-env.ps1` antes de usar.

$envFile = Join-Path $PSScriptRoot '..\..\\.env.ops'
$envFile = [System.IO.Path]::GetFullPath($envFile)

if (-not (Test-Path $envFile)) {
    Write-Error ".env.ops nao encontrado em $envFile. Copie .env.ops.example pra .env.ops e preencha."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    # Remove aspas envolvendo valor, se houver
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $value
}
