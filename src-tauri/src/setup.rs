use std::process::Command;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Emitter};
use tokio::time::sleep;
use futures_util::StreamExt;

// Importar funções do módulo principal
use crate::{check_ollama_installed, check_ollama_running, poll_ollama_ready, check_ollama_installed_async, check_if_model_installed};

#[derive(serde::Serialize, Clone)]
pub struct SetupState {
    pub ollama_installed: bool,
    pub ollama_running: bool,
    pub default_model_downloaded: bool,
    pub default_model_name: Option<String>,
}

/// Verifica o estado atual do setup
pub async fn get_setup_state(_app_handle: &AppHandle) -> Result<SetupState, String> {
    let ollama_installed = check_ollama_installed();
    let ollama_running = if ollama_installed {
        check_ollama_running().await
    } else {
        false
    };

    // Verificar se modelo padrão está instalado
    let default_model_name = Some("llama3.2:1b".to_string());
    let default_model_downloaded = if ollama_running {
        check_if_model_installed(default_model_name.as_ref().unwrap().clone())
    } else {
        false
    };

    Ok(SetupState {
        ollama_installed,
        ollama_running,
        default_model_downloaded,
        default_model_name: if default_model_downloaded {
            default_model_name
        } else {
            None
        },
    })
}

/// Instala o Ollama silenciosamente
/// No Windows, tenta usar Chocolatey primeiro, depois fallback para instalação direta
pub async fn install_ollama_silently(
    app_handle: AppHandle,
    installer_path: Option<String>,
) -> Result<(), String> {
    let window = app_handle.get_webview_window("main");

    // Se já está instalado, apenas verificar se está rodando
    if check_ollama_installed() {
        if let Some(ref w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "ollama_check",
                "message": "Ollama já está instalado. Verificando se está rodando..."
            }));
        }

        // Tentar iniciar se não estiver rodando
        if !check_ollama_running().await {
            if let Some(ref w) = window {
                let _ = w.emit("setup-progress", serde_json::json!({
                    "status": "ollama_starting",
                    "message": "Iniciando Ollama..."
                }));
            }

            // Aguardar até 30 segundos para o Ollama iniciar
            let max_attempts = 30;
            for attempt in 1..=max_attempts {
                if check_ollama_running().await {
                    if let Some(ref w) = window {
                        let _ = w.emit("setup-progress", serde_json::json!({
                            "status": "ollama_ready",
                            "message": "Ollama está rodando!"
                        }));
                    }
                    return Ok(());
                }
                sleep(Duration::from_secs(1)).await;
                
                if attempt % 5 == 0 {
                    if let Some(ref w) = window {
                        let _ = w.emit("setup-progress", serde_json::json!({
                            "status": "ollama_starting",
                            "message": format!("Aguardando Ollama iniciar... ({}s)", attempt)
                        }));
                    }
                }
            }

            return Err("Ollama instalado mas não conseguiu iniciar automaticamente".to_string());
        }

        if let Some(ref w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "ollama_ready",
                "message": "Ollama está rodando!"
            }));
        }
        return Ok(());
    }

    // No Windows, tentar usar Chocolatey primeiro
    #[cfg(target_os = "windows")]
    {
        use crate::setup_manager;
        
        // Verificar se Chocolatey está instalado
        if !setup_manager::check_chocolatey_installed() {
            if let Some(ref w) = window {
                let _ = w.emit("setup-progress", serde_json::json!({
                    "status": "installing_chocolatey",
                    "message": "Chocolatey não encontrado. Instalando Chocolatey..."
                }));
            }
            
            // Tentar instalar Chocolatey
            if let Some(ref w) = window {
                if let Err(e) = setup_manager::install_chocolatey(w.clone()).await {
                    log::warn!("Falha ao instalar Chocolatey: {}. Tentando instalação direta...", e);
                    // Continuar para fallback de instalação direta
                } else {
                    log::info!("Chocolatey instalado com sucesso");
                }
            } else {
                return Err("Window não disponível para instalação do Chocolatey".to_string());
            }
        }
        
        // Se Chocolatey está disponível, usar para instalar Ollama
        if setup_manager::check_chocolatey_installed() {
            if let Some(ref w) = window {
                let _ = w.emit("setup-progress", serde_json::json!({
                    "status": "installing_ollama",
                    "message": "Instalando Ollama via Chocolatey..."
                }));
            }
            
            if let Some(ref w) = window {
                match setup_manager::install_ollama_choco(w.clone()).await {
                    Ok(_) => {
                        log::info!("Ollama instalado via Chocolatey com sucesso");
                        // Aguardar um pouco e verificar se está rodando
                        sleep(Duration::from_secs(3)).await;
                        
                        if check_ollama_running().await {
                            if let Some(ref w) = window {
                                let _ = w.emit("setup-progress", serde_json::json!({
                                    "status": "ollama_ready",
                                    "message": "Ollama instalado e rodando!"
                                }));
                            }
                            return Ok(());
                        }
                        
                        // Se não está rodando, tentar iniciar
                        if let Some(ref w) = window {
                            let _ = w.emit("setup-progress", serde_json::json!({
                                "status": "ollama_starting",
                                "message": "Iniciando Ollama..."
                            }));
                        }
                        
                        // Aguardar até 30 segundos para o Ollama iniciar
                        let max_attempts = 30;
                        for attempt in 1..=max_attempts {
                            if check_ollama_running().await {
                                if let Some(ref w) = window {
                                    let _ = w.emit("setup-progress", serde_json::json!({
                                        "status": "ollama_ready",
                                        "message": "Ollama está rodando!"
                                    }));
                                }
                                return Ok(());
                            }
                            sleep(Duration::from_secs(1)).await;
                            
                            if attempt % 5 == 0 {
                                if let Some(ref w) = window {
                                    let _ = w.emit("setup-progress", serde_json::json!({
                                        "status": "ollama_starting",
                                        "message": format!("Aguardando Ollama iniciar... ({}s)", attempt)
                                    }));
                                }
                            }
                        }
                        
                        return Err("Ollama instalado mas não conseguiu iniciar automaticamente".to_string());
                    }
                    Err(e) => {
                        log::warn!("Falha ao instalar Ollama via Chocolatey: {}. Tentando instalação direta...", e);
                        // Continuar para fallback de instalação direta
                    }
                }
            }
        }
        
        // Fallback: instalação direta via .exe
        let installer = if let Some(path) = installer_path {
            PathBuf::from(path)
        } else {
            return Err("Caminho do instalador não fornecido e Chocolatey não disponível".to_string());
        };

        if !installer.exists() {
            return Err(format!("Instalador não encontrado: {:?}", installer));
        }

        if let Some(ref w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "installing_ollama",
                "message": "Iniciando instalação silenciosa do Ollama..."
            }));
        }
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut cmd = Command::new(&installer);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.arg("/VERYSILENT")
           .arg("/NORESTART")
           .arg("/SUPPRESSMSGBOXES");

        log::info!("Executando instalador silencioso: {:?}", installer);

        let output = cmd.output()
            .map_err(|e| format!("Erro ao executar instalador: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("Instalador retornou código de erro: {}", stderr);
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        use std::process::Stdio;
        
        let mut perms = std::fs::metadata(&installer)
            .map_err(|e| format!("Erro ao obter metadados do arquivo: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&installer, perms)
            .map_err(|e| format!("Erro ao definir permissões: {}", e))?;

        let path_str = installer.to_string_lossy();
        let mut cmd = if path_str.ends_with(".sh") {
            let mut c = Command::new("sh");
            c.arg(&installer).arg("--quiet");
            c
        } else {
            Command::new(&installer)
        };
        
        // Capturar stderr para detectar falhas de permissão
        cmd.stderr(Stdio::piped());
        cmd.stdout(Stdio::piped());
        
        let output = cmd.output()
            .map_err(|e| format!("Erro ao executar instalador: {}", e))?;
        
        // Verificar stderr por mensagens de erro de permissão
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stderr_lower = stderr.to_lowercase();
        
        if stderr_lower.contains("permission denied") 
            || stderr_lower.contains("sudo required")
            || stderr_lower.contains("cannot open")
            || stderr_lower.contains("access denied") {
            return Err("Instalação requer privilégios de administrador. Execute manualmente: curl https://ollama.com/install.sh | sh".to_string());
        }
        
        // Verificar se o comando falhou
        if !output.status.success() {
            let error_msg = if !stderr.is_empty() {
                format!("Instalação falhou: {}", stderr.trim())
            } else {
                format!("Instalação falhou com código de saída: {:?}", output.status.code())
            };
            return Err(error_msg);
        }
    }

    #[cfg(target_os = "macos")]
    {
        let path_str = installer.to_string_lossy();
        if path_str.ends_with(".pkg") {
            Command::new("installer")
                .arg("-pkg")
                .arg(&installer)
                .arg("-target")
                .arg("/")
                .arg("-verboseR")
                .spawn()
                .map_err(|e| format!("Erro ao executar instalador: {}", e))?;
        } else {
            Command::new("open")
                .arg(&installer)
                .spawn()
                .map_err(|e| format!("Erro ao abrir instalador: {}", e))?;
        }
    }

    // Aguardar instalação e verificar
    if let Some(ref w) = window {
        let _ = w.emit("setup-progress", serde_json::json!({
            "status": "installing_ollama",
            "message": "Aguardando instalação concluir..."
        }));
    }

    // Fazer polling para verificar quando Ollama estiver instalado e rodando
    let window_clone = window.clone();
    let max_attempts = 90;
    let mut attempts = 0;

    while attempts < max_attempts {
        if check_ollama_installed_async().await {
            // Aguardar um pouco para o serviço iniciar
            sleep(Duration::from_secs(2)).await;

            if let Ok(_) = poll_ollama_ready(5).await {
                log::info!("Ollama instalado e rodando com sucesso");
                if let Some(ref w) = window_clone {
                    let _ = w.emit("setup-progress", serde_json::json!({
                        "status": "ollama_ready",
                        "message": "Ollama instalado e rodando!"
                    }));
                }
                return Ok(());
            }
        }

        attempts += 1;
        sleep(Duration::from_secs(1)).await;

        if attempts % 5 == 0 {
            if let Some(ref w) = window_clone {
                let _ = w.emit("setup-progress", serde_json::json!({
                    "status": "installing_ollama",
                    "message": format!("Aguardando instalação... ({}s)", attempts)
                }));
            }
        }
    }

    // Verificar se pelo menos foi instalado
    if check_ollama_installed_async().await {
        if let Some(ref w) = window_clone {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "ollama_partial",
                "message": "Ollama instalado, mas não iniciou automaticamente"
            }));
        }
        return Err("Ollama instalado mas não iniciou automaticamente".to_string());
    }

    Err("Timeout: Ollama não foi instalado após 90 segundos".to_string())
}

// Estruturas para processar progresso do download
#[derive(serde::Deserialize)]
struct PullProgress {
    status: String,
    #[serde(default)]
    digest: String,
    #[serde(default)]
    total: u64,
    #[serde(default)]
    completed: u64,
}

#[derive(serde::Serialize)]
struct DownloadProgress {
    status: String,
    percent: Option<u8>,
    downloaded: Option<String>,
    total: Option<String>,
    speed: Option<String>,
    raw: String,
}

// Funções auxiliares para formatação
fn format_bytes(bytes: u64) -> Option<String> {
    if bytes == 0 {
        return None;
    }
    
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    
    Some(if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    })
}

fn format_speed(bytes_per_sec: f64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    
    if bytes_per_sec >= GB {
        format!("{:.1} GB/s", bytes_per_sec / GB)
    } else if bytes_per_sec >= MB {
        format!("{:.1} MB/s", bytes_per_sec / MB)
    } else if bytes_per_sec >= KB {
        format!("{:.1} KB/s", bytes_per_sec / KB)
    } else {
        format!("{:.0} B/s", bytes_per_sec)
    }
}

/// Baixa o modelo padrão durante o setup
pub async fn download_default_model(
    app_handle: AppHandle,
    model_name: String,
) -> Result<(), String> {
    let window = app_handle.get_webview_window("main");

    // Verificar se já está instalado
    if check_if_model_installed(model_name.clone()) {
        if let Some(ref w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "model_ready",
                "message": format!("Modelo {} já está instalado!", model_name)
            }));
        }
        return Ok(());
    }

    if let Some(ref w) = window {
        let _ = w.emit("setup-progress", serde_json::json!({
            "status": "downloading_model",
            "message": format!("Baixando modelo {}...", model_name)
        }));
    }

    // Usar API HTTP do Ollama (mais confiável que CLI)
    let client = reqwest::Client::new();
    
    let response = client
        .post("http://localhost:11434/api/pull")
        .json(&serde_json::json!({ "name": model_name.clone(), "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Erro ao conectar à API do Ollama: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("API do Ollama retornou erro: {}", response.status()));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let window_clone = window.clone();
    let model_name_clone = model_name.clone();
    let mut last_completed: u64 = 0;
    let mut last_time = Instant::now();

    // Processar stream NDJSON (mesmo formato que pull_model_impl_webview)
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Erro no stream: {}", e))?;
        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);
        
        // Processar linhas completas (separadas por \n)
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();
            
            if line.is_empty() {
                continue;
            }
            
            // Tentar deserializar como PullProgress
            match serde_json::from_str::<PullProgress>(&line) {
                Ok(json_progress) => {
                    // Calcular porcentagem se tiver total/completed
                    let percent = if json_progress.total > 0 {
                        Some(((json_progress.completed as f64 / json_progress.total as f64) * 100.0) as u8)
                    } else {
                        None
                    };
                    
                    // Calcular velocidade
                    let now = Instant::now();
                    let delta_time = now.duration_since(last_time).as_secs_f64();
                    let speed = if delta_time > 0.0 && json_progress.completed > last_completed {
                        let delta_bytes = json_progress.completed - last_completed;
                        let bytes_per_sec = delta_bytes as f64 / delta_time;
                        Some(format_speed(bytes_per_sec))
                    } else {
                        None
                    };
                    
                    last_completed = json_progress.completed;
                    last_time = now;
                    
                    // Criar DownloadProgress estruturado
                    let progress = DownloadProgress {
                        status: json_progress.status.clone(),
                        percent,
                        downloaded: format_bytes(json_progress.completed),
                        total: format_bytes(json_progress.total),
                        speed,
                        raw: line.clone(),
                    };
                    
                    // Emitir evento download-progress para o DownloadContext
                    if let Ok(json) = serde_json::to_string(&progress) {
                        if let Some(ref w) = window_clone {
                            let _ = w.emit("download-progress", json);
                        }
                    }
                    
                    // Manter compatibilidade: também emitir setup-progress
                    if let Some(ref w) = window_clone {
                        let _ = w.emit("setup-progress", serde_json::json!({
                            "status": "downloading_model",
                            "message": format!("{}: {}", model_name_clone, json_progress.status)
                        }));
                    }
                    
                    // Se status for "success", finalizar
                    if json_progress.status == "success" {
                        let success_progress = DownloadProgress {
                            status: "success".to_string(),
                            percent: Some(100),
                            downloaded: format_bytes(json_progress.completed),
                            total: format_bytes(json_progress.total),
                            speed: None,
                            raw: "success".to_string(),
                        };
                        if let Ok(json) = serde_json::to_string(&success_progress) {
                            if let Some(ref w) = window_clone {
                                let _ = w.emit("download-progress", json);
                            }
                        }
                        break;
                    }
                }
                Err(_) => {
                    // Se não conseguir parsear como JSON, tratar como linha raw (fallback)
                    let progress = DownloadProgress {
                        status: "downloading".to_string(),
                        percent: None,
                        downloaded: None,
                        total: None,
                        speed: None,
                        raw: line.clone(),
                    };
                    if let Ok(json) = serde_json::to_string(&progress) {
                        if let Some(ref w) = window_clone {
                            let _ = w.emit("download-progress", json);
                        }
                    }
                }
            }
        }
    }
    
    // Se chegou aqui, o stream terminou - emitir sucesso final
    let success_progress = DownloadProgress {
        status: "success".to_string(),
        percent: Some(100),
        downloaded: format_bytes(last_completed),
        total: None,
        speed: None,
        raw: "success".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&success_progress) {
        if let Some(ref w) = window {
            let _ = w.emit("download-progress", json);
        }
    }

    // Verificar se o modelo foi instalado
    if check_if_model_installed(model_name.clone()) {
        if let Some(ref w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "model_ready",
                "message": format!("Modelo {} baixado com sucesso!", model_name)
            }));
        }
        Ok(())
    } else {
        Err(format!("Download do modelo {} pode ter falhado", model_name))
    }
}
