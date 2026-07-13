$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location (Join-Path $root 'extension')
try {
    npm install
    npm run typecheck
    npm run test
    npm run build
} finally { Pop-Location }

$bin = Join-Path $root 'build\bin'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
go build -trimpath -o (Join-Path $bin 'rivlet-native-host.exe') ./cmd/rivlet-native-host
Write-Host "Built extension and native host in $bin"
