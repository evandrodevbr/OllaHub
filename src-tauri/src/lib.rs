use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write, Read};
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{command, Window, Emitter, Manager, AppHandle, State};
use sysinfo::System;
use chrono::{DateTime, Utc};
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

mod web_scraper;
mod scheduler;
mod ollama_client;
mod task_executor;
mod scheduler_loop;
mod sources_config;
mod system_monitor;
mod intent_classifier;
mod db;

use web_scraper::{
    ScrapedContent,
    SearchResultMetadata,
    create_browser,
    search_and_scrape,
    search_and_scrape_with_config,
    scrape_url,
    SearchConfig,
    search_duckduckgo_metadata,
    search_multi_engine_metadata,
    SearchEngine,
    smart_search,
    scrape_urls_bulk,
};
use headless_chrome::Browser;
use scheduler::{SentinelTask, SchedulerService, SchedulerState, TaskAction};
use sources_config::{SourcesConfig, load_sources_config, save_sources_config};
use system_monitor::{SystemStats, SystemMonitorState, GpuInfo, GpuStats};

// CommandExt é importado localmente onde necessário

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Message {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Eventos para comunicação Frontend <-> Rust
#[derive(serde::Serialize, Clone)]
struct ChatCreatedEvent {
    session_id: String,
    title: String,
    emoji: String,
}

#[derive(serde::Serialize, Clone)]
struct ChatTokenEvent {
    session_id: String,
    content: String,
    done: bool,
}

#[derive(serde::Serialize, Clone)]
struct ChatErrorEvent {
    session_id: String,
    error: String,
}

#[derive(serde::Serialize)]
struct DownloadProgress {
    status: String,          // "pulling", "verifying", "success"
    percent: Option<u8>,     // 0-100
    downloaded: Option<String>, // "552 MB"
    total: Option<String>,      // "1.2 GB"
    speed: Option<String>,      // "25 MB/s"
    raw: String,             // linha original para fallback
}

#[derive(serde::Deserialize)]
struct PullProgress {
    status: String,
    #[serde(default)]
    digest: String, // Mantido para compatibilidade com API, mas não usado atualmente
    #[serde(default)]
    total: u64,
    #[serde(default)]
    completed: u64,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ChatSession {
    id: String,
    title: String,
    messages: Vec<Message>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    #[serde(default)]
    platform: String,
    #[serde(default)]
    memory_context: Vec<String>,
}

#[derive(serde::Serialize, Clone)]
struct SessionSummary {
    id: String,
    title: String,
    emoji: String,
    updated_at: DateTime<Utc>,
    preview: String,
    platform: String,
}

#[derive(serde::Serialize)]
struct SystemSpecs {
    total_memory: u64,
    cpu_count: usize,
    os_name: String,
    gpus: Vec<GpuInfo>,
}

// SystemStats movido para system_monitor.rs
// Mantendo apenas para compatibilidade com start_system_monitor
#[derive(serde::Serialize, Clone)]
struct LegacySystemStats {
    cpu_usage: f32,
    memory_used: u64,
    memory_total: u64,
}

#[derive(serde::Serialize)]
struct LocalModel {
    name: String,
    size: String,
    id: String,
    modified_at: String,
}

// MCP Configuration Structures
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct McpServerConfig {
    command: String,
    args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    env: Option<HashMap<String, String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct McpConfig {
    #[serde(rename = "mcpServers")]
    mcp_servers: HashMap<String, McpServerConfig>,
}

#[derive(serde::Serialize, Clone)]
struct McpServerStatus {
    name: String,
    status: String, // "running" | "stopped" | "error"
    pid: Option<u32>,
}

// MCP Process Manager - wraps Child with request ID counter
struct McpProcessHandle {
    child: Child,
    request_id: Arc<Mutex<u64>>,
}

// MCP Process Manager State
type McpProcessMap = Arc<Mutex<HashMap<String, McpProcessHandle>>>;

// Web Scraper Browser State (singleton para reutilização)
type BrowserState = Arc<Mutex<Option<Arc<Browser>>>>;

// File Lock Manager - previne corrupção de dados em escritas concorrentes
type FileLockMap = Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>;

// Helper to send JSON-RPC request to MCP server
fn send_jsonrpc_request(
    child: &mut Child,
    method: &str,
    params: Option<serde_json::Value>,
    request_id: u64,
) -> Result<(), String> {
    let request = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: request_id,
        method: method.to_string(),
        params,
    };

    let request_json = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize JSON-RPC request: {}", e))?;
    
    let stdin = child.stdin.as_mut()
        .ok_or_else(|| "Failed to get stdin handle".to_string())?;
    
    writeln!(stdin, "{}", request_json)
        .map_err(|e| format!("Failed to write to stdin: {}", e))?;
    
    stdin.flush()
        .map_err(|e| format!("Failed to flush stdin: {}", e))?;
    
    Ok(())
}

// Helper to read JSON-RPC response from MCP server
// Reads from stdout line by line until we get a matching response
fn read_jsonrpc_response(
    child: &mut Child,
    expected_id: u64,
    timeout_secs: u64,
) -> Result<JsonRpcResponse, String> {
    let stdout = child.stdout.as_mut()
        .ok_or_else(|| "Failed to get stdout handle".to_string())?;
    
    let mut reader = BufReader::new(stdout);
    let start = std::time::Instant::now();
    
    // Read line by line until we get a valid JSON-RPC response
    loop {
        if start.elapsed().as_secs() > timeout_secs {
            return Err("Timeout waiting for MCP server response".to_string());
        }
        
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => {
                // EOF, wait a bit and try again
                std::thread::sleep(Duration::from_millis(100));
                continue;
            }
            Ok(_) => {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                
                match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                    Ok(response) => {
                        if response.id == expected_id {
                            return Ok(response);
                        }
                        // Continue reading if ID doesn't match (might be previous response)
                    }
                    Err(_) => {
                        // Not a valid JSON-RPC response, continue
                        continue;
                    }
                }
            }
            Err(e) => {
                return Err(format!("Failed to read line: {}", e));
            }
        }
    }
}

// MCP Tool structures
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct McpTool {
    name: String,
    description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    input_schema: Option<serde_json::Value>,
}

#[derive(serde::Serialize, Clone, Debug)]
struct McpToolInfo {
    server_name: String,
    tool: McpTool,
}

// JSON-RPC structures
#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

// Helper to get chats directory
pub fn get_chats_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let chats_dir = app_data_dir.join("chats");
    
    if !chats_dir.exists() {
        fs::create_dir_all(&chats_dir)
            .map_err(|e| format!("Failed to create chats dir: {}", e))?;
    }
    
    Ok(chats_dir)
}

// Helper to get MCP config file path
fn get_mcp_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    Ok(app_data_dir.join("mcp_config.json"))
}

#[command]
fn save_chat_session(
    app_handle: AppHandle,
    file_locks: State<'_, FileLockMap>,
    id: String, 
    title: String, 
    messages: Vec<Message>,
    platform: Option<String>,
    memory_context: Option<Vec<String>>
) -> Result<(), String> {
    // Obter ou criar lock para este arquivo específico
    let lock = {
        let mut locks_map = file_locks.lock()
            .map_err(|e| format!("Failed to lock file locks map: {}", e))?;
        
        // Usar o ID da sessão como chave única para o lock
        locks_map.entry(id.clone())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    
    // Adquirir o lock antes de qualquer operação de I/O
    let _guard = lock.lock()
        .map_err(|e| format!("Failed to acquire file lock for session {}: {}", id, e))?;
    
    let chats_dir = get_chats_dir(&app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", id));
    
    let now = Utc::now();
    
    // Try to load existing to keep created_at, or use now
    let created_at = if file_path.exists() {
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                session.created_at
            } else {
                now
            }
        } else {
            now
        }
    } else {
        now
    };

    let platform = platform.unwrap_or_else(|| System::name().unwrap_or("Unknown".to_string()));
    let memory_context = memory_context.unwrap_or_default();

    let session = ChatSession {
        id: id.clone(),
        title,
        messages,
        created_at,
        updated_at: now,
        platform,
        memory_context,
    };

    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    // Escrever em arquivo temporário primeiro, depois renomear (atomic write)
    let temp_path = file_path.with_extension("json.tmp");
    fs::write(&temp_path, json)
        .map_err(|e| format!("Failed to write temp session file: {}", e))?;
    
    // Renomear atomicamente (operação atômica na maioria dos sistemas)
    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename temp file to session file: {}", e))?;
    
    // Lock é liberado automaticamente quando _guard sai de escopo
    Ok(())
}

#[command]
fn search_chat_sessions(app_handle: AppHandle, query: String, limit: Option<usize>) -> Result<Vec<SessionSummary>, String> {
    use db::Database;
    
    let db = Database::new(&app_handle)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    let search_limit = limit.unwrap_or(50);
    let sessions = db.search_sessions(&query, search_limit)
        .map_err(|e| format!("Search failed: {}", e))?;
    
    // Validar existência de cada sessão antes de retornar
    let chats_dir = get_chats_dir(&app_handle)?;
    let mut summaries = Vec::new();
    let mut orphan_count = 0;
    
    for session in sessions {
        // Verificar se sessão existe no SQLite (já temos)
        let exists_in_sqlite = db.get_session(&session.id)
            .ok()
            .flatten()
            .is_some();
        
        // Verificar se existe no JSON (sistema legado) para compatibilidade
        let json_path = chats_dir.join(format!("{}.json", session.id));
        let exists_in_json = json_path.exists();
        
        // Sessão deve existir em pelo menos um sistema
        if !exists_in_sqlite && !exists_in_json {
            orphan_count += 1;
            log::warn!("Found orphan session in search results: {} (title: {})", session.id, session.title);
            continue; // Pular sessões órfãs
        }
        
        // Buscar primeira mensagem para preview
        let preview = db.get_messages(&session.id)
            .ok()
            .and_then(|msgs| {
                msgs.iter()
                    .find(|m| m.role == "user" || m.role == "assistant")
                    .map(|m| {
                        m.content.chars().take(50).collect::<String>()
                    })
            })
            .or_else(|| {
                // Fallback: tentar ler do JSON se não encontrou no SQLite
                if exists_in_json {
                    if let Ok(content) = fs::read_to_string(&json_path) {
                        if let Ok(session_data) = serde_json::from_str::<ChatSession>(&content) {
                            return session_data.messages.iter()
                                .find(|m| m.role == "user" || m.role == "assistant")
                                .map(|m| m.content.chars().take(50).collect::<String>());
                        }
                    }
                }
                None
            })
            .unwrap_or_default();
        
        summaries.push(SessionSummary {
            id: session.id,
            title: session.title,
            emoji: session.emoji,
            updated_at: session.updated_at, // Já é DateTime<Utc>
            preview,
            platform: String::new(), // Platform não está no SQLite ainda
        });
    }
    
    if orphan_count > 0 {
        log::info!("Filtered out {} orphan sessions from search results", orphan_count);
    }
    
    Ok(summaries)
}

#[command]
fn load_chat_sessions(app_handle: AppHandle) -> Result<Vec<SessionSummary>, String> {
    let chats_dir = get_chats_dir(&app_handle)?;
    let mut summaries = Vec::new();
    
    let entries = fs::read_dir(chats_dir)
        .map_err(|e| format!("Failed to read chats dir: {}", e))?;
        
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                        let last_msg = session.messages.last()
                            .map(|m| m.content.chars().take(50).collect::<String>())
                            .unwrap_or_default();
                        
                        // Extract emoji from metadata (first assistant message with emoji)
                        let emoji = session.messages.iter()
                            .find_map(|m| {
                                if let Some(meta) = &m.metadata {
                                    if let Some(emoji_val) = meta.get("emoji") {
                                        if let Some(emoji_str) = emoji_val.as_str() {
                                            return Some(emoji_str.to_string());
                                        }
                                    }
                                }
                                None
                            })
                            .unwrap_or_else(|| "💬".to_string());
                            
                        summaries.push(SessionSummary {
                            id: session.id,
                            title: session.title,
                            emoji,
                            updated_at: session.updated_at,
                            preview: last_msg,
                            platform: session.platform,
                        });
                    }
                }
            }
        }
    }
    
    // Sort by updated_at desc
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    
    Ok(summaries)
}

#[command]
fn load_chat_history(app_handle: AppHandle, id: String) -> Result<Vec<Message>, String> {
    use db::Database;
    
    // 1. Tentar carregar do SQLite primeiro (sistema novo)
    match Database::new(&app_handle) {
        Ok(db) => {
            match db.get_messages(&id) {
                Ok(messages) if !messages.is_empty() => {
                    // Converter ChatMessage para Message
                    let result: Vec<Message> = messages.into_iter().map(|msg| {
                        let role = if msg.role == "user" {
                            "user"
                        } else if msg.role == "assistant" {
                            "assistant"
                        } else {
                            "system"
                        };
                        
                        let metadata = msg.metadata.and_then(|m| {
                            serde_json::from_str::<serde_json::Value>(&m).ok()
                        });
                        
                        let metadata_value = metadata
                            .and_then(|m| {
                                if m.is_object() && !m.as_object().unwrap().is_empty() {
                                    Some(m)
                                } else {
                                    None
                                }
                            });
                        
                        Message {
                            role: role.to_string(),
                            content: msg.content,
                            metadata: metadata_value,
                        }
                    }).collect();
                    
                    log::info!("Loaded {} messages from SQLite for session {}", result.len(), id);
                    return Ok(result);
                }
                Ok(_) => {
                    // Sessão existe mas não tem mensagens, continuar para fallback
                }
                Err(e) => {
                    log::debug!("SQLite query failed for session {}: {}, trying JSON fallback", id, e);
                }
            }
        }
        Err(e) => {
            log::debug!("Failed to open database: {}, trying JSON fallback", e);
        }
    }
    
    // 2. Fallback: tentar carregar do sistema legado (arquivos JSON)
    let chats_dir = get_chats_dir(&app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", id));
    
    if !file_path.exists() {
        return Err("Session not found".to_string());
    }
    
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;
        
    let session: ChatSession = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session: {}", e))?;
    
    log::info!("Loaded {} messages from JSON for session {}", session.messages.len(), id);
    Ok(session.messages)
}

#[command]
fn delete_chat_session(app_handle: AppHandle, id: String) -> Result<(), String> {
    use db::Database;
    
    let mut errors = Vec::new();
    
    // 1. Deletar do sistema legado (arquivos JSON)
    let chats_dir = get_chats_dir(&app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", id));
    
    if file_path.exists() {
        if let Err(e) = fs::remove_file(&file_path) {
            errors.push(format!("Failed to delete JSON file: {}", e));
        } else {
            log::info!("Deleted session JSON file: {}", id);
        }
    }
    
    // 2. Deletar do SQLite (sistema novo)
    match Database::new(&app_handle) {
        Ok(db) => {
            if let Err(e) = db.delete_session(&id) {
                errors.push(format!("Failed to delete from SQLite: {}", e));
            } else {
                log::info!("Deleted session from SQLite: {}", id);
            }
        }
        Err(e) => {
            errors.push(format!("Failed to open database: {}", e));
        }
    }
    
    // Se ambos falharam, retornar erro
    if !errors.is_empty() && !file_path.exists() {
        // Se arquivo JSON não existe, verificar se pelo menos deletou do SQLite
        match Database::new(&app_handle) {
            Ok(db) => {
                if db.get_session(&id).ok().flatten().is_none() {
                    // Sessão não existe em nenhum lugar, considerar sucesso
                    return Ok(());
                }
            }
            _ => {}
        }
    }
    
    // Se houve erros mas pelo menos um sistema foi atualizado, logar mas não falhar
    if !errors.is_empty() {
        log::warn!("Some errors during deletion of session {}: {:?}", id, errors);
    }
    
    Ok(())
}

#[command]
fn get_system_specs() -> SystemSpecs {
    let mut sys = System::new_all();
    sys.refresh_all();

    // Detectar todas as GPUs
    let gpus = system_monitor::detect_all_gpus();

    SystemSpecs {
        total_memory: sys.total_memory(),
        cpu_count: sys.cpus().len(),
        os_name: System::name().unwrap_or("Unknown".to_string()),
        gpus,
    }
}

/// Retorna o sistema operacional atual: 'windows', 'mac', ou 'linux'
#[command]
fn get_operating_system() -> String {
    #[cfg(target_os = "windows")]
    {
        return "windows".to_string();
    }
    
    #[cfg(target_os = "macos")]
    {
        return "mac".to_string();
    }
    
    #[cfg(target_os = "linux")]
    {
        return "linux".to_string();
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return "unknown".to_string();
}

#[command]
fn start_system_monitor(window: Window) {
    std::thread::spawn(move || {
        let mut sys = System::new_all();
        loop {
            sys.refresh_cpu_all();
            sys.refresh_memory();

            let cpu_usage = sys.global_cpu_usage();
            let memory_used = sys.used_memory();
            let memory_total = sys.total_memory();

            let stats = LegacySystemStats {
                cpu_usage,
                memory_used,
                memory_total,
            };

            if window.emit("system-stats", stats).is_err() {
                break; // Stop if window is closed
            }

            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

#[command]
fn list_local_models() -> Vec<LocalModel> {
    let output = Command::new("ollama")
        .arg("list")
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut models = Vec::new();
            
            // Skip header line
            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    // NAME ID SIZE MODIFIED
                    // Note: Modified can be "2 days ago" (multiple parts)
                    // We'll take the first part as name, second as ID, third as size
                    // and the rest as modified
                    let name = parts[0].to_string();
                    let id = parts[1].to_string();
                    let size = parts[2].to_string();
                    let modified_at = parts[3..].join(" ");

                    models.push(LocalModel {
                        name,
                        id,
                        size,
                        modified_at,
                    });
                }
            }
            models
        }
        Err(_) => Vec::new(),
    }
}

#[command]
async fn delete_model(name: String) -> Result<(), String> {
    let output = Command::new("ollama")
        .arg("rm")
        .arg(&name)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
fn check_if_model_installed(name: String) -> bool {
    let output = Command::new("ollama")
        .arg("list")
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.contains(&name)
        }
        Err(_) => false,
    }
}

/// Instala um modelo GGUF a partir de um arquivo local
#[command]
async fn install_gguf_model(
    app_handle: AppHandle,
    file_path: String,
    model_name: Option<String>,
) -> Result<String, String> {
    use std::path::Path;
    
    let source_path = Path::new(&file_path);
    
    // Validar que o arquivo existe
    if !source_path.exists() {
        return Err("Arquivo não encontrado".to_string());
    }
    
    // Validar extensão (mas aceitar arquivos sem extensão também)
    let is_gguf = if let Some(ext) = source_path.extension() {
        ext.to_string_lossy().to_lowercase() == "gguf"
    } else {
        // Arquivo sem extensão - verificar pelo tamanho (modelos GGUF são grandes)
        let metadata = fs::metadata(source_path)
            .map_err(|e| format!("Erro ao ler metadados do arquivo: {}", e))?;
        metadata.len() >= 50 * 1024 * 1024 // Pelo menos 50MB
    };
    
    if !is_gguf {
        // Verificar se é um arquivo grande sem extensão (pode ser GGUF)
        let metadata = fs::metadata(source_path)
            .map_err(|e| format!("Erro ao ler metadados do arquivo: {}", e))?;
        if metadata.len() < 50 * 1024 * 1024 {
            return Err("Arquivo muito pequeno ou não é um modelo GGUF válido".to_string());
        }
        // Se for grande o suficiente, aceitar mesmo sem extensão
    }
    
    // Validar tamanho mínimo (100MB)
    let metadata = fs::metadata(source_path)
        .map_err(|e| format!("Erro ao ler metadados do arquivo: {}", e))?;
    let min_size = 100 * 1024 * 1024; // 100MB
    if metadata.len() < min_size {
        return Err("Arquivo muito pequeno. Modelos GGUF geralmente têm pelo menos 100MB".to_string());
    }
    
    // Determinar nome do modelo
    let final_model_name = if let Some(name) = model_name {
        name.trim().to_string()
    } else {
        // Extrair nome do arquivo sem extensão
        source_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("model")
            .to_string()
    };
    
    if final_model_name.is_empty() {
        return Err("Nome do modelo não pode estar vazio".to_string());
    }
    
    // Obter diretório de modelos do Ollama
    // Ollama armazena modelos em ~/.ollama/models (Linux/Mac) ou %USERPROFILE%\.ollama\models (Windows)
    let models_dir = dirs::home_dir()
        .ok_or_else(|| "Não foi possível determinar diretório home".to_string())?
        .join(".ollama")
        .join("models");
    
    // Criar diretório se não existir
    fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Erro ao criar diretório de modelos: {}", e))?;
    
    // Criar diretório para o modelo específico
    let model_dir = models_dir.join(&final_model_name);
    fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Erro ao criar diretório do modelo: {}", e))?;
    
    // Nome do arquivo de destino (usar nome do modelo + .gguf)
    let dest_file = model_dir.join(format!("{}.gguf", final_model_name));
    
    // Copiar arquivo
    log::info!("Copiando arquivo GGUF de {} para {}", file_path, dest_file.display());
    fs::copy(source_path, &dest_file)
        .map_err(|e| format!("Erro ao copiar arquivo: {}", e))?;
    
    log::info!("Arquivo copiado com sucesso. Tentando registrar no Ollama...");
    
    // Tentar criar Modelfile e importar modelo no Ollama
    // Ollama pode importar modelos GGUF usando: ollama create <name> -f <modelfile>
    // Mas para GGUF direto, podemos usar: ollama create <name> --file <path>
    // Ou simplesmente copiar para o diretório e o Ollama detecta automaticamente
    
    // Tentar criar Modelfile e registrar modelo no Ollama
    // Ollama requer um Modelfile para criar modelos GGUF
    let modelfile_path = model_dir.join("Modelfile");
    let modelfile_content = format!("FROM {}\n", dest_file.display());
    
    // Escrever Modelfile
    if let Err(e) = fs::write(&modelfile_path, &modelfile_content) {
        log::warn!("Erro ao criar Modelfile: {}. Tentando método alternativo...", e);
    }
    
    // Tentar usar ollama create com Modelfile
    let create_output = Command::new("ollama")
        .arg("create")
        .arg(&final_model_name)
        .arg("-f")
        .arg(&modelfile_path)
        .output();
    
    match create_output {
        Ok(output) => {
            if output.status.success() {
                log::info!("Modelo {} registrado com sucesso no Ollama", final_model_name);
                Ok(final_model_name)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // Se o modelo já existe, ainda consideramos sucesso
                if stderr.contains("already exists") || stderr.contains("model already exists") {
                    log::info!("Modelo {} já existe no Ollama", final_model_name);
                    Ok(final_model_name)
                } else {
                    // Tentar método alternativo: usar FROM diretamente
                    log::warn!("Primeira tentativa falhou: {}. Tentando método alternativo...", stderr);
                    
                    // Método alternativo: criar modelo usando FROM diretamente
                    let alt_output = Command::new("ollama")
                        .arg("create")
                        .arg(&final_model_name)
                        .arg("--file")
                        .arg(&dest_file)
                        .output();
                    
                    match alt_output {
                        Ok(alt_out) => {
                            if alt_out.status.success() {
                                log::info!("Modelo {} registrado com sucesso (método alternativo)", final_model_name);
                                Ok(final_model_name)
                            } else {
                                let alt_stderr = String::from_utf8_lossy(&alt_out.stderr);
                                // Se falhar, ainda retornamos sucesso pois o arquivo foi copiado
                                log::warn!("Não foi possível registrar modelo automaticamente: {}. Arquivo copiado para: {}. Você pode registrar manualmente usando: ollama create {} -f {}", alt_stderr, dest_file.display(), final_model_name, modelfile_path.display());
                                Ok(final_model_name)
                            }
                        }
                        Err(_) => {
                            // Se ambos falharem, ainda retornamos sucesso pois o arquivo foi copiado
                            log::warn!("Não foi possível registrar modelo automaticamente. Arquivo copiado para: {}. Você pode registrar manualmente usando: ollama create {} -f {}", dest_file.display(), final_model_name, modelfile_path.display());
                            Ok(final_model_name)
                        }
                    }
                }
            }
        }
        Err(e) => {
            // Se ollama create falhar, ainda retornamos sucesso pois o arquivo foi copiado
            // O usuário pode registrar manualmente depois
            log::warn!("Não foi possível registrar modelo automaticamente: {}. Arquivo copiado para: {}. Você pode registrar manualmente usando: ollama create {} -f {}", e, dest_file.display(), final_model_name, modelfile_path.display());
            Ok(final_model_name)
        }
    }
}

// Função auxiliar para ler linha até encontrar \r ou \n (mantida para fallback)
#[allow(dead_code)]
fn read_line_until_delimiter<R: Read>(reader: &mut BufReader<R>, buffer: &mut Vec<u8>) -> Result<usize, std::io::Error> {
    buffer.clear();
    let mut byte = [0u8; 1];
    let mut count = 0;
    
    loop {
        match reader.read(&mut byte)? {
            0 => break, // EOF
            _ => {
                if byte[0] == b'\r' {
                    // Se for \r, verificar se o próximo é \n e pular ambos
                    let mut peek = [0u8; 1];
                    if reader.read(&mut peek).unwrap_or(0) > 0 && peek[0] == b'\n' {
                        // É \r\n, já consumimos ambos
                    } else {
                        // É apenas \r, já consumimos
                    }
                    break;
                } else if byte[0] == b'\n' {
                    break;
                }
                buffer.push(byte[0]);
                count += 1;
            }
        }
    }
    
    Ok(count)
}

// Função auxiliar para formatar bytes em formato legível
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

// Função para parsear linha do Ollama e extrair informações (mantida para fallback)
#[allow(dead_code)]
fn parse_ollama_progress(line: &str) -> DownloadProgress {
    let line_lower = line.to_lowercase();
    let mut status = "downloading".to_string();
    let mut percent: Option<u8> = None;
    let mut downloaded: Option<String> = None;
    let mut total: Option<String> = None;
    let mut speed: Option<String> = None;
    
    // Determinar status
    if line_lower.contains("pulling manifest") || line_lower.contains("pulling") {
        status = "pulling".to_string();
    } else if line_lower.contains("verifying") {
        status = "verifying".to_string();
    } else if line_lower.contains("writing manifest") {
        status = "writing".to_string();
    } else if line_lower.contains("success") || line_lower.contains("complete") || line_lower.contains("pulled") {
        status = "success".to_string();
    }
    
    // Extrair porcentagem: "45%" ou "45 %"
    if let Some(caps) = regex::Regex::new(r"(\d+)\s*%").unwrap().captures(line) {
        if let Ok(p) = caps[1].parse::<u8>() {
            percent = Some(p);
        }
    }
    
    // Extrair tamanho baixado/total: "552 MB/1.2 GB" ou "552MB / 1.2GB"
    if let Some(caps) = regex::Regex::new(r"(\d+(?:\.\d+)?)\s*([KMGT]?B)\s*/\s*(\d+(?:\.\d+)?)\s*([KMGT]?B)").unwrap().captures(line) {
        downloaded = Some(format!("{} {}", &caps[1], &caps[2]));
        total = Some(format!("{} {}", &caps[3], &caps[4]));
    }
    
    // Extrair velocidade: "25 MB/s" ou "25MB/s"
    if let Some(caps) = regex::Regex::new(r"(\d+(?:\.\d+)?)\s*([KMGT]?B/s)").unwrap().captures(line) {
        speed = Some(format!("{} {}", &caps[1], &caps[2]));
    }
    
    DownloadProgress {
        status,
        percent,
        downloaded,
        total,
        speed,
        raw: line.to_string(),
    }
}

#[command]
async fn pull_model(window: Window, name: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    
    // Fazer requisição POST para API do Ollama com streaming
    let response = client
        .post("http://localhost:11434/api/pull")
        .json(&serde_json::json!({ "name": name, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama API: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Ollama API returned error: {}", response.status()));
    }
    
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut last_completed: u64 = 0;
    let mut last_time = Instant::now();
    
    // Processar stream NDJSON (Newline Delimited JSON)
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
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
                    
                    // Emitir evento para frontend
                    if let Ok(json) = serde_json::to_string(&progress) {
                        window.emit("download-progress", json).unwrap_or(());
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
                            window.emit("download-progress", json).unwrap_or(());
                        }
                        return Ok(());
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
                        raw: line,
                    };
                    if let Ok(json) = serde_json::to_string(&progress) {
                        window.emit("download-progress", json).unwrap_or(());
                    }
                }
            }
        }
    }
    
    // Se chegou aqui, o stream terminou sem "success" explícito
    // Emitir sucesso final
    let success_progress = DownloadProgress {
        status: "success".to_string(),
        percent: Some(100),
        downloaded: format_bytes(last_completed),
        total: None,
        speed: None,
        raw: "success".to_string(),
    };
    if let Ok(json) = serde_json::to_string(&success_progress) {
        window.emit("download-progress", json).unwrap_or(());
    }
    
    Ok(())
}

// Função auxiliar para formatar velocidade
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

#[command]
fn check_ollama_installed() -> bool {
    match Command::new("ollama").arg("--version").output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[command]
async fn check_ollama_running() -> bool {
    match reqwest::get("http://localhost:11434").await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Verificação completa do Ollama: instalação e execução
#[derive(serde::Serialize)]
struct OllamaCheckResult {
    installed: bool,
    running: bool,
    status: String, // "not_installed" | "installed_stopped" | "running"
}

/// Inicia o Ollama automaticamente se estiver instalado mas não estiver rodando
#[command]
async fn auto_start_ollama() -> Result<bool, String> {
    // Verificar se está instalado
    let installed = check_ollama_installed();
    if !installed {
        log::info!("Ollama não está instalado, pulando inicialização automática");
        return Ok(false);
    }
    
    // Verificar se já está rodando
    let running = check_ollama_running().await;
    if running {
        log::info!("Ollama já está rodando");
        return Ok(true);
    }
    
    // Tentar iniciar
    log::info!("Iniciando Ollama automaticamente...");
    match start_ollama_server() {
        Ok(_) => {
            // Aguardar um pouco para o servidor iniciar
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            
            // Verificar se iniciou com sucesso
            let is_running = check_ollama_running().await;
            if is_running {
                log::info!("Ollama iniciado com sucesso");
                Ok(true)
            } else {
                log::warn!("Ollama foi iniciado mas ainda não está respondendo");
                Ok(false)
            }
        }
        Err(e) => {
            log::error!("Falha ao iniciar Ollama automaticamente: {}", e);
            Err(e)
        }
    }
}

#[command]
async fn check_ollama_full() -> Result<OllamaCheckResult, String> {
    let installed = check_ollama_installed();
    
    if !installed {
        return Ok(OllamaCheckResult {
            installed: false,
            running: false,
            status: "not_installed".to_string(),
        });
    }
    
    let running = check_ollama_running().await;
    
    if !running {
        return Ok(OllamaCheckResult {
            installed: true,
            running: false,
            status: "installed_stopped".to_string(),
        });
    }
    
    Ok(OllamaCheckResult {
        installed: true,
        running: true,
        status: "running".to_string(),
    })
}

#[command]
fn start_ollama_server() -> Result<(), String> {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Spawn detached
    cmd.spawn()
        .map_err(|e| format!("Failed to start ollama: {}", e))?;
        
    Ok(())
}

// MCP Configuration Commands
#[command]
fn load_mcp_config(app_handle: AppHandle) -> Result<McpConfig, String> {
    let config_path = get_mcp_config_path(&app_handle)?;
    
    // If file doesn't exist, return empty config
    if !config_path.exists() {
        return Ok(McpConfig {
            mcp_servers: HashMap::new(),
        });
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read MCP config: {}", e))?;
    
    let config: McpConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse MCP config: {}", e))?;
    
    Ok(config)
}

#[command]
fn save_mcp_config(app_handle: AppHandle, config: McpConfig) -> Result<(), String> {
    let config_path = get_mcp_config_path(&app_handle)?;
    
    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }
    
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write MCP config: {}", e))?;
    
    Ok(())
}

#[command]
fn get_mcp_config_path_command(app_handle: AppHandle) -> Result<String, String> {
    let path = get_mcp_config_path(&app_handle)?;
    Ok(path.to_string_lossy().to_string())
}

// MCP Process Management Commands
#[command]
fn start_mcp_server(
    processes: State<'_, McpProcessMap>,
    name: String,
    config: McpServerConfig,
) -> Result<u32, String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    // Kill existing process if running
    if let Some(mut handle) = processes_map.remove(&name) {
        let _ = handle.child.kill();
        let _ = handle.child.wait();
    }
    
    // Check if command exists before attempting to spawn
    // On Windows, we need to check both with and without .exe extension
    let mut command_exists = {
        let check = Command::new(&config.command)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
        
        #[cfg(target_os = "windows")]
        {
            if check.is_err() {
                // Try with .exe extension on Windows
                Command::new(format!("{}.exe", config.command))
                    .arg("--version")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .output()
                    .is_ok()
            } else {
                true
            }
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            check.is_ok()
        }
    };
    
    // Build command - try to use full path if found, otherwise use command as-is
    // On Windows, we may need to check common Node.js installation paths
    let mut command_path = config.command.clone();
    
    #[cfg(target_os = "windows")]
    {
        // If command is npx and not found in PATH, try common Node.js locations
        if config.command == "npx" && !command_exists {
            let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
            let program_files_x86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());
            
            let common_paths: Vec<String> = vec![
                format!("{}\\nodejs\\npx.cmd", program_files),
                format!("{}\\nodejs\\npx.cmd", program_files_x86),
                r"C:\Program Files\nodejs\npx.cmd".to_string(),
                r"C:\Program Files (x86)\nodejs\npx.cmd".to_string(),
            ];
            
            for path in common_paths {
                if std::path::Path::new(&path).exists() {
                    command_path = path;
                    command_exists = true; // Mark as found
                    break;
                }
            }
        }
    }
    
    if !command_exists {
        // Command not found - provide helpful error message
        return Err(format!(
            "Comando '{}' não encontrado no PATH. Verifique se está instalado e acessível. {}",
            config.command,
            if config.command == "npx" {
                "O Node.js e npm precisam estar instalados. Instale de https://nodejs.org/ e reinicie o aplicativo após a instalação."
            } else if config.command == "uvx" {
                "O uv (Python package manager) precisa estar instalado. Instale com: pip install uv"
            } else {
                "Certifique-se de que o comando está disponível no PATH do sistema."
            }
        ));
    }
    
    let mut cmd = Command::new(&command_path);
    cmd.args(&config.args);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // Set environment variables if provided
    if let Some(env_vars) = &config.env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    // Spawn process
    let child = cmd.spawn()
        .map_err(|e| {
            let error_msg = e.to_string();
            // Provide more context for common errors
            if error_msg.contains("program not found") || 
               error_msg.contains("No such file") || 
               error_msg.contains("The system cannot find the file") ||
               error_msg.contains("not found") {
                format!(
                    "Comando '{}' não encontrado. Verifique se está instalado e no PATH do sistema. {}",
                    config.command,
                    if config.command == "npx" {
                        "Instale Node.js de https://nodejs.org/ e reinicie o aplicativo após a instalação."
                    } else if config.command == "uvx" {
                        "Instale uv com: pip install uv"
                    } else {
                        "Certifique-se de que o comando está disponível no PATH."
                    }
                )
            } else {
                format!("Erro ao iniciar servidor '{}': {}", name, error_msg)
            }
        })?;
    
    let pid = child.id();
    
    // Create process handle with request ID counter
    let handle = McpProcessHandle {
        child,
        request_id: Arc::new(Mutex::new(0)),
    };
    
    // Store in map
    processes_map.insert(name, handle);
    
    Ok(pid)
}

#[command]
fn stop_mcp_server(
    processes: State<'_, McpProcessMap>,
    name: String,
) -> Result<(), String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    if let Some(mut handle) = processes_map.remove(&name) {
        handle.child.kill()
            .map_err(|e| format!("Failed to kill process '{}': {}", name, e))?;
        let _ = handle.child.wait();
        Ok(())
    } else {
        Err(format!("MCP server '{}' not found", name))
    }
}

#[command]
fn restart_mcp_server(
    processes: State<'_, McpProcessMap>,
    app_handle: AppHandle,
    name: String,
) -> Result<u32, String> {
    // Load config
    let config = load_mcp_config(app_handle)?;
    
    // Find server config
    let server_config = config.mcp_servers.get(&name)
        .ok_or_else(|| format!("MCP server '{}' not found in config", name))?
        .clone();
    
    // Stop if running
    {
        let mut processes_map = processes.lock()
            .map_err(|e| format!("Failed to lock processes map: {}", e))?;
        if let Some(mut handle) = processes_map.remove(&name) {
            let _ = handle.child.kill();
            let _ = handle.child.wait();
        }
    }
    
    // Start again
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    // Build command
    let mut cmd = Command::new(&server_config.command);
    cmd.args(&server_config.args);
    cmd.stdin(Stdio::piped());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // Set environment variables if provided
    if let Some(env_vars) = &server_config.env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    // Spawn process
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn MCP server '{}': {}", name, e))?;
    
    let pid = child.id();
    
    // Create process handle with request ID counter
    let handle = McpProcessHandle {
        child,
        request_id: Arc::new(Mutex::new(0)),
    };
    
    // Store in map
    processes_map.insert(name, handle);
    
    Ok(pid)
}

#[command]
fn list_mcp_server_status(
    processes: State<'_, McpProcessMap>,
    app_handle: AppHandle,
) -> Result<Vec<McpServerStatus>, String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    let config = load_mcp_config(app_handle)?;
    let mut statuses = Vec::new();
    
    for (name, _) in config.mcp_servers {
        let status = if let Some(handle) = processes_map.get_mut(&name) {
            // Check if process is still alive by trying to get its status
            match handle.child.try_wait() {
                Ok(Some(_)) => {
                    // Process finished, remove from map
                    processes_map.remove(&name);
                    McpServerStatus {
                        name: name.clone(),
                        status: "stopped".to_string(),
                        pid: None,
                    }
                },
                Ok(None) => McpServerStatus {
                    name: name.clone(),
                    status: "running".to_string(),
                    pid: Some(handle.child.id()),
                },
                Err(_) => McpServerStatus {
                    name: name.clone(),
                    status: "error".to_string(),
                    pid: None,
                },
            }
        } else {
            McpServerStatus {
                name: name.clone(),
                status: "stopped".to_string(),
                pid: None,
            }
        };
        
        statuses.push(status);
    }
    
    Ok(statuses)
}

#[command]
fn restart_all_mcp_servers(
    processes: State<'_, McpProcessMap>,
    app_handle: AppHandle,
) -> Result<Vec<String>, String> {
    let config = load_mcp_config(app_handle)?;
    let mut started = Vec::new();
    
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    // First, kill all existing processes
    for (_name, mut handle) in processes_map.drain() {
        let _ = handle.child.kill();
        let _ = handle.child.wait();
    }
    
    // Now start all servers from config
    for (name, server_config) in config.mcp_servers {
        // Build command
        let mut cmd = Command::new(&server_config.command);
        cmd.args(&server_config.args);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Set environment variables if provided
        if let Some(env_vars) = &server_config.env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        // Spawn process
        match cmd.spawn() {
            Ok(child) => {
                let handle = McpProcessHandle {
                    child,
                    request_id: Arc::new(Mutex::new(0)),
                };
                processes_map.insert(name.clone(), handle);
                started.push(name);
            }
            Err(e) => {
                eprintln!("Failed to start MCP server '{}': {}", name, e);
            }
        }
    }
    
    Ok(started)
}

// MCP JSON-RPC Communication Commands
#[command]
fn list_mcp_tools(
    processes: State<'_, McpProcessMap>,
    server_name: String,
) -> Result<Vec<McpTool>, String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    let handle = processes_map.get_mut(&server_name)
        .ok_or_else(|| format!("MCP server '{}' not found or not running", server_name))?;
    
    list_mcp_tools_internal(handle)
}

#[command]
fn call_mcp_tool(
    processes: State<'_, McpProcessMap>,
    server_name: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    let handle = processes_map.get_mut(&server_name)
        .ok_or_else(|| format!("MCP server '{}' not found or not running", server_name))?;
    
    // Increment request ID
    let request_id = {
        let mut id = handle.request_id.lock()
            .map_err(|e| format!("Failed to lock request ID: {}", e))?;
        *id += 1;
        *id
    };
    
    // Build params for tools/call
    let params = serde_json::json!({
        "name": tool_name,
        "arguments": arguments
    });
    
    // Send tools/call request
    send_jsonrpc_request(
        &mut handle.child,
        "tools/call",
        Some(params),
        request_id,
    )?;
    
    // Read response (wait a moment for server to process)
    std::thread::sleep(Duration::from_millis(200));
    let response = read_jsonrpc_response(&mut handle.child, request_id, 30)?;
    
    // Parse result from response
    if let Some(error) = response.error {
        return Err(format!("MCP server error: {} ({})", error.message, error.code));
    }
    
    response.result
        .ok_or_else(|| "No result in response".to_string())
}

// Helper function to list tools from a server (not a Tauri command, used internally)
fn list_mcp_tools_internal(
    handle: &mut McpProcessHandle,
) -> Result<Vec<McpTool>, String> {
    // Increment request ID
    let request_id = {
        let mut id = handle.request_id.lock()
            .map_err(|e| format!("Failed to lock request ID: {}", e))?;
        *id += 1;
        *id
    };
    
    // Send tools/list request
    send_jsonrpc_request(
        &mut handle.child,
        "tools/list",
        None,
        request_id,
    )?;
    
    // Read response (wait a moment for server to process)
    std::thread::sleep(Duration::from_millis(200));
    let response = read_jsonrpc_response(&mut handle.child, request_id, 10)?;
    
    // Parse tools from response
    if let Some(error) = response.error {
        return Err(format!("MCP server error: {} ({})", error.message, error.code));
    }
    
    let result = response.result
        .ok_or_else(|| "No result in response".to_string())?;
    
    let tools_obj = result.get("tools")
        .ok_or_else(|| "No 'tools' field in response".to_string())?
        .as_array()
        .ok_or_else(|| "Tools field is not an array".to_string())?;
    
    let mut tools = Vec::new();
    for tool_json in tools_obj {
        let tool: McpTool = serde_json::from_value(tool_json.clone())
            .map_err(|e| format!("Failed to parse tool: {}", e))?;
        tools.push(tool);
    }
    
    Ok(tools)
}

#[command]
fn get_all_mcp_tools(
    processes: State<'_, McpProcessMap>,
    app_handle: AppHandle,
) -> Result<Vec<McpToolInfo>, String> {
    let mut processes_map = processes.lock()
        .map_err(|e| format!("Failed to lock processes map: {}", e))?;
    
    let config = load_mcp_config(app_handle)?;
    let mut all_tools = Vec::new();
    
    // Get tools from each running server
    for (server_name, _) in config.mcp_servers {
        if let Some(handle) = processes_map.get_mut(&server_name) {
            match list_mcp_tools_internal(handle) {
                Ok(tools) => {
                    for tool in tools {
                        all_tools.push(McpToolInfo {
                            server_name: server_name.clone(),
                            tool,
                        });
                    }
                }
                Err(e) => {
                    eprintln!("Failed to list tools from '{}': {}", server_name, e);
                }
            }
        }
    }
    
    Ok(all_tools)
}

#[command]
fn ensure_mcp_server_installed(
    _name: String,
    config: McpServerConfig,
) -> Result<bool, String> {
    // Check if command exists
    let command_exists = Command::new(&config.command)
        .arg("--version")
        .output()
        .is_ok();
    
    if !command_exists {
        return Err(format!("Command '{}' not found in PATH", config.command));
    }
    
    // For npx commands with -y flag, check if package exists
    // Note: This is a simplified check - in production, you might want to verify
    // the package actually exists before trying to run it
    if config.command == "npx" && config.args.contains(&"-y".to_string()) {
        // npx -y will auto-install if needed, so we consider it available
        return Ok(true);
    }
    
    // For other commands, assume they're installed if command exists
    Ok(true)
}

#[command]
fn check_mcp_server_available(
    name: String,
    config: McpServerConfig,
) -> Result<bool, String> {
    ensure_mcp_server_installed(name, config)
}

// ========== Web Scraper Commands ==========

/// Obtém ou cria uma instância do Browser (singleton)
pub fn get_or_create_browser(state: State<BrowserState>) -> Result<Arc<Browser>, String> {
    let mut browser_opt = state.lock().map_err(|e| format!("Erro ao acessar estado do browser: {}", e))?;
    
    if let Some(ref browser) = *browser_opt {
        let alive = browser.new_tab().is_ok();
        if alive {
            return Ok(browser.clone());
        } else {
            *browser_opt = None;
        }
    }
    
    // Criar nova instância
    let browser = Arc::new(
        create_browser()
            .map_err(|e| format!("Falha ao criar browser: {}", e))?
    );
    
    *browser_opt = Some(browser.clone());
    Ok(browser)
}

/// Busca no DuckDuckGo e extrai conteúdo das URLs encontradas
#[command]
async fn search_and_extract_content(
    query: String,
    limit: Option<usize>,
    excluded_domains: Option<Vec<String>>,
    search_config: Option<SearchConfig>,
    state: State<'_, BrowserState>,
) -> Result<Vec<ScrapedContent>, String> {
    if query.trim().is_empty() {
        return Err("Query não pode estar vazia".to_string());
    }
    
    let browser = get_or_create_browser(state)?;
    
    // Se SearchConfig foi fornecido, usar a nova função
    if let Some(config) = search_config {
        search_and_scrape_with_config(&query, &config, browser)
            .await
            .map_err(|e| format!("Erro ao buscar e extrair conteúdo: {}", e))
    } else {
        // Backward compatibility: usar configuração padrão
        let limit = limit.unwrap_or(3);
        let excluded_domains = excluded_domains.unwrap_or_default();
        search_and_scrape(&query, limit, browser, excluded_domains)
            .await
            .map_err(|e| format!("Erro ao buscar e extrair conteúdo: {}", e))
    }
}

/// Extrai conteúdo de uma URL específica
#[command]
async fn extract_url_content(
    url: String,
    state: State<'_, BrowserState>,
) -> Result<ScrapedContent, String> {
    if url.trim().is_empty() {
        return Err("URL não pode estar vazia".to_string());
    }
    
    // Validar formato de URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL deve começar com http:// ou https://".to_string());
    }
    
    let browser = get_or_create_browser(state)?;
    
    scrape_url(&url, browser)
        .await
        .map_err(|e| format!("Erro ao extrair conteúdo da URL: {}", e))
}

/// Busca metadados leves (título/URL/snippet) sem abrir páginas
#[command]
async fn search_web_metadata(
    query: String,
    limit: Option<usize>,
    search_config: Option<SearchConfig>,
    engine_order: Option<Vec<String>>,
) -> Result<Vec<SearchResultMetadata>, String> {
    if query.trim().is_empty() {
        return Err("Query não pode estar vazia".to_string());
    }

    let lim = limit.unwrap_or(5);

    // Converter engine_order (strings) para Vec<SearchEngine>
    let engines: Vec<SearchEngine> = if let Some(order) = engine_order {
        order.iter()
            .filter_map(|s| SearchEngine::from_str(s))
            .collect()
    } else {
        // Ordem padrão: Google primeiro, depois outros
        vec![
            SearchEngine::Google,
            SearchEngine::Bing,
            SearchEngine::Yahoo,
            SearchEngine::DuckDuckGo,
            SearchEngine::Startpage,
        ]
    };

    // Se não há engines configuradas, usar DuckDuckGo como fallback
    if engines.is_empty() {
        log::warn!("No valid engines in order, using DuckDuckGo as fallback");
        return search_duckduckgo_metadata(&query, lim)
            .await
            .map_err(|e| format!("Erro ao buscar metadados: {}", e));
    }

    // Usar multi-engine search
    let min_results = 1; // Mínimo de 1 resultado para considerar sucesso
    match search_multi_engine_metadata(&query, lim, &engines, min_results).await {
        Ok(results) => {
            if results.is_empty() && search_config.is_some() {
                // Fallback para smart_search se multi-engine retornou vazio
                log::info!("Multi-engine returned empty, trying smart_search fallback");
                if let Some(config) = search_config {
                    match smart_search(&query, &config).await {
                        Ok(mut urls) => {
                            urls.truncate(lim);
                            let metas = urls
                                .into_iter()
                                .map(|u| SearchResultMetadata { title: u.clone(), url: u, snippet: String::new() })
                                .collect::<Vec<_>>();
                            Ok(metas)
                        }
                        Err(e) => Err(format!("Erro ao executar smart_search: {}", e)),
                    }
                } else {
                    Ok(results)
                }
            } else {
                Ok(results)
            }
        }
        Err(e) => {
            // Se multi-engine falhou completamente, tentar DuckDuckGo como último recurso
            log::warn!("Multi-engine search failed: {}, trying DuckDuckGo fallback", e);
            search_duckduckgo_metadata(&query, lim)
                .await
                .map_err(|e| format!("Erro ao buscar metadados: {}", e))
        }
    }
}

/// Faz scraping em lote de URLs fornecidas
#[command]
async fn scrape_urls(
    urls: Vec<String>,
    state: State<'_, BrowserState>,
) -> Result<Vec<ScrapedContent>, String> {
    if urls.is_empty() {
        return Ok(Vec::new());
    }

    let browser = get_or_create_browser(state)?;

    scrape_urls_bulk(urls, browser)
        .await
        .map_err(|e| format!("Erro ao extrair conteúdo das URLs: {}", e))
}

/// Reinicia o browser (útil se houver problemas)
#[command]
fn reset_browser(state: State<'_, BrowserState>) -> Result<(), String> {
    let mut browser_opt = state.lock().map_err(|e| format!("Erro ao acessar estado do browser: {}", e))?;
    // Limpar referência - o browser será dropado automaticamente
    *browser_opt = None;
    log::info!("Browser resetado - processo será encerrado quando não houver mais referências");
    Ok(())
}

/// Força o encerramento apenas de processos Chrome/Chromium headless criados pelo app
/// Seguro: não mata o navegador pessoal do usuário
#[command]
fn force_kill_browser() -> Result<u32, String> {
    let mut system = System::new_all();
    system.refresh_all();
    
    let mut killed_count = 0;
    let process_names = vec!["chrome", "chromium", "chromedriver", "headless_shell"];
    
    for (pid, process) in system.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        
        // Verifica se o nome do processo corresponde
        if !process_names.iter().any(|&pn| name.contains(pn)) {
            continue;
        }
        
        // SAFE KILL: Estratégia conservadora para identificar processos headless
        // No Windows, tentamos usar wmic para obter a linha de comando completa
        #[cfg(target_os = "windows")]
        let is_headless = {
            use std::process::Command;
            // Tenta obter a linha de comando do processo via wmic
            let cmd_output = Command::new("wmic")
                .args(&["process", "where", &format!("ProcessId={}", pid), "get", "CommandLine", "/format:list"])
                .output();
            
            if let Ok(output) = cmd_output {
                if let Ok(cmd_str) = String::from_utf8(output.stdout) {
                    let cmd_lower = cmd_str.to_lowercase();
                    // Só mata se tiver flags muito específicas de headless
                    cmd_lower.contains("--headless") 
                        || cmd_lower.contains("--remote-debugging-port")
                        || (cmd_lower.contains("--disable-gpu") && cmd_lower.contains("--no-sandbox"))
                } else {
                    false // Se não conseguir ler, não mata (seguro)
                }
            } else {
                // Se wmic falhar, usa heurística conservadora: só mata se o nome for muito específico
                name.contains("headless_shell") || name.contains("chromedriver")
            }
        };
        
        #[cfg(not(target_os = "windows"))]
        let is_headless = {
            // No Linux/Mac, tenta ler /proc/PID/cmdline
            use std::fs;
            if let Ok(cmdline) = fs::read_to_string(format!("/proc/{}/cmdline", pid)) {
                let cmd_lower = cmdline.to_lowercase();
                cmd_lower.contains("--headless") 
                    || cmd_lower.contains("--remote-debugging-port")
                    || (cmd_lower.contains("--disable-gpu") && cmd_lower.contains("--no-sandbox"))
            } else {
                // Se não conseguir ler, usa heurística conservadora
                name.contains("headless_shell") || name.contains("chromedriver")
            }
        };
        
        if !is_headless {
            log::debug!("Ignorando processo Chrome não-headless: PID {} ({})", pid, name);
            continue;
        }
        
        // Processo identificado como headless - pode matar com segurança
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                match Command::new("taskkill")
                    .args(&["/F", "/PID", &pid.to_string()])
                    .output()
                {
                    Ok(output) => {
                        if output.status.success() {
                            killed_count += 1;
                        log::info!("Processo Chrome headless encerrado: PID {} ({})", pid, name);
                        }
                    }
                    Err(e) => {
                        log::warn!("Erro ao encerrar processo {}: {}", pid, e);
                    }
                }
            }
            
            #[cfg(not(target_os = "windows"))]
            {
                use std::process::Command;
                match Command::new("kill")
                    .args(&["-9", &pid.to_string()])
                    .output()
                {
                    Ok(output) => {
                        if output.status.success() {
                            killed_count += 1;
                        log::info!("Processo Chrome headless encerrado: PID {} ({})", pid, name);
                        }
                    }
                    Err(e) => {
                        log::warn!("Erro ao encerrar processo {}: {}", pid, e);
                }
            }
        }
    }
    
    if killed_count > 0 {
        log::info!("Total de {} processos Chrome headless encerrados (seguro)", killed_count);
    } else {
        log::info!("Nenhum processo Chrome headless encontrado para encerrar");
    }
    
    Ok(killed_count)
}

// ========== Storage Management Commands ==========

/// Exporta todas as sessões de chat para um arquivo ZIP
#[command]
async fn export_chat_sessions(app_handle: AppHandle) -> Result<String, String> {
    let chats_dir = get_chats_dir(&app_handle)?;
    
    // Criar nome do arquivo com timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let export_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let zip_path = export_dir.join(format!("ollahub_export_{}.zip", timestamp));
    
    // Criar arquivo ZIP
    let file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create ZIP file: {}", e))?;
    
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o755);
    
    // Ler todos os arquivos JSON do diretório chats
    let entries = fs::read_dir(&chats_dir)
        .map_err(|e| format!("Failed to read chats dir: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .ok_or_else(|| "Invalid file name".to_string())?;
            
            let file_content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read file {}: {}", file_name, e))?;
            
            zip.start_file(format!("chats/{}", file_name), options)
                .map_err(|e| format!("Failed to add file to ZIP: {}", e))?;
            zip.write_all(file_content.as_bytes())
                .map_err(|e| format!("Failed to write file to ZIP: {}", e))?;
        }
    }
    
    zip.finish()
        .map_err(|e| format!("Failed to finalize ZIP: {}", e))?;
    
    Ok(format!("{}", zip_path.display()))
}

/// Apaga todo o histórico de conversas
#[command]
fn clear_chat_history(app_handle: AppHandle) -> Result<(), String> {
    use db::Database;
    
    let chats_dir = get_chats_dir(&app_handle)?;
    
    // 1. Deletar todos os arquivos JSON
    let entries = fs::read_dir(&chats_dir)
        .map_err(|e| format!("Failed to read chats dir: {}", e))?;
    
    let mut deleted_count = 0;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete file {:?}: {}", path, e))?;
            deleted_count += 1;
        }
    }
    
    // 2. Deletar todas as sessões do SQLite
    match Database::new(&app_handle) {
        Ok(db) => {
            match db.list_sessions() {
                Ok(sessions) => {
                    let mut sqlite_deleted = 0;
                    for session in sessions {
                        if let Err(e) = db.delete_session(&session.id) {
                            log::warn!("Failed to delete session {} from SQLite: {}", session.id, e);
                        } else {
                            sqlite_deleted += 1;
                        }
                    }
                    log::info!("Deleted {} sessions from SQLite", sqlite_deleted);
                }
                Err(e) => {
                    log::warn!("Failed to list sessions from SQLite: {}", e);
                }
            }
        }
        Err(e) => {
            log::warn!("Failed to open database: {}", e);
        }
    }
    
    log::info!("Deleted {} chat session files", deleted_count);
    Ok(())
}

/// Limpa sessões órfãs do SQLite que não têm arquivo JSON correspondente
#[command]
fn cleanup_orphan_sessions(app_handle: AppHandle) -> Result<u32, String> {
    use db::Database;
    
    let db = Database::new(&app_handle)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    let chats_dir = get_chats_dir(&app_handle)?;
    let mut orphan_count = 0;
    
    // Listar todas as sessões do SQLite
    let sessions = db.list_sessions()
        .map_err(|e| format!("Failed to list sessions: {}", e))?;
    
    for session in sessions {
        let json_path = chats_dir.join(format!("{}.json", session.id));
        
        // Se não existe arquivo JSON correspondente, é uma sessão órfã
        if !json_path.exists() {
            log::info!("Found orphan session: {} (title: {}), removing from SQLite", session.id, session.title);
            
            if let Err(e) = db.delete_session(&session.id) {
                log::warn!("Failed to delete orphan session {}: {}", session.id, e);
            } else {
                orphan_count += 1;
            }
        }
    }
    
    log::info!("Cleaned up {} orphan sessions from SQLite", orphan_count);
    Ok(orphan_count)
}

/// Retorna o caminho do diretório de dados do app
#[command]
fn get_app_data_dir(app_handle: AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(format!("{}", app_data_dir.display()))
}

/// Salva um arquivo temporário e retorna o caminho
#[command]
fn save_temp_file(app_handle: AppHandle, data: Vec<u8>, extension: String) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    // Obter diretório temporário
    let temp_dir = std::env::temp_dir();
    
    // Criar nome de arquivo único
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let filename = format!("ollama_model_{}.{}", timestamp, extension);
    let temp_path = temp_dir.join(&filename);
    
    // Escrever arquivo
    fs::write(&temp_path, data)
        .map_err(|e| format!("Erro ao salvar arquivo temporário: {}", e))?;
    
    Ok(temp_path.to_string_lossy().to_string())
}

/// Abre um dialog de seleção de arquivo GGUF usando dialog nativo do sistema
#[command]
async fn open_gguf_file_dialog() -> Result<Option<String>, String> {
    use rfd::FileDialog;
    
    // No rfd, o filtro "*" não funciona corretamente no Windows.
    // Para garantir que todos os arquivos sejam mostrados, vamos criar
    // um dialog sem filtro algum. O dialog nativo do Windows mostrará
    // todos os arquivos por padrão quando não há filtro.
    let file = FileDialog::new()
        .set_title("Selecionar modelo GGUF")
        .pick_file();
    
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

// ========== Sources Config Commands ==========

/// Carrega a configuração de fontes de busca
#[command]
fn load_sources_config_command(app_handle: AppHandle) -> Result<SourcesConfig, String> {
    load_sources_config(&app_handle)
}

/// Salva a configuração de fontes de busca
#[command]
fn save_sources_config_command(app_handle: AppHandle, config: SourcesConfig) -> Result<(), String> {
    save_sources_config(&app_handle, config)
}

// ========== Ollama Installer Download Commands ==========

/// Verifica se uma URL de download está disponível
#[command]
async fn check_download_url(url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    match client.head(&url).send().await {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Obtém o caminho do instalador local se existir
#[command]
fn get_local_installer_path(filename: String, app_handle: AppHandle) -> Result<Option<String>, String> {
    // Tentar no diretório do executável (dev e produção)
    // Em desenvolvimento, os arquivos estão em public/ relativo ao projeto
    // Em produção, tentamos encontrar o arquivo em vários locais possíveis
    if let Ok(exe_dir) = app_handle.path().executable_dir() {
        // Tentar vários caminhos possíveis
        let possible_paths = vec![
            // Caminho relativo ao executável (dev) - subir até a raiz do projeto
            exe_dir.parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("public").join("installers").join(&filename)),
            // Caminho direto do executável (dev)
            exe_dir.parent()
                .map(|p| p.join("public").join("installers").join(&filename)),
            // Caminho absoluto do workspace (dev) - tentar encontrar a raiz
            exe_dir.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .map(|p| p.join("public").join("installers").join(&filename)),
            // Em produção, arquivos podem estar no diretório do executável
            Some(exe_dir.join("installers").join(&filename)),
            // Ou no diretório pai do executável
            exe_dir.parent()
                .map(|p| p.join("installers").join(&filename)),
        ];
        
        for path_opt in possible_paths {
            if let Some(path) = path_opt {
                if path.exists() {
                    return Ok(Some(path.to_string_lossy().to_string()));
                }
            }
        }
    }
    
    Ok(None)
}

/// Faz download do instalador da URL oficial ou usa fallback local
#[command]
async fn download_installer(
    url: String,
    filename: String,
    window: Window,
    app_handle: AppHandle,
) -> Result<String, String> {
    use std::io::Write;
    use futures_util::StreamExt;
    
    // Primeiro, tentar usar instalador local como fallback
    if let Some(local_path) = get_local_installer_path(filename.clone(), app_handle.clone())? {
        let local_path_buf = PathBuf::from(&local_path);
        if local_path_buf.exists() {
            // Copiar para app_data_dir/installers
            let app_data_dir = app_handle.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let installers_dir = app_data_dir.join("installers");
            
            if !installers_dir.exists() {
                fs::create_dir_all(&installers_dir)
                    .map_err(|e| format!("Failed to create installers directory: {}", e))?;
            }
            
            let dest_path = installers_dir.join(&filename);
            fs::copy(&local_path_buf, &dest_path)
                .map_err(|e| format!("Failed to copy local installer: {}", e))?;
            
            window.emit("installer-download-progress", serde_json::json!({
                "progress": 100,
                "status": "Concluído (versão local)"
            })).ok();
            
            return Ok(dest_path.to_string_lossy().to_string());
        }
    }
    
    // Fazer download da URL
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300)) // 5 minutos de timeout
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to download installer: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    // Obter tamanho total do arquivo
    let total_size = response.content_length().unwrap_or(0);
    
    // Criar diretório de instaladores
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let installers_dir = app_data_dir.join("installers");
    
    if !installers_dir.exists() {
        fs::create_dir_all(&installers_dir)
            .map_err(|e| format!("Failed to create installers directory: {}", e))?;
    }
    
    let dest_path = installers_dir.join(&filename);
    let mut file = fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        // Emitir progresso
        let progress = if total_size > 0 {
            (downloaded * 100) / total_size
        } else {
            0
        };
        
        window.emit("installer-download-progress", serde_json::json!({
            "progress": progress,
            "downloaded": downloaded,
            "total": total_size,
            "status": format!("Baixando... {}%", progress)
        })).ok();
    }
    
    window.emit("installer-download-progress", serde_json::json!({
        "progress": 100,
        "status": "Download concluído"
    })).ok();
    
    log::info!("Instalador baixado para: {:?}", dest_path);
    Ok(dest_path.to_string_lossy().to_string())
}

/// Executa o instalador baixado
#[command]
fn run_installer(file_path: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    
    if !path.exists() {
        return Err(format!("Instalador não encontrado: {}", file_path));
    }
    
    #[cfg(target_os = "windows")]
    {
        // No Windows, executar o .exe diretamente
        Command::new(&path)
            .spawn()
            .map_err(|e| format!("Failed to run installer: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        // No Linux, dar permissão de execução e executar
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set executable permissions: {}", e))?;
        
        Command::new(&path)
            .spawn()
            .map_err(|e| format!("Failed to run installer: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        // No macOS, executar o .zip (precisa ser extraído primeiro)
        // Por enquanto, apenas abrir o arquivo
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open installer: {}", e))?;
    }
    
    log::info!("Instalador executado: {:?}", path);
    Ok(())
}

/// Verifica se o instalador já foi baixado
#[command]
fn get_downloaded_installer_path(filename: String, app_handle: AppHandle) -> Result<Option<String>, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let installer_path = app_data_dir.join("installers").join(&filename);
    
    if installer_path.exists() {
        Ok(Some(installer_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

// ========== Export & Backup Commands ==========

/// Exporta todos os dados do app (chats, tasks, sources, settings) para um arquivo ZIP
#[command]
async fn export_all_data(app_handle: AppHandle) -> Result<String, String> {
    use walkdir::WalkDir;
    
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Criar nome do arquivo com timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let zip_path = app_data_dir.join(format!("ollahub_backup_{}.zip", timestamp));
    
    // Criar arquivo ZIP
    let file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create ZIP file: {}", e))?;
    
    let mut zip = ZipWriter::new(file);
    let options = FileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o755);
    
    // 1. Adicionar pasta chats/ inteira
    let chats_dir = get_chats_dir(&app_handle)?;
    if chats_dir.exists() {
        for entry in WalkDir::new(&chats_dir) {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                // Obter caminho relativo a partir de chats_dir
                let relative_path = path.strip_prefix(&chats_dir)
                    .map_err(|e| format!("Failed to get relative path: {}", e))?;
                
                // Construir caminho no ZIP como "chats/nome_arquivo.json"
                let zip_path = format!("chats/{}", relative_path.to_string_lossy().replace('\\', "/"));
                
                let file_content = fs::read(path)
                    .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;
                
                zip.start_file(zip_path, options)
                    .map_err(|e| format!("Failed to add file to ZIP: {}", e))?;
                zip.write_all(&file_content)
                    .map_err(|e| format!("Failed to write file to ZIP: {}", e))?;
            }
        }
    }
    
    // 2. Adicionar tasks.json
    let tasks_file = app_data_dir.join("tasks.json");
    if tasks_file.exists() {
        let tasks_content = fs::read_to_string(&tasks_file)
            .map_err(|e| format!("Failed to read tasks.json: {}", e))?;
        
        zip.start_file("tasks.json", options)
            .map_err(|e| format!("Failed to add tasks.json to ZIP: {}", e))?;
        zip.write_all(tasks_content.as_bytes())
            .map_err(|e| format!("Failed to write tasks.json to ZIP: {}", e))?;
    }
    
    // 3. Adicionar sources.json
    let sources_file = app_data_dir.join("sources.json");
    if sources_file.exists() {
        let sources_content = fs::read_to_string(&sources_file)
            .map_err(|e| format!("Failed to read sources.json: {}", e))?;
        
        zip.start_file("sources.json", options)
            .map_err(|e| format!("Failed to add sources.json to ZIP: {}", e))?;
        zip.write_all(sources_content.as_bytes())
            .map_err(|e| format!("Failed to write sources.json to ZIP: {}", e))?;
    } else {
        // Se não existir, criar um sources.json padrão no ZIP
        let default_config = SourcesConfig::default();
        let default_json = serde_json::to_string_pretty(&default_config)
            .map_err(|e| format!("Failed to serialize default sources config: {}", e))?;
        
        zip.start_file("sources.json", options)
            .map_err(|e| format!("Failed to add default sources.json to ZIP: {}", e))?;
        zip.write_all(default_json.as_bytes())
            .map_err(|e| format!("Failed to write default sources.json to ZIP: {}", e))?;
    }
    
    // 4. Adicionar settings.json (se existir)
    let settings_file = app_data_dir.join("settings.json");
    if settings_file.exists() {
        let settings_content = fs::read_to_string(&settings_file)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        
        zip.start_file("settings.json", options)
            .map_err(|e| format!("Failed to add settings.json to ZIP: {}", e))?;
        zip.write_all(settings_content.as_bytes())
            .map_err(|e| format!("Failed to write settings.json to ZIP: {}", e))?;
    }
    
    // Finalizar ZIP
    zip.finish()
        .map_err(|e| format!("Failed to finalize ZIP: {}", e))?;
    
    log::info!("Backup completo exportado para: {}", zip_path.display());
    Ok(format!("{}", zip_path.display()))
}

// ========== Logs Commands ==========

/// Obtém as últimas N linhas dos logs do sistema
#[command]
fn get_recent_logs(app_handle: AppHandle, lines: usize) -> Result<Vec<String>, String> {
    // O tauri-plugin-log geralmente salva logs em app_data_dir/logs/
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let logs_dir = app_data_dir.join("logs");
    
    // Se o diretório de logs não existir, retornar vazio
    if !logs_dir.exists() {
        return Ok(Vec::new());
    }
    
    // Procurar pelo arquivo de log mais recente
    let mut log_files: Vec<_> = fs::read_dir(&logs_dir)
        .map_err(|e| format!("Failed to read logs directory: {}", e))?
        .filter_map(|entry| {
            entry.ok().and_then(|e| {
                let path = e.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("log") {
                    Some((path, e.metadata().ok()?.modified().ok()?))
                } else {
                    None
                }
            })
        })
        .collect();
    
    // Ordenar por data de modificação (mais recente primeiro)
    log_files.sort_by(|a, b| b.1.cmp(&a.1));
    
    // Ler o arquivo mais recente
    if let Some((log_file_path, _)) = log_files.first() {
        let content = fs::read_to_string(log_file_path)
            .map_err(|e| format!("Failed to read log file: {}", e))?;
        
        // Dividir em linhas e pegar as últimas N
        let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        let total_lines = all_lines.len();
        let start = if total_lines > lines { total_lines - lines } else { 0 };
        
        Ok(all_lines[start..].to_vec())
    } else {
        Ok(Vec::new())
    }
}

/// Recebe logs do frontend e os imprime no terminal
#[command]
fn log_to_terminal(level: String, message: String) -> Result<(), String> {
    match level.as_str() {
        "info" => log::info!("{}", message),
        "warn" => log::warn!("{}", message),
        "error" => log::error!("{}", message),
        "debug" => log::debug!("{}", message),
        _ => log::info!("{}", message),
    }
    Ok(())
}

// ========== System Monitor Commands ==========

/// Obtém estatísticas do sistema em tempo real
#[command]
fn get_system_stats(
    monitor_state: State<'_, Arc<Mutex<SystemMonitorState>>>,
) -> Result<SystemStats, String> {
    let mut monitor = monitor_state.lock()
        .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
    
    Ok(monitor.get_stats())
}

/// Obtém estatísticas detalhadas de uma GPU específica
#[command]
fn get_gpu_stats(gpu_id: Option<String>) -> Result<Option<GpuStats>, String> {
    Ok(system_monitor::get_gpu_stats(gpu_id.as_deref()))
}

// ========== Task Scheduler Commands ==========

#[command]
async fn create_task(
    scheduler: State<'_, SchedulerState>,
    label: String,
    cron_schedule: String,
    action: TaskAction,
) -> Result<String, String> {
    use uuid::Uuid;
    
    let task = SentinelTask {
        id: Uuid::new_v4().to_string(),
        label,
        cron_schedule,
        action,
        enabled: true,
        last_run: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    
    let mut sched = scheduler.lock().await;
    sched.upsert_task(task.clone())?;
    Ok(task.id)
}

#[command]
async fn list_tasks(
    scheduler: State<'_, SchedulerState>,
) -> Result<Vec<SentinelTask>, String> {
    let sched = scheduler.lock().await;
    Ok(sched.list_tasks())
}

#[command]
async fn update_task(
    scheduler: State<'_, SchedulerState>,
    task: SentinelTask,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    let mut updated = task;
    updated.updated_at = Utc::now();
    sched.upsert_task(updated)
}

#[command]
async fn delete_task(
    scheduler: State<'_, SchedulerState>,
    id: String,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    sched.remove_task(&id)
}

#[command]
async fn toggle_task(
    scheduler: State<'_, SchedulerState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    if let Some(mut task) = sched.get_task(&id).cloned() {
        task.enabled = enabled;
        task.updated_at = Utc::now();
        sched.upsert_task(task)
    } else {
        Err("Task not found".to_string())
    }
}

#[command]
fn classify_intent(query: String) -> String {
    use intent_classifier::{IntentClassifier, QueryIntent};
    let intent = IntentClassifier::classify(&query);
    match intent {
        QueryIntent::Factual => "factual".to_string(),
        QueryIntent::Conversational => "conversational".to_string(),
        QueryIntent::Technical => "technical".to_string(),
        QueryIntent::Opinion => "opinion".to_string(),
        QueryIntent::Calculation => "calculation".to_string(),
        QueryIntent::Unknown => "unknown".to_string(),
    }
}

/// Comando principal para streaming de chat via Rust
#[command]
async fn chat_stream(
    window: Window,
    app_handle: AppHandle,
    session_id: Option<String>,
    messages: Vec<Message>,
    model: String,
    system_prompt: Option<String>,
    enable_rag: Option<bool>,
) -> Result<String, String> {
    use uuid::Uuid;
    use ollama_client::OllamaClient;
    use futures_util::StreamExt;
    use db::{Database, ChatSession, ChatMessage};
    
    // Gerar ou usar session_id existente
    let session_id = session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let enable_rag = enable_rag.unwrap_or(false);
    
    // Verificar se é nova sessão (apenas 1 mensagem do usuário)
    let is_new_session = messages.len() == 1 && messages[0].role == "user";
    
    // Variáveis para título e emoji (usadas depois na persistência)
    let (title, emoji) = if is_new_session {
        let user_input = &messages[0].content;
        let ollama_client = OllamaClient::new(None);
        
        // Tentar gerar título (com timeout curto)
        let generated_title = match tokio::time::timeout(
            tokio::time::Duration::from_secs(5),
            ollama_client.generate_title(&model, user_input)
        ).await {
            Ok(Ok(t)) => t,
            Ok(Err(e)) => {
                log::warn!("Erro ao gerar título: {}. Usando fallback.", e);
                // Fallback: primeiras palavras da pergunta
                user_input.split_whitespace().take(5).collect::<Vec<_>>().join(" ")
            },
            Err(_) => {
                log::warn!("Timeout ao gerar título. Usando fallback.");
                user_input.split_whitespace().take(5).collect::<Vec<_>>().join(" ")
            }
        };
        
        let generated_emoji = OllamaClient::generate_emoji(&generated_title);
        
        // Emitir evento de chat criado
        let created_event = ChatCreatedEvent {
            session_id: session_id.clone(),
            title: generated_title.clone(),
            emoji: generated_emoji.clone(),
        };
        
        if let Err(e) = window.emit("chat-created", &created_event) {
            log::warn!("Erro ao emitir evento chat-created: {}", e);
        }
        
        (generated_title, generated_emoji)
    } else {
        (String::new(), "💬".to_string())
    };
    
    // 2. Preparar mensagens para Ollama
    let mut ollama_messages = Vec::new();
    
    // Adicionar system prompt se fornecido
    if let Some(sys_prompt) = system_prompt {
        ollama_messages.push(serde_json::json!({
            "role": "system",
            "content": sys_prompt
        }));
    }
    
    // Converter mensagens para formato Ollama
    for msg in &messages {
        ollama_messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content
        }));
    }
    
    // 3. TODO: Classificar intent e aplicar RAG se necessário
    // if enable_rag {
    //     let intent = classify_intent(messages.last().unwrap().content.clone());
    //     // Buscar contexto via RAG
    //     // Injetar no system prompt
    // }
    
    // 4. Fazer requisição streaming para Ollama
    let ollama_client = OllamaClient::new(None);
    ollama_client.check_connection().await?;
    
    let request = serde_json::json!({
        "model": model,
        "messages": ollama_messages,
        "stream": true
    });
    
    // Usar reqwest diretamente para streaming
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let url = "http://localhost:11434/api/chat";
    let response = client
        .post(url)
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;
    
    if !response.status().is_success() {
        let error_msg = format!("Ollama returned status: {}", response.status());
        let error_event = ChatErrorEvent {
            session_id: session_id.clone(),
            error: error_msg.clone(),
        };
        let _ = window.emit("chat-error", &error_event);
        return Err(error_msg);
    }
    
    // 5. Processar stream e emitir tokens
    // IMPORTANTE: O Ollama envia tokens INCREMENTAIS (cada chunk contém apenas o novo conteúdo)
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();
    
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        let chunk_str = String::from_utf8_lossy(&chunk);
        buffer.push_str(&chunk_str);
        
        // Processar linhas completas (separadas por \n)
        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim().to_string();
            buffer = buffer[pos + 1..].to_string();
            
            if line.is_empty() {
                continue;
            }
            
            // Tentar deserializar como JSON do Ollama
            match serde_json::from_str::<serde_json::Value>(&line) {
                Ok(json) => {
                    // Verificar se stream terminou primeiro
                    let is_done = json.get("done").and_then(|d| d.as_bool()) == Some(true);
                    
                    // Extrair conteúdo do chunk (Ollama envia tokens incrementais)
                    if let Some(message) = json.get("message") {
                        if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                            // O Ollama envia apenas o NOVO conteúdo em cada chunk, não o acumulado
                            // Então podemos emitir diretamente
                            if !content.is_empty() {
                                full_content.push_str(content);
                                
                                // Emitir token para frontend
                                let token_event = ChatTokenEvent {
                                    session_id: session_id.clone(),
                                    content: content.to_string(),
                                    done: false,
                                };
                                
                                if let Err(e) = window.emit("chat-token", &token_event) {
                                    log::warn!("Erro ao emitir token: {}", e);
                                }
                            }
                        }
                    }
                    
                    // Verificar se stream terminou
                    if is_done {
                        // Emitir evento final
                        let final_event = ChatTokenEvent {
                            session_id: session_id.clone(),
                            content: String::new(),
                            done: true,
                        };
                        let _ = window.emit("chat-token", &final_event);
                        break;
                    }
                }
                Err(e) => {
                    log::debug!("Failed to parse JSON chunk: {} - Line: {}", e, line);
                    // Continuar mesmo com erro de parse
                }
            }
        }
    }
    
    // 6. Persistir sessão e mensagens no SQLite
    match Database::new(&app_handle) {
        Ok(db) => {
            let now = Utc::now();
            
            // Criar ou atualizar sessão
            let session = if is_new_session && !title.is_empty() {
                ChatSession {
                    id: session_id.clone(),
                    title,
                    emoji,
                    created_at: now,
                    updated_at: now,
                }
            } else {
                // Buscar sessão existente ou criar nova
                match db.get_session(&session_id) {
                    Ok(Some(mut existing)) => {
                        existing.updated_at = now;
                        existing
                    }
                    _ => ChatSession {
                        id: session_id.clone(),
                        title: "Nova Conversa".to_string(),
                        emoji: "💬".to_string(),
                        created_at: now,
                        updated_at: now,
                    }
                }
            };
            
            if let Err(e) = db.create_session(&session) {
                log::warn!("Erro ao salvar sessão: {}", e);
            }
            
            // Salvar mensagens do usuário
            for msg in &messages {
                let chat_msg = ChatMessage {
                    id: None,
                    session_id: session_id.clone(),
                    role: msg.role.clone(),
                    content: msg.content.clone(),
                    metadata: msg.metadata.as_ref().and_then(|m| serde_json::to_string(m).ok()),
                    created_at: now,
                };
                
                if let Err(e) = db.add_message(&chat_msg) {
                    log::warn!("Erro ao salvar mensagem: {}", e);
                }
            }
            
            // Salvar mensagem final do assistente
            if !full_content.is_empty() {
                let assistant_msg = ChatMessage {
                    id: None,
                    session_id: session_id.clone(),
                    role: "assistant".to_string(),
                    content: full_content,
                    metadata: None,
                    created_at: Utc::now(),
                };
                
                if let Err(e) = db.add_message(&assistant_msg) {
                    log::warn!("Erro ao salvar mensagem do assistente: {}", e);
                }
            }
        }
        Err(e) => {
            log::warn!("Erro ao inicializar banco de dados: {}", e);
        }
    }
    
    Ok(session_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Plugin de notificações
      app.handle().plugin(tauri_plugin_notification::init())?;
      
      // Modificar comportamento de fechar janela (ocultar ao invés de fechar)
      if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Ocultar ao invés de fechar
                let _ = window_clone.hide();
                api.prevent_close();
            }
        });
      }
      
      // Inicializar scheduler
      let scheduler_service = match SchedulerService::new(app.handle().clone()) {
          Ok(service) => service,
          Err(e) => {
              log::error!("Erro ao criar scheduler service: {}", e);
              return Err(e.into());
          }
      };
      
      // Usar tokio::sync::Mutex para SchedulerState (async)
      let scheduler_state: SchedulerState = Arc::new(tokio::sync::Mutex::new(scheduler_service));
      
      // Iniciar loop do scheduler em background
      let app_handle = app.handle().clone();
      let scheduler_clone = scheduler_state.clone();
      
      // Inicializar Ollama automaticamente se estiver instalado
      tauri::async_runtime::spawn(async move {
          // Aguardar um pouco para o app inicializar completamente
          tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
          
          // Tentar iniciar Ollama automaticamente
          if let Err(e) = auto_start_ollama().await {
              log::warn!("Falha ao iniciar Ollama automaticamente: {}", e);
          }
      });
      
      // BrowserState não é mais necessário - o scheduler criará o browser quando necessário
      // Usar o runtime async do Tauri ao invés de tokio::spawn
      tauri::async_runtime::spawn(async move {
          if let Err(e) = scheduler_loop::start_scheduler_loop(
              app_handle,
              scheduler_clone,
              None, // BrowserState não é mais necessário
              None, // Ollama URL - pode vir do settings store
          ).await {
              log::error!("Erro ao iniciar scheduler: {}", e);
          }
      });
      
      // Adicionar scheduler ao manage
      app.manage(scheduler_state.clone());
      
      // Inicializar System Monitor State
      let monitor_state: Arc<Mutex<SystemMonitorState>> = Arc::new(Mutex::new(SystemMonitorState::new()));
      app.manage(monitor_state);
      
      Ok(())
    })
    .manage(Arc::new(Mutex::new(None::<Arc<Browser>>)) as BrowserState)
    .manage(Arc::new(Mutex::new(HashMap::<String, Arc<Mutex<()>>>::new())) as FileLockMap)
    .invoke_handler(tauri::generate_handler![
        chat_stream,
        check_ollama_installed, 
        check_ollama_running,
        get_system_specs,
        get_operating_system,
        check_if_model_installed,
        pull_model,
        install_gguf_model,
        save_temp_file,
        open_gguf_file_dialog,
        start_ollama_server,
        start_system_monitor,
        get_gpu_stats,
        list_local_models,
        delete_model,
        save_chat_session,
        load_chat_sessions,
        search_chat_sessions,
        load_chat_history,
        delete_chat_session,
        cleanup_orphan_sessions,
        load_mcp_config,
        save_mcp_config,
        get_mcp_config_path_command,
        start_mcp_server,
        stop_mcp_server,
        restart_mcp_server,
        list_mcp_server_status,
        restart_all_mcp_servers,
        list_mcp_tools,
        call_mcp_tool,
        get_all_mcp_tools,
        ensure_mcp_server_installed,
        check_mcp_server_available,
        search_and_extract_content,
        extract_url_content,
        search_web_metadata,
        scrape_urls,
        reset_browser,
        force_kill_browser,
        export_chat_sessions,
        export_all_data,
        clear_chat_history,
        get_app_data_dir,
        load_sources_config_command,
        save_sources_config_command,
        get_recent_logs,
        log_to_terminal,
        get_system_stats,
        create_task,
        list_tasks,
        update_task,
        delete_task,
        toggle_task,
        check_download_url,
        get_local_installer_path,
        download_installer,
        run_installer,
        get_downloaded_installer_path,
        check_ollama_full,
        auto_start_ollama,
        classify_intent
    ])
    .manage(Arc::new(Mutex::new(HashMap::<String, McpProcessHandle>::new())) as McpProcessMap)
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
