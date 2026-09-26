$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    throw 'PHP não encontrado no PATH. Instale PHP 8.1+ com pdo_mysql. Veja LEIA-ME.md.'
}
if (-not (Test-Path -LiteralPath 'config/config.php')) {
    Copy-Item -LiteralPath 'config/config.example.php' -Destination 'config/config.php'
    Write-Host 'config/config.php foi criado. Preencha a senha e os dados do MySQL e execute novamente.'
    exit 1
}
& php src/verificar.php
if ($LASTEXITCODE -ne 0) { throw 'Requer PHP 8.1+ com a extensão pdo_mysql habilitada.' }
Write-Host 'Cantina: http://localhost:8000 — Ctrl+C para encerrar.'
& php -S localhost:8000 -t public
