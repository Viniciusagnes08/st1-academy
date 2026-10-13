# Starts the existing local pilot without changing accounts, data or credentials.
[CmdletBinding()]
param(
    [switch]$ValidateOnly,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$academyRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$academyServer = Join-Path $academyRoot 'server.mjs'
$academyMutex = $null
$academyLocked = $false
$academyOperationalEnvironment = @{}

function Get-AcademyListeners([int]$Port) {
    @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Test-AcademyHealth($Config) {
    try {
        # Probe the IPv4 address we bind to. localhost can spend over two seconds
        # attempting IPv6 first on Windows. Public URLs and OAuth keep localhost.
        $healthUri = 'http://127.0.0.1:' + $Config.port + '/api/catalog'
        $catalog = Invoke-RestMethod -Uri $healthUri -TimeoutSec 5 -Method Get
        return ($catalog.title -eq $Config.title -and
            $catalog.environment -eq 'local-persistent' -and
            $catalog.minimumPercent -eq 80 -and $catalog.criticalRequired -eq $true -and
            $catalog.totalTracks -eq $Config.totalTracks -and
            $catalog.testMode -eq $Config.testMode)
    } catch { return $false }
}

function Test-AcademyProcess([int]$ProcessId, [string]$NodePath) {
    try {
        $running = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $ProcessId)
        if (-not $running -or -not $running.ExecutablePath -or -not $running.CommandLine) { return $false }
        if (-not [string]::Equals($running.ExecutablePath, $NodePath, [StringComparison]::OrdinalIgnoreCase)) { return $false }
        # Our launcher always passes the full path. Never reuse or terminate an unknown listener.
        return $running.CommandLine.IndexOf($academyServer, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } catch { return $false }
}

try {
    if (-not (Test-Path -LiteralPath $academyServer -PathType Leaf)) { throw 'server.mjs nao encontrado ao lado do iniciador.' }
    if (-not (Test-Path -LiteralPath (Join-Path $academyRoot '.env') -PathType Leaf)) {
        throw 'A configuracao privada .env deste piloto nao foi encontrada. Nao foi criado outro banco.'
    }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $academyNode = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $academyNode -PathType Leaf)) { throw 'Instale Node.js 24.15.0 ou posterior antes de iniciar.' }
    $nodeVersion = (& $academyNode --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.(\d+)\.(\d+)') { throw 'Nao foi possivel conferir a versao do Node.js.' }
    if ([version]$nodeVersion.Substring(1) -lt [version]'24.15.0') { throw 'O Node.js precisa ser 24.15.0 ou posterior.' }
    foreach ($dependency in @('express', 'better-auth', 'pdf-lib', '@pdf-lib/fontkit', 'qrcode')) {
        if (-not (Test-Path -LiteralPath (Join-Path $academyRoot ('node_modules/' + $dependency + '/package.json')) -PathType Leaf)) {
            throw 'As dependencias ainda nao estao instaladas. Execute npm ci --ignore-scripts nesta pasta.'
        }
    }

    # Child processes use .env for operational settings, even if a terminal inherited
    # a different PORT or test configuration. The caller environment is restored below.
    foreach ($variableName in @('PORT', 'ACADEMY_BASE_URL', 'ACADEMY_DATA_DIR', 'ACADEMY_LISTEN_HOST', 'ACADEMY_TEST_MODE')) {
        $academyOperationalEnvironment[$variableName] = [Environment]::GetEnvironmentVariable($variableName, 'Process')
        Remove-Item -LiteralPath ('Env:' + $variableName) -ErrorAction SilentlyContinue
    }
    # Only operational metadata leaves this subprocess. OAuth secrets are never printed.
    $configProbe = @'
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
try {
  const saved=parseEnv(readFileSync('.env','utf8'));
  if(!saved.PORT||!saved.ACADEMY_BASE_URL||!['0','1'].includes(saved.ACADEMY_TEST_MODE)) throw new Error('Missing operational environment');
  const port=Number(process.env.PORT),url=new URL(process.env.ACADEMY_BASE_URL);
  const host=process.env.ACADEMY_LISTEN_HOST||'127.0.0.1';
  if(port!==4177||url.protocol!=='http:'||url.hostname!=='localhost'||Number(url.port)!==port||url.pathname!=='/'||url.search||url.hash||url.username||url.password||!['localhost','127.0.0.1'].includes(host)||process.env.VERCEL) throw new Error('Invalid local configuration');
  const bank=JSON.parse(readFileSync('content/questions.json','utf8'));
  console.log(JSON.stringify({port,baseURL:url.origin,host,dataDir:resolve(process.env.ACADEMY_DATA_DIR||'data'),testMode:process.env.ACADEMY_TEST_MODE==='1',title:bank.title,totalTracks:bank.tracks.length}));
} catch { console.error('A configuracao operacional privada nao corresponde a um piloto local valido. Confira PORT, ACADEMY_BASE_URL, ACADEMY_TEST_MODE e as variaveis herdadas.'); process.exit(1); }
'@
    Push-Location -LiteralPath $academyRoot
    try {
        $configResult = & $academyNode --env-file-if-exists=.env --input-type=module -e $configProbe
        if ($LASTEXITCODE -ne 0) { throw 'Validacao da configuracao interrompida; credenciais e banco nao foram alterados.' }
        $academyConfig = $configResult | ConvertFrom-Json
    } finally { Pop-Location }

    foreach ($privateFile in @('academy.sqlite', '.auth-secret')) {
        if (-not (Test-Path -LiteralPath (Join-Path $academyConfig.dataDir $privateFile) -PathType Leaf)) {
            throw 'O banco ou a chave do piloto existente nao foram encontrados na pasta configurada. Nao foi criado outro cadastro.'
        }
    }
    $academyListeners = @(Get-AcademyListeners $academyConfig.port)
    if ($ValidateOnly) {
        Write-Output ('Validacao concluida. Node {0}; configuracao local, dependencias, banco e chave existentes conferidos.' -f $nodeVersion)
        Write-Output ('Endereco: {0} | Porta ocupada: {1} | Nenhum servidor foi iniciado e nenhum arquivo foi modificado.' -f $academyConfig.baseURL, ($academyListeners.Count -gt 0))
        exit 0
    }

    $hashSource = [Text.Encoding]::UTF8.GetBytes($academyRoot.ToLowerInvariant() + ':' + $academyConfig.port)
    $hashTool = [Security.Cryptography.SHA256]::Create()
    try { $lockHash = [BitConverter]::ToString($hashTool.ComputeHash($hashSource)).Replace('-', '') } finally { $hashTool.Dispose() }
    $academyMutex = New-Object Threading.Mutex($false, ('Local\ST1Academy-' + $lockHash))
    try { $academyLocked = $academyMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $academyLocked = $true }
    if (-not $academyLocked) { throw 'Outro iniciador ja esta trabalhando. Aguarde alguns segundos e abra novamente.' }

    $academyListeners = @(Get-AcademyListeners $academyConfig.port)
    if ($academyListeners.Count -gt 0) {
        $listenerIds = @($academyListeners | Select-Object -ExpandProperty OwningProcess -Unique)
        if ($listenerIds.Count -ne 1 -or -not (Test-AcademyProcess $listenerIds[0] $academyNode) -or -not (Test-AcademyHealth $academyConfig)) {
            throw ('A porta {0} esta ocupada por um processo que nao foi identificado como este piloto saudavel. Nenhum processo foi encerrado.' -f $academyConfig.port)
        }
        Write-Output ('A ST1 Academy ja esta funcionando em {0}. O servidor existente foi reutilizado.' -f $academyConfig.baseURL)
    } else {
        $academyLogDir = Join-Path $academyConfig.dataDir 'logs'
        New-Item -ItemType Directory -Path $academyLogDir -Force | Out-Null
        $logSuffix = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
        $stdoutPath = Join-Path $academyLogDir ('startup-' + $logSuffix + '.out.log')
        $stderrPath = Join-Path $academyLogDir ('startup-' + $logSuffix + '.err.log')
        $serverArgs = @('--env-file-if-exists=.env', ('"{0}"' -f $academyServer))
        $academyProcess = Start-Process -FilePath $academyNode -ArgumentList $serverArgs -WorkingDirectory $academyRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
        $ready = $false
        $deadline = [DateTime]::UtcNow.AddSeconds(45)
        do {
            $academyProcess.Refresh()
            if ($academyProcess.HasExited) { break }
            $currentListeners = @(Get-AcademyListeners $academyConfig.port)
            $ownerIds = @($currentListeners | Select-Object -ExpandProperty OwningProcess -Unique)
            if ($ownerIds.Count -eq 1 -and $ownerIds[0] -eq $academyProcess.Id -and (Test-AcademyHealth $academyConfig)) { $ready = $true; break }
            Start-Sleep -Milliseconds 300
        } while ([DateTime]::UtcNow -lt $deadline)
        if (-not $ready) {
            throw ('O servidor nao confirmou a inicializacao. Consulte os logs privados em {0}. Nenhuma conta, senha ou chave foi recriada.' -f $academyLogDir)
        }
        @{ pid = $academyProcess.Id; project = $academyRoot; node = $academyNode; url = $academyConfig.baseURL; startedAt = [DateTime]::UtcNow.ToString('o'); stdout = $stdoutPath; stderr = $stderrPath } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $academyLogDir 'launcher.json') -Encoding UTF8
        Write-Output ('ST1 Academy iniciada e verificada em {0}. Processo em segundo plano: {1}.' -f $academyConfig.baseURL, $academyProcess.Id)
        Write-Output 'O servidor foi iniciado separadamente no Windows. Abra pelo mesmo atalho depois de desligar o computador.'
    }
    if ($OpenBrowser) { Start-Process -FilePath ($academyConfig.baseURL + '/login') | Out-Null }
} catch {
    Write-Error $_.Exception.Message -ErrorAction Continue
    exit 1
} finally {
    foreach ($variableName in $academyOperationalEnvironment.Keys) {
        if ($null -eq $academyOperationalEnvironment[$variableName]) {
            Remove-Item -LiteralPath ('Env:' + $variableName) -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($variableName, $academyOperationalEnvironment[$variableName], 'Process')
        }
    }
    if ($academyLocked -and $academyMutex) { $academyMutex.ReleaseMutex() }
    if ($academyMutex) { $academyMutex.Dispose() }
}
