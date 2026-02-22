use serde::Serialize;
use tauri::{AppHandle, Manager, Emitter};
use std::process::Command;
use std::process::Stdio as StdProcessStdio;
use tokio::process::Command as TokioCommand;
use tokio::io::{AsyncBufReadExt, BufReader};
use anyhow::Result;
use std::time::Duration;
use tokio::time::sleep;

#[derive(Serialize, Clone, Debug)]
pub struct InstallStep {
    pub id: u8,
    pub name: String,
    pub weight: u8,
    pub command: InstallCommand,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InstallCommand {
    Shell { cmd: String, args: Vec<String> },
    PowerShell { script: String },
    WaitDockerReady,
    EnableWindowsFeature { feature: String },
}

#[derive(Serialize, Clone)]
pub struct InstallProgressEvent {
    pub event_type: ProgressEventType,
    pub step: Option<u8>,
    pub step_name: Option<String>,
    pub total_steps: Option<u8>,
    pub progress: u8,
    pub message: Option<String>,
    pub log_line: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum ProgressEventType {
    StepStart,
    Log,
    StepComplete,
    Error,
    Complete,
}

/// Instala Docker no sistema com monitoramento de progresso
pub async fn install_docker(app_handle: AppHandle, os: &str) -> Result<()> {
    let steps = get_install_steps(os);
    let total_weight: u16 = steps.iter().map(|s| s.weight as u16).sum();
    
    let mut completed_weight: u16 = 0;
    let total_steps = steps.len() as u8;
    
    emit_progress_event(
        &app_handle,
        ProgressEventType::StepStart,
        None,
        None,
        Some(total_steps),
        0,
        Some("Iniciando instalação do Docker...".to_string()),
        None,
    );
    
    for (idx, step) in steps.iter().enumerate() {
        let step_num = (idx + 1) as u8;
        
        // Emitir início da etapa
        emit_progress_event(
            &app_handle,
            ProgressEventType::StepStart,
            Some(step.id),
            Some(step.name.clone()),
            Some(total_steps),
            ((completed_weight * 100) / total_weight) as u8,
            Some(format!("Executando: {}", step.name)),
            None,
        );
        
        // Executar comando
        match execute_step(&app_handle, step, step_num).await {
            Ok(()) => {
                completed_weight += step.weight as u16;
                let progress = ((completed_weight * 100) / total_weight) as u8;
                
                emit_progress_event(
                    &app_handle,
                    ProgressEventType::StepComplete,
                    Some(step.id),
                    Some(step.name.clone()),
                    Some(total_steps),
                    progress,
                    Some(format!("✓ {} concluído", step.name)),
                    None,
                );
            }
            Err(e) => {
                emit_progress_event(
                    &app_handle,
                    ProgressEventType::Error,
                    Some(step.id),
                    Some(step.name.clone()),
                    Some(total_steps),
                    ((completed_weight * 100) / total_weight) as u8,
                    Some(format!("Erro em {}: {}", step.name, e)),
                    None,
                );
                return Err(e);
            }
        }
        
        // Pequeno delay entre etapas
        sleep(Duration::from_millis(500)).await;
    }
    
    emit_progress_event(
        &app_handle,
        ProgressEventType::Complete,
        None,
        None,
        Some(total_steps),
        100,
        Some("Docker instalado com sucesso!".to_string()),
        None,
    );
    
    Ok(())
}

/// Executa uma etapa de instalação
async fn execute_step(app_handle: &AppHandle, step: &InstallStep, step_num: u8) -> Result<()> {
    match &step.command {
        InstallCommand::Shell { cmd, args } => {
            execute_shell_command(app_handle, cmd, args, step_num).await
        }
        InstallCommand::PowerShell { script } => {
            execute_powershell_script(app_handle, script, step_num).await
        }
        InstallCommand::WaitDockerReady => {
            wait_for_docker_ready(app_handle).await
        }
        InstallCommand::EnableWindowsFeature { feature } => {
            enable_windows_feature(app_handle, feature, step_num).await
        }
    }
}

/// Executa comando shell e captura saída em tempo real
async fn execute_shell_command(
    app_handle: &AppHandle,
    cmd: &str,
    args: &[String],
    step_num: u8,
) -> Result<()> {
    
    let mut command = TokioCommand::new(cmd);
    command.args(args);
    command.stdout(StdProcessStdio::piped());
    command.stderr(StdProcessStdio::piped());
    
    let mut child = command.spawn()?;
    
    // Capturar stdout
    if let Some(stdout) = child.stdout.take() {
        let app_handle_clone = app_handle.clone();
        let step_num_clone = step_num;
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_progress_event(
                    &app_handle_clone,
                    ProgressEventType::Log,
                    Some(step_num_clone),
                    None,
                    None,
                    0,
                    None,
                    Some(line),
                );
            }
        });
    }
    
    // Capturar stderr
    if let Some(stderr) = child.stderr.take() {
        let app_handle_clone = app_handle.clone();
        let step_num_clone = step_num;
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_progress_event(
                    &app_handle_clone,
                    ProgressEventType::Log,
                    Some(step_num_clone),
                    None,
                    None,
                    0,
                    None,
                    Some(format!("[stderr] {}", line)),
                );
            }
        });
    }
    
    let status = child.wait().await?;
    
    if !status.success() {
        return Err(anyhow::anyhow!("Comando falhou com código: {:?}", status.code()));
    }
    
    Ok(())
}

/// Executa script PowerShell
async fn execute_powershell_script(
    app_handle: &AppHandle,
    script: &str,
    step_num: u8,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        
        let mut command = TokioCommand::new("powershell");
        command.args(&["-Command", script]);
        command.stdout(StdProcessStdio::piped());
        command.stderr(StdProcessStdio::piped());
        
        let mut child = command.spawn()?;
        
        // Capturar saída
        if let Some(stdout) = child.stdout.take() {
            let app_handle_clone = app_handle.clone();
            let step_num_clone = step_num;
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_progress_event(
                        &app_handle_clone,
                        ProgressEventType::Log,
                        Some(step_num_clone),
                        None,
                        None,
                        0,
                        None,
                        Some(line),
                    );
                }
            });
        }
        
        let status = child.wait().await?;
        
        if !status.success() {
            return Err(anyhow::anyhow!("PowerShell script falhou"));
        }
        
        Ok(())
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err(anyhow::anyhow!("PowerShell não disponível neste sistema"))
    }
}

/// Habilita feature do Windows
async fn enable_windows_feature(
    app_handle: &AppHandle,
    feature: &str,
    step_num: u8,
) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        let script = format!(
            "Enable-WindowsOptionalFeature -Online -FeatureName {} -NoRestart -All",
            feature
        );
        execute_powershell_script(app_handle, &script, step_num).await
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err(anyhow::anyhow!("Habilitar features do Windows não disponível neste sistema"))
    }
}

/// Aguarda Docker ficar pronto
async fn wait_for_docker_ready(app_handle: &AppHandle) -> Result<()> {
    emit_progress_event(
        app_handle,
        ProgressEventType::Log,
        None,
        None,
        None,
        0,
        Some("Aguardando Docker inicializar...".to_string()),
        None,
    );
    
    for i in 0..30 {
        // Tentar docker info
        let output = Command::new("docker")
            .arg("info")
            .output();
        
        if let Ok(o) = output {
            if o.status.success() {
                emit_progress_event(
                    app_handle,
                    ProgressEventType::Log,
                    None,
                    None,
                    None,
                    0,
                    Some("Docker está pronto!".to_string()),
                    None,
                );
                return Ok(());
            }
        }
        
        sleep(Duration::from_secs(1)).await;
        
        if i % 5 == 0 {
            emit_progress_event(
                app_handle,
                ProgressEventType::Log,
                None,
                None,
                None,
                0,
                Some(format!("Aguardando... ({}s)", i)),
                None,
            );
        }
    }
    
    Err(anyhow::anyhow!("Timeout aguardando Docker inicializar"))
}

/// Obtém etapas de instalação por plataforma
fn get_install_steps(os: &str) -> Vec<InstallStep> {
    match os {
        "linux" => get_linux_steps(),
        "windows" => get_windows_steps(),
        "mac" => get_macos_steps(),
        _ => vec![],
    }
}

fn get_linux_steps() -> Vec<InstallStep> {
    vec![
        InstallStep {
            id: 1,
            name: "Atualizar repositórios".to_string(),
            weight: 10,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec!["apt".to_string(), "update".to_string()],
            },
        },
        InstallStep {
            id: 2,
            name: "Instalar dependências".to_string(),
            weight: 15,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec![
                    "apt".to_string(),
                    "install".to_string(),
                    "-y".to_string(),
                    "ca-certificates".to_string(),
                    "curl".to_string(),
                    "gnupg".to_string(),
                ],
            },
        },
        InstallStep {
            id: 3,
            name: "Adicionar chave GPG Docker".to_string(),
            weight: 5,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec![
                    "install".to_string(),
                    "-m".to_string(),
                    "0755".to_string(),
                    "-d".to_string(),
                    "/etc/apt/keyrings".to_string(),
                ],
            },
        },
        InstallStep {
            id: 4,
            name: "Configurar repositório Docker".to_string(),
            weight: 10,
            command: InstallCommand::Shell {
                cmd: "bash".to_string(),
                args: vec![
                    "-c".to_string(),
                    r#"curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null"#.to_string(),
                ],
            },
        },
        InstallStep {
            id: 5,
            name: "Atualizar índice de pacotes".to_string(),
            weight: 10,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec!["apt".to_string(), "update".to_string()],
            },
        },
        InstallStep {
            id: 6,
            name: "Instalar Docker Engine".to_string(),
            weight: 40,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec![
                    "apt".to_string(),
                    "install".to_string(),
                    "-y".to_string(),
                    "docker-ce".to_string(),
                    "docker-ce-cli".to_string(),
                    "containerd.io".to_string(),
                    "docker-buildx-plugin".to_string(),
                    "docker-compose-plugin".to_string(),
                ],
            },
        },
        InstallStep {
            id: 7,
            name: "Verificar instalação".to_string(),
            weight: 5,
            command: InstallCommand::Shell {
                cmd: "docker".to_string(),
                args: vec!["--version".to_string()],
            },
        },
        InstallStep {
            id: 8,
            name: "Testar container".to_string(),
            weight: 5,
            command: InstallCommand::Shell {
                cmd: "sudo".to_string(),
                args: vec!["docker".to_string(), "run".to_string(), "hello-world".to_string()],
            },
        },
    ]
}

fn get_windows_steps() -> Vec<InstallStep> {
    vec![
        InstallStep {
            id: 1,
            name: "Habilitar VirtualMachinePlatform".to_string(),
            weight: 20,
            command: InstallCommand::EnableWindowsFeature {
                feature: "VirtualMachinePlatform".to_string(),
            },
        },
        InstallStep {
            id: 2,
            name: "Habilitar WSL".to_string(),
            weight: 20,
            command: InstallCommand::EnableWindowsFeature {
                feature: "Microsoft-Windows-Subsystem-Linux".to_string(),
            },
        },
        InstallStep {
            id: 3,
            name: "Verificar reinício necessário".to_string(),
            weight: 5,
            command: InstallCommand::PowerShell {
                script: r#"$restart = (Get-ComputerRestartRequired); if ($restart) { Write-Host "Reinício necessário. Por favor, reinicie o sistema e execute novamente." } else { Write-Host "Reinício não necessário." }"#.to_string(),
            },
        },
        InstallStep {
            id: 4,
            name: "Configurar WSL 2".to_string(),
            weight: 10,
            command: InstallCommand::PowerShell {
                script: "wsl --set-default-version 2".to_string(),
            },
        },
        InstallStep {
            id: 5,
            name: "Instalar distribuição Ubuntu".to_string(),
            weight: 15,
            command: InstallCommand::PowerShell {
                script: "wsl --install -d Ubuntu".to_string(),
            },
        },
        InstallStep {
            id: 6,
            name: "Instalar Docker no WSL".to_string(),
            weight: 25,
            command: InstallCommand::PowerShell {
                script: r#"wsl -d Ubuntu -e bash -c "curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh""#.to_string(),
            },
        },
        InstallStep {
            id: 7,
            name: "Verificar instalação".to_string(),
            weight: 5,
            command: InstallCommand::PowerShell {
                script: r#"wsl -d Ubuntu -e docker --version"#.to_string(),
            },
        },
    ]
}

fn get_macos_steps() -> Vec<InstallStep> {
    vec![
        InstallStep {
            id: 1,
            name: "Verificar Homebrew".to_string(),
            weight: 5,
            command: InstallCommand::Shell {
                cmd: "brew".to_string(),
                args: vec!["--version".to_string()],
            },
        },
        InstallStep {
            id: 2,
            name: "Atualizar Homebrew".to_string(),
            weight: 10,
            command: InstallCommand::Shell {
                cmd: "brew".to_string(),
                args: vec!["update".to_string()],
            },
        },
        InstallStep {
            id: 3,
            name: "Instalar Docker Desktop".to_string(),
            weight: 60,
            command: InstallCommand::Shell {
                cmd: "brew".to_string(),
                args: vec!["install".to_string(), "--cask".to_string(), "docker".to_string()],
            },
        },
        InstallStep {
            id: 4,
            name: "Iniciar Docker Desktop".to_string(),
            weight: 15,
            command: InstallCommand::Shell {
                cmd: "open".to_string(),
                args: vec!["-a".to_string(), "Docker".to_string()],
            },
        },
        InstallStep {
            id: 5,
            name: "Aguardar inicialização".to_string(),
            weight: 5,
            command: InstallCommand::WaitDockerReady,
        },
        InstallStep {
            id: 6,
            name: "Verificar instalação".to_string(),
            weight: 5,
            command: InstallCommand::Shell {
                cmd: "docker".to_string(),
                args: vec!["--version".to_string()],
            },
        },
    ]
}

/// Emite evento de progresso via Tauri
fn emit_progress_event(
    app_handle: &AppHandle,
    event_type: ProgressEventType,
    step: Option<u8>,
    step_name: Option<String>,
    total_steps: Option<u8>,
    progress: u8,
    message: Option<String>,
    log_line: Option<String>,
) {
    let event = InstallProgressEvent {
        event_type,
        step,
        step_name,
        total_steps,
        progress,
        message,
        log_line,
    };
    
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("docker-install-progress", event);
    }
}
