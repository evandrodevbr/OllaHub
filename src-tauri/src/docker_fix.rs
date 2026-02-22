use anyhow::Result;
use std::process::Command;
use tauri::{AppHandle, Manager, Emitter};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct FixProgressEvent {
    pub event_type: FixEventType,
    pub message: String,
    pub progress: Option<u8>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum FixEventType {
    Start,
    Progress,
    Complete,
    Error,
}

/// Corrige problemas encontrados nos requisitos do sistema
pub async fn fix_system_requirements(
    app_handle: AppHandle,
    os: &str,
    issues: &[String],
) -> Result<()> {
    emit_fix_event(&app_handle, FixEventType::Start, "Iniciando correção de problemas...", None);
    
    match os {
        "windows" => fix_windows_requirements(&app_handle, issues).await,
        "linux" => fix_linux_requirements(&app_handle, issues).await,
        "mac" => fix_macos_requirements(&app_handle, issues).await,
        _ => Err(anyhow::anyhow!("Sistema operacional não suportado")),
    }
}

async fn fix_windows_requirements(
    app_handle: &AppHandle,
    issues: &[String],
) -> Result<()> {
    let mut fixed = 0;
    let total = issues.len();
    
    for issue in issues {
        if issue.contains("VirtualMachinePlatform") {
            emit_fix_event(
                app_handle,
                FixEventType::Progress,
                "Habilitando VirtualMachinePlatform...",
                Some((fixed * 100 / total) as u8),
            );
            
            let output = Command::new("powershell")
                .args(&[
                    "-Command",
                    "Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart -All"
                ])
                .output();
            
            if let Ok(o) = output {
                if o.status.success() {
                    fixed += 1;
                    emit_fix_event(
                        app_handle,
                        FixEventType::Progress,
                        "VirtualMachinePlatform habilitado",
                        Some((fixed * 100 / total) as u8),
                    );
                }
            }
        }
        
        if issue.contains("WSL") || issue.contains("Microsoft-Windows-Subsystem-Linux") {
            emit_fix_event(
                app_handle,
                FixEventType::Progress,
                "Habilitando WSL...",
                Some((fixed * 100 / total) as u8),
            );
            
            let output = Command::new("powershell")
                .args(&[
                    "-Command",
                    "Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart -All"
                ])
                .output();
            
            if let Ok(o) = output {
                if o.status.success() {
                    fixed += 1;
                    emit_fix_event(
                        app_handle,
                        FixEventType::Progress,
                        "WSL habilitado",
                        Some((fixed * 100 / total) as u8),
                    );
                }
            }
        }
        
        if issue.contains("WSL 2") {
            emit_fix_event(
                app_handle,
                FixEventType::Progress,
                "Configurando WSL 2...",
                Some((fixed * 100 / total) as u8),
            );
            
            let output = Command::new("wsl")
                .args(&["--set-default-version", "2"])
                .output();
            
            if let Ok(o) = output {
                if o.status.success() {
                    fixed += 1;
                    emit_fix_event(
                        app_handle,
                        FixEventType::Progress,
                        "WSL 2 configurado",
                        Some((fixed * 100 / total) as u8),
                    );
                }
            }
        }
    }
    
    emit_fix_event(
        app_handle,
        FixEventType::Complete,
        &format!("Correção concluída: {} de {} problemas corrigidos", fixed, total),
        Some(100),
    );
    
    Ok(())
}

async fn fix_linux_requirements(
    app_handle: &AppHandle,
    issues: &[String],
) -> Result<()> {
    let mut fixed = 0;
    let total = issues.len();
    
    for issue in issues {
        if issue.contains("Pacote") || issue.contains("não instalado") {
            // Extrair nome do pacote
            if let Some(pkg) = issue.split("Pacote").nth(1)
                .and_then(|s| s.split("não").next())
                .map(|s| s.trim())
            {
                emit_fix_event(
                    app_handle,
                    FixEventType::Progress,
                    &format!("Instalando {}...", pkg),
                    Some((fixed * 100 / total) as u8),
                );
                
                let output = Command::new("sudo")
                    .args(&["apt", "install", "-y", pkg])
                    .output();
                
                if let Ok(o) = output {
                    if o.status.success() {
                        fixed += 1;
                        emit_fix_event(
                            app_handle,
                            FixEventType::Progress,
                            &format!("{} instalado", pkg),
                            Some((fixed * 100 / total) as u8),
                        );
                    }
                }
            }
        }
        
        if issue.contains("Privilégios sudo") {
            emit_fix_event(
                app_handle,
                FixEventType::Progress,
                "Verificando privilégios sudo...",
                Some((fixed * 100 / total) as u8),
            );
            
            // Verificar se sudo está disponível
            let output = Command::new("sudo")
                .args(&["-n", "true"])
                .output();
            
            if let Ok(o) = output {
                if o.status.success() {
                    fixed += 1;
                    emit_fix_event(
                        app_handle,
                        FixEventType::Progress,
                        "Privilégios sudo disponíveis",
                        Some((fixed * 100 / total) as u8),
                    );
                } else {
                    emit_fix_event(
                        app_handle,
                        FixEventType::Error,
                        "Privilégios sudo necessários. Execute com sudo ou configure sudoers.",
                        None,
                    );
                }
            }
        }
        
        if issue.contains("grupo docker") || issue.contains("Permissões Docker") {
            emit_fix_event(
                app_handle,
                FixEventType::Progress,
                "Adicionando usuário ao grupo docker...",
                Some((fixed * 100 / total) as u8),
            );
            
            // Obter usuário atual
            if let Ok(user) = std::env::var("USER") {
                let output = Command::new("sudo")
                    .args(&["usermod", "-aG", "docker", &user])
                    .output();
                
                if let Ok(o) = output {
                    if o.status.success() {
                        fixed += 1;
                        emit_fix_event(
                            app_handle,
                            FixEventType::Progress,
                            "Usuário adicionado ao grupo docker. Faça logout e login novamente.",
                            Some((fixed * 100 / total) as u8),
                        );
                    }
                }
            }
        }
    }
    
    emit_fix_event(
        app_handle,
        FixEventType::Complete,
        &format!("Correção concluída: {} de {} problemas corrigidos", fixed, total),
        Some(100),
    );
    
    Ok(())
}

async fn fix_macos_requirements(
    app_handle: &AppHandle,
    _issues: &[String],
) -> Result<()> {
    emit_fix_event(
        app_handle,
        FixEventType::Progress,
        "No macOS, a maioria das correções requer instalação manual via Homebrew",
        None,
    );
    
    emit_fix_event(
        app_handle,
        FixEventType::Complete,
        "Verifique os avisos e instale manualmente se necessário",
        Some(100),
    );
    
    Ok(())
}

fn emit_fix_event(
    app_handle: &AppHandle,
    event_type: FixEventType,
    message: &str,
    progress: Option<u8>,
) {
    let event = FixProgressEvent {
        event_type,
        message: message.to_string(),
        progress,
    };
    
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("docker-fix-progress", event);
    }
}
