# Ensures Ollama is running on localhost using WSL (Ubuntu) when available,
# with a Windows-native fallback. Designed to be idempotent.

param()

$ErrorActionPreference = 'SilentlyContinue'

function Write-Info($msg) { Write-Host "[ensure-ollama] $msg" }
function Write-Warn($msg) { Write-Warning "[ensure-ollama] $msg" }

function Get-EnvOrDefault([string]$name, [string]$default) {
    $val = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($val)) { return $default }
    return $val
}

function Test-Port([int]$Port) {
    try {
        $res = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
        return [bool]$res.TcpTestSucceeded
    } catch { return $false }
}

function Wait-Healthy([int]$Port, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port -Port $Port) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Has-WSL() {
    return $null -ne (Get-Command wsl.exe -ErrorAction SilentlyContinue)
}

function WSL-HasDistro([string]$Distro) {
    try {
        $list = & wsl.exe -l -q 2>$null
        return $list -split "`r?`n" | Where-Object { $_ -eq $Distro } | ForEach-Object { $true } | Select-Object -First 1
    } catch { return $false }
}

function Invoke-WSL([string]$Distro, [string]$Cmd) {
    & wsl.exe -d $Distro -- bash -lc $Cmd
}

function Ensure-Ollama-WSL([string]$Distro) {
    Write-Info "Verificando/instalando Ollama na WSL ($Distro)"
    $installCmd = 'command -v ollama >/dev/null 2>&1 || (curl -fsSL https://ollama.com/install.sh | sh)'
    Invoke-WSL -Distro $Distro -Cmd $installCmd | Out-Null
}

function Start-Ollama-WSL([string]$Distro) {
    Write-Info "Iniciando ollama serve em background (WSL:$Distro)"
    $startCmd = 'mkdir -p "$HOME/.ollama"; nohup ollama serve > "$HOME/.ollama/ollama.log" 2>&1 & disown || true'
    Invoke-WSL -Distro $Distro -Cmd $startCmd | Out-Null
}

function Has-Ollama-OnWindows() {
    return $null -ne (Get-Command ollama -ErrorAction SilentlyContinue)
}

function Start-Ollama-Windows() {
    try {
        $ollama = (Get-Command ollama -ErrorAction Stop).Source
        Write-Info "Iniciando ollama serve no Windows (hidden)"
        Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        return $true
    } catch {
        Write-Warn "Ollama não encontrado no PATH do Windows."
        return $false
    }
}

# Main
$port = [int](Get-EnvOrDefault 'OLLAMA_PORT' '11434')
$timeout = [int](Get-EnvOrDefault 'OLLAMA_START_TIMEOUT' '20')
$distro = Get-EnvOrDefault 'OLLAMA_WSL_DISTRO' 'Ubuntu'

if (Test-Port -Port $port) {
    Write-Info "Porta $port já está respondendo. Nada a fazer."
    exit 0
}

if (Has-WSL) {
    if (-not (WSL-HasDistro -Distro $distro)) {
        Write-Warn "Distro '$distro' não encontrada. Tentando WSL padrão..."
        $distro = 'Ubuntu'
    }

    Write-Info "Tentando iniciar Ollama via WSL ($distro)"
    Ensure-Ollama-WSL -Distro $distro
    Start-Ollama-WSL -Distro $distro

    if (Wait-Healthy -Port $port -TimeoutSeconds $timeout) {
        Write-Info "Ollama disponível em localhost:$port (via WSL)."
        exit 0
    } else {
        Write-Warn "Timeout aguardando Ollama (WSL). Prosseguindo com fallback Windows."
    }
}

# Fallback Windows
if (-not (Has-Ollama-OnWindows)) {
    Write-Warn "Ollama não encontrado no Windows e WSL não atendeu no tempo."
    Write-Warn "Instale o Ollama no Windows ou habilite WSL/Ubuntu."
    exit 0
}

if (Start-Ollama-Windows) {
    if (Wait-Healthy -Port $port -TimeoutSeconds $timeout) {
        Write-Info "Ollama disponível em localhost:$port (Windows)."
        exit 0
    } else {
        Write-Warn "Timeout aguardando Ollama (Windows)."
        exit 0
    }
}

exit 0


