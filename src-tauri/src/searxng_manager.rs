use anyhow::Result;
use std::process::Command;
use std::time::Duration;
use tokio::time::timeout;
use reqwest::Client;
use tauri::{AppHandle, Manager, Emitter};

/// Verifica se Docker está instalado no sistema
pub fn check_docker_available() -> Result<bool> {
    let output = Command::new("docker")
        .arg("--version")
        .output();
    
    match output {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

/// Verifica se Docker está rodando
pub fn check_docker_running() -> Result<bool> {
    let output = Command::new("docker")
        .arg("info")
        .output();
    
    match output {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

/// Instala SearXNG via Docker Compose com progresso
pub async fn install_searxng_with_progress(
    app_handle: Option<&AppHandle>,
    url: &str,
    port: u16,
) -> Result<()> {
    log::info!("Installing SearXNG at {}:{}", url, port);
    
    // Verificar requisitos antes de instalar
    if let Some(handle) = app_handle {
        emit_searxng_progress(handle, "Verificando requisitos...", None);
    }
    
    // Verificar se Docker está disponível
    match check_docker_available() {
        Ok(true) => {
            if let Some(handle) = app_handle {
                emit_searxng_progress(handle, "Docker encontrado", None);
            }
        }
        Ok(false) => {
            return Err(anyhow::anyhow!("Docker não está instalado. Por favor, instale o Docker primeiro."));
        }
        Err(e) => {
            return Err(anyhow::anyhow!("Erro ao verificar Docker: {}", e));
        }
    }
    
    // Verificar se Docker está rodando
    match check_docker_running() {
        Ok(true) => {
            if let Some(handle) = app_handle {
                emit_searxng_progress(handle, "Docker está rodando", None);
            }
        }
        Ok(false) => {
            return Err(anyhow::anyhow!("Docker não está rodando. Por favor, inicie o Docker primeiro."));
        }
        Err(e) => {
            return Err(anyhow::anyhow!("Erro ao verificar se Docker está rodando: {}", e));
        }
    }
    
    // Tentar usar docker-compose.yml do projeto se existir
    let project_compose = std::env::current_dir()
        .ok()
        .and_then(|cwd| {
            let path = cwd.join("docker-compose.searxng.yml");
            if path.exists() {
                Some(path)
            } else {
                None
            }
        });
    
    let compose_path = if let Some(path) = project_compose {
        if let Some(handle) = app_handle {
            emit_searxng_progress(handle, "Usando docker-compose do projeto", None);
        }
        path
    } else {
        // Criar docker-compose.yml temporário
        if let Some(handle) = app_handle {
            emit_searxng_progress(handle, "Criando configuração docker-compose...", None);
        }
        
        let compose_content = format!(
            r#"version: "3.7"

services:
  searxng:
    image: searxng/searxng:latest
    container_name: ollaHub_searxng
    ports:
      - "{}:8080"
    volumes:
      - searxng_data:/etc/searxng:rw
    environment:
      - SEARXNG_BASE_URL={}/
    restart: unless-stopped
    networks:
      - searxng_network

  redis:
    image: redis:alpine
    container_name: ollaHub_searxng_redis
    command: redis-server --save "" --appendonly "no"
    networks:
      - searxng_network
    tmpfs:
      - /var/lib/redis

volumes:
  searxng_data:

networks:
  searxng_network:
    driver: bridge
"#,
            port, url
        );
        
        // Salvar docker-compose.yml temporário
        let temp_path = std::env::temp_dir().join("ollahub_searxng_docker-compose.yml");
        std::fs::write(&temp_path, compose_content)?;
        temp_path
    };
    
    // Executar docker-compose up -d com captura de saída
    if let Some(handle) = app_handle {
        emit_searxng_progress(handle, "Baixando imagens Docker...", None);
    }
    
    let output = Command::new("docker")
        .arg("compose")
        .arg("-f")
        .arg(compose_path.to_str().unwrap())
        .arg("pull")
        .output();
    
    if let Ok(o) = output {
        if !o.status.success() {
            let error = String::from_utf8_lossy(&o.stderr);
            if let Some(handle) = app_handle {
                emit_searxng_progress(handle, &format!("Aviso ao baixar imagens: {}", error), None);
            }
        } else if let Some(handle) = app_handle {
            emit_searxng_progress(handle, "Imagens baixadas com sucesso", None);
        }
    }
    
    if let Some(handle) = app_handle {
        emit_searxng_progress(handle, "Criando containers...", None);
    }
    
    let output = Command::new("docker")
        .arg("compose")
        .arg("-f")
        .arg(compose_path.to_str().unwrap())
        .arg("up")
        .arg("-d")
        .output()?;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        if let Some(handle) = app_handle {
            emit_searxng_progress(handle, &format!("Erro: {}", error), Some("error"));
        }
        return Err(anyhow::anyhow!("Docker compose failed: {}", error));
    }
    
    if let Some(handle) = app_handle {
        emit_searxng_progress(handle, "SearXNG instalado com sucesso!", Some("complete"));
    }
    
    log::info!("SearXNG installation completed");
    Ok(())
}

/// Instala SearXNG via Docker Compose (versão sem progresso para compatibilidade)
pub async fn install_searxng(url: &str, port: u16) -> Result<()> {
    install_searxng_with_progress(None, url, port).await
}

/// Emite evento de progresso da instalação SearXNG
fn emit_searxng_progress(app_handle: &AppHandle, message: &str, status: Option<&str>) {
    #[derive(serde::Serialize, Clone)]
    struct SearxngProgressEvent {
        message: String,
        status: Option<String>,
    }
    
    let event = SearxngProgressEvent {
        message: message.to_string(),
        status: status.map(|s| s.to_string()),
    };
    
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("searxng-install-progress", event);
    }
}

/// Inicia o container SearXNG
pub async fn start_searxng() -> Result<()> {
    log::info!("Starting SearXNG container");
    
    let output = Command::new("docker")
        .arg("start")
        .arg("ollaHub_searxng")
        .output()?;
    
    if !output.status.success() {
        // Se não existe, tentar criar novamente
        let error = String::from_utf8_lossy(&output.stderr);
        if error.contains("No such container") {
            return Err(anyhow::anyhow!("Container não encontrado. Execute a instalação primeiro."));
        }
        return Err(anyhow::anyhow!("Failed to start container: {}", error));
    }
    
    log::info!("SearXNG container started");
    Ok(())
}

/// Para o container SearXNG
pub async fn stop_searxng() -> Result<()> {
    log::info!("Stopping SearXNG container");
    
    let output = Command::new("docker")
        .arg("stop")
        .arg("ollaHub_searxng")
        .output()?;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("Failed to stop container: {}", error));
    }
    
    log::info!("SearXNG container stopped");
    Ok(())
}

/// Verifica se SearXNG está respondendo
pub async fn check_searxng_status(url: &str) -> Result<bool> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()?;
    
    let test_url = format!("{}/search?q=test&format=json", url.trim_end_matches('/'));
    
    match timeout(Duration::from_secs(5), client.get(&test_url).send()).await {
        Ok(Ok(response)) => Ok(response.status().is_success()),
        Ok(Err(_)) => Ok(false),
        Err(_) => Ok(false),
    }
}

/// Obtém logs do container SearXNG
pub fn get_searxng_logs(lines: usize) -> Result<Vec<String>> {
    let output = Command::new("docker")
        .arg("logs")
        .arg("--tail")
        .arg(lines.to_string())
        .arg("ollaHub_searxng")
        .output()?;
    
    if !output.status.success() {
        return Ok(Vec::new());
    }
    
    let logs = String::from_utf8_lossy(&output.stdout);
    Ok(logs.lines().map(|s| s.to_string()).collect())
}
