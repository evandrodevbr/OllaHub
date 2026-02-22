use anyhow::Result;
use crate::web_scraper::SearchResultMetadata;
use crate::searxng_search::searxng_search;
use crate::searxng_manager::check_searxng_status;
use crate::web_scraper::SearchConfig;
use crate::event_emitter::{SearchQueryEvent, SearchQueryCompletedEvent, emit_search_event, emit_search_completed_event};
use tauri::AppHandle;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use tokio::time::timeout;

/// Executa busca apenas com SearXNG (se habilitado)
/// Nodriver é usado para scraping das URLs encontradas (fonte primária)
pub async fn search_with_waterfall(
    query: &str,
    limit: usize,
    config: &SearchConfig,
    app_handle: Option<&AppHandle>,
) -> Result<Vec<SearchResultMetadata>> {
    // Apenas SearXNG (se habilitado e disponível)
    if !config.searxng.enabled {
        return Err(anyhow::anyhow!("SearXNG não está habilitado. Configure SearXNG nas configurações."));
    }
    
    // Verificar status do SearXNG com timeout reduzido (2s)
    match timeout(Duration::from_secs(2), check_searxng_status(&config.searxng.url)).await {
        Ok(Ok(true)) => {
            log::info!("[SearchOrchestrator] Using SearXNG for query: {}", query);
            
            // Emitir evento de query iniciada
            if let Some(handle) = app_handle {
                let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
                    .unwrap_or_default().as_secs() * 1000;
                emit_search_event(handle, &SearchQueryEvent {
                    query: query.to_string(),
                    source: "searxng".to_string(),
                    round: None,
                    timestamp,
                });
            }
            
            // Timeout reduzido para busca SearXNG (6s total)
            match timeout(Duration::from_secs(6), searxng_search(query, limit, &config.searxng.url)).await {
                Ok(Ok(results)) if !results.is_empty() => {
                    log::info!("[SearchOrchestrator] SearXNG returned {} results", results.len());
                    
                    // Emitir evento de query completada
                    if let Some(handle) = app_handle {
                        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
                            .unwrap_or_default().as_secs() * 1000;
                        emit_search_completed_event(handle, &SearchQueryCompletedEvent {
                            query: query.to_string(),
                            source: "searxng".to_string(),
                            results_count: results.len(),
                            success: true,
                            timestamp,
                        });
                    }
                    
                    Ok(results)
                }
                Ok(Ok(_)) => {
                    log::warn!("[SearchOrchestrator] SearXNG returned empty results");
                    Err(anyhow::anyhow!("SearXNG retornou resultados vazios"))
                }
                Ok(Err(e)) => {
                    log::error!("[SearchOrchestrator] SearXNG search failed: {}", e);
                    Err(anyhow::anyhow!("SearXNG search failed: {}", e))
                }
                Err(_) => {
                    log::error!("[SearchOrchestrator] SearXNG search timeout (6s)");
                    Err(anyhow::anyhow!("SearXNG search timeout"))
                }
            }
        }
        Ok(Ok(false)) => {
            log::error!("[SearchOrchestrator] SearXNG is not available at {}", config.searxng.url);
            Err(anyhow::anyhow!("SearXNG não está disponível. Verifique se está rodando em {}", config.searxng.url))
        }
        Ok(Err(e)) => {
            log::error!("[SearchOrchestrator] Failed to check SearXNG status: {}", e);
            Err(anyhow::anyhow!("Falha ao verificar status do SearXNG: {}", e))
        }
        Err(_) => {
            log::error!("[SearchOrchestrator] Timeout checking SearXNG status");
            Err(anyhow::anyhow!("Timeout ao verificar status do SearXNG"))
        }
    }
}
