use std::process::{Command, Stdio};
use tauri::{WebviewWindow, Emitter};
use tokio::process::Command as TokioCommand;
use tokio::fs;

/// Verifica se o Chocolatey está instalado
pub fn check_chocolatey_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("choco");
        cmd.arg("--version");
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Ocultar janela do console no Windows
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        match cmd.output() {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// Instala o Chocolatey via PowerShell com elevação UAC
/// Emite eventos 'install-log' para cada linha de stdout/stderr
/// Usa Start-Process -Verb RunAs para solicitar permissões de administrador
pub async fn install_chocolatey(window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use uuid::Uuid;
        
        // Script oficial de instalação do Chocolatey
        let install_script = r#"
Set-ExecutionPolicy Bypass -Scope Process -Force;
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
"#;
        
        // Criar arquivo temporário para capturar logs do processo elevado
        let temp_dir = env::temp_dir();
        let log_file = temp_dir.join(format!("choco_install_{}.log", Uuid::new_v4()));
        let log_file_str = log_file.to_string_lossy().replace('\\', "/");
        
        // Criar script PowerShell que executa com elevação e redireciona saída
        let ps_wrapper_script = format!(
            r#"$script = @'
{}
'@
$logFile = '{}'
try {{
    $proc = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $script -Verb RunAs -Wait -PassThru -WindowStyle Hidden
    if ($proc.ExitCode -ne 0) {{
        "ExitCode: $($proc.ExitCode)" | Out-File -FilePath $logFile -Append -Encoding utf8
    }}
}} catch {{
    "Error: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 1
}}"#,
            install_script.trim(),
            log_file_str
        );
        
        // Executar PowerShell wrapper (sem elevação, mas ele solicitará UAC internamente)
        let mut cmd = TokioCommand::new("powershell");
        cmd.args(&[
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command", &ps_wrapper_script
        ]);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Ocultar janela do console
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        // Iniciar processo e monitorar arquivo de log em paralelo
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn PowerShell: {}", e))?;
        
        // Aguardar conclusão do processo wrapper
        let status = child.wait().await
            .map_err(|e| format!("Failed to wait for PowerShell: {}", e))?;
        
        // Aguardar um pouco para garantir que logs finais foram escritos
        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        
        // Ler logs do arquivo e emitir eventos
        if let Ok(contents) = fs::read_to_string(&log_file).await {
            for line in contents.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && !trimmed.starts_with("ExitCode:") {
                    let _ = window.emit("install-log", serde_json::json!({
                        "line": trimmed,
                        "type": "stdout"
                    }));
                }
            }
        } else {
            // Se não conseguir ler o arquivo, emitir mensagem genérica
            let _ = window.emit("install-log", serde_json::json!({
                "line": "Instalando Chocolatey (solicitando permissões de administrador)...",
                "type": "stdout"
            }));
        }
        
        // Limpar arquivo temporário
        let _ = fs::remove_file(&log_file).await;
        
        // Verificar se Chocolatey foi instalado
        if check_chocolatey_installed() {
            Ok(())
        } else if status.success() {
            // Processo retornou sucesso mas Chocolatey não está disponível
            // Pode ser que precise recarregar PATH
            Err("Chocolatey installation completed but not found in PATH. Please restart the application.".to_string())
        } else {
            Err(format!("Chocolatey installation failed with exit code: {:?}", status.code()))
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Chocolatey is only available on Windows".to_string())
    }
}

/// Instala o Ollama via Chocolatey com elevação UAC
/// Usa arquivo .ps1 temporário para evitar problemas de escaping
/// Emite eventos 'install-log' para cada linha de stdout/stderr
/// Extrai progresso dos logs quando disponível
/// Verifica integridade após instalação usando verify_ollama_integrity
pub async fn install_ollama_choco(window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::env;
        use uuid::Uuid;
        
        let temp_dir = env::temp_dir();
        let script_id = Uuid::new_v4();
        let script_file = temp_dir.join(format!("ollama_install_{}.ps1", script_id));
        let log_file = temp_dir.join(format!("ollama_install_{}.log", script_id));
        let log_file_str = log_file.to_string_lossy().replace('\\', "/");
        let script_file_str = script_file.to_string_lossy().replace('\\', "/");
        
        // Conteúdo do script PowerShell completo
        let script_content = format!(
            r#"$ErrorActionPreference = "Stop"
$logFile = '{}'
Start-Transcript -Path $logFile -Append

try {{
    Write-Output "Iniciando instalação do Ollama..."
    
    # 1. Verificar/Instalar Chocolatey
    if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {{
        Write-Output "Instalando Chocolatey..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Output "Chocolatey instalado com sucesso."
    }} else {{
        Write-Output "Chocolatey já está instalado."
    }}
    
    # 2. Atualizar PATH para a sessão atual (Crucial)
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    # 3. Instalar Ollama
    Write-Output "Instalando Ollama via Choco..."
    choco install ollama -y --force
    
    Write-Output "Instalação concluída com sucesso."
    exit 0
}} catch {{
    Write-Error $_
    "Error: $_" | Out-File -FilePath $logFile -Append -Encoding utf8
    exit 1
}} finally {{
    Stop-Transcript
}}"#,
            log_file_str
        );
        
        // Escrever script para arquivo
        fs::write(&script_file, script_content).await
            .map_err(|e| format!("Failed to create PowerShell script: {}", e))?;
        
        // Emitir evento inicial
        let _ = window.emit("install-log", serde_json::json!({
            "line": "Preparando instalação do Ollama via Chocolatey...",
            "type": "stdout",
            "progress": 0
        }));
        
        // Emitir evento inicial avisando sobre UAC
        let _ = window.emit("install-log", serde_json::json!({
            "line": "Solicitando permissões de administrador... (Por favor, aceite o prompt do Windows)",
            "type": "stdout",
            "progress": 0
        }));

        // Executar script com elevação usando Start-Process (janela oculta)
        let mut cmd = TokioCommand::new("powershell");
        cmd.args(&[
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            &format!("Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', '{}' -Verb RunAs -WindowStyle Hidden -Wait", script_file_str)
        ]);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Ocultar janela do console
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        // Iniciar processo
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn PowerShell: {}", e))?;
        
        // Monitorar arquivo de log em tempo real enquanto o processo executa
        let log_file_clone = log_file.clone();
        let window_clone = window.clone();
        let monitor_handle = tokio::spawn(async move {
            let mut last_position = 0u64;
            let mut last_read = std::time::Instant::now();
            
            // Polling do arquivo de log enquanto o processo está rodando
            loop {
                if let Ok(metadata) = fs::metadata(&log_file_clone).await {
                    if metadata.len() > last_position {
                        if let Ok(mut file) = fs::File::open(&log_file_clone).await {
                            use tokio::io::{AsyncSeekExt, AsyncReadExt};
                            if file.seek(tokio::io::SeekFrom::Start(last_position)).await.is_ok() {
                                let bytes_to_read = (metadata.len() - last_position) as usize;
                                let mut buffer = vec![0u8; bytes_to_read];
                                if let Ok(bytes_read) = file.read(&mut buffer).await {
                                    if bytes_read > 0 {
                                        let new_content = String::from_utf8_lossy(&buffer[..bytes_read]);
                                        for line in new_content.lines() {
                                            let trimmed = line.trim();
                                            // Filtrar linhas de controle do Transcript
                                            if !trimmed.is_empty() 
                                                && !trimmed.starts_with("**********************")
                                                && !trimmed.starts_with("Windows PowerShell transcript start")
                                                && !trimmed.starts_with("Windows PowerShell transcript end")
                                                && !trimmed.starts_with("Command start time:")
                                                && !trimmed.starts_with("Command end time:")
                                                && !trimmed.starts_with("Machine:")
                                                && !trimmed.starts_with("Username:")
                                                && !trimmed.starts_with("RunAs User:")
                                                && !trimmed.starts_with("Transcript started")
                                                && !trimmed.starts_with("Transcript stopped") {
                                                let progress = extract_progress_from_log(trimmed);
                                                let _ = window_clone.emit("install-log", serde_json::json!({
                                                    "line": trimmed,
                                                    "type": "stdout",
                                                    "progress": progress
                                                }));
                                            }
                                        }
                                        last_position = metadata.len();
                                        last_read = std::time::Instant::now();
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Verificar se o processo ainda está rodando (timeout após 5 minutos de inatividade)
                if last_read.elapsed().as_secs() > 300 {
                    break;
                }
                
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            }
        });
        
        // Aguardar conclusão do processo wrapper
        let status = child.wait().await
            .map_err(|e| format!("Failed to wait for PowerShell: {}", e))?;
        
        // Aguardar um pouco para garantir que logs finais foram escritos
        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;
        
        // Cancelar monitoramento
        monitor_handle.abort();
        
        // Ler logs finais do arquivo e emitir eventos (caso tenha perdido algo)
        if let Ok(contents) = fs::read_to_string(&log_file).await {
            for line in contents.lines() {
                let trimmed = line.trim();
                // Filtrar linhas de controle do Transcript
                if !trimmed.is_empty() 
                    && !trimmed.starts_with("ExitCode:")
                    && !trimmed.starts_with("**********************")
                    && !trimmed.starts_with("Windows PowerShell transcript start")
                    && !trimmed.starts_with("Windows PowerShell transcript end")
                    && !trimmed.starts_with("Command start time:")
                    && !trimmed.starts_with("Command end time:")
                    && !trimmed.starts_with("Machine:")
                    && !trimmed.starts_with("Username:")
                    && !trimmed.starts_with("RunAs User:")
                    && !trimmed.starts_with("Transcript started")
                    && !trimmed.starts_with("Transcript stopped") {
                    let progress = extract_progress_from_log(trimmed);
                    let _ = window.emit("install-log", serde_json::json!({
                        "line": trimmed,
                        "type": "stdout",
                        "progress": progress
                    }));
                }
            }
        }
        
        // Limpar arquivos temporários
        let _ = fs::remove_file(&script_file).await;
        let _ = fs::remove_file(&log_file).await;
        
        // Verificar se a instalação foi bem-sucedida
        if !status.success() {
            return Err(format!("Ollama installation via Chocolatey failed with exit code: {:?}", status.code()));
        }
        
        // Aguardar um pouco para o Ollama ser instalado e iniciado
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        
        // Verificar integridade usando verify_ollama_integrity
        use crate::verify_ollama_integrity;
        match verify_ollama_integrity().await {
            Ok(true) => {
                let _ = window.emit("install-log", serde_json::json!({
                    "line": "Ollama instalado e verificado com sucesso!",
                    "type": "stdout",
                    "progress": 100
                }));
                Ok(())
            }
            Ok(false) => {
                // Instalado mas não funcional (serviço não está rodando)
                Err("Ollama foi instalado mas o serviço não está rodando. Tente iniciar manualmente.".to_string())
            }
            Err(e) => {
                Err(format!("Erro ao verificar instalação do Ollama: {}", e))
            }
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("Chocolatey is only available on Windows".to_string())
    }
}

/// Extrai progresso percentual de uma linha de log
/// Procura por padrões como "Progress: 50%", "50%", "Downloading...", etc.
fn extract_progress_from_log(line: &str) -> Option<u8> {
    // Procurar por padrão "Progress: n%" ou "n%"
    if let Some(percent_pos) = line.find('%') {
        let before_percent = &line[..percent_pos];
        // Procurar número antes do %
        let mut num_str = String::new();
        for ch in before_percent.chars().rev() {
            if ch.is_ascii_digit() {
                num_str.insert(0, ch);
            } else if !num_str.is_empty() {
                break;
            }
        }
        if let Ok(num) = num_str.parse::<u8>() {
            if num <= 100 {
                return Some(num);
            }
        }
    }
    
    // Procurar por keywords e mapear para progresso aproximado
    let line_lower = line.to_lowercase();
    if line_lower.contains("downloading") {
        return Some(25);
    } else if line_lower.contains("installing") {
        return Some(50);
    } else if line_lower.contains("shim") || line_lower.contains("creating") {
        return Some(75);
    } else if line_lower.contains("finished") || line_lower.contains("completed") || line_lower.contains("success") {
        return Some(100);
    }
    
    None
}
