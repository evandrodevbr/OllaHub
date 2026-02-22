use anyhow::Result;
use reqwest::Client;
use std::time::Duration;
use crate::web_scraper::SearchResultMetadata;
use crate::event_emitter::{SearchQueryEvent, SearchQueryCompletedEvent, emit_search_event, emit_search_completed_event};
use tauri::AppHandle;
use std::time::{SystemTime, UNIX_EPOCH};

/// Busca via Brave Search API
pub async fn brave_search(
    query: &str,
    limit: usize,
    app_handle: Option<&AppHandle>,
) -> Result<Vec<SearchResultMetadata>> {
    // Emitir evento de query iniciada
    if let Some(handle) = app_handle {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
            .unwrap_or_default().as_secs() * 1000;
        emit_search_event(handle, &SearchQueryEvent {
            query: query.to_string(),
            source: "brave".to_string(),
            round: None,
            timestamp,
        });
    }

    let api_key = std::env::var("BRAVE_API_KEY")
        .map_err(|_| anyhow::anyhow!("BRAVE_API_KEY não configurada"))?;

    let client = Client::builder()
        .timeout(Duration::from_secs(3)) // Reduzido de 5s para 3s para maior velocidade
        .build()?;

    let response = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", &api_key)
        .query(&[
            ("q", query),
            ("count", &limit.to_string()),
            ("safesearch", "moderate"),
        ])
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        
        // Emitir evento de query completada com falha
        if let Some(handle) = app_handle {
            let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
                .unwrap_or_default().as_secs() * 1000;
            emit_search_completed_event(handle, &SearchQueryCompletedEvent {
                query: query.to_string(),
                source: "brave".to_string(),
                results_count: 0,
                success: false,
                timestamp,
            });
        }
        
        return Err(anyhow::anyhow!("Brave API returned status {}: {}", status, error_text));
    }

    #[derive(serde::Deserialize)]
    struct BraveResponse {
        web: BraveWebResults,
    }

    #[derive(serde::Deserialize)]
    struct BraveWebResults {
        results: Vec<BraveResult>,
    }

    #[derive(serde::Deserialize)]
    struct BraveResult {
        title: String,
        url: String,
        description: String,
    }

    let data: BraveResponse = response.json().await?;

    let metadata: Vec<SearchResultMetadata> = data
        .web
        .results
        .into_iter()
        .take(limit)
        .map(|r| SearchResultMetadata {
            title: r.title,
            url: r.url,
            snippet: r.description,
        })
        .collect();

    // Emitir evento de query completada com sucesso
    if let Some(handle) = app_handle {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)
            .unwrap_or_default().as_secs() * 1000;
        emit_search_completed_event(handle, &SearchQueryCompletedEvent {
            query: query.to_string(),
            source: "brave".to_string(),
            results_count: metadata.len(),
            success: true,
            timestamp,
        });
    }

    Ok(metadata)
}
