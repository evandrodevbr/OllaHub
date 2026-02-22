use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write, Read};
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use std::fs;
use std::path::{PathBuf, Path};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
<<<<<<< HEAD
use tokio::sync::Mutex as AsyncMutex;
use tauri::async_runtime::JoinHandle as TauriJoinHandle;
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
use tauri::{command, Window, Emitter, Manager, AppHandle, State, WebviewWindow};
use sysinfo::System;
use chrono::{DateTime, Utc};
use zip::write::{FileOptions, ZipWriter};
use zip::CompressionMethod;

mod web_scraper;
mod scraper_logger;
mod scraper_state;
mod python_scraper;
mod scheduler;
mod ollama_client;
mod task_executor;
mod scheduler_loop;
mod sources_config;
mod system_monitor;
mod intent_classifier;
mod db;
mod embeddings;
<<<<<<< HEAD
mod setup;
mod setup_manager;
mod content_store;
mod crypto;
mod models_dir;
mod llama_cpp_state;
mod local_models;
mod huggingface_download;
mod searxng_manager;
mod searxng_search;
mod search_orchestrator;
mod event_emitter;
mod domain_strategy;
mod docker_requirements;
mod docker_installer;
mod docker_validator;
mod docker_fix;
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5

use web_scraper::{
    ScrapedContent,
    SearchResultMetadata,
    search_and_scrape_with_config,
    scrape_url,
    SearchConfig,
    scrape_urls_bulk,
};
use search_orchestrator::search_with_waterfall;
use searxng_manager::{
    check_docker_available as check_docker_available_impl,
    check_docker_running as check_docker_running_impl,
    start_searxng as start_searxng_impl,
    stop_searxng as stop_searxng_impl,
    check_searxng_status as check_searxng_status_impl,
    get_searxng_logs as get_searxng_logs_impl,
};
use scheduler::{SentinelTask, SchedulerService, SchedulerState, TaskAction};
use scraper_state::ScraperState;
use sources_config::{SourcesConfig, load_sources_config, save_sources_config};
<<<<<<< HEAD
use system_monitor::{SystemStats, SystemMonitorState, GpuInfo, GpuStats, HealthStatus};
=======
use system_monitor::{SystemStats, SystemMonitorState, GpuInfo, GpuStats, SystemHealth, HealthStatus};
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5

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
    #[serde(skip_serializing_if = "Option::is_none")]
    match_count: Option<usize>,
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


// File Lock Manager - previne corrupção de dados em escritas concorrentes
type FileLockMap = Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>;

// Ollama Process State - rastreia processo Ollama spawnado pelo app
type OllamaProcessState = Arc<Mutex<Option<Child>>>;

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
fn toggle_devtools(window: WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    #[cfg(not(debug_assertions))]
    {
<<<<<<< HEAD
        // Em release, não fazer nada - window não é usado mas necessário para a assinatura
        let _ = window;
=======
        // Em release, não fazer nada
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    }
    Ok(())
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
    
    // Também salvar no SQLite (sistema novo) para melhor performance e paginação
    // Se falhar, apenas logar erro mas não falhar a operação (compatibilidade)
    use db::Database;
    match Database::new(&app_handle) {
        Ok(db) => {
            // Criar/atualizar sessão no SQLite
            let db_session = db::ChatSession {
                id: session.id.clone(),
                title: session.title.clone(),
                emoji: "💬".to_string(), // Emoji padrão
                created_at: session.created_at,
                updated_at: session.updated_at,
            };
            
<<<<<<< HEAD
            if let Err(e) = db.create_session(&db_session) {
=======
            if let Err(e) = db.save_session(&db_session) {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
                log::warn!("Failed to save session to SQLite (continuing with JSON only): {}", e);
            } else {
                // Converter Message para ChatMessage e salvar no SQLite
                // Preservar ordem usando timestamps incrementais baseados no índice
                let chat_messages: Vec<db::ChatMessage> = session.messages.iter().enumerate().map(|(idx, msg)| {
                    let metadata_str = msg.metadata.as_ref()
                        .and_then(|m| serde_json::to_string(m).ok());
                    
                    // Criar timestamp incremental para preservar ordem das mensagens
                    // Usar created_at da sessão como base e adicionar segundos baseados no índice
                    // Isso garante que a ordem seja mantida quando ordenado por created_at ASC
                    let base_time = session.created_at;
                    let msg_created_at = base_time + chrono::Duration::seconds(idx as i64);
                    
                    db::ChatMessage {
                        id: None,
                        session_id: session.id.clone(),
                        role: msg.role.clone(),
                        content: msg.content.clone(),
                        metadata: metadata_str,
                        created_at: msg_created_at,
                    }
                }).collect();
                
<<<<<<< HEAD
                // Salvar mensagens individualmente
                for msg in &chat_messages {
                    if let Err(e) = db.save_message(msg) {
                        log::warn!("Failed to save message to SQLite: {}", e);
                    }
                }
                log::debug!("Successfully saved {} messages to SQLite for session {}", chat_messages.len(), session.id);
=======
                if let Err(e) = db.save_messages_batch(&session.id, &chat_messages) {
                    log::warn!("Failed to save messages to SQLite (continuing with JSON only): {}", e);
                } else {
                    log::debug!("Successfully saved {} messages to SQLite for session {}", chat_messages.len(), session.id);
                }
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
            }
        }
        Err(e) => {
            log::debug!("Failed to open database for saving (JSON saved successfully): {}", e);
        }
    }
    
    // Lock é liberado automaticamente quando _guard sai de escopo
    Ok(())
}

#[command]
fn search_chat_sessions(app_handle: AppHandle, query: String, limit: Option<usize>) -> Result<Vec<SessionSummary>, String> {
    use db::Database;
    
    let db = Database::new(&app_handle)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    
    let search_limit = limit.unwrap_or(50);
    let search_results = db.search_sessions(&query, search_limit)
        .map_err(|e| format!("Search failed: {}", e))?;
    
    // Validar existência de cada sessão antes de retornar
    let chats_dir = get_chats_dir(&app_handle)?;
    let mut summaries = Vec::new();
    let mut orphan_count = 0;
    
    for search_result in search_results {
        let session = search_result.session;
        let match_count = search_result.match_count;
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
            match_count: Some(match_count as usize),
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
                            match_count: None,
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

/// Resultado de carregamento paginado de histórico
#[derive(serde::Serialize)]
struct PaginatedHistory {
    messages: Vec<Message>,
    total_count: usize,
    has_more: bool,
}

/// Carrega histórico de chat com paginação (lazy loading)
/// 
/// Parâmetros:
/// - id: ID da sessão
/// - limit: número máximo de mensagens a retornar (default: 20)
/// - offset: número de mensagens a pular do final (default: 0)
#[command]
fn load_chat_history_paginated(
    app_handle: AppHandle,
    id: String,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<PaginatedHistory, String> {
    use db::Database;
    
    let limit = limit.unwrap_or(20);
    let offset = offset.unwrap_or(0);
    
    match Database::new(&app_handle) {
        Ok(db) => {
            match db.get_messages_paginated(&id, limit, offset) {
                Ok((messages, total_count, has_more)) => {
                    // Se SQLite retornou 0 mensagens, tentar fallback para JSON (sistema legado)
                    if total_count == 0 {
                        log::debug!("No messages in SQLite for session {}, trying JSON fallback", id);
                        
                        // Tentar carregar do JSON
                        let chats_dir = match get_chats_dir(&app_handle) {
                            Ok(dir) => dir,
                            Err(e) => {
                                log::debug!("Failed to get chats dir for JSON fallback: {}", e);
                                // Retornar vazio se não conseguir acessar diretório
                                return Ok(PaginatedHistory {
                                    messages: Vec::new(),
                                    total_count: 0,
                                    has_more: false,
                                });
                            }
                        };
                        
                        let file_path = chats_dir.join(format!("{}.json", id));
                        if file_path.exists() {
                            match fs::read_to_string(&file_path) {
                                Ok(content) => {
                                    match serde_json::from_str::<ChatSession>(&content) {
                                        Ok(session) => {
                                            let all_messages = session.messages;
                                            let total = all_messages.len();
                                            
                                            if total == 0 {
                                                return Ok(PaginatedHistory {
                                                    messages: Vec::new(),
                                                    total_count: 0,
                                                    has_more: false,
                                                });
                                            }
                                            
                                            // Aplicar paginação em memória (simular comportamento do SQLite)
                                            // offset=0 significa últimas N mensagens
                                            // offset>0 significa mensagens antes das últimas N
                                            let start_idx = if offset + limit <= total {
                                                total - offset - limit
                                            } else {
                                                0
                                            };
                                            
                                            let end_idx = std::cmp::min(start_idx + limit, total);
                                            let paginated_messages: Vec<Message> = all_messages
                                                .into_iter()
                                                .skip(start_idx)
                                                .take(end_idx - start_idx)
                                                .collect();
                                            
                                            let has_more = offset + paginated_messages.len() < total;
                                            
                                            log::info!(
                                                "Loaded {} messages (offset: {}, total: {}, has_more: {}) from JSON fallback for session {}",
                                                paginated_messages.len(), offset, total, has_more, id
                                            );
                                            
                                            return Ok(PaginatedHistory {
                                                messages: paginated_messages,
                                                total_count: total,
                                                has_more,
                                            });
                                        }
                                        Err(e) => {
                                            log::debug!("Failed to parse JSON session: {}", e);
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::debug!("Failed to read JSON file: {}", e);
                                }
                            }
                        }
                        
                        // Se chegou aqui, não encontrou mensagens nem no SQLite nem no JSON
                        return Ok(PaginatedHistory {
                            messages: Vec::new(),
                            total_count: 0,
                            has_more: false,
                        });
                    }
                    
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
                    
                    log::info!(
                        "Loaded {} messages (offset: {}, total: {}, has_more: {}) from SQLite for session {}",
                        result.len(), offset, total_count, has_more, id
                    );
                    
                    Ok(PaginatedHistory {
                        messages: result,
                        total_count,
                        has_more,
                    })
                }
                Err(e) => {
                    log::debug!("SQLite query failed for session {}: {}, trying JSON fallback", id, e);
                    
                    // Fallback para JSON em caso de erro também
                    let chats_dir = match get_chats_dir(&app_handle) {
                        Ok(dir) => dir,
                        Err(_) => {
                            return Err(format!("Failed to load paginated history: {}", e));
                        }
                    };
                    
                    let file_path = chats_dir.join(format!("{}.json", id));
                    if file_path.exists() {
                        match fs::read_to_string(&file_path) {
                            Ok(content) => {
                                match serde_json::from_str::<ChatSession>(&content) {
                                    Ok(session) => {
                                        let all_messages = session.messages;
                                        let total = all_messages.len();
                                        
                                        if total == 0 {
                                            return Ok(PaginatedHistory {
                                                messages: Vec::new(),
                                                total_count: 0,
                                                has_more: false,
                                            });
                                        }
                                        
                                        let start_idx = if offset + limit <= total {
                                            total - offset - limit
                                        } else {
                                            0
                                        };
                                        
                                        let end_idx = std::cmp::min(start_idx + limit, total);
                                        let paginated_messages: Vec<Message> = all_messages
                                            .into_iter()
                                            .skip(start_idx)
                                            .take(end_idx - start_idx)
                                            .collect();
                                        
                                        let has_more = offset + paginated_messages.len() < total;
                                        
                                        log::info!(
                                            "Loaded {} messages (offset: {}, total: {}, has_more: {}) from JSON fallback (error case) for session {}",
                                            paginated_messages.len(), offset, total, has_more, id
                                        );
                                        
                                        return Ok(PaginatedHistory {
                                            messages: paginated_messages,
                                            total_count: total,
                                            has_more,
                                        });
                                    }
                                    Err(e2) => {
                                        return Err(format!("Failed to load paginated history: {} (JSON parse error: {})", e, e2));
                                    }
                                }
                            }
                            Err(e2) => {
                                return Err(format!("Failed to load paginated history: {} (JSON read error: {})", e, e2));
                            }
                        }
                    }
                    
                    Err(format!("Failed to load paginated history: {}", e))
                }
            }
        }
        Err(e) => {
            log::debug!("Failed to open database: {}, trying JSON fallback", e);
            
            // Fallback para JSON se não conseguir abrir banco
            let chats_dir = match get_chats_dir(&app_handle) {
                Ok(dir) => dir,
                Err(e2) => {
                    return Err(format!("Failed to open database: {} (chats dir error: {})", e, e2));
                }
            };
            
            let file_path = chats_dir.join(format!("{}.json", id));
            if file_path.exists() {
                match fs::read_to_string(&file_path) {
                    Ok(content) => {
                        match serde_json::from_str::<ChatSession>(&content) {
                            Ok(session) => {
                                let all_messages = session.messages;
                                let total = all_messages.len();
                                
                                if total == 0 {
                                    return Ok(PaginatedHistory {
                                        messages: Vec::new(),
                                        total_count: 0,
                                        has_more: false,
                                    });
                                }
                                
                                let start_idx = if offset + limit <= total {
                                    total - offset - limit
                                } else {
                                    0
                                };
                                
                                let end_idx = std::cmp::min(start_idx + limit, total);
                                let paginated_messages: Vec<Message> = all_messages
                                    .into_iter()
                                    .skip(start_idx)
                                    .take(end_idx - start_idx)
                                    .collect();
                                
                                let has_more = offset + paginated_messages.len() < total;
                                
                                log::info!(
                                    "Loaded {} messages (offset: {}, total: {}, has_more: {}) from JSON fallback (db open error) for session {}",
                                    paginated_messages.len(), offset, total, has_more, id
                                );
                                
                                return Ok(PaginatedHistory {
                                    messages: paginated_messages,
                                    total_count: total,
                                    has_more,
                                });
                            }
                            Err(e2) => {
                                return Err(format!("Failed to open database: {} (JSON parse error: {})", e, e2));
                            }
                        }
                    }
                    Err(e2) => {
                        return Err(format!("Failed to open database: {} (JSON read error: {})", e, e2));
                    }
                }
            }
            
            Err(format!("Failed to open database: {}", e))
        }
    }
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
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let mut sys = System::new_all();
<<<<<<< HEAD
=======
        let mut last_health_status: Option<HealthStatus> = None;
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        
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

            if window_clone.emit("system-stats", stats).is_err() {
                break; // Stop if window is closed
            }
            
            // Verificar saúde do sistema e emitir apenas quando mudar
            if let Ok(mut monitor) = monitor_state.lock() {
                let health = monitor.get_health();
                if last_health_status.as_ref() != Some(&health.status) {
                    // Status mudou, emitir evento
                    if window_clone.emit("system-state-change", health.clone()).is_err() {
                        break;
                    }
                    last_health_status = Some(health.status);
                }
            }

            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

/// Inicia monitoramento contínuo da saúde do sistema
#[command]
fn start_health_monitor(app_handle: AppHandle) -> Result<(), String> {
<<<<<<< HEAD
    // Obter o Arc do monitor state e cloná-lo antes de mover para o async
    let monitor_state_arc = app_handle.try_state::<Arc<Mutex<SystemMonitorState>>>()
        .ok_or_else(|| "SystemMonitorState not found".to_string())?
        .inner()
        .clone();
=======
    let monitor_state = app_handle.state::<Arc<Mutex<SystemMonitorState>>>();
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    let window = app_handle.get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;
    
    // Iniciar monitoramento em background
    tauri::async_runtime::spawn(async move {
        let mut last_status: Option<HealthStatus> = None;
        
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            
            let health = {
<<<<<<< HEAD
                let mut monitor = match monitor_state_arc.lock() {
=======
                let mut monitor = match monitor_state.lock() {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
                    Ok(m) => m,
                    Err(_) => break,
                };
                monitor.get_health()
            };
            
            // Emitir evento apenas quando status mudar (histerese já aplicada)
            if last_status.as_ref() != Some(&health.status) {
                if window.emit("system-state-change", health.clone()).is_err() {
                    break;
                }
                last_status = Some(health.status);
            }
        }
    });
    
    Ok(())
}

#[command]
fn list_local_models() -> Vec<LocalModel> {
    let mut cmd = Command::new("ollama");
    cmd.arg("list");
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let output = cmd.output();

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

/// Lista modelos GGUF locais (não do Ollama)
#[command]
fn list_local_gguf_models(app_handle: AppHandle) -> Result<Vec<local_models::LocalGgufModel>, String> {
    local_models::list_local_gguf_models(&app_handle)
}

#[command]
async fn delete_model(name: String) -> Result<(), String> {
    let mut cmd = Command::new("ollama");
    cmd.arg("rm").arg(&name);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let output = cmd.output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

<<<<<<< HEAD
// Função interna (sem #[command]) para uso em outros módulos
pub fn check_if_model_installed(name: String) -> bool {
=======
#[command]
fn check_if_model_installed(name: String) -> bool {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    let mut cmd = Command::new("ollama");
    cmd.arg("list");
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let output = cmd.output();

    match output {
        Ok(output) => {
            // Verificar se o comando foi executado com sucesso
            if !output.status.success() {
                return false;
            }
            
            let stdout = String::from_utf8_lossy(&output.stdout);
            
            // Fazer parsing correto: pular header e verificar primeira coluna (nome do modelo)
            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 1 {
                    // A primeira coluna é o nome do modelo
                    let model_name = parts[0];
                    // Comparação exata (case-sensitive)
                    if model_name == name {
                        return true;
                    }
                }
            }
            false
        }
        Err(_) => false,
    }
}

// Wrapper com #[command] para exposição via Tauri
#[command]
fn check_if_model_installed_command(name: String) -> bool {
    check_if_model_installed(name)
}

// Nota: A função check_if_model_installed acima (linha 1203) é interna e não tem #[command]
// para evitar conflito com a macro. Apenas check_if_model_installed_command tem #[command].

/// Instala um modelo GGUF a partir de um arquivo local
#[command]
async fn install_gguf_model(
    _app_handle: AppHandle,
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
    let mut cmd = Command::new("ollama");
    cmd.arg("create")
        .arg(&final_model_name)
        .arg("-f")
        .arg(&modelfile_path);
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let create_output = cmd.output();
    
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
                    let mut alt_cmd = Command::new("ollama");
                    alt_cmd.arg("create");
                    
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::process::CommandExt;
                        const CREATE_NO_WINDOW: u32 = 0x08000000;
                        alt_cmd.creation_flags(CREATE_NO_WINDOW);
                    }
                    
                    let alt_output = alt_cmd
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
async fn pull_model(window: Window, state: State<'_, DownloadState>, name: String) -> Result<(), String> {
    // Abort any existing download task
    if let Some(existing) = state.current_task.lock().await.take() {
        existing.abort();
    }

    let window_clone = window.clone();
    let name_clone = name.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let _ = pull_model_impl_window(&window_clone, name_clone).await;
        if let Some(app_handle) = window_clone.app_handle().try_state::<DownloadState>() {
            let _ = app_handle.current_task.lock().await.take();
        }
    });

    *state.current_task.lock().await = Some(handle);
    Ok(())
}

/// Implementação interna que aceita Window
async fn pull_model_impl_window(window: &Window, name: String) -> Result<(), String> {
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

/// Implementação interna que aceita WebviewWindow
async fn pull_model_impl_webview(window: &WebviewWindow, name: String) -> Result<(), String> {
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

<<<<<<< HEAD
// Função interna (sem #[command]) para uso em outros módulos
pub fn check_ollama_installed() -> bool {
=======
#[command]
fn check_ollama_installed() -> bool {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    let mut cmd = Command::new("ollama");
    cmd.arg("--version");
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    match cmd.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

// Wrapper com #[command] para exposição via Tauri
#[command]
fn check_ollama_installed_command() -> bool {
    check_ollama_installed()
}

/// Comando Tauri para verificação robusta do Ollama
#[command]
async fn verify_ollama_integrity_command() -> Result<bool, String> {
    verify_ollama_integrity().await
}

// Nota: A função check_ollama_installed acima (linha 1787) é interna e não tem #[command]
// para evitar conflito com a macro. Apenas check_ollama_installed_command tem #[command].

#[command]
async fn check_ollama_running() -> bool {
    match reqwest::get("http://localhost:11434").await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

/// Heartbeat rápido no endpoint raiz com timeout curto
#[command]
async fn check_ollama_heartbeat() -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(1))
        .build()
        .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;
    match client.get("http://127.0.0.1:11434/").send().await {
        Ok(resp) => Ok(resp.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Verificação completa do Ollama: instalação e execução
#[derive(serde::Serialize)]
struct OllamaCheckResult {
    installed: bool,
    running: bool,
    status: String, // "not_installed" | "installed_stopped" | "running"
}

<<<<<<< HEAD
/// Verificação robusta multi-camada do Ollama
/// Prioriza resposta HTTP como fonte da verdade
/// Retorna Ok(true) se funcional, Ok(false) se não encontrado/não funcional, Err(msg) em caso de erro
pub async fn verify_ollama_integrity() -> Result<bool, String> {
    // PRIORIDADE 1: Verificar HTTP endpoint (fonte da verdade)
    // Se HTTP responder 200 OK, retornar true imediatamente
    {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(1))
            .build()
            .map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;
        
        match client.get("http://localhost:11434/api/version").send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    log::debug!("Ollama HTTP endpoint respondendo - integridade confirmada");
                    return Ok(true);
                } else {
                    log::debug!("Ollama HTTP endpoint retornou status: {}", resp.status());
                }
            }
            Err(e) => {
                log::debug!("Ollama HTTP endpoint não acessível: {}", e);
            }
        }
    }
    
    // Se HTTP falhou, verificar se processo está rodando (serviço pode estar iniciando)
    // PRIORIDADE 2: Verificar se processo Ollama está rodando
    let process_running = {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = Command::new("tasklist");
            cmd.arg("/FI").arg("IMAGENAME eq ollama.exe");
            
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
            
            match cmd.output() {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    // tasklist retorna o nome do processo se estiver rodando
                    stdout.contains("ollama.exe")
                }
                Err(_) => false,
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            let mut cmd = Command::new("pgrep");
            cmd.arg("-f").arg("ollama");
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            
            match cmd.output() {
                Ok(output) => output.status.success(),
                Err(_) => {
                    // Fallback: usar ps
                    let mut ps_cmd = Command::new("ps");
                    ps_cmd.arg("aux");
                    ps_cmd.stdout(Stdio::piped());
                    ps_cmd.stderr(Stdio::null());
                    
                    match ps_cmd.output() {
                        Ok(ps_output) => {
                            let stdout = String::from_utf8_lossy(&ps_output.stdout);
                            stdout.contains("ollama")
                        }
                        Err(_) => false,
                    }
                }
            }
        }
        
        #[cfg(target_os = "macos")]
        {
            let mut cmd = Command::new("pgrep");
            cmd.arg("-f").arg("ollama");
            cmd.stdout(Stdio::null());
            cmd.stderr(Stdio::null());
            
            match cmd.output() {
                Ok(output) => output.status.success(),
                Err(_) => false,
            }
        }
        
        #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
        {
            false
        }
    };
    
    // Se processo está rodando mas HTTP falhou, considerar como funcional (serviço iniciando)
    if process_running {
        log::debug!("Processo Ollama detectado rodando, mas HTTP ainda não responde (serviço iniciando)");
        return Ok(true);
    }
    
    // Se HTTP falhou e processo não está rodando, retornar false
    // NÃO verificar apenas existência de arquivo - arquivo pode existir sem serviço funcional
    log::debug!("Ollama não está funcional: HTTP não responde e processo não está rodando");
    Ok(false)
}

/// Faz polling do serviço Ollama até estar disponível
/// Retorna Ok(()) quando o serviço responder 200 OK, ou erro após timeout
pub async fn poll_ollama_ready(timeout_secs: u64) -> Result<(), String> {
=======
/// Faz polling do serviço Ollama até estar disponível
/// Retorna Ok(()) quando o serviço responder 200 OK, ou erro após timeout
async fn poll_ollama_ready(timeout_secs: u64) -> Result<(), String> {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    
    loop {
        match reqwest::get("http://localhost:11434").await {
            Ok(resp) => {
                if resp.status().is_success() {
                    log::info!("Ollama está pronto e respondendo");
                    return Ok(());
                }
            }
            Err(_) => {
                // Serviço ainda não está disponível, continuar polling
            }
        }
        
        // Verificar timeout
        if start.elapsed() >= timeout {
            return Err(format!("Timeout: Ollama não ficou pronto em {} segundos", timeout_secs));
        }
        
        // Aguardar 2 segundos antes da próxima tentativa
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Inicia o Ollama automaticamente se estiver instalado mas não estiver rodando
#[command]
async fn auto_start_ollama(ollama_process: State<'_, OllamaProcessState>) -> Result<bool, String> {
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
    match start_ollama_server(ollama_process) {
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

/// Opções para geração de texto (espelha GenerationOptions do ollama_client)
#[derive(serde::Deserialize)]
struct GenerationOptionsInput {
    temperature: Option<f64>,
    num_predict: Option<u32>,
    format: Option<String>,
}

/// Gera completion usando /api/generate (não streaming)
#[command]
<<<<<<< HEAD
async fn generate_completion(
    model: String,
    prompt: String,
    options: Option<GenerationOptionsInput>,
) -> Result<String, String> {
    use ollama_client::{OllamaClient, GenerationOptions};
    
    let client = OllamaClient::new(None);
    
    let gen_options = options.map(|opts| GenerationOptions {
        temperature: opts.temperature,
        num_predict: opts.num_predict,
        format: opts.format,
    });
    log::info!("[LLM_DEBUG] generate_completion wrapper: model={} prompt_len={} format={:?}", model, prompt.len(), gen_options.as_ref().and_then(|o| o.format.as_deref()));
    let result = client.generate_completion(&model, &prompt, gen_options).await?;
    log::info!("[LLM_DEBUG] generate_completion wrapper: returned {} chars", result.len());
    Ok(result)
}

/// Gera chat completion usando /api/chat (não streaming)
#[command]
async fn generate_chat_completion(
    model: String,
    messages: Vec<Message>,
    options: Option<GenerationOptionsInput>,
) -> Result<String, String> {
    use ollama_client::{OllamaClient, OllamaMessage, GenerationOptions};
    
    let client = OllamaClient::new(None);
    
    // Converter Message para OllamaMessage
    let ollama_messages: Vec<OllamaMessage> = messages
        .into_iter()
        .map(|msg| OllamaMessage {
            role: msg.role,
            content: msg.content,
        })
        .collect();
    
    let gen_options = options.map(|opts| GenerationOptions {
        temperature: opts.temperature,
        num_predict: opts.num_predict,
        format: opts.format,
    });
    
    client.generate_chat_completion(&model, ollama_messages, gen_options).await
}

/// Obtém informações de um modelo usando /api/show
#[command]
async fn get_ollama_model_info(model_name: String) -> Result<serde_json::Value, String> {
    use ollama_client::OllamaClient;
    
    let client = OllamaClient::new(None);
    client.get_model_info(&model_name).await
}

/// Lista modelos disponíveis usando /api/tags
#[command]
async fn get_ollama_tags() -> Result<Vec<serde_json::Value>, String> {
    use ollama_client::OllamaClient;
    
    let client = OllamaClient::new(None);
    let models = client.get_tags().await?;
    
    // Converter para JSON genérico para compatibilidade com frontend
    let result: Vec<serde_json::Value> = models
        .into_iter()
        .map(|model| {
            let mut obj = serde_json::Map::new();
            obj.insert("name".to_string(), serde_json::Value::String(model.name));
            if let Some(size) = model.size {
                obj.insert("size".to_string(), serde_json::Value::Number(size.into()));
            }
            if let Some(modified_at) = model.modified_at {
                obj.insert("modified_at".to_string(), serde_json::Value::String(modified_at));
            }
            if let Some(digest) = model.digest {
                obj.insert("digest".to_string(), serde_json::Value::String(digest));
            }
            serde_json::Value::Object(obj)
        })
        .collect();
    
    Ok(result)
}

#[command]
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
fn start_ollama_server(ollama_process: State<'_, OllamaProcessState>) -> Result<(), String> {
    // Verificar se já há processo rastreado
    {
        let process_state = ollama_process.lock()
            .map_err(|e| format!("Failed to lock Ollama process state: {}", e))?;
        if process_state.is_some() {
            return Err("Ollama já está rodando (processo rastreado)".to_string());
        }
    }
    
    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Spawn e armazenar handle
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start ollama: {}", e))?;
    
    // Armazenar Child handle no state
    {
        let mut process_state = ollama_process.lock()
            .map_err(|e| format!("Failed to lock Ollama process state: {}", e))?;
        *process_state = Some(child);
    }
        
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

<<<<<<< HEAD
=======
/// Verifica se pode criar browser baseado no estado do sistema
fn can_create_browser(monitor_state: &State<'_, Arc<Mutex<SystemMonitorState>>>) -> Result<bool, String> {
    let monitor = monitor_state.lock()
        .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
    let health = monitor.get_health();
    
    match health.status {
        HealthStatus::Critical => {
            log::warn!("Sistema em estado crítico (RAM: {:.1}%, CPU: {:.1}%), bloqueando criação de browser", health.ram_percent, health.cpu_percent);
            Ok(false)
        }
        _ => Ok(true),
    }
}

/// Obtém ou cria uma instância do Browser (singleton)
/// Verifica estado do sistema antes de criar novo browser
pub fn get_or_create_browser(
    state: State<BrowserState>,
    monitor_state: Option<State<'_, Arc<Mutex<SystemMonitorState>>>>,
) -> Result<Arc<Browser>, String> {
    let mut browser_opt = state.lock().map_err(|e| format!("Erro ao acessar estado do browser: {}", e))?;
    
    if let Some(ref browser) = *browser_opt {
        let alive = browser.new_tab().is_ok();
        if alive {
            return Ok(browser.clone());
        } else {
            *browser_opt = None;
        }
    }
    
    // Verificar estado do sistema antes de criar novo browser
    if let Some(monitor) = monitor_state {
        if !can_create_browser(&monitor)? {
            return Err("Sistema sobrecarregado: não é possível criar browser no momento. Use reqwest como alternativa.".to_string());
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
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5

/// Busca via SearXNG e extrai conteúdo das URLs encontradas usando Nodriver (fonte primária)
#[command]
async fn search_and_extract_content(
    app_handle: AppHandle,
    query: String,
    limit: Option<usize>,
    excluded_domains: Option<Vec<String>>,
    search_config: Option<SearchConfig>,
<<<<<<< HEAD
=======
    state: State<'_, BrowserState>,
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    monitor_state: State<'_, Arc<Mutex<SystemMonitorState>>>,
) -> Result<Vec<ScrapedContent>, String> {
    log::info!("[Scraper_DEBUG] Função de scraping iniciada para query: {}", query);
    if query.trim().is_empty() {
        return Err("Query não pode estar vazia".to_string());
    }
    
<<<<<<< HEAD
    // Obter ScraperState
    let scraper_state = app_handle.try_state::<ScraperState>()
        .map(|s| s.inner().clone());

    if let Some(ref s) = scraper_state {
        s.reset();
    }
    
    // Verificar estado do sistema e ajustar configuração
    let health = {
        let mut monitor = monitor_state.lock()
            .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
        monitor.get_health()
    };
    
    // Ajustar configuração baseado no estado do sistema
    let mut config = search_config.unwrap_or_else(|| SearchConfig {
        max_concurrent_tabs: 5,
        total_sources_limit: limit.unwrap_or(3),
        categories: Vec::new(),
        user_custom_sites: Vec::new(),
        excluded_domains: excluded_domains.unwrap_or_default(),
        searxng: web_scraper::SearxngConfig::default(),
    });
    
    // Aplicar throttling baseado no estado do sistema
    match health.status {
        HealthStatus::Critical => {
            // Bloquear scraping completamente
            return Err("Sistema sobrecarregado: recursos limitados. Tente novamente em alguns instantes.".to_string());
        }
        HealthStatus::Warning => {
            // Limitar concorrência drasticamente
            config.max_concurrent_tabs = 1;
            log::info!("Sistema em warning, limitando concorrência do scraper para {}", config.max_concurrent_tabs);
        }
        HealthStatus::Healthy => {
            // Configuração normal
        }
    }
    
    log::info!("[Scraper_DEBUG] Chamando search_and_scrape_with_config (limit: {}, max_tabs: {}, excluded_domains: {})",
        config.total_sources_limit,
        config.max_concurrent_tabs,
        config.excluded_domains.len()
    );
    
    search_and_scrape_with_config(&query, &config, scraper_state)
=======
    // Verificar estado do sistema e ajustar configuração
    let health = {
        let mut monitor = monitor_state.lock()
            .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
        monitor.get_health()
    };
    
    // Ajustar configuração baseado no estado do sistema
    let mut config = search_config.unwrap_or_else(|| SearchConfig {
        max_concurrent_tabs: 5,
        total_sources_limit: limit.unwrap_or(3),
        categories: Vec::new(),
        user_custom_sites: Vec::new(),
        excluded_domains: excluded_domains.unwrap_or_default(),
    });
    
    // Aplicar throttling baseado no estado do sistema
    match health.status {
        HealthStatus::Critical => {
            // Bloquear browser completamente, usar apenas reqwest
            return Err("Sistema sobrecarregado: recursos limitados. Tente novamente em alguns instantes.".to_string());
        }
        HealthStatus::Warning => {
            // Limitar concorrência drasticamente
            config.max_concurrent_tabs = 1;
            log::info!("Sistema em warning, limitando concorrência do scraper para {}", config.max_concurrent_tabs);
        }
        HealthStatus::Healthy => {
            // Configuração normal
        }
    }
    
    let browser = get_or_create_browser(state, Some(monitor_state))?;
    
    // Usar a função com configuração ajustada
    search_and_scrape_with_config(&query, &config, browser)
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        .await
        .map_err(|e| format!("Erro ao buscar e extrair conteúdo: {}", e))
}

/// Extrai conteúdo de uma URL específica
#[command]
async fn extract_url_content(
    app_handle: AppHandle,
    url: String,
<<<<<<< HEAD
=======
    state: State<'_, BrowserState>,
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    monitor_state: State<'_, Arc<Mutex<SystemMonitorState>>>,
) -> Result<ScrapedContent, String> {
    if url.trim().is_empty() {
        return Err("URL não pode estar vazia".to_string());
    }
    
    // Validar formato de URL
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL deve começar com http:// ou https://".to_string());
    }
    
    // Verificar estado do sistema
    let health = {
        let mut monitor = monitor_state.lock()
            .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
        monitor.get_health()
    };
<<<<<<< HEAD
=======
    
    if health.status == HealthStatus::Critical {
        return Err("Sistema sobrecarregado: recursos limitados. Tente novamente em alguns instantes.".to_string());
    }
    
    let browser = get_or_create_browser(state, Some(monitor_state))?;
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    
    if health.status == HealthStatus::Critical {
        return Err("Sistema sobrecarregado: recursos limitados. Tente novamente em alguns instantes.".to_string());
    }
    
    use event_emitter::{ScrapingUrlEvent, emit_scraping_event};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    // Emitir evento de início
    let start_timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs() * 1000;
    emit_scraping_event(&app_handle, &ScrapingUrlEvent {
        url: url.clone(),
        title: None,
        status: "started".to_string(),
        duration_ms: None,
        source: None,
        timestamp: start_timestamp,
    });
    
    let start_time = std::time::Instant::now();
    let result = scrape_url(&url).await;
    let duration = start_time.elapsed().as_millis() as u64;
    
    // Emitir evento de conclusão
    let end_timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs() * 1000;
    
    match &result {
        Ok(content) => {
            emit_scraping_event(&app_handle, &ScrapingUrlEvent {
                url: url.clone(),
                title: Some(content.title.clone()),
                status: if content.cached { "cached".to_string() } else { "completed".to_string() },
                duration_ms: Some(duration),
                source: Some(if content.cached { "cached".to_string() } else { "playwright".to_string() }),
                timestamp: end_timestamp,
            });
        }
        Err(_) => {
            emit_scraping_event(&app_handle, &ScrapingUrlEvent {
                url: url.clone(),
                title: None,
                status: "failed".to_string(),
                duration_ms: Some(duration),
                source: None,
                timestamp: end_timestamp,
            });
        }
    }
    
    result.map_err(|e| format!("Erro ao extrair conteúdo da URL: {}", e))
}

/// Busca metadados leves (título/URL/snippet) via SearXNG
#[command]
async fn search_web_metadata(
    _app_handle: AppHandle,
    query: String,
    limit: Option<usize>,
    search_config: Option<SearchConfig>,
    _engine_order: Option<Vec<String>>, // Mantido para compatibilidade, mas não usado
) -> Result<Vec<SearchResultMetadata>, String> {
    if query.trim().is_empty() {
        return Err("Query não pode estar vazia".to_string());
    }

    let lim = limit.unwrap_or(5);

    // Usar SearXNG se config fornecido e habilitado
    if let Some(config) = &search_config {
        if config.searxng.enabled {
            match search_with_waterfall(&query, lim, config, Some(&_app_handle)).await {
                Ok(metadata) => {
                    log::info!("[SearchMetadata] SearXNG returned {} results", metadata.len());
                    return Ok(metadata);
                }
                Err(e) => {
                    log::error!("[SearchMetadata] SearXNG failed: {}", e);
                    return Err(format!("SearXNG search failed: {}", e));
                }
            }
        } else {
            return Err("SearXNG não está habilitado. Configure SearXNG nas configurações.".to_string());
        }
    } else {
        return Err("SearchConfig não fornecido. SearXNG é obrigatório.".to_string());
    }
}

/// Faz scraping em lote de URLs fornecidas
#[command]
async fn scrape_urls(
    app_handle: AppHandle,
    urls: Vec<String>,
) -> Result<Vec<ScrapedContent>, String> {
    if urls.is_empty() {
        return Ok(Vec::new());
    }

<<<<<<< HEAD
    use event_emitter::{ScrapingUrlEvent, emit_scraping_event};
    use std::time::{SystemTime, UNIX_EPOCH};
=======
    let browser = get_or_create_browser(state, None)?;
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5

    // Emitir eventos de início para cada URL
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs() * 1000;
    
    for url in &urls {
        emit_scraping_event(&app_handle, &ScrapingUrlEvent {
            url: url.clone(),
            title: None,
            status: "started".to_string(),
            duration_ms: None,
            source: None,
            timestamp,
        });
    }

    let scraper_state = app_handle.try_state::<ScraperState>()
        .ok_or_else(|| "ScraperState not found".to_string())?
        .inner()
        .clone();

    // Reset cancellation state before starting
    scraper_state.reset();

    let results = scrape_urls_bulk(urls.clone(), Some(scraper_state))
        .await
        .map_err(|e| format!("Erro ao extrair conteúdo das URLs: {}", e))?;

    // Emitir eventos de conclusão
    let completed_timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
        .unwrap_or_default().as_secs() * 1000;
    
    let results_map: std::collections::HashMap<String, &ScrapedContent> = results
        .iter()
        .map(|r| (r.url.clone(), r))
        .collect();
    
    for url in &urls {
        if let Some(result) = results_map.get(url) {
            emit_scraping_event(&app_handle, &ScrapingUrlEvent {
                url: url.clone(),
                title: Some(result.title.clone()),
                status: "completed".to_string(),
                duration_ms: None, // TODO: calcular duração real
                source: Some(if result.cached { "cached".to_string() } else { "playwright".to_string() }),
                timestamp: completed_timestamp,
            });
        } else {
            emit_scraping_event(&app_handle, &ScrapingUrlEvent {
                url: url.clone(),
                title: None,
                status: "failed".to_string(),
                duration_ms: None,
                source: None,
                timestamp: completed_timestamp,
            });
        }
    }

    Ok(results)
}

/// Cancela operação de scraping em andamento
#[command]
fn cancel_scraping(app_handle: AppHandle) -> Result<(), String> {
    if let Some(scraper_state) = app_handle.try_state::<ScraperState>() {
        let state = scraper_state.inner();
        state.cancel();
    } else {
        log::warn!("[Scraper_DEBUG] cancel_scraping called but ScraperState not found; treating as no-op");
    }
    Ok(())
}

/// Limpa todos os processos filhos (MCP, Chrome headless, Ollama)
/// Chamado durante o shutdown do app para evitar processos zumbis
fn cleanup_all_child_processes(
    app_handle: &AppHandle,
) -> Result<(), String> {
    log::info!("Iniciando cleanup de processos filhos...");
    
    // 1. Limpar processos MCP
    if let Some(mcp_processes) = app_handle.try_state::<McpProcessMap>() {
        let mut processes_map = mcp_processes.lock()
            .map_err(|e| format!("Failed to lock MCP processes map: {}", e))?;
        let mut killed_count = 0;
        for (_name, mut handle) in processes_map.drain() {
            if let Err(e) = handle.child.kill() {
                log::warn!("Erro ao matar processo MCP: {}", e);
            } else {
                let _ = handle.child.wait();
                killed_count += 1;
            }
        }
        if killed_count > 0 {
            log::info!("{} processos MCP encerrados", killed_count);
        }
    }
    
    // 2. Limpar processo Ollama
    if let Some(ollama_state) = app_handle.try_state::<OllamaProcessState>() {
        let mut process_state = ollama_state.lock()
            .map_err(|e| format!("Failed to lock Ollama process state: {}", e))?;
        if let Some(mut child) = process_state.take() {
            if let Err(e) = child.kill() {
                log::warn!("Erro ao matar processo Ollama: {}", e);
            } else {
                let _ = child.wait();
                log::info!("Processo Ollama encerrado");
            }
        }
    }
    
<<<<<<< HEAD
    // 3. Limpar processos Python scraper (se necessário)
    // O PythonScraper gerencia seu próprio processo, não precisa de cleanup manual aqui
=======
    // 3. Limpar processos Chrome headless
    match force_kill_browser() {
        Ok(count) => {
            if count > 0 {
                log::info!("{} processos Chrome headless encerrados", count);
            }
        }
        Err(e) => {
            log::warn!("Erro ao encerrar processos Chrome headless: {}", e);
        }
    }
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    
    log::info!("Cleanup de processos filhos concluído");
    Ok(())
}

<<<<<<< HEAD
/// Força o encerramento de processos Python scraper (se necessário)
/// Mantido para compatibilidade, mas não é mais necessário com PythonScraper
=======
/// Força o encerramento apenas de processos Chrome/Chromium headless criados pelo app
/// Seguro: não mata o navegador pessoal do usuário
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
#[command]
fn force_kill_browser() -> Result<u32, String> {
    // PythonScraper gerencia seu próprio processo, não precisa de kill manual
    log::info!("force_kill_browser chamado, mas não é mais necessário com PythonScraper");
    Ok(0)
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
fn save_temp_file(_app_handle: AppHandle, data: Vec<u8>, extension: String) -> Result<String, String> {
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

/// Calcula o hash SHA256 de um arquivo
fn calculate_sha256(file_path: &Path) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    use std::io::Read;
    
    let mut file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file for hash calculation: {}", e))?;
    
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8192]; // Buffer de 8KB para leitura em chunks
    
    loop {
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file for hash: {}", e))?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }
    
    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}

/// Faz download do instalador da URL oficial ou usa fallback local
#[command]
async fn download_installer(
    url: String,
    filename: String,
    window: Window,
    app_handle: AppHandle,
    expected_sha256: Option<String>,
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
    
    // Variáveis para cálculo de velocidade e ETA
    let start_time = Instant::now();
    let mut last_update_time = start_time;
    let mut last_downloaded: u64 = 0;
    let mut speed_bytes_per_sec: f64 = 0.0;
    
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Failed to read chunk: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        // Calcular velocidade a cada segundo (média móvel)
        let now = Instant::now();
        let elapsed = now.duration_since(last_update_time);
        
        if elapsed.as_secs() >= 1 || downloaded == total_size {
            let bytes_delta = downloaded - last_downloaded;
            let time_delta = elapsed.as_secs_f64();
            
            if time_delta > 0.0 {
                speed_bytes_per_sec = bytes_delta as f64 / time_delta;
            }
            
            last_update_time = now;
            last_downloaded = downloaded;
        }
        
        // Calcular progresso e ETA
        let progress = if total_size > 0 {
            (downloaded * 100) / total_size
        } else {
            0
        };
        
        let speed_mb_per_sec = speed_bytes_per_sec / (1024.0 * 1024.0);
        let eta_seconds = if speed_bytes_per_sec > 0.0 && total_size > downloaded {
            ((total_size - downloaded) as f64 / speed_bytes_per_sec) as u64
        } else {
            0
        };
        
        // Emitir progresso com telemetria
        window.emit("installer-download-progress", serde_json::json!({
            "progress": progress,
            "downloaded": downloaded,
            "total": total_size,
            "speed": speed_bytes_per_sec as u64,
            "speed_formatted": format!("{:.1} MB/s", speed_mb_per_sec),
            "eta_seconds": eta_seconds,
            "status": format!("Baixando... {}%", progress)
        })).ok();
    }
    
    // Fechar arquivo antes de calcular hash
    drop(file);
    
    // Validar hash SHA256 se fornecido
    if let Some(ref expected_hash) = expected_sha256 {
        window.emit("installer-download-progress", serde_json::json!({
            "progress": 100,
            "downloaded": downloaded,
            "total": total_size,
            "status": "Verificando integridade..."
        })).ok();
        
        let calculated_hash = calculate_sha256(&dest_path)
            .map_err(|e| format!("Failed to calculate file hash: {}", e))?;
        
        // Comparar hashes (case-insensitive)
        if calculated_hash.to_lowercase() != expected_hash.to_lowercase() {
            // Remover arquivo corrompido
            let _ = fs::remove_file(&dest_path);
            return Err(format!(
                "Download corrompido: hash esperado {}, mas obteve {}. Arquivo removido.",
                expected_hash,
                calculated_hash
            ));
        }
        
        log::info!("Hash SHA256 validado com sucesso para: {:?}", dest_path);
    }
    
    window.emit("installer-download-progress", serde_json::json!({
        "progress": 100,
        "downloaded": downloaded,
        "total": total_size,
        "status": "Download concluído"
    })).ok();
    
    log::info!("Instalador baixado para: {:?}", dest_path);
    Ok(dest_path.to_string_lossy().to_string())
}

/// Executa o instalador baixado e faz polling até Ollama estar pronto
#[command]
<<<<<<< HEAD
async fn run_installer(app_handle: AppHandle, file_path: String, expected_sha256: Option<String>) -> Result<(), String> {
=======
async fn run_installer(app_handle: AppHandle, file_path: String) -> Result<(), String> {
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    let path = PathBuf::from(&file_path);
    
    if !path.exists() {
        return Err(format!("Instalador não encontrado: {}", file_path));
    }
    
    let window = app_handle.get_webview_window("main");
    
    // Validar hash SHA256 se fornecido antes de executar
    if let Some(ref expected_hash) = expected_sha256 {
        if let Some(ref w) = window {
            let _ = w.emit("installer-progress", serde_json::json!({
                "status": "verifying",
                "message": "Verificando integridade do instalador..."
            }));
        }
        
        let calculated_hash = calculate_sha256(&path)
            .map_err(|e| format!("Failed to calculate file hash: {}", e))?;
        
        // Comparar hashes (case-insensitive)
        if calculated_hash.to_lowercase() != expected_hash.to_lowercase() {
            if let Some(ref w) = window {
                let _ = w.emit("installer-progress", serde_json::json!({
                    "status": "error",
                    "message": format!("Arquivo corrompido: hash esperado {}, mas obteve {}", expected_hash, calculated_hash)
                }));
            }
            return Err(format!(
                "Arquivo corrompido: hash esperado {}, mas obteve {}. Não é seguro executar o instalador.",
                expected_hash,
                calculated_hash
            ));
        }
        
        log::info!("Hash SHA256 validado com sucesso antes de executar instalador");
    }
    
    #[cfg(target_os = "windows")]
    {
        // No Windows, executar o .exe diretamente com flags silenciosas
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
<<<<<<< HEAD
        
        // Emitir evento de início da instalação
        let window_clone_for_start = window.clone();
        if let Some(ref w) = window_clone_for_start {
            let _ = w.emit("installer-progress", serde_json::json!({
                "status": "starting",
                "message": "Iniciando instalação silenciosa..."
            }));
        }
        
        // Tentar múltiplas flags de instalação silenciosa (NSIS suporta /S, /SILENT, /VERYSILENT)
        // /VERYSILENT é o mais silencioso (sem janela, sem progresso)
        // /SILENT mostra progresso mas sem interação
        // /S é o padrão NSIS
        let mut cmd = Command::new(&path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        // Usar /VERYSILENT para instalação completamente silenciosa
        // /NORESTART evita reiniciar o sistema
        cmd.arg("/VERYSILENT")
           .arg("/NORESTART")
           .arg("/SUPPRESSMSGBOXES");
        
        log::info!("Executando instalador com flags silenciosas: {:?}", path);
        
        // Aguardar o processo terminar para saber se a instalação foi bem-sucedida
        let window_clone_for_error = window.clone();
        let output = cmd.output()
            .map_err(|e| {
                let error_msg = format!("Failed to run installer: {}", e);
                if let Some(ref w) = window_clone_for_error {
                    let _ = w.emit("installer-progress", serde_json::json!({
                        "status": "error",
                        "message": error_msg.clone()
                    }));
                }
                error_msg
            })?;
        
        if output.status.success() {
            log::info!("Instalador executado com sucesso");
            if let Some(ref w) = window {
                let _ = w.emit("installer-progress", serde_json::json!({
                    "status": "completed",
                    "message": "Instalação concluída. Verificando Ollama..."
                }));
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let error_msg = format!("Instalador retornou código de erro: {}. {}", output.status.code().unwrap_or(-1), stderr);
            log::warn!("{}", error_msg);
            
            // Mesmo com erro, tentar verificar se o Ollama foi instalado
            // (alguns instaladores retornam erro mesmo quando instalam corretamente)
            if let Some(ref w) = window {
                let _ = w.emit("installer-progress", serde_json::json!({
                    "status": "warning",
                    "message": "Instalador concluído (com avisos). Verificando instalação..."
                }));
            }
        }
=======
        let mut cmd = Command::new(&path);
        cmd.creation_flags(CREATE_NO_WINDOW);
        // Adicionar flag /S para instalação silenciosa (se suportado pelo instalador)
        cmd.arg("/S");
        cmd.spawn()
            .map_err(|e| format!("Failed to run installer: {}", e))?;
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    }
    
    #[cfg(target_os = "linux")]
    {
        // No Linux, dar permissão de execução e executar com flags silenciosas
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set executable permissions: {}", e))?;
        
        // Tentar executar com --quiet se for um script .sh
        let path_str = path.to_string_lossy();
        if path_str.ends_with(".sh") {
            Command::new("sh")
                .arg(&path)
                .arg("--quiet")
                .spawn()
                .map_err(|e| format!("Failed to run installer: {}", e))?;
        } else {
            // Para outros formatos, executar diretamente
            Command::new(&path)
                .spawn()
                .map_err(|e| format!("Failed to run installer: {}", e))?;
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // No macOS, usar installer com flags silenciosas
        // Se for .pkg, usar installer com --quiet
        let path_str = path.to_string_lossy();
        if path_str.ends_with(".pkg") {
            Command::new("installer")
                .arg("-pkg")
                .arg(&path)
                .arg("-target")
                .arg("/")
                .arg("-verboseR")
                .spawn()
                .map_err(|e| format!("Failed to run installer: {}", e))?;
        } else {
            // Para outros formatos, abrir normalmente
            Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| format!("Failed to open installer: {}", e))?;
        }
    }
    
<<<<<<< HEAD
    // Iniciar polling em background para detectar quando Ollama estiver pronto
    let window_clone = app_handle.get_webview_window("main");
    tauri::async_runtime::spawn(async move {
        // Aguardar um pouco para a instalação finalizar e o serviço iniciar
        tokio::time::sleep(Duration::from_secs(2)).await;
        
        if let Some(ref w) = window_clone {
            let _ = w.emit("installer-progress", serde_json::json!({
                "status": "checking",
                "message": "Verificando se Ollama foi instalado corretamente..."
            }));
        }
        
        // Fazer polling por até 90 segundos (dar mais tempo para instalação completa)
        let max_attempts = 90;
        let mut attempts = 0;
        
        while attempts < max_attempts {
            // Verificar se o Ollama está instalado
            if check_ollama_installed_async().await {
                // Verificar se o serviço está rodando
                if let Ok(_) = poll_ollama_ready(5).await {
                    log::info!("Ollama está pronto após instalação");
                    if let Some(ref w) = window_clone {
                        let _ = w.emit("installer-progress", serde_json::json!({
                            "status": "success",
                            "message": "Ollama instalado e rodando com sucesso!"
                        }));
                        let _ = w.emit("ollama-ready", ());
                    }
                    return;
                }
            }
            
            attempts += 1;
            tokio::time::sleep(Duration::from_secs(1)).await;
            
            // Atualizar progresso a cada 5 segundos
            if attempts % 5 == 0 && attempts < max_attempts {
                if let Some(ref w) = window_clone {
                    let _ = w.emit("installer-progress", serde_json::json!({
                        "status": "checking",
                        "message": format!("Aguardando Ollama iniciar... ({}s)", attempts)
                    }));
                }
            }
        }
        
        // Timeout - verificar se pelo menos está instalado
        if check_ollama_installed_async().await {
            log::warn!("Ollama instalado mas não iniciou automaticamente");
            if let Some(w) = window_clone {
                let _ = w.emit("installer-progress", serde_json::json!({
                    "status": "partial",
                    "message": "Ollama instalado, mas não iniciou automaticamente. Tente iniciar manualmente."
                }));
            }
        } else {
            log::warn!("Polling timeout: Ollama não foi detectado após instalação");
            if let Some(ref w) = window_clone {
                let _ = w.emit("installer-progress", serde_json::json!({
                    "status": "error",
                    "message": "Instalação pode ter falhado. Verifique manualmente."
                }));
=======
    log::info!("Instalador executado: {:?}", path);
    
    // Iniciar polling em background para detectar quando Ollama estiver pronto
    let window = app_handle.get_webview_window("main");
    tauri::async_runtime::spawn(async move {
        // Aguardar um pouco para a instalação começar
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // Fazer polling por até 60 segundos
        match poll_ollama_ready(60).await {
            Ok(_) => {
                log::info!("Ollama está pronto após instalação");
                // Emitir evento para o frontend
                if let Some(w) = window {
                    let _ = w.emit("ollama-ready", ());
                }
            }
            Err(e) => {
                log::warn!("Polling timeout: {}", e);
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
            }
        }
    });
    
    Ok(())
}

/// Verifica se o Ollama está instalado (verifica se o executável existe) - versão async
pub async fn check_ollama_installed_async() -> bool {
    #[cfg(target_os = "windows")]
    {
        // No Windows, verificar se ollama.exe existe no PATH ou em localizações comuns
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let mut cmd = Command::new("where");
        cmd.arg("ollama");
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                return !stdout.trim().is_empty();
            }
        }
        
        // Verificar localizações comuns do Ollama no Windows
        let common_paths: Vec<PathBuf> = vec![
            std::path::PathBuf::from(r"C:\Program Files\Ollama\ollama.exe"),
            std::path::PathBuf::from(r"C:\Program Files (x86)\Ollama\ollama.exe"),
        ];
        
        // Adicionar path do home dir se disponível
        if let Some(mut home_path) = dirs::home_dir() {
            home_path.push("AppData\\Local\\Programs\\Ollama\\ollama.exe");
            let mut paths_with_home = common_paths;
            paths_with_home.push(home_path);
            
            for path in paths_with_home {
                if path.exists() {
                    return true;
                }
            }
        } else {
            for path in common_paths {
                if path.exists() {
                    return true;
                }
            }
        }
        
        false
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        // Linux/Mac: verificar se ollama está no PATH
        use std::process::Command;
        if let Ok(output) = Command::new("which").arg("ollama").output() {
            output.status.success()
        } else {
            false
        }
    }
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
    monitor_state: State<'_, Arc<Mutex<SystemMonitorState>>>,
<<<<<<< HEAD
    processing_state: State<'_, ProcessingState>,
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
) -> Result<String, String> {
    use uuid::Uuid;
    use ollama_client::OllamaClient;
    use futures_util::StreamExt;
    use db::{Database, ChatSession, ChatMessage};
    
    // Verificar estado do sistema antes de processar
    let health = {
        let mut monitor = monitor_state.lock()
            .map_err(|e| format!("Failed to lock monitor state: {}", e))?;
        monitor.get_health()
<<<<<<< HEAD
=======
    };
    
    if health.status == HealthStatus::Critical {
        return Err("Sistema sobrecarregado: aguarde alguns instantes antes de fazer novas requisições.".to_string());
    }
    
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
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    };
    
    if health.status == HealthStatus::Critical {
        return Err("Sistema sobrecarregado: aguarde alguns instantes antes de fazer novas requisições.".to_string());
    }
    
    let session_id = session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let _enable_rag = enable_rag.unwrap_or(false);
    let is_new_session = messages.len() == 1 && messages[0].role == "user";
    {
        let mut status = processing_state.status.lock().await;
        status.insert(session_id.clone(), ("running".to_string(), Utc::now()));
    }
<<<<<<< HEAD
    let _ = window.emit("processing-status", &ProcessingStatusEvent { session_id: session_id.clone(), status: "running".to_string() });
    let window_cloned = window.clone();
    let app_handle_cloned = app_handle.clone();
    let model_cloned = model.clone();
    let system_prompt_cloned = system_prompt.clone();
    let messages_cloned = messages.clone();
    let session_id_cloned = session_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let ollama_client = OllamaClient::new(None);
        let mut title = String::new();
        let mut emoji = "💬".to_string();
        if is_new_session {
            let user_input = &messages_cloned[0].content;
            let generated_title = match tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                ollama_client.generate_title(&model_cloned, user_input)
            ).await {
                Ok(Ok(t)) => t,
                Ok(Err(_)) => user_input.split_whitespace().take(5).collect::<Vec<_>>().join(" "),
                Err(_) => user_input.split_whitespace().take(5).collect::<Vec<_>>().join(" "),
            };
            let generated_emoji = OllamaClient::generate_emoji(&generated_title);
            title = generated_title.clone();
            emoji = generated_emoji.clone();
            let created_event = ChatCreatedEvent { session_id: session_id_cloned.clone(), title: generated_title, emoji: generated_emoji };
            let _ = window_cloned.emit("chat-created", &created_event);
        }
        let mut ollama_messages = Vec::new();
        if let Some(sys_prompt) = system_prompt_cloned {
            ollama_messages.push(serde_json::json!({ "role": "system", "content": sys_prompt }));
        }
        for msg in &messages_cloned {
            ollama_messages.push(serde_json::json!({ "role": msg.role, "content": msg.content }));
        }
        if let Err(e) = ollama_client.check_connection().await {
            let _ = window_cloned.emit("chat-error", &ChatErrorEvent { session_id: session_id_cloned.clone(), error: e });
            let _ = window_cloned.emit("chat-token", &ChatTokenEvent { session_id: session_id_cloned.clone(), content: String::new(), done: true });
            if let Some(state_ref) = app_handle_cloned.try_state::<ProcessingState>() { 
                let mut status = state_ref.status.lock().await; 
                status.insert(session_id_cloned.clone(), ("error".to_string(), Utc::now()));
                let mut sessions = state_ref.sessions.lock().await; 
                let _ = sessions.remove(&session_id_cloned);
            }
            let _ = window_cloned.emit("processing-status", &ProcessingStatusEvent { session_id: session_id_cloned.clone(), status: "error".to_string() });
            return;
        }
        let request = serde_json::json!({ "model": model_cloned, "messages": ollama_messages, "stream": true });
        let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build() { Ok(c) => c, Err(e) => {
            let _ = window_cloned.emit("chat-error", &ChatErrorEvent { session_id: session_id_cloned.clone(), error: format!("Failed to create HTTP client: {}", e) });
            let _ = window_cloned.emit("chat-token", &ChatTokenEvent { session_id: session_id_cloned.clone(), content: String::new(), done: true });
            if let Some(state_ref) = app_handle_cloned.try_state::<ProcessingState>() { 
                let mut status = state_ref.status.lock().await; 
                status.insert(session_id_cloned.clone(), ("error".to_string(), Utc::now()));
                let mut sessions = state_ref.sessions.lock().await; 
                let _ = sessions.remove(&session_id_cloned);
            }
            let _ = window_cloned.emit("processing-status", &ProcessingStatusEvent { session_id: session_id_cloned.clone(), status: "error".to_string() });
            return;
        }};
        let url = "http://localhost:11434/api/chat";
        let response = match client.post(url).json(&request).send().await { Ok(r) => r, Err(e) => {
            let _ = window_cloned.emit("chat-error", &ChatErrorEvent { session_id: session_id_cloned.clone(), error: format!("Failed to send request to Ollama: {}", e) });
            let _ = window_cloned.emit("chat-token", &ChatTokenEvent { session_id: session_id_cloned.clone(), content: String::new(), done: true });
            if let Some(state_ref) = app_handle_cloned.try_state::<ProcessingState>() { 
                let mut status = state_ref.status.lock().await; 
                status.insert(session_id_cloned.clone(), ("error".to_string(), Utc::now()));
                let mut sessions = state_ref.sessions.lock().await; 
                let _ = sessions.remove(&session_id_cloned);
            }
            let _ = window_cloned.emit("processing-status", &ProcessingStatusEvent { session_id: session_id_cloned.clone(), status: "error".to_string() });
            return;
        }};
        if !response.status().is_success() {
            let error_msg = format!("Ollama returned status: {}", response.status());
            let _ = window_cloned.emit("chat-error", &ChatErrorEvent { session_id: session_id_cloned.clone(), error: error_msg.clone() });
            let _ = window_cloned.emit("chat-token", &ChatTokenEvent { session_id: session_id_cloned.clone(), content: String::new(), done: true });
            if let Some(state_ref) = app_handle_cloned.try_state::<ProcessingState>() { 
                let mut status = state_ref.status.lock().await; 
                status.insert(session_id_cloned.clone(), ("error".to_string(), Utc::now()));
                let mut sessions = state_ref.sessions.lock().await; 
                let _ = sessions.remove(&session_id_cloned);
            }
            let _ = window_cloned.emit("processing-status", &ProcessingStatusEvent { session_id: session_id_cloned.clone(), status: "error".to_string() });
            return;
        }
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut full_content = String::new();
        let mut token_buffer = String::new();
        let mut last_emit = std::time::Instant::now();
        const EMIT_INTERVAL_MS: u64 = 16;
        const MAX_BUFFER_CHARS: usize = 50;
        while let Some(chunk_result) = stream.next().await {
            let chunk = match chunk_result { Ok(c) => c, Err(e) => {
                let _ = window_cloned.emit("chat-error", &ChatErrorEvent { session_id: session_id_cloned.clone(), error: format!("Stream error: {}", e) });
                break;
            }};
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();
                if line.is_empty() { continue; }
                match serde_json::from_str::<serde_json::Value>(&line) {
                    Ok(json) => {
                        let is_done = json.get("done").and_then(|d| d.as_bool()) == Some(true);
                        if let Some(message) = json.get("message") {
                            if let Some(content) = message.get("content").and_then(|c| c.as_str()) {
                                if !content.is_empty() {
                                    full_content.push_str(content);
                                    token_buffer.push_str(content);
                                    let elapsed = last_emit.elapsed().as_millis() as u64;
                                    if elapsed >= EMIT_INTERVAL_MS || token_buffer.len() >= MAX_BUFFER_CHARS {
                                        let token_event = ChatTokenEvent { session_id: session_id_cloned.clone(), content: std::mem::take(&mut token_buffer), done: false };
                                        let _ = window_cloned.emit("chat-token", &token_event);
                                        last_emit = std::time::Instant::now();
                                    }
=======
    
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
    
    // 5. Processar stream e emitir tokens COM BUFFERING
    // OTIMIZAÇÃO: Acumular tokens e emitir em batches para reduzir overhead da bridge
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_content = String::new();
    
    // Buffer de tokens para reduzir eventos na bridge
    let mut token_buffer = String::new();
    let mut last_emit = std::time::Instant::now();
    const EMIT_INTERVAL_MS: u64 = 16; // ~60fps para sincronizar com RAF do frontend
    const MAX_BUFFER_CHARS: usize = 50; // Emitir quando buffer tiver ~50 chars
    
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
                            if !content.is_empty() {
                                full_content.push_str(content);
                                token_buffer.push_str(content);
                                
                                // Emitir buffer quando: tempo >= 16ms OU buffer >= 50 chars
                                let elapsed = last_emit.elapsed().as_millis() as u64;
                                if elapsed >= EMIT_INTERVAL_MS || token_buffer.len() >= MAX_BUFFER_CHARS {
                                    let token_event = ChatTokenEvent {
                                        session_id: session_id.clone(),
                                        content: std::mem::take(&mut token_buffer),
                                        done: false,
                                    };
                                    
                                    if let Err(e) = window.emit("chat-token", &token_event) {
                                        log::warn!("Erro ao emitir token: {}", e);
                                    }
                                    last_emit = std::time::Instant::now();
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
                                }
                            }
                        }
                        if is_done {
                            if !token_buffer.is_empty() {
                                let flush_event = ChatTokenEvent { session_id: session_id_cloned.clone(), content: std::mem::take(&mut token_buffer), done: false };
                                let _ = window_cloned.emit("chat-token", &flush_event);
                            }
                            let final_event = ChatTokenEvent { session_id: session_id_cloned.clone(), content: String::new(), done: true };
                            let _ = window_cloned.emit("chat-token", &final_event);
                            break;
                        }
                    }
<<<<<<< HEAD
                    Err(_) => {}
=======
                    
                    // Verificar se stream terminou
                    if is_done {
                        // Flush do buffer residual antes de finalizar
                        if !token_buffer.is_empty() {
                            let flush_event = ChatTokenEvent {
                                session_id: session_id.clone(),
                                content: std::mem::take(&mut token_buffer),
                                done: false,
                            };
                            let _ = window.emit("chat-token", &flush_event);
                        }
                        
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
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
                }
            }
        }
        match Database::new(&app_handle_cloned) {
            Ok(db) => {
                let now = Utc::now();
                let session = if is_new_session && !title.is_empty() { ChatSession { id: session_id_cloned.clone(), title, emoji, created_at: now, updated_at: now } } else {
                    match db.get_session(&session_id_cloned) { Ok(Some(mut existing)) => { existing.updated_at = now; existing }, _ => ChatSession { id: session_id_cloned.clone(), title: "Nova Conversa".to_string(), emoji: "💬".to_string(), created_at: now, updated_at: now } }
                };
                let _ = db.create_session(&session);
                for msg in &messages_cloned {
                    let chat_msg = ChatMessage { id: None, session_id: session_id_cloned.clone(), role: msg.role.clone(), content: msg.content.clone(), metadata: msg.metadata.as_ref().and_then(|m| serde_json::to_string(m).ok()), created_at: now };
                    let _ = db.save_message(&chat_msg);
                }
                if !full_content.is_empty() {
                    let assistant_msg = ChatMessage { id: None, session_id: session_id_cloned.clone(), role: "assistant".to_string(), content: full_content, metadata: None, created_at: Utc::now() };
                    let _ = db.save_message(&assistant_msg);
                }
            }
            Err(_) => {}
        }
        if let Some(state_ref) = app_handle_cloned.try_state::<ProcessingState>() {
            {
                let mut status = state_ref.status.lock().await;
                status.insert(session_id_cloned.clone(), ("completed".to_string(), Utc::now()));
            }
            {
                let mut sessions = state_ref.sessions.lock().await;
                let _ = sessions.remove(&session_id_cloned);
            }
        }
        let _ = window_cloned.emit("processing-status", &ProcessingStatusEvent { session_id: session_id_cloned.clone(), status: "completed".to_string() });
    });
    {
        let mut sessions = processing_state.sessions.lock().await;
        sessions.insert(session_id.clone(), handle);
    }
    Ok(session_id)
}

// ========== Setup Commands ==========

#[command]
async fn get_setup_state_command(app_handle: AppHandle) -> Result<setup::SetupState, String> {
    use setup::get_setup_state;
    get_setup_state(&app_handle).await
}

// Nota: Esta função é o único comando Tauri para get_setup_state.
// A função setup::get_setup_state é interna e não tem #[command].

#[command]
fn check_chocolatey_installed_command() -> bool {
    use setup_manager::check_chocolatey_installed;
    check_chocolatey_installed()
}

#[command]
async fn install_chocolatey_command(window: WebviewWindow) -> Result<(), String> {
    use setup_manager::install_chocolatey;
    install_chocolatey(window).await
}

#[command]
async fn install_ollama_choco_command(window: WebviewWindow) -> Result<(), String> {
    use setup_manager::install_ollama_choco;
    install_ollama_choco(window).await
}

#[command]
async fn install_ollama_silently_command(
    app_handle: AppHandle,
    installer_path: Option<String>,
) -> Result<(), String> {
    use setup::install_ollama_silently;
    install_ollama_silently(app_handle, installer_path).await
}

#[command]
async fn download_default_model_command(
    app_handle: AppHandle,
    state: State<'_, DownloadState>,
    model_name: String,
) -> Result<(), String> {
    use setup::download_default_model;
    if let Some(existing) = state.current_task.lock().await.take() {
        existing.abort();
    }
    let app_handle_clone = app_handle.clone();
    let model_name_clone = model_name.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let _ = download_default_model(app_handle_clone, model_name_clone).await;
        if let Some(state_ref) = app_handle.try_state::<DownloadState>() {
            let _ = state_ref.current_task.lock().await.take();
        }
    });
    *state.current_task.lock().await = Some(handle);
    Ok(())
}

// ============== COMANDOS DE EMBEDDINGS ==============

/// Baixa o modelo de embeddings se não existir
#[command]
async fn download_embedding_model(app_handle: AppHandle) -> Result<bool, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    match embeddings::ensure_model_files(&app_data_dir).await {
        Ok(_) => {
            log::info!("[Embeddings] Model files ready");
            Ok(true)
        }
        Err(e) => {
            log::error!("[Embeddings] Failed to ensure model files: {}", e);
            Err(format!("Failed to download model: {}", e))
        }
    }
}

/// Verifica se o modelo de embeddings está disponível
#[command]
fn is_embedding_model_available(app_handle: AppHandle) -> Result<bool, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    Ok(embeddings::is_model_available(&app_data_dir))
}

// ============== COMANDOS HUGGING FACE ==============

/// Baixa um modelo GGUF do Hugging Face
#[command]
async fn download_gguf_model(
    app_handle: AppHandle,
    model_id: String,
    filename: String,
) -> Result<String, String> {
    // Obter window principal se disponível
    let window = app_handle.get_webview_window("main");
    let path = huggingface_download::download_gguf_model(app_handle, model_id, filename, window).await?;
    Ok(path.to_string_lossy().to_string())
}

/// Lista modelos GGUF disponíveis no Hugging Face
#[command]
async fn list_huggingface_gguf_models(
    app_handle: AppHandle,
    query: Option<String>,
    quantization: Option<String>,
) -> Result<Vec<huggingface_download::HuggingFaceModel>, String> {
    huggingface_download::list_huggingface_gguf_models(&app_handle, query, quantization).await
}

/// Calcula scores de relevância para textos em relação a uma query
#[command]
fn calculate_relevance_scores(
    app_handle: AppHandle,
    query: String,
    texts: Vec<String>,
) -> Result<Vec<(usize, f32)>, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let model_arc = embeddings::get_or_init_model(&app_data_dir)
        .map_err(|e| format!("Failed to load model: {}", e))?;
    
    let mut model = model_arc.lock()
        .map_err(|e| format!("Failed to lock model: {}", e))?;
    
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    
    embeddings::rank_by_relevance(&mut model, &query, &text_refs)
        .map_err(|e| format!("Failed to calculate relevance: {}", e))
}

/// Gera embedding para um texto
#[command]
fn generate_embedding(
    app_handle: AppHandle,
    text: String,
) -> Result<Vec<f32>, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let model_arc = embeddings::get_or_init_model(&app_data_dir)
        .map_err(|e| format!("Failed to load model: {}", e))?;
    
    let mut model = model_arc.lock()
        .map_err(|e| format!("Failed to lock model: {}", e))?;
    
    model.embed(&text)
        .map_err(|e| format!("Failed to generate embedding: {}", e))
}

/// Copia recursos do bundle para AppData e configura tudo necessário
async fn setup_bundle_resources(
    app_handle: &AppHandle,
    window: Option<&WebviewWindow>,
) -> Result<(), String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let resource_dir = app_handle.path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    
    // 1. Copiar modelos de embeddings do bundle para AppData
    let embedding_source = resource_dir.join("bundle/models/embeddings");
    let embedding_dest = app_data_dir.join("models");
    
    if embedding_source.exists() && !embedding_dest.exists() {
        log::info!("[BundleSetup] Copiando modelos de embeddings do bundle...");
        if let Some(w) = window {
            let _ = w.emit("setup-progress", serde_json::json!({
                "status": "copying",
                "message": "Copiando modelos de embeddings..."
            }));
        }
        
        std::fs::create_dir_all(&embedding_dest)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;
        
        // Copiar arquivos individualmente
        let files_to_copy = vec![
            "all-MiniLM-L6-v2.onnx",
            "tokenizer.json",
            "onnxruntime.dll",
        ];
        
        for file_name in files_to_copy {
            let src = embedding_source.join(file_name);
            let dest = embedding_dest.join(file_name);
            
            if src.exists() && !dest.exists() {
                std::fs::copy(&src, &dest)
                    .map_err(|e| format!("Failed to copy {}: {}", file_name, e))?;
                log::info!("[BundleSetup] Copiado: {}", file_name);
            }
        }
        
        // Copiar diretório ort se existir
        let ort_source = embedding_source.join("ort");
        let ort_dest = embedding_dest.join("ort");
        if ort_source.exists() && !ort_dest.exists() {
            copy_dir_all(&ort_source, &ort_dest)?;
        }
    }
    
    // 2. Verificar status do Ollama (apenas logar, não instalar)
    if !check_ollama_installed_async().await {
        log::info!("[BundleSetup] Ollama não está instalado. A instalação deve ser solicitada pelo frontend.");
    } else {
        log::info!("[BundleSetup] Ollama já está instalado");
    }
    
    // Nota: Instalação do Ollama e download de modelos agora são controlados pelo frontend
    // através dos comandos Tauri: install_ollama_silently_command, install_ollama_choco_command, etc.
    
    Ok(())
}

/// Copia um diretório recursivamente
fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create destination dir: {}", e))?;
    
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("Failed to read source dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name();
        let dst_path = dst.join(&file_name);
        
        if path.is_dir() {
            copy_dir_all(&path, &dst_path)?;
        } else {
            std::fs::copy(&path, &dst_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", path, e))?;
        }
    }
    
    Ok(())
}

/// Poda o contexto mantendo apenas os parágrafos mais relevantes
#[command]
fn prune_context(
    app_handle: AppHandle,
    query: String,
    context: String,
    max_tokens: Option<usize>,
    min_score: Option<f32>,
) -> Result<String, String> {
    let max_tokens = max_tokens.unwrap_or(2000);
    let min_score = min_score.unwrap_or(0.3);
    
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Tentar usar embeddings se modelo disponível
    if embeddings::is_model_available(&app_data_dir) {
        let model_arc = embeddings::get_or_init_model(&app_data_dir)
            .map_err(|e| format!("Failed to load model: {}", e))?;
        
        let mut model = model_arc.lock()
            .map_err(|e| format!("Failed to lock model: {}", e))?;
        
        embeddings::prune_context(&mut model, &query, &context, max_tokens, min_score)
            .map_err(|e| format!("Failed to prune context: {}", e))
    } else {
        // Fallback para BM25-like
        log::info!("[PruneContext] Using BM25 fallback (embedding model not available)");
        Ok(embeddings::prune_context_bm25(&query, &context, max_tokens))
    }
}

// ============== COMANDOS DE EMBEDDINGS ==============

/// Baixa o modelo de embeddings se não existir
#[command]
async fn download_embedding_model(app_handle: AppHandle) -> Result<bool, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    match embeddings::ensure_model_files(&app_data_dir).await {
        Ok(_) => {
            log::info!("[Embeddings] Model files ready");
            Ok(true)
        }
        Err(e) => {
            log::error!("[Embeddings] Failed to ensure model files: {}", e);
            Err(format!("Failed to download model: {}", e))
        }
    }
}

/// Verifica se o modelo de embeddings está disponível
#[command]
fn is_embedding_model_available(app_handle: AppHandle) -> Result<bool, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    Ok(embeddings::is_model_available(&app_data_dir))
}

/// Calcula scores de relevância para textos em relação a uma query
#[command]
fn calculate_relevance_scores(
    app_handle: AppHandle,
    query: String,
    texts: Vec<String>,
) -> Result<Vec<(usize, f32)>, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let model_arc = embeddings::get_or_init_model(&app_data_dir)
        .map_err(|e| format!("Failed to load model: {}", e))?;
    
    let mut model = model_arc.lock()
        .map_err(|e| format!("Failed to lock model: {}", e))?;
    
    let text_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    
    embeddings::rank_by_relevance(&mut model, &query, &text_refs)
        .map_err(|e| format!("Failed to calculate relevance: {}", e))
}

/// Gera embedding para um texto
#[command]
fn generate_embedding(
    app_handle: AppHandle,
    text: String,
) -> Result<Vec<f32>, String> {
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let model_arc = embeddings::get_or_init_model(&app_data_dir)
        .map_err(|e| format!("Failed to load model: {}", e))?;
    
    let mut model = model_arc.lock()
        .map_err(|e| format!("Failed to lock model: {}", e))?;
    
    model.embed(&text)
        .map_err(|e| format!("Failed to generate embedding: {}", e))
}

/// Poda o contexto mantendo apenas os parágrafos mais relevantes
#[command]
fn prune_context(
    app_handle: AppHandle,
    query: String,
    context: String,
    max_tokens: Option<usize>,
    min_score: Option<f32>,
) -> Result<String, String> {
    let max_tokens = max_tokens.unwrap_or(2000);
    let min_score = min_score.unwrap_or(0.3);
    
    let app_data_dir = app_handle.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Tentar usar embeddings se modelo disponível
    if embeddings::is_model_available(&app_data_dir) {
        let model_arc = embeddings::get_or_init_model(&app_data_dir)
            .map_err(|e| format!("Failed to load model: {}", e))?;
        
        let mut model = model_arc.lock()
            .map_err(|e| format!("Failed to lock model: {}", e))?;
        
        embeddings::prune_context(&mut model, &query, &context, max_tokens, min_score)
            .map_err(|e| format!("Failed to prune context: {}", e))
    } else {
        // Fallback para BM25-like
        log::info!("[PruneContext] Using BM25 fallback (embedding model not available)");
        Ok(embeddings::prune_context_bm25(&query, &context, max_tokens))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Verificação de instância única usando lock file
<<<<<<< HEAD
  // Em modo de desenvolvimento, desabilitar para permitir múltiplas instâncias durante debug
  #[cfg(not(debug_assertions))]
  {
    let lock_file_path = dirs::data_local_dir()
      .map(|mut path| {
        path.push("OllaHub");
        std::fs::create_dir_all(&path).ok();
        path.push("ollahub.lock");
        path
      });
    
    if let Some(lock_path) = lock_file_path {
      // Tentar criar lock file exclusivo
      // No Windows, isso falhará se o arquivo já existir e estiver em uso
      // No Unix, podemos usar flock ou similar
      #[cfg(unix)]
      {
        use std::fs::OpenOptions;
        use std::os::unix::fs::OpenOptionsExt;
        // Tentar remover lock file antigo se existir (pode ser de processo que não encerrou corretamente)
        let _ = std::fs::remove_file(&lock_path);
        
        if let Ok(file) = OpenOptions::new()
          .write(true)
          .create_new(true)
          .open(&lock_path)
        {
          // Lock file criado com sucesso - manter aberto durante a execução
          std::mem::forget(file); // Manter arquivo aberto
        } else {
          eprintln!("OllaHub já está em execução. Encerrando...");
          std::process::exit(1);
        }
      }
      
      #[cfg(windows)]
      {
        use std::fs::OpenOptions;
        // Tentar remover lock file antigo se existir (pode ser de processo que não encerrou corretamente)
        // No Windows, se o arquivo estiver em uso por outro processo, remove_file falhará silenciosamente
        let _ = std::fs::remove_file(&lock_path);
        
        // Aguardar um pouco para garantir que o arquivo foi liberado
        std::thread::sleep(std::time::Duration::from_millis(100));
        
        if let Ok(_file) = OpenOptions::new()
          .write(true)
          .create_new(true)
          .open(&lock_path)
        {
          // Lock file criado com sucesso
        } else {
          // Verificar se há processo realmente rodando antes de encerrar
          // Se não conseguir criar o lock, pode ser que o arquivo ainda esteja sendo usado
          // ou que haja outra instância rodando
          eprintln!("OllaHub já está em execução. Encerrando...");
          std::process::exit(1);
        }
=======
  let lock_file_path = dirs::data_local_dir()
    .map(|mut path| {
      path.push("OllaHub");
      std::fs::create_dir_all(&path).ok();
      path.push("ollahub.lock");
      path
    });
  
  if let Some(lock_path) = lock_file_path {
    // Tentar criar lock file exclusivo
    // No Windows, isso falhará se o arquivo já existir e estiver em uso
    // No Unix, podemos usar flock ou similar
    #[cfg(unix)]
    {
      use std::fs::OpenOptions;
      use std::os::unix::fs::OpenOptionsExt;
      if let Ok(file) = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
      {
        // Lock file criado com sucesso - manter aberto durante a execução
        std::mem::forget(file); // Manter arquivo aberto
      } else {
        eprintln!("OllaHub já está em execução. Encerrando...");
        std::process::exit(1);
      }
    }
    
    #[cfg(windows)]
    {
      use std::fs::OpenOptions;
      if let Ok(_file) = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
      {
        // Lock file criado com sucesso
      } else {
        eprintln!("OllaHub já está em execução. Encerrando...");
        std::process::exit(1);
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      }
    }
  }
  
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
      
      // Plugin de atualização automática
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      
<<<<<<< HEAD
      // Copiar recursos do bundle para AppData no primeiro run
      let app_handle_setup = app.handle().clone();
      let window_setup = app.get_webview_window("main");
      tauri::async_runtime::spawn(async move {
        // Aguardar um pouco para o app inicializar completamente
        tokio::time::sleep(Duration::from_secs(1)).await;
        
        if let Err(e) = setup_bundle_resources(&app_handle_setup, window_setup.as_ref()).await {
          log::warn!("Erro ao configurar recursos do bundle: {}", e);
        }
      });
      
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      // Modificar comportamento de fechar janela (ocultar ao invés de fechar)
      if let Some(window) = app.get_webview_window("main") {
        let window_clone = window.clone();
        let app_handle_cleanup = app.handle().clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Limpar processos filhos antes de esconder
                if let Err(e) = cleanup_all_child_processes(&app_handle_cleanup) {
                    log::warn!("Erro durante cleanup de processos: {}", e);
                }
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
      
      // Inicializar Ollama Process State
      let ollama_process_state: OllamaProcessState = Arc::new(Mutex::new(None));
      app.manage(ollama_process_state.clone());
      
      // Inicializar Ollama automaticamente se estiver instalado
      let app_handle_ollama = app.handle().clone();
      tauri::async_runtime::spawn(async move {
          // Aguardar um pouco para o app inicializar completamente
          tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
          
          // Tentar iniciar Ollama automaticamente
          if let Some(ollama_state) = app_handle_ollama.try_state::<OllamaProcessState>() {
              if let Err(e) = auto_start_ollama(ollama_state).await {
                  log::warn!("Falha ao iniciar Ollama automaticamente: {}", e);
              }
          } else {
              log::warn!("OllamaProcessState não encontrado no app state");
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
      app.manage(monitor_state.clone());
<<<<<<< HEAD

      // Inicializar ScraperState com AppData dir
      let app_data_dir = app.path().app_data_dir()
        .map_err(|e| {
          let msg = format!("Failed to get app data dir: {}", e);
          log::warn!("{}", msg);
          msg
        })?;
      let scraper_state = scraper_state::ScraperState::new(app_data_dir);
      app.manage(scraper_state);
      
      // Inicializar LlamaCppState
      let llama_cpp_state = llama_cpp_state::LlamaCppState::new();
      app.manage(llama_cpp_state);
      
      // Iniciar monitoramento de saúde do sistema
      if let Err(e) = start_health_monitor(app.handle().clone()) {
        log::warn!("Falha ao iniciar monitor de saúde: {}", e);
=======
      
      // Iniciar monitoramento de saúde do sistema
      if let Err(e) = start_health_monitor(app.handle().clone()) {
          log::warn!("Falha ao iniciar monitor de saúde: {}", e);
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
      }
      
      Ok(())
    })
    .manage(Arc::new(Mutex::new(HashMap::<String, Arc<Mutex<()>>>::new())) as FileLockMap)
    .manage(DownloadState { current_task: AsyncMutex::new(None) })
    .manage(ProcessingState::new())
    .invoke_handler(tauri::generate_handler![
        chat_stream,
        stop_processing,
        get_processing_status,
        check_ollama_installed_command, 
        check_ollama_running,
        check_ollama_heartbeat,
        get_system_specs,
        get_operating_system,
        check_if_model_installed_command,
        pull_model,
        cancel_download,
        install_gguf_model,
        save_temp_file,
        open_gguf_file_dialog,
        start_ollama_server,
        start_system_monitor,
        start_health_monitor,
        get_gpu_stats,
        list_local_models,
        list_local_gguf_models,
        delete_model,
        save_chat_session,
        load_chat_sessions,
        toggle_devtools,
        search_chat_sessions,
        load_chat_history,
        load_chat_history_paginated,
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
        cancel_scraping,
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
        classify_intent,
<<<<<<< HEAD
        generate_completion,
        generate_chat_completion,
        get_ollama_tags,
        get_ollama_model_info,
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        // Embeddings commands
        download_embedding_model,
        is_embedding_model_available,
        calculate_relevance_scores,
        generate_embedding,
<<<<<<< HEAD
        prune_context,
        // Setup commands
        get_setup_state_command,
        check_chocolatey_installed_command,
        install_chocolatey_command,
        install_ollama_choco_command,
        install_ollama_silently_command,
        download_default_model_command,
        verify_ollama_integrity_command,
        // Hugging Face commands
        download_gguf_model,
        list_huggingface_gguf_models,
        // SearXNG commands
        check_docker_available,
        check_docker_running,
        check_docker_requirements,
        install_docker,
        validate_docker_installation,
        fix_docker_requirements,
        install_searxng,
        start_searxng,
        stop_searxng,
        check_searxng_status,
        get_searxng_logs,
        open_url
=======
        prune_context
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    ])
    .manage(Arc::new(Mutex::new(HashMap::<String, McpProcessHandle>::new())) as McpProcessMap)
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
// Download task state for cancellation
pub struct DownloadState {
    pub current_task: AsyncMutex<Option<TauriJoinHandle<()>>>,
}
#[command]
async fn cancel_download(window: WebviewWindow, state: State<'_, DownloadState>) -> Result<(), String> {
    if let Some(handle) = state.current_task.lock().await.take() {
        handle.abort();
        let _ = window.emit("download-progress", serde_json::json!({
            "status": "cancelled",
            "percent": null,
            "downloaded": null,
            "total": null,
            "speed": null,
            "raw": "cancelled"
        }));
    }
    Ok(())
}

pub struct ProcessingState {
    pub sessions: AsyncMutex<HashMap<String, TauriJoinHandle<()>>>,
    pub status: AsyncMutex<HashMap<String, (String, DateTime<Utc>)>>, 
}

impl ProcessingState {
    pub fn new() -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
            status: AsyncMutex::new(HashMap::new()),
        }
    }
}

#[derive(serde::Serialize, Clone)]
struct ProcessingStatusEvent {
    session_id: String,
    status: String,
}

#[command]
async fn stop_processing(window: WebviewWindow, state: State<'_, ProcessingState>, session_id: String) -> Result<(), String> {
    let mut map = state.sessions.lock().await;
    if let Some(handle) = map.remove(&session_id) {
        handle.abort();
        {
            let mut status = state.status.lock().await;
            status.insert(session_id.clone(), ("stopped".to_string(), Utc::now()));
        }
        let _ = window.emit("processing-status", &ProcessingStatusEvent { session_id: session_id.clone(), status: "stopped".to_string() });
        let _ = window.emit("chat-token", &ChatTokenEvent { session_id, content: String::new(), done: true });
    }
    Ok(())
}

#[command]
fn check_docker_available() -> Result<bool, String> {
    check_docker_available_impl().map_err(|e| e.to_string())
}

#[command]
fn check_docker_running() -> Result<bool, String> {
    check_docker_running_impl().map_err(|e| e.to_string())
}

#[command]
fn check_docker_requirements() -> Result<docker_requirements::SystemRequirements, String> {
    docker_requirements::check_system_requirements()
        .map_err(|e| e.to_string())
}

#[command]
async fn install_docker(app_handle: AppHandle) -> Result<(), String> {
    let os = get_operating_system();
    docker_installer::install_docker(app_handle, &os).await
        .map_err(|e| e.to_string())
}

#[command]
fn validate_docker_installation() -> Result<docker_validator::ValidationResult, String> {
    docker_validator::validate_docker_installation()
        .map_err(|e| e.to_string())
}

#[command]
async fn fix_docker_requirements(
    app_handle: AppHandle,
    os: String,
    issues: Vec<String>,
) -> Result<(), String> {
    docker_fix::fix_system_requirements(app_handle, &os, &issues).await
        .map_err(|e| e.to_string())
}

#[command]
async fn install_searxng(app_handle: AppHandle, url: String, port: u16) -> Result<(), String> {
    searxng_manager::install_searxng_with_progress(Some(&app_handle), &url, port).await
        .map_err(|e| e.to_string())
}

#[command]
async fn start_searxng() -> Result<(), String> {
    start_searxng_impl().await.map_err(|e| e.to_string())
}

#[command]
async fn stop_searxng() -> Result<(), String> {
    stop_searxng_impl().await.map_err(|e| e.to_string())
}

#[command]
async fn check_searxng_status(url: String) -> Result<bool, String> {
    check_searxng_status_impl(&url).await.map_err(|e| e.to_string())
}

#[command]
fn get_searxng_logs(lines: Option<usize>) -> Result<Vec<String>, String> {
    get_searxng_logs_impl(lines.unwrap_or(50)).map_err(|e| e.to_string())
}

#[command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    Ok(())
}

#[command]
async fn get_processing_status(state: State<'_, ProcessingState>, session_id: Option<String>) -> Result<serde_json::Value, String> {
    let status = state.status.lock().await;
    if let Some(id) = session_id {
        if let Some((s, ts)) = status.get(&id) {
            return Ok(serde_json::json!({"session_id": id, "status": s, "timestamp": ts}));
        }
        return Ok(serde_json::json!({"session_id": id, "status": "unknown"}));
    }
    let list: Vec<serde_json::Value> = status.iter().map(|(id, (s, ts))| serde_json::json!({"session_id": id, "status": s, "timestamp": ts})).collect();
    Ok(serde_json::json!(list))
}
