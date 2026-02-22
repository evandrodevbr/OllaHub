use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use sha2::{Sha256, Digest};
use tokio::fs;
use std::io;
use chrono::{DateTime, Utc};
use url::Url;

/// Estrutura do conteúdo salvo em disco (JSON)
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CachedContent {
    pub url: String,
    pub domain: String,
    pub access_timestamp: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>, // TTL
    pub http_status: u16,
    pub title: String,
    pub content_markdown: String,
    pub metadata: serde_json::Value,
    pub raw_html_path: Option<String>,
}

pub struct ContentStore;

impl ContentStore {
    /// Retorna o diretório base do cache: app_data/scraping_cache
    pub fn get_cache_dir() -> PathBuf {
        // Caminho relativo ao diretório de execução ou base do projeto
        // Em produção, idealmente usaria dirs::data_local_dir()
        PathBuf::from("app_data").join("scraping_cache")
    }

    /// Gera o hash SHA256 da URL para usar como nome de arquivo
    fn get_url_hash(url: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(url.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Extrai o domínio da URL para particionamento de pastas
    fn get_domain(url: &str) -> String {
        Url::parse(url)
            .map(|u| u.domain().unwrap_or("unknown").to_string())
            .unwrap_or_else(|_| "unknown".to_string())
    }

    /// Recupera conteúdo do cache se existir e não expirado
    pub async fn get_cached_content(url: &str) -> Option<CachedContent> {
        let domain = Self::get_domain(url);
        let hash = Self::get_url_hash(url);
        let path = Self::get_cache_dir().join(domain).join(format!("{}.json", hash));

        if path.exists() {
             // Tenta ler e deserializar
             let path_clone = path.clone();
             if let Ok(content) = fs::read_to_string(&path).await {
                 if let Ok(data) = serde_json::from_str::<CachedContent>(&content) {
                     // Verificar se expirou
                     if let Some(expires_at) = &data.expires_at {
                         if *expires_at < Utc::now() {
                             // Cache expirado, deletar arquivo
                             let _ = fs::remove_file(&path_clone).await;
                             return None;
                         }
                     }
                     return Some(data);
                 }
             }
        }
        None
    }

    /// Salva conteúdo no cache com TTL
    pub async fn save_content(url: &str, title: &str, content_markdown: &str, meta: Option<serde_json::Value>) -> io::Result<()> {
        Self::save_content_with_ttl(url, title, content_markdown, meta, Some(168)).await // Default: 7 dias
    }

    /// Salva conteúdo no cache com TTL customizado (em horas)
    pub async fn save_content_with_ttl(
        url: &str,
        title: &str,
        content_markdown: &str,
        meta: Option<serde_json::Value>,
        ttl_hours: Option<u64>,
    ) -> io::Result<()> {
        let domain = Self::get_domain(url);
        let hash = Self::get_url_hash(url);
        let dir = Self::get_cache_dir().join(&domain);
        
        // Garante que o diretório do domínio existe
        if !dir.exists() {
            fs::create_dir_all(&dir).await?;
        }

        let path = dir.join(format!("{}.json", hash));
        
        let now = Utc::now();
        let expires_at = ttl_hours.map(|hours| now + chrono::Duration::hours(hours as i64));
        
        let data = CachedContent {
            url: url.to_string(),
            domain: domain,
            access_timestamp: now,
            expires_at,
            http_status: 200,
            title: title.to_string(),
            content_markdown: content_markdown.to_string(),
            metadata: meta.unwrap_or(serde_json::json!({})),
            raw_html_path: None,
        };

        let json = serde_json::to_string_pretty(&data)?;
        fs::write(path, json).await?;
        
        // Limpeza periódica: a cada 100 inserções, limpar expirados e aplicar LRU
        static INSERT_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let count = INSERT_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        
        if count % 100 == 0 {
            let _ = Self::cleanup_expired().await;
            let _ = Self::apply_lru_limit(10000).await; // Manter apenas 10k entradas mais recentes
        }
        
        Ok(())
    }

    /// Limpa entradas expiradas do cache
    pub async fn cleanup_expired() -> io::Result<usize> {
        let cache_dir = Self::get_cache_dir();
        if !cache_dir.exists() {
            return Ok(0);
        }

        let mut cleaned = 0;
        let now = Utc::now();

        // Iterar sobre todos os arquivos JSON no cache
        let mut entries = fs::read_dir(&cache_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let domain_dir = entry.path();
                let mut domain_files = fs::read_dir(&domain_dir).await?;
                
                while let Some(file_entry) = domain_files.next_entry().await? {
                    if file_entry.path().extension().and_then(|s| s.to_str()) == Some("json") {
                        if let Ok(content) = fs::read_to_string(file_entry.path()).await {
                            if let Ok(data) = serde_json::from_str::<CachedContent>(&content) {
                                if let Some(expires_at) = &data.expires_at {
                                    if *expires_at < now {
                                        let _ = fs::remove_file(file_entry.path()).await;
                                        cleaned += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(cleaned)
    }

    /// Aplica limite LRU: mantém apenas N entradas mais recentes
    pub async fn apply_lru_limit(max_entries: usize) -> io::Result<usize> {
        let cache_dir = Self::get_cache_dir();
        if !cache_dir.exists() {
            return Ok(0);
        }

        // Coletar todas as entradas com timestamp
        let mut all_entries: Vec<(std::path::PathBuf, DateTime<Utc>)> = Vec::new();

        let mut entries = fs::read_dir(&cache_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            if entry.file_type().await?.is_dir() {
                let domain_dir = entry.path();
                let mut domain_files = fs::read_dir(&domain_dir).await?;
                
                while let Some(file_entry) = domain_files.next_entry().await? {
                    if file_entry.path().extension().and_then(|s| s.to_str()) == Some("json") {
                        if let Ok(content) = fs::read_to_string(file_entry.path()).await {
                            if let Ok(data) = serde_json::from_str::<CachedContent>(&content) {
                                all_entries.push((file_entry.path(), data.access_timestamp));
                            }
                        }
                    }
                }
            }
        }

        // Se temos mais entradas que o limite, remover as mais antigas
        if all_entries.len() > max_entries {
            // Ordenar por timestamp (mais antigas primeiro)
            all_entries.sort_by_key(|(_, ts)| *ts);
            
            // Remover as mais antigas
            let to_remove = all_entries.len() - max_entries;
            for (path, _) in all_entries.into_iter().take(to_remove) {
                let _ = fs::remove_file(&path).await;
            }
            
            Ok(to_remove)
        } else {
            Ok(0)
        }
    }

    /// Registra operação no log de auditoria
    pub async fn log_operation(url: &str, status: &str, latency_ms: u64, bytes: usize) {
        let log_entry = format!("[{}] [INFO] [{}] [{}] [{}ms] [{}bytes]\n", 
            Utc::now().to_rfc3339(), url, status, latency_ms, bytes);
        
        let path = Self::get_cache_dir().join("scraping_ops.log");
        
        // Append assíncrono
        use tokio::io::AsyncWriteExt;
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path).await {
            let _ = file.write_all(log_entry.as_bytes()).await;
        }
    }
}
