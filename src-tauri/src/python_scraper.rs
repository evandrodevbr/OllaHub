use anyhow::Result;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::timeout;

// Estrutura para retornar conteúdo scraped do Python
// Evita dependência circular com web_scraper::ScrapedContent
pub struct PythonScrapedContent {
    pub title: String,
    pub url: String,
    pub content: String,
    pub markdown: String,
}

// Estrutura para resultados de busca via scraping
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct PythonSearchResult {
    pub url: String,
    pub title: String,
    pub content: String,
    pub engine: String,
    pub score: f64,
}

/// Timeout para operações de scraping (15 segundos - otimizado)
const SCRAPE_TIMEOUT: Duration = Duration::from_secs(15);
/// Timeout inicial mais curto para primeira tentativa (8 segundos)
const SCRAPE_TIMEOUT_INITIAL: Duration = Duration::from_secs(8);

/// Resposta JSON do script Python
#[derive(serde::Deserialize, Debug)]
struct PythonResponse {
    #[serde(rename = "type")]
    response_type: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    markdown: Option<String>,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    results: Option<Vec<PythonSearchResult>>,
    #[serde(default)]
    number_of_results: Option<usize>,
}

/// Gerenciador de processo Python persistente para scraping
pub struct PythonScraper {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<Arc<std::sync::Mutex<BufReader<ChildStdout>>>>,
    script_path: PathBuf,
}

impl PythonScraper {
    /// Cria uma nova instância do PythonScraper e spawna o processo Python
    pub fn new() -> Result<Self> {
        let script_path = Self::resolve_script_path()?;
        
        log::info!("[PythonScraper] Initializing with script: {}", script_path.display());
        
        let mut scraper = Self {
            child: None,
            stdin: None,
            stdout: None,
            script_path,
        };
        
        scraper.spawn_process()?;
        
        Ok(scraper)
    }
    
    /// Resolve o caminho do script Python baseado no engine configurado
    fn resolve_script_path() -> Result<PathBuf> {
        // Verificar variável de ambiente para escolher engine
        // Nodriver é mais rápido e anti-detecção, então é o padrão
        let engine = std::env::var("SCRAPER_ENGINE").unwrap_or_else(|_| "nodriver".to_string());
        let script_name = if engine == "nodriver" {
            "scraper_nodriver.py"
        } else {
            "scraper.py"
        };
        
        Self::resolve_script_path_with_name(script_name)
    }
    
    /// Resolve o caminho do script Python com nome específico
    fn resolve_script_path_with_name(script_name: &str) -> Result<PathBuf> {
        // Estratégia 1: Tentar encontrar em relação ao executável
        // Em desenvolvimento: target/debug/app.exe -> subir para raiz -> src-tauri/scripts/scraper.py
        if let Ok(exe_path) = std::env::current_exe() {
            let mut current_dir = exe_path.parent();
            
            // Subir até 5 níveis para encontrar src-tauri/scripts/scraper.py
            // Exemplo: target/debug/app.exe -> target/debug -> target -> root -> src-tauri/scripts
            for level in 0..5 {
                if let Some(dir) = current_dir {
                    // Tentar src-tauri/scripts/{script_name} (desenvolvimento)
                    let src_tauri_scripts = dir.join("src-tauri").join("scripts").join(script_name);
                    if src_tauri_scripts.exists() {
                        log::info!("[PythonScraper] Found script at level {}: {}", level, src_tauri_scripts.display());
                        return Ok(src_tauri_scripts);
                    }
                    
                    // Tentar scripts/{script_name} (produção/bundle)
                    let scripts_path = dir.join("scripts").join(script_name);
                    if scripts_path.exists() {
                        log::info!("[PythonScraper] Found script at level {}: {}", level, scripts_path.display());
                        return Ok(scripts_path);
                    }
                    
                    // Subir um nível
                    current_dir = dir.parent();
                } else {
                    break;
                }
            }
        }
        
        // Estratégia 2: Tentar usando diretório de trabalho atual
        if let Ok(cwd) = std::env::current_dir() {
            // Se CWD é a raiz do projeto
            let cwd_script = cwd.join("src-tauri").join("scripts").join(script_name);
            if cwd_script.exists() {
                log::info!("[PythonScraper] Found script at (CWD root): {}", cwd_script.display());
                return Ok(cwd_script);
            }
            
            // Se CWD é src-tauri
            let relative_script = cwd.join("scripts").join(script_name);
            if relative_script.exists() {
                log::info!("[PythonScraper] Found script at (CWD src-tauri): {}", relative_script.display());
                return Ok(relative_script);
            }
            
            // Tentar subir do CWD também
            let mut cwd_parent = cwd.parent();
            for _ in 0..3 {
                if let Some(parent) = cwd_parent {
                    let parent_script = parent.join("src-tauri").join("scripts").join(script_name);
                    if parent_script.exists() {
                        log::info!("[PythonScraper] Found script at (CWD parent): {}", parent_script.display());
                        return Ok(parent_script);
                    }
                    cwd_parent = parent.parent();
                } else {
                    break;
                }
            }
        }
        
        // Estratégia 3: Tentar variável de ambiente CARGO_MANIFEST_DIR (runtime)
        if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
            let manifest_path = PathBuf::from(&manifest_dir);
            let script = manifest_path.join("scripts").join(script_name);
            if script.exists() {
                log::info!("[PythonScraper] Found script at (CARGO_MANIFEST_DIR): {}", script.display());
                return Ok(script);
            }
        }
        
        // Estratégia 4: Tentar caminho absoluto construído a partir do executável
        // Se executável está em target/debug/app.exe, precisamos subir 3 níveis
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                // Construir caminho absoluto: subir até encontrar src-tauri
                let mut search_dir = exe_dir.to_path_buf();
                for _ in 0..6 {
                    let test_path = search_dir.join("src-tauri").join("scripts").join(script_name);
                    if test_path.exists() {
                        log::info!("[PythonScraper] Found script at (absolute from exe): {}", test_path.display());
                        return Ok(test_path);
                    }
                    if let Some(parent) = search_dir.parent() {
                        search_dir = parent.to_path_buf();
                    } else {
                        break;
                    }
                }
            }
        }
        
        // Estratégia 5: Tentar caminho relativo simples (se executado da raiz)
        let simple_path = PathBuf::from("src-tauri/scripts").join(script_name);
        if simple_path.exists() {
            log::info!("[PythonScraper] Found script at (simple): {}", simple_path.display());
            return Ok(simple_path);
        }
        
        // Log detalhado para debug
        let exe_info = std::env::current_exe()
            .map(|p| format!("{}", p.display()))
            .unwrap_or_else(|_| "unknown".to_string());
        let cwd_info = std::env::current_dir()
            .map(|p| format!("{}", p.display()))
            .unwrap_or_else(|_| "unknown".to_string());
        let manifest_info = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| "not set".to_string());
        
        Err(anyhow::anyhow!(
            "Could not find {} script.\n\
             Executable: {}\n\
             Current dir: {}\n\
             CARGO_MANIFEST_DIR: {}\n\
             Expected location: src-tauri/scripts/{}\n\
             Searched: relative to executable (up to 5 levels), current working directory, \
             CARGO_MANIFEST_DIR, file!() macro, and simple path.",
            script_name, exe_info, cwd_info, manifest_info, script_name
        ))
    }
    
    /// Spawna o processo Python
    fn spawn_process(&mut self) -> Result<()> {
        // Limpar processo anterior se existir
        self.cleanup();
        
        log::info!("[PythonScraper] Spawning Python process: {}", self.script_path.display());
        
        let mut cmd = Command::new("python");
        cmd.arg(&self.script_path);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        let mut child = cmd.spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn Python process: {}", e))?;
        
        let stdin = child.stdin.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdin"))?;
        
        let stdout = child.stdout.take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdout"))?;
        
        let stdout_reader = Arc::new(std::sync::Mutex::new(BufReader::new(stdout)));
        
        self.child = Some(child);
        self.stdin = Some(stdin);
        self.stdout = Some(stdout_reader);
        
        log::info!("[PythonScraper] Python process spawned successfully");
        
        Ok(())
    }
    
    /// Garante que o processo está vivo, reiniciando se necessário
    fn ensure_alive(&mut self) -> Result<()> {
        if let Some(ref mut child) = self.child {
            // Verificar se processo ainda está rodando (não bloqueia)
            if let Ok(Some(_)) = child.try_wait() {
                // Processo morreu
                log::warn!("[PythonScraper] Process died, restarting...");
                return self.restart();
            }
        } else {
            // Processo nunca foi criado
            return self.restart();
        }
        
        Ok(())
    }
    
    /// Reinicia o processo Python
    pub fn restart(&mut self) -> Result<()> {
        log::info!("[PythonScraper] Restarting Python process...");
        self.spawn_process()
    }
    
    /// Limpa recursos do processo anterior
    fn cleanup(&mut self) {
        if let Some(mut child) = self.child.take() {
            // Tentar terminar graciosamente
            let _ = child.kill();
            let _ = child.wait();
        }
        self.stdin = None;
        self.stdout = None;
    }
    
    /// Realiza scraping de uma URL usando o processo Python
    pub async fn scrape_url(&mut self, url: &str) -> Result<PythonScrapedContent> {
        // Garantir que processo está vivo
        self.ensure_alive()?;
        
        let stdin = self.stdin.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Stdin not available"))?;
        
        let stdout = self.stdout.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Stdout not available"))?
            .clone();
        
        // Preparar comando JSON
        let command = serde_json::json!({
            "command": "scrape",
            "url": url,
            "visible": false
        });
        
        let command_json = serde_json::to_string(&command)
            .map_err(|e| anyhow::anyhow!("Failed to serialize command: {}", e))?;
        
        log::debug!("[PythonScraper] Sending command: {}", command_json);
        
        // Enviar comando para stdin (síncrono, mas rápido)
        stdin.write_all(command_json.as_bytes())
            .map_err(|e| anyhow::anyhow!("Failed to write to stdin: {}", e))?;
        stdin.write_all(b"\n")
            .map_err(|e| anyhow::anyhow!("Failed to write newline to stdin: {}", e))?;
        stdin.flush()
            .map_err(|e| anyhow::anyhow!("Failed to flush stdin: {}", e))?;
        
        // Ler resposta do stdout com timeout progressivo (primeira tentativa mais curta)
        let stdout_arc = stdout.clone();
        let read_future = tokio::task::spawn_blocking(move || {
            let mut stdout_guard = stdout_arc.lock()
                .map_err(|e| anyhow::anyhow!("Failed to lock stdout: {}", e))?;
            let mut line = String::new();
            stdout_guard.read_line(&mut line)
                .map_err(|e| anyhow::anyhow!("Failed to read from stdout: {}", e))?;
            
            if line.is_empty() {
                return Err(anyhow::anyhow!("Empty response from Python script"));
            }
            
            Ok(line.trim().to_string())
        });
        
        // Tentativa 1: Timeout inicial mais curto (8s) para resposta rápida
        let response_line = match timeout(SCRAPE_TIMEOUT_INITIAL, read_future).await {
            Ok(Ok(Ok(line))) => line,
            Ok(Ok(Err(e))) => {
                log::error!("[PythonScraper] Error reading response: {}", e);
                return Err(e);
            }
            Ok(Err(e)) => {
                log::error!("[PythonScraper] Task error: {}", e);
                return Err(anyhow::anyhow!("Task error: {}", e));
            }
            Err(_) => {
                // Timeout inicial, tentar novamente com timeout maior
                log::debug!("[PythonScraper] Initial timeout ({}s), retrying with longer timeout...", SCRAPE_TIMEOUT_INITIAL.as_secs());
                
                // Segunda tentativa com timeout maior
                let stdout_arc2 = stdout.clone();
                let read_future2 = tokio::task::spawn_blocking(move || {
                    let mut stdout_guard = stdout_arc2.lock()
                        .map_err(|e| anyhow::anyhow!("Failed to lock stdout: {}", e))?;
                    let mut line = String::new();
                    stdout_guard.read_line(&mut line)
                        .map_err(|e| anyhow::anyhow!("Failed to read from stdout: {}", e))?;
                    
                    if line.is_empty() {
                        return Err(anyhow::anyhow!("Empty response from Python script"));
                    }
                    
                    Ok(line.trim().to_string())
                });
                
                match timeout(SCRAPE_TIMEOUT, read_future2).await {
                    Ok(Ok(Ok(line))) => line,
                    Ok(Ok(Err(e))) => {
                        log::error!("[PythonScraper] Error reading response (retry): {}", e);
                        return Err(e);
                    }
                    Ok(Err(e)) => {
                        log::error!("[PythonScraper] Task error (retry): {}", e);
                        return Err(anyhow::anyhow!("Task error: {}", e));
                    }
                    Err(_) => {
                        log::warn!("[PythonScraper] Timeout after retry ({}s), restarting process...", SCRAPE_TIMEOUT.as_secs());
                        self.restart()?;
                        return Err(anyhow::anyhow!("Timeout waiting for Python script response"));
                    }
                }
            }
        };
        
        log::debug!("[PythonScraper] Received response: {}", response_line);
        
        // Deserializar resposta JSON
        let response: PythonResponse = serde_json::from_str(&response_line)
            .map_err(|e| anyhow::anyhow!("Failed to parse JSON response: {} (response: {})", e, response_line))?;
        
        // Processar resposta
        match response.response_type.as_str() {
            "success" => {
                let title = response.title.unwrap_or_else(|| "Sem título".to_string());
                let url = response.url.unwrap_or_else(|| url.to_string());
                let content = response.content.unwrap_or_else(|| String::new());
                let markdown = response.markdown.unwrap_or_else(|| content.clone());
                
                Ok(PythonScrapedContent {
                    title,
                    url,
                    content,
                    markdown,
                })
            }
            "error" => {
                let error_msg = response.message.unwrap_or_else(|| "Unknown error".to_string());
                Err(anyhow::anyhow!("Python scraper error: {}", error_msg))
            }
            _ => {
                Err(anyhow::anyhow!("Unknown response type: {}", response.response_type))
            }
        }
    }

    /// Realiza busca no DuckDuckGo via Python
    pub async fn search_duckduckgo(
        &mut self, 
        keywords: &str, 
        region: &str, 
        safesearch: &str, 
        max_results: usize
    ) -> Result<Vec<PythonSearchResult>> {
        self.ensure_alive()?;
        
        let stdin = self.stdin.as_mut()
            .ok_or_else(|| anyhow::anyhow!("Stdin not available"))?;
        
        let stdout = self.stdout.as_ref()
            .ok_or_else(|| anyhow::anyhow!("Stdout not available"))?
            .clone();
        
        let command = serde_json::json!({
            "command": "search",
            "keywords": keywords,
            "region": region,
            "safesearch": safesearch,
            "max_results": max_results
        });
        
        let command_json = serde_json::to_string(&command)
            .map_err(|e| anyhow::anyhow!("Failed to serialize command: {}", e))?;
        
        log::debug!("[PythonScraper] Sending DDG search command: {}", command_json);
        
        stdin.write_all(command_json.as_bytes())
            .map_err(|e| anyhow::anyhow!("Failed to write to stdin: {}", e))?;
        stdin.write_all(b"\n")
            .map_err(|e| anyhow::anyhow!("Failed to write newline to stdin: {}", e))?;
        stdin.flush()
            .map_err(|e| anyhow::anyhow!("Failed to flush stdin: {}", e))?;
        
        let stdout_arc = stdout.clone();
        let read_future = tokio::task::spawn_blocking(move || {
            let mut stdout_guard = stdout_arc.lock()
                .map_err(|e| anyhow::anyhow!("Failed to lock stdout: {}", e))?;
            let mut line = String::new();
            stdout_guard.read_line(&mut line)
                .map_err(|e| anyhow::anyhow!("Failed to read from stdout: {}", e))?;
            
            if line.is_empty() {
                return Err(anyhow::anyhow!("Empty response from Python script"));
            }
            
            Ok(line.trim().to_string())
        });
        
        // Para busca DuckDuckGo, usar timeout padrão (não precisa de progressivo)
        let response_line = match timeout(SCRAPE_TIMEOUT, read_future).await {
            Ok(Ok(Ok(line))) => line,
            Ok(Ok(Err(e))) => {
                log::error!("[PythonScraper] Error reading response: {}", e);
                return Err(e);
            }
            Ok(Err(e)) => {
                log::error!("[PythonScraper] Task error: {}", e);
                return Err(anyhow::anyhow!("Task error: {}", e));
            }
            Err(_) => {
                log::warn!("[PythonScraper] Timeout reading response, restarting process...");
                self.restart()?;
                return Err(anyhow::anyhow!("Timeout waiting for Python script response"));
            }
        };
        
        log::debug!("[PythonScraper] Received search response: {}", response_line);
        
        let response: PythonResponse = serde_json::from_str(&response_line)
            .map_err(|e| anyhow::anyhow!("Failed to parse JSON response: {}", e))?;
            
        match response.response_type.as_str() {
            "success" => Ok(response.results.unwrap_or_default()),
            "error" => {
                let error_msg = response.message.unwrap_or_else(|| "Unknown error".to_string());
                Err(anyhow::anyhow!("Python scraper error: {}", error_msg))
            }
            _ => Err(anyhow::anyhow!("Unknown response type: {}", response.response_type))
        }
    }
}

impl Drop for PythonScraper {
    fn drop(&mut self) {
        self.cleanup();
    }
}

/// Instância global thread-safe do PythonScraper (lazy initialization)
static LAZY_PYTHON_SCRAPER: OnceLock<Arc<Mutex<PythonScraper>>> = OnceLock::new();

/// Obtém ou cria a instância global do PythonScraper
pub fn get_or_create_python_scraper() -> Result<Arc<Mutex<PythonScraper>>> {
    if let Some(scraper) = LAZY_PYTHON_SCRAPER.get() {
        return Ok(scraper.clone());
    }
    
    // Inicializar se ainda não foi inicializado
    let scraper = PythonScraper::new()?;
    let scraper_arc = Arc::new(Mutex::new(scraper));
    
    // Tentar inserir (pode falhar se outra thread inseriu primeiro)
    let result = LAZY_PYTHON_SCRAPER.set(scraper_arc.clone());
    if result.is_err() {
        // Outra thread já inicializou, usar a instância existente
        return Ok(LAZY_PYTHON_SCRAPER.get().unwrap().clone());
    }
    
    Ok(scraper_arc)
}

/// Limpa a instância do PythonScraper (para liberar recursos quando não em uso)
pub async fn clear_python_scraper() {
    if let Some(scraper_arc) = LAZY_PYTHON_SCRAPER.get() {
        let mut scraper = scraper_arc.lock().await;
        scraper.cleanup();
    }
}