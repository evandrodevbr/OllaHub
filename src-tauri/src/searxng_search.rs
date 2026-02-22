use anyhow::Result;
use reqwest::Client;
use std::time::Duration;
use crate::web_scraper::SearchResultMetadata;

/// Busca via SearXNG self-hosted
pub async fn searxng_search(
    query: &str,
    limit: usize,
    url: &str,
) -> Result<Vec<SearchResultMetadata>> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5)) // Reduzido de 8s para 5s para maior velocidade
        .build()?;
    
    let search_url = format!("{}/search", url.trim_end_matches('/'));
    
    let response = client
        .get(&search_url)
        .query(&[
            ("q", query),
            ("format", "json"),
            ("categories", "general"),
            ("pageno", "1"),
        ])
        .send()
        .await?;
    
    if !response.status().is_success() {
        return Err(anyhow::anyhow!("SearXNG returned status: {}", response.status()));
    }
    
    #[derive(serde::Deserialize)]
    struct SearxngResponse {
        results: Vec<SearxngResult>,
    }
    
    #[derive(serde::Deserialize)]
    struct SearxngResult {
        title: String,
        url: String,
        content: Option<String>,
    }
    
    let data: SearxngResponse = response.json().await?;
    
    let metadata: Vec<SearchResultMetadata> = data
        .results
        .into_iter()
        .take(limit)
        .map(|r| SearchResultMetadata {
            title: r.title,
            url: r.url,
            snippet: r.content.unwrap_or_default(),
        })
        .collect();
    
    Ok(metadata)
}
