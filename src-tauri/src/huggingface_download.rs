use std::path::{Path, PathBuf};
use std::fs;
use std::io::Write;
use serde::{Deserialize, Serialize};
use reqwest::Client;
use sha2::{Sha256, Digest};
use regex::Regex;
use tauri::{AppHandle, WebviewWindow, Emitter};
use futures_util::StreamExt;
use crate::models_dir;

/// Modelo GGUF disponível no Hugging Face
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HuggingFaceModel {
    pub id: String,
    pub filename: String,
    pub size: u64,
    pub quantization: String,
    pub sha256: Option<String>,
    pub repo_owner: String,
    pub repo_name: String,
}

/// Cache de metadados do Hugging Face
#[derive(Debug, Serialize, Deserialize)]
struct HuggingFaceCache {
    models: Vec<HuggingFaceModel>,
    last_updated: String, // ISO8601
}

const MAX_RETRIES: u32 = 3;
const RATE_LIMIT_BACKOFF: u64 = 60; // segundos
const CACHE_TTL_HOURS: i64 = 1;

/// Extrai quantização do filename usando regex corrigido
fn extract_quantization(filename: &str) -> Option<String> {
    let re = Regex::new(r"[._-](Q\d+_?[KM]?_?[MS]?|[FI]P?\d+)[._-]").ok()?;
    
    re.captures(filename)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// Faz requisição HTTP com retry e rate limiting
async fn fetch_with_retry(url: &str) -> Result<reqwest::Response, String> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    for attempt in 0..MAX_RETRIES {
        match client.get(url).send().await {
            Ok(resp) if resp.status() == 429 => {
                // Rate limited - usar Retry-After header
                let retry_after = resp
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(RATE_LIMIT_BACKOFF);
                
                log::warn!("Rate limited, retrying after {} seconds", retry_after);
                tokio::time::sleep(std::time::Duration::from_secs(retry_after)).await;
                continue;
            }
            Ok(resp) => return Ok(resp),
            Err(e) if attempt < MAX_RETRIES - 1 => {
                let backoff = 2u64.pow(attempt);
                log::warn!("Request failed (attempt {}), retrying in {}s: {}", attempt + 1, backoff, e);
                tokio::time::sleep(std::time::Duration::from_secs(backoff)).await;
            }
            Err(e) => return Err(format!("Request failed after {} attempts: {}", MAX_RETRIES, e)),
        }
    }
    
    Err("Max retries exceeded".to_string())
}

/// Valida SHA256 de um arquivo
fn validate_sha256(path: &Path, expected_sha256: &str) -> Result<(), String> {
    use std::io::Read;
    
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file for validation: {}", e))?;
    
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8192];
    
    loop {
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }
    
    let hash = format!("{:x}", hasher.finalize());
    
    if hash.to_lowercase() != expected_sha256.to_lowercase() {
        return Err(format!(
            "SHA256 mismatch: expected {}, got {}",
            expected_sha256, hash
        ));
    }
    
    Ok(())
}

/// Busca SHA256 de um arquivo no Hugging Face
async fn fetch_sha256_from_hf(model_id: &str, filename: &str) -> Result<Option<String>, String> {
    // API do Hugging Face para obter SHA256
    // Nota: Esta API pode não estar disponível para todos os arquivos
    let url = format!("https://huggingface.co/api/models/{}/tree/main", model_id);
    
    let response = fetch_with_retry(&url).await?;
    
    if !response.status().is_success() {
        return Ok(None); // SHA256 não disponível
    }
    
    let tree: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    // Procurar pelo arquivo no tree
    if let Some(files) = tree.get("siblings").and_then(|s| s.as_array()) {
        for file in files {
            if let Some(path) = file.get("rfilename").and_then(|p| p.as_str()) {
                if path == filename {
                    // Tentar obter SHA256 (pode não estar disponível)
                    if let Some(sha256) = file.get("sha256").and_then(|s| s.as_str()) {
                        return Ok(Some(sha256.to_string()));
                    }
                }
            }
        }
    }
    
    Ok(None)
}

/// Baixa um modelo GGUF do Hugging Face com streaming de progresso
pub async fn download_gguf_model(
    app_handle: AppHandle,
    model_id: String,
    filename: String,
    window: Option<WebviewWindow>,
) -> Result<PathBuf, String> {
    // Extrair repo_owner e repo_name do model_id
    let parts: Vec<&str> = model_id.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid model_id format. Expected 'owner/repo'".to_string());
    }
    let repo_owner = parts[0];
    let repo_name = parts[1];
    
    // Extrair quantização do filename
    let quantization = extract_quantization(&filename)
        .unwrap_or_else(|| "unknown".to_string());
    
    // Obter diretório de destino
    let model_dir = models_dir::get_model_dir(&app_handle, repo_owner, repo_name, &quantization)?;
    let dest_path = model_dir.join(&filename);
    
    // Verificar se arquivo já existe
    if dest_path.exists() {
        log::info!("Model already exists at {}", dest_path.display());
        return Ok(dest_path);
    }
    
    // URL de download do Hugging Face
    let download_url = format!("https://huggingface.co/{}/resolve/main/{}", model_id, filename);
    
    // Buscar SHA256 se disponível
    let sha256 = fetch_sha256_from_hf(&model_id, &filename).await?;
    
    // Criar arquivo temporário para download
    let temp_path = dest_path.with_extension("tmp");
    
    // Verificar se há download parcial para resumir
    let mut start_pos = 0u64;
    if temp_path.exists() {
        start_pos = fs::metadata(&temp_path)
            .map_err(|e| format!("Failed to get temp file size: {}", e))?
            .len();
        log::info!("Resuming download from byte {}", start_pos);
    }
    
    // Fazer download com streaming
    let response = fetch_with_retry(&download_url).await?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let total_size = response.content_length().unwrap_or(0);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&temp_path)
        .map_err(|e| format!("Failed to open temp file: {}", e))?;
    
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = start_pos;
    let mut last_update = std::time::Instant::now();
    
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {}", e))?;
        
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        downloaded += chunk.len() as u64;
        
        // Emitir progresso a cada segundo
        if last_update.elapsed().as_secs() >= 1 {
            let percent = if total_size > 0 {
                Some(((downloaded as f64 / total_size as f64) * 100.0) as u8)
            } else {
                None
            };
            
            // Criar evento de progresso compatível com o formato existente
            let progress_json = serde_json::json!({
                "status": "downloading",
                "percent": percent,
                "downloaded": format_bytes(downloaded),
                "total": if total_size > 0 { format_bytes(total_size) } else { "".to_string() },
                "speed": null,
                "raw": format!("downloaded: {} / {}", downloaded, total_size)
            });
            
            if let Some(w) = &window {
                let _ = w.emit("download-progress", progress_json.to_string());
            }
            
            last_update = std::time::Instant::now();
        }
    }
    
    // Mover arquivo temporário para destino final
    fs::rename(&temp_path, &dest_path)
        .map_err(|e| format!("Failed to move temp file: {}", e))?;
    
    // Validar SHA256 se disponível
    if let Some(expected_sha256) = &sha256 {
        log::info!("Validating SHA256 for {}", filename);
        validate_sha256(&dest_path, expected_sha256)?;
        log::info!("SHA256 validation passed");
    } else {
        log::warn!("SHA256 not available for {}, skipping validation", filename);
    }
    
    // Emitir sucesso
    let success_progress = serde_json::json!({
        "status": "success",
        "percent": 100,
        "downloaded": format_bytes(downloaded),
        "total": if total_size > 0 { format_bytes(total_size) } else { "".to_string() },
        "speed": null,
        "raw": "success"
    });
    
    if let Some(w) = &window {
        let _ = w.emit("download-progress", success_progress.to_string());
    }
    
    Ok(dest_path)
}

/// Lista modelos GGUF disponíveis no Hugging Face
pub async fn list_huggingface_gguf_models(
    app_handle: &AppHandle,
    query: Option<String>,
    quantization: Option<String>,
) -> Result<Vec<HuggingFaceModel>, String> {
    // Verificar cache primeiro
    let cache_path = models_dir::get_cache_dir(app_handle)?
        .join("huggingface_models.json");
    
    // Tentar carregar cache
    if let Ok(cache) = load_cache(&cache_path) {
        let cache_age = chrono::DateTime::parse_from_rfc3339(&cache.last_updated)
            .ok()
            .and_then(|dt| {
                let now = chrono::Utc::now();
                let cache_time = dt.with_timezone(&chrono::Utc);
                Some((now - cache_time).num_hours())
            });
        
        if let Some(age) = cache_age {
            if age < CACHE_TTL_HOURS {
                log::info!("Using cached models (age: {} hours)", age);
                return Ok(filter_models(cache.models, query, quantization));
            }
        }
    }
    
    // Buscar modelos do Hugging Face
    let search_url = if let Some(q) = &query {
        format!("https://huggingface.co/api/models?search={}&filter=gguf", q)
    } else {
        "https://huggingface.co/api/models?filter=gguf".to_string()
    };
    
    let response = fetch_with_retry(&search_url).await?;
    
    if !response.status().is_success() {
        return Err(format!("API request failed with status: {}", response.status()));
    }
    
    let models_json: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    let mut models = Vec::new();
    
    // Processar resultados
    if let Some(items) = models_json.as_array() {
        for item in items {
            if let Some(model_id) = item.get("id").and_then(|i| i.as_str()) {
                // Buscar arquivos GGUF no repositório
                if let Ok(repo_models) = fetch_repo_gguf_files(model_id).await {
                    models.extend(repo_models);
                }
            }
        }
    }
    
    // Salvar cache
    let cache = HuggingFaceCache {
        models: models.clone(),
        last_updated: chrono::Utc::now().to_rfc3339(),
    };
    
    if let Err(e) = save_cache(&cache_path, &cache) {
        log::warn!("Failed to save cache: {}", e);
    }
    
    Ok(filter_models(models, query, quantization))
}

/// Busca arquivos GGUF em um repositório específico
async fn fetch_repo_gguf_files(model_id: &str) -> Result<Vec<HuggingFaceModel>, String> {
    let url = format!("https://huggingface.co/api/models/{}/tree/main", model_id);
    let response = fetch_with_retry(&url).await?;
    
    if !response.status().is_success() {
        return Ok(Vec::new()); // Repositório não encontrado ou sem acesso
    }
    
    let tree: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    let parts: Vec<&str> = model_id.split('/').collect();
    let repo_owner = parts.get(0).unwrap_or(&"unknown").to_string();
    let repo_name = parts.get(1).unwrap_or(&"unknown").to_string();
    
    let mut models = Vec::new();
    
    if let Some(files) = tree.get("siblings").and_then(|s| s.as_array()) {
        for file in files {
            if let Some(path) = file.get("rfilename").and_then(|p| p.as_str()) {
                if path.ends_with(".gguf") {
                    let size = file.get("size").and_then(|s| s.as_u64()).unwrap_or(0);
                    let quantization = extract_quantization(path)
                        .unwrap_or_else(|| "unknown".to_string());
                    let sha256 = file.get("sha256").and_then(|s| s.as_str()).map(|s| s.to_string());
                    
                    models.push(HuggingFaceModel {
                        id: model_id.to_string(),
                        filename: path.to_string(),
                        size,
                        quantization,
                        sha256,
                        repo_owner: repo_owner.clone(),
                        repo_name: repo_name.clone(),
                    });
                }
            }
        }
    }
    
    Ok(models)
}

/// Filtra modelos por query e quantização
fn filter_models(
    models: Vec<HuggingFaceModel>,
    query: Option<String>,
    quantization: Option<String>,
) -> Vec<HuggingFaceModel> {
    models
        .into_iter()
        .filter(|m| {
            if let Some(q) = &query {
                m.id.to_lowercase().contains(&q.to_lowercase()) ||
                m.filename.to_lowercase().contains(&q.to_lowercase())
            } else {
                true
            }
        })
        .filter(|m| {
            if let Some(quant) = &quantization {
                m.quantization.to_lowercase() == quant.to_lowercase()
            } else {
                true
            }
        })
        .collect()
}

/// Carrega cache de metadados
fn load_cache(path: &Path) -> Result<HuggingFaceCache, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read cache: {}", e))?;
    
    let cache: HuggingFaceCache = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cache: {}", e))?;
    
    Ok(cache)
}

/// Salva cache de metadados
fn save_cache(path: &Path, cache: &HuggingFaceCache) -> Result<(), String> {
    let content = serde_json::to_string_pretty(cache)
        .map_err(|e| format!("Failed to serialize cache: {}", e))?;
    
    fs::write(path, content)
        .map_err(|e| format!("Failed to write cache: {}", e))?;
    
    Ok(())
}

/// Formata bytes em formato legível
fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.2} {}", size, UNITS[unit_index])
}
