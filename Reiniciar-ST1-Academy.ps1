# Reload this exact local Academy while preserving its existing account and data.
[CmdletBinding()]
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$academyRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$academyServer = Join-Path $academyRoot 'server.mjs'
$academyData = Join-Path $academyRoot 'data'
$academySavedEnvironment = @{}
$academyChangedEnvironment = $false
try {
    $academyNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    foreach ($required in @($academyNode, $academyServer, (Join-Path $academyRoot '.env'), (Join-Path $academyData 'academy.sqlite'), (Join-Path $academyData '.auth-secret'))) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw 'Um requisito do projeto existente nao foi encontrado. Nenhum cadastro foi recriado.' }
    }
    $academyListener = @(Get-NetTCPConnection -LocalPort 4177 -State Listen -ErrorAction SilentlyContinue)
    $academyOwners = @($academyListener | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($academyOwners.Count -ne 1) { throw 'Abra o servidor principal antes de atualizar. Este iniciador so recarrega a Academy existente.' }
    $academyProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $academyOwners[0])
    if (-not $academyProcess -or -not $academyProcess.CommandLine -or
        -not [string]::Equals($academyProcess.ExecutablePath, $academyNode, [StringComparison]::OrdinalIgnoreCase) -or
        $academyProcess.CommandLine.IndexOf($academyServer, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'A porta pertence a um processo diferente. O processo foi preservado.'
    }
    $academyCatalog = Invoke-RestMethod -Uri 'http://127.0.0.1:4177/api/catalog' -TimeoutSec 5
    if ($academyCatalog.environment -ne 'local-persistent' -or $academyCatalog.minimumPercent -ne 80 -or $academyCatalog.totalTracks -ne 5) {
        throw 'A instancia nao corresponde a Academy esperada.'
    }
    $academySecretBefore = (Get-FileHash -LiteralPath (Join-Path $academyData '.auth-secret') -Algorithm SHA256).Hash
    if ($ValidateOnly) {
        Write-Output 'Servidor, banco e chave existentes conferidos. Nenhum processo foi reiniciado.'
        exit 0
    }
    foreach ($name in @('PORT','ACADEMY_BASE_URL','ACADEMY_DATA_DIR','ACADEMY_TEST_MODE','ACADEMY_LISTEN_HOST')) {
        $academySavedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
    }
    $academyChangedEnvironment = $true
    $env:PORT = '4177'
    $env:ACADEMY_BASE_URL = 'http://localhost:4177'
    $env:ACADEMY_DATA_DIR = $academyData
    $env:ACADEMY_TEST_MODE = if ($academyCatalog.testMode) { '1' } else { '0' }
    $env:ACADEMY_LISTEN_HOST = '127.0.0.1'
    $academyLogs = Join-Path $academyData 'logs'
    New-Item -ItemType Directory -Path $academyLogs -Force | Out-Null
    $academyStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    # Recheck ownership immediately before stopping only the known process.
    $academyCurrentOwners = @(Get-NetTCPConnection -LocalPort 4177 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($academyCurrentOwners.Count -ne 1 -or $academyCurrentOwners[0] -ne $academyOwners[0]) { throw 'A instancia mudou durante a verificacao. Atualizacao cancelada.' }
    Stop-Process -Id $academyOwners[0]
    $academyStarted = Start-Process -FilePath $academyNode -ArgumentList @('--env-file-if-exists=.env', ('"' + $academyServer + '"')) -WorkingDirectory $academyRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $academyLogs ('mapa-' + $academyStamp + '.log')) -RedirectStandardError (Join-Path $academyLogs ('mapa-' + $academyStamp + '-erro.log')) -PassThru
    $academyReady = $false
    $academyDeadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 300
        try {
            $academyNewCatalog = Invoke-RestMethod -Uri 'http://127.0.0.1:4177/api/catalog' -TimeoutSec 2
            $academyNewOwners = @(Get-NetTCPConnection -LocalPort 4177 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
            $academyReady = $academyNewOwners.Count -eq 1 -and $academyNewOwners[0] -eq $academyStarted.Id -and $academyNewCatalog.testMode -eq $academyCatalog.testMode
        } catch { $academyReady = $false }
    } while (-not $academyReady -and [DateTime]::UtcNow -lt $academyDeadline)
    if (-not $academyReady) { throw 'O servidor ainda nao confirmou a inicializacao. Consulte os logs privados em data/logs.' }
    $academySecretAfter = (Get-FileHash -LiteralPath (Join-Path $academyData '.auth-secret') -Algorithm SHA256).Hash
    if ($academySecretAfter -ne $academySecretBefore) { throw 'A chave de autenticacao mudou. Confira a configuracao antes de continuar.' }
    Write-Output 'ST1 Academy recarregada. Banco, credenciais, chave e configuracao local preservados.'
    Write-Output 'Atualize a aba existente em http://localhost:4177/#conhecimento para ver o mapa revisado.'
} catch {
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    if ($academyChangedEnvironment) {
        foreach ($name in $academySavedEnvironment.Keys) {
            if ($null -eq $academySavedEnvironment[$name]) { Remove-Item -LiteralPath ('Env:' + $name) -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($name,$academySavedEnvironment[$name],'Process') }
        }
    }
}
