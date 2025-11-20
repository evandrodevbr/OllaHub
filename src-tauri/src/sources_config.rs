use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::Utc;

/// Categoria de fonte de busca
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourceCategory {
    pub id: String,
    pub name: String,
    pub base_sites: Vec<String>,
    pub enabled: bool,
}

/// Configuração completa de fontes de busca
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SourcesConfig {
    #[serde(default = "default_version")]
    pub version: u32,
    pub categories: Vec<SourceCategory>,
    #[serde(default = "default_last_updated")]
    pub last_updated: String,
}

fn default_version() -> u32 {
    1
}

fn default_last_updated() -> String {
    Utc::now().to_rfc3339()
}

impl Default for SourcesConfig {
    fn default() -> Self {
        Self {
            version: 1,
            last_updated: Utc::now().to_rfc3339(),
            categories: vec![
                SourceCategory {
                    id: "academico".to_string(),
                    name: "Acadêmico".to_string(),
                    base_sites: vec![
                        "scholar.google.com".to_string(),
                        "arxiv.org".to_string(),
                        "pubmed.ncbi.nlm.nih.gov".to_string(),
                        "ieee.org".to_string(),
                        "acm.org".to_string(),
                    ],
                    enabled: true,
                },
                SourceCategory {
                    id: "tech".to_string(),
                    name: "Tech".to_string(),
                    base_sites: vec![
                        "github.com".to_string(),
                        "stackoverflow.com".to_string(),
                        "dev.to".to_string(),
                        "medium.com".to_string(),
                        "reddit.com/r/programming".to_string(),
                    ],
                    enabled: true,
                },
                SourceCategory {
                    id: "news".to_string(),
                    name: "News".to_string(),
                    base_sites: vec![
                        "news.ycombinator.com".to_string(),
                        "techcrunch.com".to_string(),
                        "theverge.com".to_string(),
                        "arstechnica.com".to_string(),
                    ],
                    enabled: true,
                },
                SourceCategory {
                    id: "financeiro".to_string(),
                    name: "Financeiro".to_string(),
                    base_sites: vec![
                        "bloomberg.com".to_string(),
                        "reuters.com".to_string(),
                        "financialtimes.com".to_string(),
                        "wsj.com".to_string(),
                    ],
                    enabled: true,
                },
            ],
        }
    }
}

/// Helper para obter o caminho do arquivo sources.json
pub fn get_sources_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    Ok(app_data_dir.join("sources.json"))
}

/// Carrega a configuração de fontes do arquivo
/// Se o arquivo não existir, retorna uma configuração padrão robusta
pub fn load_sources_config(app_handle: &AppHandle) -> Result<SourcesConfig, String> {
    let config_path = get_sources_config_path(app_handle)?;
    
    // Se o arquivo não existir, retornar Default
    if !config_path.exists() {
        log::info!("sources.json não encontrado, usando configuração padrão");
        return Ok(SourcesConfig::default());
    }
    
    // Tentar ler e parsear o arquivo
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read sources.json: {}", e))?;
    
    let config: SourcesConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sources.json: {}", e))?;
    
    Ok(config)
}

/// Salva a configuração de fontes no arquivo
pub fn save_sources_config(app_handle: &AppHandle, config: SourcesConfig) -> Result<(), String> {
    let config_path = get_sources_config_path(app_handle)?;
    
    // Garantir que o diretório pai existe
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }
    
    // Atualizar timestamp
    let mut config_to_save = config;
    config_to_save.last_updated = Utc::now().to_rfc3339();
    
    // Serializar e escrever
    let json = serde_json::to_string_pretty(&config_to_save)
        .map_err(|e| format!("Failed to serialize sources config: {}", e))?;
    
    // Escrever em arquivo temporário primeiro, depois renomear (atomic write)
    let temp_path = config_path.with_extension("json.tmp");
    fs::write(&temp_path, json)
        .map_err(|e| format!("Failed to write temp sources config file: {}", e))?;
    
    // Renomear atomicamente
    fs::rename(&temp_path, &config_path)
        .map_err(|e| format!("Failed to rename temp file to sources.json: {}", e))?;
    
    log::info!("Sources config salvo com sucesso em {:?}", config_path);
    Ok(())
}

