use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, command};
use chrono::Utc;
use uuid::Uuid;
use crate::search_config::{load_search_config, SearchConfig};
use crate::python_scraper::get_or_create_python_scraper;
use crate::db::{Database, SearchLog};
use crate::web_scraper::SearchResultMetadata;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub url: String,
    pub title: String,
    pub content: String,
    pub engine: String,
    pub score: f64,
}

// Helper to convert SearchResult to SearchResultMetadata
pub fn search_results_to_metadata(results: &[SearchResult]) -> Vec<SearchResultMetadata> {
    results.iter().map(|result| {
        SearchResultMetadata {
            title: result.title.clone(),
            url: result.url.clone(),
            snippet: result.content.clone(),
        }
    }).collect()
}

// Helper to extract URLs
pub fn search_results_to_urls(results: &[SearchResult]) -> Vec<String> {
    results.iter().map(|result| result.url.clone()).collect()
}

#[command]
pub async fn search_command(
    app_handle: AppHandle,
    query: String,
    chat_id: Option<String>,
    user_id: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    perform_search(&app_handle, query, chat_id, user_id).await
}

/// Public function to perform search (used by web_scraper)
pub async fn perform_search(
    app_handle: &AppHandle,
    query: String,
    chat_id: Option<String>,
    user_id: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let config = load_search_config(app_handle)?;
    
    if !config.enabled {
        return Err("Search is disabled".to_string());
    }

    let python_scraper = get_or_create_python_scraper().map_err(|e| e.to_string())?;
    let mut scraper = python_scraper.lock().await;
    
    // Execute search via Python (DuckDuckGo)
    let python_results = scraper.search_duckduckgo(
        &query,
        &config.region,
        &config.safe_search,
        config.max_results
    ).await.map_err(|e| e.to_string())?;
    
    let results: Vec<SearchResult> = python_results.into_iter().map(|r| SearchResult {
        title: r.title,
        url: r.url,
        content: r.content,
        engine: r.engine,
        score: r.score,
    }).collect();

    // Log to DB
    if let Ok(db) = Database::new(app_handle) {
        let log = SearchLog {
            id: Uuid::new_v4().to_string(),
            chat_id,
            user_id,
            timestamp: Utc::now(),
            searxng_instance: Some("duckduckgo-direct".to_string()),
            query: if config.log_search_content { query } else { "[REDACTED]".to_string() },
            engines: Some(vec!["duckduckgo".to_string()]),
            filters: Some(config.safe_search),
            response_time_ms: Some(0), // TODO: measure time
            total_results: Some(results.len() as i64),
            results_per_engine: None,
            error: None,
        };
        
        if let Err(e) = db.log_search(&log) {
            log::error!("Failed to log search: {}", e);
        }
    }
    
    Ok(results)
}

#[command]
pub fn cleanup_search_logs_command(app_handle: AppHandle, days: i64) -> Result<usize, String> {
    let db = Database::new(&app_handle).map_err(|e| e.to_string())?;
    db.cleanup_search_logs(days).map_err(|e| e.to_string())
}

#[command]
pub fn get_search_logs_command(
    app_handle: AppHandle,
    chat_id: Option<String>,
    limit: usize,
    offset: usize
) -> Result<Vec<SearchLog>, String> {
    let db = Database::new(&app_handle).map_err(|e| e.to_string())?;
    db.get_search_logs(chat_id.as_deref(), limit, offset).map_err(|e| e.to_string())
}
