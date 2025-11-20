use std::process::{Command, Stdio, Child};
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;
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

use web_scraper::{ScrapedContent, create_browser, search_and_scrape, search_and_scrape_with_config, scrape_url, SearchConfig};
use headless_chrome::Browser;
use scheduler::{SentinelTask, SchedulerService, SchedulerState, TaskAction};
use sources_config::{SourcesConfig, load_sources_config, save_sources_config};
use system_monitor::{SystemStats, SystemMonitorState};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct Message {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
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
    let chats_dir = get_chats_dir(&app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", id));
    
    if !file_path.exists() {
        return Err("Session not found".to_string());
    }
    
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;
        
    let session: ChatSession = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session: {}", e))?;
        
    Ok(session.messages)
}

#[command]
fn delete_chat_session(app_handle: AppHandle, id: String) -> Result<(), String> {
    let chats_dir = get_chats_dir(&app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", id));
    
    if file_path.exists() {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
    }
    
    Ok(())
}

#[command]
fn get_system_specs() -> SystemSpecs {
    let mut sys = System::new_all();
    sys.refresh_all();

    SystemSpecs {
        total_memory: sys.total_memory(),
        cpu_count: sys.cpus().len(),
        os_name: System::name().unwrap_or("Unknown".to_string()),
    }
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

#[command]
async fn pull_model(window: Window, name: String) -> Result<(), String> {
    let mut child = Command::new("ollama")
        .arg("pull")
        .arg(&name)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        match line {
            Ok(l) => {
                window.emit("download-progress", l).unwrap_or(());
            }
            Err(_) => break,
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        Ok(())
    } else {
        Err("Failed to pull model".to_string())
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

#[command]
fn start_ollama_server() -> Result<(), String> {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(target_os = "windows")]
    {
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
        return Ok(browser.clone());
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
    let chats_dir = get_chats_dir(&app_handle)?;
    
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
    
    log::info!("Deleted {} chat session files", deleted_count);
    Ok(())
}

/// Retorna o caminho do diretório de dados do app
#[command]
fn get_app_data_dir(app_handle: AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(format!("{}", app_data_dir.display()))
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
        check_ollama_installed, 
        check_ollama_running,
        get_system_specs,
        check_if_model_installed,
        pull_model,
        start_ollama_server,
        start_system_monitor,
        list_local_models,
        delete_model,
        save_chat_session,
        load_chat_sessions,
        load_chat_history,
        delete_chat_session,
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
        reset_browser,
        force_kill_browser,
        export_chat_sessions,
        export_all_data,
        clear_chat_history,
        get_app_data_dir,
        load_sources_config_command,
        save_sources_config_command,
        get_recent_logs,
        get_system_stats,
        create_task,
        list_tasks,
        update_task,
        delete_task,
        toggle_task
    ])
    .manage(Arc::new(Mutex::new(HashMap::<String, McpProcessHandle>::new())) as McpProcessMap)
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
