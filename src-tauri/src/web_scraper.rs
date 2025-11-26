use anyhow::Result;
use headless_chrome::{Browser, LaunchOptions, Tab};
use reqwest::header::USER_AGENT;
use scraper::{Html, Selector};
use std::sync::Arc;
use std::time::Duration;
use url::Url;
use rand::Rng;
use tokio::sync::Semaphore;
use regex::Regex;
use std::time::Instant;

/// Resultado da extração de conteúdo de uma URL
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ScrapedContent {
    pub title: String,
    pub url: String,
    pub content: String,
    pub markdown: String,
}

/// Metadados de resultado de busca (leve, sem abrir página)
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearchResultMetadata {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// Categoria de busca com sites curados
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearchCategory {
    pub id: String,
    pub name: String,
    pub base_sites: Vec<String>,
    pub enabled: bool,
}

/// Configuração completa de busca
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearchConfig {
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent_tabs: usize,
    #[serde(default = "default_total_sources")]
    pub total_sources_limit: usize,
    pub categories: Vec<SearchCategory>,
    #[serde(default)]
    pub user_custom_sites: Vec<String>,
    #[serde(default)]
    pub excluded_domains: Vec<String>,
}

fn default_max_concurrent() -> usize {
    5
}

fn default_total_sources() -> usize {
    100
}

/// Enum para identificar diferentes motores de busca
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchEngine {
    Google,
    Bing,
    Yahoo,
    DuckDuckGo,
    Startpage,
}

impl SearchEngine {
    /// Converte string para SearchEngine
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "google" => Some(SearchEngine::Google),
            "bing" => Some(SearchEngine::Bing),
            "yahoo" => Some(SearchEngine::Yahoo),
            "duckduckgo" | "duck_duck_go" => Some(SearchEngine::DuckDuckGo),
            "startpage" => Some(SearchEngine::Startpage),
            _ => None,
        }
    }

    /// Retorna nome do motor como string
    pub fn as_str(&self) -> &'static str {
        match self {
            SearchEngine::Google => "Google",
            SearchEngine::Bing => "Bing",
            SearchEngine::Yahoo => "Yahoo",
            SearchEngine::DuckDuckGo => "DuckDuckGo",
            SearchEngine::Startpage => "Startpage",
        }
    }

    /// Retorna URL base de busca
    fn base_url(&self) -> &'static str {
        match self {
            SearchEngine::Google => "https://www.google.com/search",
            SearchEngine::Bing => "https://www.bing.com/search",
            SearchEngine::Yahoo => "https://search.yahoo.com/search",
            SearchEngine::DuckDuckGo => "https://html.duckduckgo.com/html",
            SearchEngine::Startpage => "https://www.startpage.com/sp/search",
        }
    }

    /// Retorna selectors CSS específicos para cada motor
    fn selectors(&self) -> SearchSelectors {
        match self {
            SearchEngine::Google => SearchSelectors {
                container: vec![
                    "div.g",
                    "div[data-ved]",
                    ".tF2Cxc",
                ],
                title: vec![
                    "h3",
                    ".LC20lb",
                    ".DKV0Md",
                ],
                url: vec![
                    "a[href]",
                    "cite",
                ],
                snippet: vec![
                    ".VwiC3b",
                    ".s",
                    ".st",
                ],
            },
            SearchEngine::Bing => SearchSelectors {
                container: vec![
                    ".b_algo",
                    "li.b_algo",
                ],
                title: vec![
                    "h2 a",
                    ".b_title a",
                ],
                url: vec![
                    "h2 a[href]",
                    ".b_title a[href]",
                ],
                snippet: vec![
                    ".b_caption p",
                    ".b_caption",
                ],
            },
            SearchEngine::Yahoo => SearchSelectors {
                container: vec![
                    ".dd.algo",
                    ".Sr",
                ],
                title: vec![
                    "h3 a",
                    ".ac-algo h3 a",
                ],
                url: vec![
                    "h3 a[href]",
                    ".ac-algo h3 a[href]",
                ],
                snippet: vec![
                    ".ac-algo .ac-text",
                    ".compText",
                ],
            },
            SearchEngine::DuckDuckGo => SearchSelectors {
                container: vec![
                    ".result",
                    ".web-result",
                    ".result__body",
                ],
                title: vec![
                    ".result__a",
                    ".web-result__link",
                    "a.result__a",
                ],
                url: vec![
                    ".result__a[href]",
                    ".web-result__link[href]",
                ],
                snippet: vec![
                    ".result__snippet",
                    ".result__snippet.js-result-snippet",
                    ".web-result__snippet",
                ],
            },
            SearchEngine::Startpage => SearchSelectors {
                container: vec![
                    ".w-gl__result",
                    ".result",
                ],
                title: vec![
                    ".w-gl__result-title a",
                    "h3 a",
                ],
                url: vec![
                    ".w-gl__result-title a[href]",
                    "h3 a[href]",
                ],
                snippet: vec![
                    ".w-gl__result-snippet",
                    ".snippet",
                ],
            },
        }
    }

    /// Normaliza query para o motor específico
    fn normalize_query(&self, query: &str) -> String {
        // Todos os motores usam encoding padrão, mas alguns podem ter requisitos específicos
        query.trim().to_string()
    }
}

/// Estrutura para selectors CSS de cada motor
struct SearchSelectors {
    container: Vec<&'static str>,
    title: Vec<&'static str>,
    url: Vec<&'static str>,
    snippet: Vec<&'static str>,
}

/// Log de tentativa de busca em um motor
struct SearchAttemptLog {
    engine: SearchEngine,
    query: String,
    success: bool,
    results_count: usize,
    duration_ms: u64,
    error: Option<String>,
}

/// Pool de User-Agents para rotação (evita bloqueios 429)
const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
];

/// Retorna um User-Agent aleatório do pool
fn get_random_user_agent() -> &'static str {
    let mut rng = rand::thread_rng();
    let index = rng.gen_range(0..USER_AGENTS.len());
    USER_AGENTS[index]
}

/// Busca no DuckDuckGo e retorna URLs dos resultados
pub async fn search_duckduckgo(query: &str, limit: usize) -> Result<Vec<String>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;
    let user_agent = get_random_user_agent();
    let mut links = Vec::new();
    let mut offset = 0usize;
    let max_pages = 5usize;
    let selectors = vec![
        ".result__a",
        ".web-result__link",
        "a.result__a",
    ];
    for _ in 0..max_pages {
        if links.len() >= limit { break; }
        let url = format!(
            "https://html.duckduckgo.com/html/?q={}&s={}",
            urlencoding::encode(query),
            offset
        );
        let res = client
            .get(&url)
            .header(USER_AGENT, user_agent)
            .send()
            .await?
            .text()
            .await?;
        {
            let document = Html::parse_document(&res);
            for selector_str in &selectors {
                if let Ok(selector) = Selector::parse(selector_str) {
                    for element in document.select(&selector) {
                        if let Some(href) = element.value().attr("href") {
                            if let Some(real_url) = extract_real_url(href) {
                                if !links.contains(&real_url) {
                                    links.push(real_url);
                                    if links.len() >= limit { break; }
                                }
                            }
                        }
                    }
                    if links.len() >= limit { break; }
                }
            }
        }
        offset += 50;
        if res.is_empty() { break; }
    }
    links.truncate(limit);
    Ok(links)
}

/// Busca no Google retornando apenas metadados (título, URL, snippet)
pub async fn search_google_metadata(query: &str, limit: usize) -> Result<Vec<SearchResultMetadata>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let url = format!("{}?q={}&num={}",
        SearchEngine::Google.base_url(),
        urlencoding::encode(query),
        limit.min(100)
    );

    let user_agent = get_random_user_agent();
    let start_time = Instant::now();
    
    log::info!("[SearchEngine:Google] Query: '{}', Attempting...", query);
    
    let res = match client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await
    {
        Ok(r) => r.text().await?,
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::warn!("[SearchEngine:Google] Failed: {} ({}ms)", e, duration);
            return Err(anyhow::anyhow!("Google search failed: {}", e));
        }
    };

    let mut results: Vec<SearchResultMetadata> = Vec::new();
    let selectors = SearchEngine::Google.selectors();
    let document = Html::parse_document(&res);

    for cont_sel in &selectors.container {
        if results.len() >= limit { break; }
        if let Ok(container) = Selector::parse(cont_sel) {
            for node in document.select(&container) {
                if results.len() >= limit { break; }
                
                let mut found_url: Option<String> = None;
                let mut found_title: Option<String> = None;
                
                // Buscar título
                for tsel in &selectors.title {
                    if let Ok(ts) = Selector::parse(tsel) {
                        if let Some(a) = node.select(&ts).next() {
                            // Extrair URL
                            if let Some(href) = a.value().attr("href") {
                                let cleaned = clean_url(href);
                                if cleaned.is_some() {
                                    found_url = cleaned;
                                }
                            }
                            // Extrair título
                            let text = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
                            if !text.is_empty() { found_title = Some(text); }
                        }
                        if found_url.is_some() && found_title.is_some() { break; }
                    }
                }

                if found_url.is_none() { continue; }

                // Buscar snippet
                let mut snippet_text = String::new();
                for ssel in &selectors.snippet {
                    if let Ok(ss) = Selector::parse(ssel) {
                        if let Some(s) = node.select(&ss).next() {
                            let t = s.text().collect::<Vec<_>>().join(" ");
                            let norm = t.split_whitespace().collect::<Vec<_>>().join(" ");
                            if !norm.is_empty() { snippet_text = norm; break; }
                        }
                    }
                }

                let url_final = found_url.unwrap();
                if is_ad_or_tracker_url(&url_final) || url_final.is_empty() { continue; }

                results.push(SearchResultMetadata {
                    title: found_title.unwrap_or_else(|| url_final.clone()),
                    url: url_final,
                    snippet: snippet_text,
                });
            }
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;
    if results.is_empty() {
        log::warn!("[SearchEngine:Google] No results found ({}ms)", duration);
    } else {
        log::info!("[SearchEngine:Google] Found {} results ({}ms)", results.len(), duration);
    }

    Ok(results)
}

/// Busca no Bing retornando apenas metadados (título, URL, snippet)
pub async fn search_bing_metadata(query: &str, limit: usize) -> Result<Vec<SearchResultMetadata>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let url = format!("{}?q={}&count={}",
        SearchEngine::Bing.base_url(),
        urlencoding::encode(query),
        limit.min(50)
    );

    let user_agent = get_random_user_agent();
    let start_time = Instant::now();
    
    log::info!("[SearchEngine:Bing] Query: '{}', Attempting...", query);
    
    let res = match client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await
    {
        Ok(r) => r.text().await?,
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::warn!("[SearchEngine:Bing] Failed: {} ({}ms)", e, duration);
            return Err(anyhow::anyhow!("Bing search failed: {}", e));
        }
    };

    let mut results: Vec<SearchResultMetadata> = Vec::new();
    let selectors = SearchEngine::Bing.selectors();
    let document = Html::parse_document(&res);

    for cont_sel in &selectors.container {
        if results.len() >= limit { break; }
        if let Ok(container) = Selector::parse(cont_sel) {
            for node in document.select(&container) {
                if results.len() >= limit { break; }
                
                let mut found_url: Option<String> = None;
                let mut found_title: Option<String> = None;
                
                for tsel in &selectors.title {
                    if let Ok(ts) = Selector::parse(tsel) {
                        if let Some(a) = node.select(&ts).next() {
                            if let Some(href) = a.value().attr("href") {
                                let cleaned = clean_url(href);
                                if cleaned.is_some() {
                                    found_url = cleaned;
                                }
                            }
                            let text = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
                            if !text.is_empty() { found_title = Some(text); }
                        }
                        if found_url.is_some() && found_title.is_some() { break; }
                    }
                }

                if found_url.is_none() { continue; }

                let mut snippet_text = String::new();
                for ssel in &selectors.snippet {
                    if let Ok(ss) = Selector::parse(ssel) {
                        if let Some(s) = node.select(&ss).next() {
                            let t = s.text().collect::<Vec<_>>().join(" ");
                            let norm = t.split_whitespace().collect::<Vec<_>>().join(" ");
                            if !norm.is_empty() { snippet_text = norm; break; }
                        }
                    }
                }

                let url_final = found_url.unwrap();
                if is_ad_or_tracker_url(&url_final) || url_final.is_empty() { continue; }

                results.push(SearchResultMetadata {
                    title: found_title.unwrap_or_else(|| url_final.clone()),
                    url: url_final,
                    snippet: snippet_text,
                });
            }
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;
    if results.is_empty() {
        log::warn!("[SearchEngine:Bing] No results found ({}ms)", duration);
    } else {
        log::info!("[SearchEngine:Bing] Found {} results ({}ms)", results.len(), duration);
    }

    Ok(results)
}

/// Busca no Yahoo retornando apenas metadados (título, URL, snippet)
pub async fn search_yahoo_metadata(query: &str, limit: usize) -> Result<Vec<SearchResultMetadata>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let url = format!("{}?p={}&n={}",
        SearchEngine::Yahoo.base_url(),
        urlencoding::encode(query),
        limit.min(40)
    );

    let user_agent = get_random_user_agent();
    let start_time = Instant::now();
    
    log::info!("[SearchEngine:Yahoo] Query: '{}', Attempting...", query);
    
    let res = match client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await
    {
        Ok(r) => r.text().await?,
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::warn!("[SearchEngine:Yahoo] Failed: {} ({}ms)", e, duration);
            return Err(anyhow::anyhow!("Yahoo search failed: {}", e));
        }
    };

    let mut results: Vec<SearchResultMetadata> = Vec::new();
    let selectors = SearchEngine::Yahoo.selectors();
    let document = Html::parse_document(&res);

    for cont_sel in &selectors.container {
        if results.len() >= limit { break; }
        if let Ok(container) = Selector::parse(cont_sel) {
            for node in document.select(&container) {
                if results.len() >= limit { break; }
                
                let mut found_url: Option<String> = None;
                let mut found_title: Option<String> = None;
                
                for tsel in &selectors.title {
                    if let Ok(ts) = Selector::parse(tsel) {
                        if let Some(a) = node.select(&ts).next() {
                            if let Some(href) = a.value().attr("href") {
                                let cleaned = clean_url(href);
                                if cleaned.is_some() {
                                    found_url = cleaned;
                                }
                            }
                            let text = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
                            if !text.is_empty() { found_title = Some(text); }
                        }
                        if found_url.is_some() && found_title.is_some() { break; }
                    }
                }

                if found_url.is_none() { continue; }

                let mut snippet_text = String::new();
                for ssel in &selectors.snippet {
                    if let Ok(ss) = Selector::parse(ssel) {
                        if let Some(s) = node.select(&ss).next() {
                            let t = s.text().collect::<Vec<_>>().join(" ");
                            let norm = t.split_whitespace().collect::<Vec<_>>().join(" ");
                            if !norm.is_empty() { snippet_text = norm; break; }
                        }
                    }
                }

                let url_final = found_url.unwrap();
                if is_ad_or_tracker_url(&url_final) || url_final.is_empty() { continue; }

                results.push(SearchResultMetadata {
                    title: found_title.unwrap_or_else(|| url_final.clone()),
                    url: url_final,
                    snippet: snippet_text,
                });
            }
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;
    if results.is_empty() {
        log::warn!("[SearchEngine:Yahoo] No results found ({}ms)", duration);
    } else {
        log::info!("[SearchEngine:Yahoo] Found {} results ({}ms)", results.len(), duration);
    }

    Ok(results)
}

/// Busca no Startpage retornando apenas metadados (título, URL, snippet)
pub async fn search_startpage_metadata(query: &str, limit: usize) -> Result<Vec<SearchResultMetadata>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let url = format!("{}?query={}&page=1",
        SearchEngine::Startpage.base_url(),
        urlencoding::encode(query)
    );

    let user_agent = get_random_user_agent();
    let start_time = Instant::now();
    
    log::info!("[SearchEngine:Startpage] Query: '{}', Attempting...", query);
    
    let res = match client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await
    {
        Ok(r) => r.text().await?,
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::warn!("[SearchEngine:Startpage] Failed: {} ({}ms)", e, duration);
            return Err(anyhow::anyhow!("Startpage search failed: {}", e));
        }
    };

    let mut results: Vec<SearchResultMetadata> = Vec::new();
    let selectors = SearchEngine::Startpage.selectors();
    let document = Html::parse_document(&res);

    for cont_sel in &selectors.container {
        if results.len() >= limit { break; }
        if let Ok(container) = Selector::parse(cont_sel) {
            for node in document.select(&container) {
                if results.len() >= limit { break; }
                
                let mut found_url: Option<String> = None;
                let mut found_title: Option<String> = None;
                
                for tsel in &selectors.title {
                    if let Ok(ts) = Selector::parse(tsel) {
                        if let Some(a) = node.select(&ts).next() {
                            if let Some(href) = a.value().attr("href") {
                                let cleaned = clean_url(href);
                                if cleaned.is_some() {
                                    found_url = cleaned;
                                }
                            }
                            let text = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
                            if !text.is_empty() { found_title = Some(text); }
                        }
                        if found_url.is_some() && found_title.is_some() { break; }
                    }
                }

                if found_url.is_none() { continue; }

                let mut snippet_text = String::new();
                for ssel in &selectors.snippet {
                    if let Ok(ss) = Selector::parse(ssel) {
                        if let Some(s) = node.select(&ss).next() {
                            let t = s.text().collect::<Vec<_>>().join(" ");
                            let norm = t.split_whitespace().collect::<Vec<_>>().join(" ");
                            if !norm.is_empty() { snippet_text = norm; break; }
                        }
                    }
                }

                let url_final = found_url.unwrap();
                if is_ad_or_tracker_url(&url_final) || url_final.is_empty() { continue; }

                results.push(SearchResultMetadata {
                    title: found_title.unwrap_or_else(|| url_final.clone()),
                    url: url_final,
                    snippet: snippet_text,
                });
            }
        }
    }

    let duration = start_time.elapsed().as_millis() as u64;
    if results.is_empty() {
        log::warn!("[SearchEngine:Startpage] No results found ({}ms)", duration);
    } else {
        log::info!("[SearchEngine:Startpage] Found {} results ({}ms)", results.len(), duration);
    }

    Ok(results)
}

/// Busca no DuckDuckGo retornando apenas metadados (título, URL, snippet)
pub async fn search_duckduckgo_metadata(query: &str, limit: usize) -> Result<Vec<SearchResultMetadata>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?;

    let url = format!("https://html.duckduckgo.com/html/?q={}",
        urlencoding::encode(query));

    let user_agent = get_random_user_agent();
    let res = client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await?
        .text()
        .await?;

    let mut results: Vec<SearchResultMetadata> = Vec::new();

    {
        let document = Html::parse_document(&res);

        // Estruturas comuns no HTML do DuckDuckGo
        let container_selectors = vec![
            ".result",
            ".web-result",
            ".result__body",
        ];
        let title_selectors = vec![
            ".result__a",
            ".web-result__link",
            "a.result__a",
        ];
        let snippet_selectors = vec![
            ".result__snippet",
            ".result__snippet.js-result-snippet",
            ".web-result__snippet",
        ];

        for cont_sel in &container_selectors {
            if results.len() >= limit { break; }
            if let Ok(container) = Selector::parse(cont_sel) {
                for node in document.select(&container) {
                    if results.len() >= limit { break; }
                    // Title + URL
                    let mut found_url: Option<String> = None;
                    let mut found_title: Option<String> = None;
                    for tsel in &title_selectors {
                        if let Ok(ts) = Selector::parse(tsel) {
                            if let Some(a) = node.select(&ts).next() {
                                if let Some(href) = a.value().attr("href") {
                                    if let Some(real_url) = extract_real_url(href) {
                                        found_url = clean_url(&real_url);
                                    }
                                }
                                let text = a.text().collect::<Vec<_>>().join(" ").trim().to_string();
                                if !text.is_empty() { found_title = Some(text); }
                            }
                        }
                        if found_url.is_some() && found_title.is_some() { break; }
                    }

                    if found_url.is_none() { continue; }

                    // Snippet
                    let mut snippet_text: String = String::new();
                    for ssel in &snippet_selectors {
                        if let Ok(ss) = Selector::parse(ssel) {
                            if let Some(s) = node.select(&ss).next() {
                                let t = s.text().collect::<Vec<_>>().join(" ");
                                let norm = t.split_whitespace().collect::<Vec<_>>().join(" ");
                                if !norm.is_empty() { snippet_text = norm; break; }
                            }
                        }
                    }

                    let url_final = found_url.unwrap();
                    if is_ad_or_tracker_url(&url_final) || url_final.is_empty() { continue; }

                    results.push(SearchResultMetadata {
                        title: found_title.unwrap_or_else(|| url_final.clone()),
                        url: url_final,
                        snippet: snippet_text,
                    });

                    if results.len() >= limit { break; }
                }
            }
        }
    }

    // Se ainda vazio, tentar fallback simples: extrair todos os links conhecidos
    if results.is_empty() {
        let links = search_duckduckgo(query, limit).await?;
        for l in links {
            let url_clean = clean_url(&l).unwrap_or(l);
            results.push(SearchResultMetadata {
                title: url_clean.clone(),
                url: url_clean,
                snippet: String::new(),
            });
            if results.len() >= limit { break; }
        }
    }

    Ok(results)
}

/// Calcula score de relevância baseado em matches de palavras-chave
fn calculate_relevance_score(result: &SearchResultMetadata, query: &str) -> f32 {
    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace()
        .filter(|w| w.len() > 2)
        .collect();
    
    if query_words.is_empty() {
        return 0.5; // Score neutro se não há palavras-chave
    }
    
    let title_lower = result.title.to_lowercase();
    let snippet_lower = result.snippet.to_lowercase();
    let combined = format!("{} {}", title_lower, snippet_lower);
    
    let mut matches = 0;
    for word in &query_words {
        if combined.contains(word) {
            matches += 1;
        }
    }
    
    let base_score = matches as f32 / query_words.len() as f32;
    
    // Bônus se palavra está no título
    let title_matches = query_words.iter()
        .filter(|w| title_lower.contains(*w))
        .count();
    let title_bonus = (title_matches as f32 / query_words.len() as f32) * 0.3;
    
    // Bônus se snippet não está vazio
    let snippet_bonus = if !result.snippet.is_empty() { 0.1 } else { 0.0 };
    
    (base_score + title_bonus + snippet_bonus).min(1.0)
}

/// Busca multi-engine com fallback automático
pub async fn search_multi_engine_metadata(
    query: &str,
    limit: usize,
    engine_order: &[SearchEngine],
    min_results: usize,
) -> Result<Vec<SearchResultMetadata>> {
    let mut all_results: Vec<SearchResultMetadata> = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();
    let mut attempt_logs: Vec<SearchAttemptLog> = Vec::new();
    
    log::info!("[MultiEngine] Starting search for: '{}'", query);
    log::info!("[MultiEngine] Engine order: {:?}", engine_order.iter().map(|e| e.as_str()).collect::<Vec<_>>());
    log::info!("[MultiEngine] Min results required: {}", min_results);
    
    for engine in engine_order {
        let start_time = Instant::now();
        let mut attempt_log = SearchAttemptLog {
            engine: *engine,
            query: query.to_string(),
            success: false,
            results_count: 0,
            duration_ms: 0,
            error: None,
        };
        
        let result = match *engine {
            SearchEngine::Google => search_google_metadata(query, limit).await,
            SearchEngine::Bing => search_bing_metadata(query, limit).await,
            SearchEngine::Yahoo => search_yahoo_metadata(query, limit).await,
            SearchEngine::DuckDuckGo => search_duckduckgo_metadata(query, limit).await,
            SearchEngine::Startpage => search_startpage_metadata(query, limit).await,
        };
        
        attempt_log.duration_ms = start_time.elapsed().as_millis() as u64;
        
        match result {
            Ok(mut engine_results) => {
                // Filtrar duplicatas
                engine_results.retain(|r| {
                    if seen_urls.contains(&r.url) {
                        false
                    } else {
                        seen_urls.insert(r.url.clone());
                        true
                    }
                });
                
                attempt_log.results_count = engine_results.len();
                attempt_log.success = true;
                
                if !engine_results.is_empty() {
                    log::info!("[MultiEngine:{}] Found {} unique results ({}ms)", 
                        engine.as_str(), engine_results.len(), attempt_log.duration_ms);
                    all_results.extend(engine_results);
                    
                    // Se atingiu mínimo necessário, pode parar
                    if all_results.len() >= min_results {
                        log::info!("[MultiEngine] Minimum results ({}) reached, stopping early", min_results);
                        break;
                    }
                } else {
                    log::warn!("[MultiEngine:{}] No results found ({}ms), trying next engine...", 
                        engine.as_str(), attempt_log.duration_ms);
                }
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                attempt_log.error = Some(error_msg.clone());
                log::warn!("[MultiEngine:{}] Failed: {} ({}ms), trying next engine...", 
                    engine.as_str(), error_msg, attempt_log.duration_ms);
            }
        }
        
        attempt_logs.push(attempt_log);
    }
    
    // Ranquear resultados por relevância
    let mut scored_results: Vec<(SearchResultMetadata, f32)> = all_results
        .into_iter()
        .map(|r| {
            let score = calculate_relevance_score(&r, query);
            (r, score)
        })
        .collect();
    
    // Ordenar por score (maior primeiro)
    scored_results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    // Retornar top limit resultados
    let final_results: Vec<SearchResultMetadata> = scored_results
        .into_iter()
        .take(limit)
        .map(|(r, _)| r)
        .collect();
    
    // Log resumo
    log::info!("[MultiEngine] Final results: {} (from {} engines)", 
        final_results.len(), attempt_logs.len());
    for log_entry in &attempt_logs {
        if log_entry.success {
            log::info!("  ✓ {}: {} results ({}ms)", 
                log_entry.engine.as_str(), log_entry.results_count, log_entry.duration_ms);
        } else {
            log::warn!("  ✗ {}: Failed - {} ({}ms)", 
                log_entry.engine.as_str(), 
                log_entry.error.as_ref().unwrap_or(&"Unknown error".to_string()),
                log_entry.duration_ms);
        }
    }
    
    Ok(final_results)
}

/// Expande query semanticamente (adiciona sinônimos, remove stopwords)
pub fn expand_query_semantic(query: &str, language: &str) -> Vec<String> {
    let mut variants = Vec::new();
    
    // Query original sempre incluída
    variants.push(query.trim().to_string());
    
    // Stopwords por idioma
    let stopwords: Vec<&str> = match language {
        "pt-BR" | "pt" => vec!["o", "a", "os", "as", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas", "para", "por", "com", "sem", "que", "qual", "quais"],
        "en" => vec!["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by"],
        "es" => vec!["el", "la", "los", "las", "de", "del", "en", "un", "una", "para", "por", "con", "sin"],
        _ => vec![],
    };
    
    // Remover stopwords
    let words: Vec<&str> = query.split_whitespace()
        .filter(|w| !stopwords.contains(&w.to_lowercase().as_str()))
        .collect();
    
    if words.len() > 1 {
        let without_stopwords = words.join(" ");
        if without_stopwords != query.trim() {
            variants.push(without_stopwords);
        }
    }
    
    // Sinônimos comuns (básico - pode ser expandido)
    let synonyms: Vec<(&str, &str)> = match language {
        "pt-BR" | "pt" => vec![
            ("pesquisa", "estudo investigação"),
            ("resultado", "achado descoberta"),
            ("acadêmico", "científico universitário"),
        ],
        "en" => vec![
            ("research", "study investigation"),
            ("result", "finding discovery"),
            ("academic", "scientific scholarly"),
        ],
        _ => vec![],
    };
    
    // Adicionar variantes com sinônimos
    for (original, replacements) in synonyms {
        if query.to_lowercase().contains(original) {
            for replacement in replacements.split_whitespace() {
                let variant = query.to_lowercase().replace(original, replacement);
                if variant != query.to_lowercase() {
                    variants.push(variant);
                }
            }
        }
    }
    
    // Remover duplicatas e retornar
    variants.sort();
    variants.dedup();
    variants
}

/// Extrai a URL real do redirecionamento do DuckDuckGo
fn extract_real_url(ddg_redirect: &str) -> Option<String> {
    // DuckDuckGo usa formato: /l/?kh=-1&uddg=<URL_ENCODED>
    if let Some(uddg_start) = ddg_redirect.find("uddg=") {
        if let Some(encoded_url) = ddg_redirect.get(uddg_start + 5..) {
            if let Some(ampersand) = encoded_url.find('&') {
                if let Ok(decoded) = urlencoding::decode(&encoded_url[..ampersand]) {
                    return Some(decoded.to_string());
                }
            } else if let Ok(decoded) = urlencoding::decode(encoded_url) {
                return Some(decoded.to_string());
            }
        }
    }
    
    // Se não for redirecionamento DDG, retorna como está (se for URL válida)
    if ddg_redirect.starts_with("http://") || ddg_redirect.starts_with("https://") {
        Some(ddg_redirect.to_string())
    } else {
        None
    }
}

/// Extrai o domínio de uma URL
fn extract_domain(url: &str) -> Option<String> {
    if let Ok(parsed) = Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            return Some(host.to_string());
        }
    }
    None
}

/// Verifica se uma URL está na lista de domínios bloqueados
fn is_domain_blocked(url: &str, excluded_domains: &[String]) -> bool {
    if excluded_domains.is_empty() {
        return false;
    }
    
    if let Some(domain) = extract_domain(url) {
        let domain_lower = domain.to_lowercase();
        for excluded in excluded_domains {
            let excluded_lower = excluded.to_lowercase();
            // Match exato ou subdomínio
            if domain_lower == excluded_lower || domain_lower.ends_with(&format!(".{}", excluded_lower)) {
                log::debug!("URL bloqueada por blacklist: {} (domínio: {})", url, excluded);
                return true;
            }
        }
    }
    false
}

/// Verifica se uma URL é de anúncio/tracker (deve ser ignorada)
fn is_ad_or_tracker_url(url: &str) -> bool {
    let ad_patterns = vec![
        r"duckduckgo\.com/y\.js",
        r"googleadservices\.com",
        r"doubleclick\.net",
        r"googlesyndication\.com",
        r"aclick",
        r"/y\.js",
        r"advertising\.com",
        r"adsystem\.com",
    ];
    
    for pattern in ad_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if re.is_match(url) {
                log::debug!("URL de anúncio/tracker ignorada: {}", url);
                return true;
            }
        }
    }
    false
}

/// Limpa URL removendo parâmetros de tracking e redirecionamento
fn clean_url(url: &str) -> Option<String> {
    // Se for URL de anúncio, ignorar completamente
    if is_ad_or_tracker_url(url) {
        return None;
    }
    
    // Tentar extrair URL real de redirecionamentos do DuckDuckGo
    if url.contains("duckduckgo.com") {
        // Formato: /l/?kh=-1&uddg=<URL_ENCODED> ou /y.js?ad_provider=...
        if url.contains("/y.js") || url.contains("aclick") {
            return None; // É anúncio
        }
        
        if let Some(uddg_start) = url.find("uddg=") {
            if let Some(encoded_url) = url.get(uddg_start + 5..) {
                if let Some(ampersand) = encoded_url.find('&') {
                    if let Ok(decoded) = urlencoding::decode(&encoded_url[..ampersand]) {
                        return Some(decoded.to_string());
                    }
                } else if let Ok(decoded) = urlencoding::decode(encoded_url) {
                    return Some(decoded.to_string());
                }
            }
        }
    }
    
    // Se já for URL limpa, validar formato
    if url.starts_with("http://") || url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

/// Busca usando query "site:" para categorias específicas
async fn search_with_site_filter(query: &str, sites: &[String], limit: usize) -> Result<Vec<String>> {
    if sites.is_empty() {
        return Ok(Vec::new());
    }
    
    // Construir query: site:site1.com OR site:site2.com ... {query}
    let site_filters: Vec<String> = sites.iter()
        .map(|site| format!("site:{}", site))
        .collect();
    
    let site_query = format!("({}) {}", site_filters.join(" OR "), query);
    
    search_duckduckgo(&site_query, limit).await
}

/// Busca inteligente híbrida: geral + curada por categorias
pub async fn smart_search(query: &str, config: &SearchConfig) -> Result<Vec<String>> {
    let mut all_urls = Vec::new();
    let mut seen_urls = std::collections::HashSet::new();
    
    // 1. Busca geral no DuckDuckGo (ignorando anúncios)
    log::info!("Executando busca geral para: {}", query);
    let general_urls = search_duckduckgo(query, config.total_sources_limit).await?;
    
    for url in general_urls {
        if let Some(cleaned) = clean_url(&url) {
            if !is_domain_blocked(&cleaned, &config.excluded_domains) {
                if seen_urls.insert(cleaned.clone()) {
                    all_urls.push(cleaned);
                }
            }
        }
    }
    
    // 2. Busca direta por categorias ativas (site: filters)
    for category in &config.categories {
        if !category.enabled || category.base_sites.is_empty() {
            continue;
        }
        
        log::info!("Buscando em categoria '{}' ({} sites)", category.name, category.base_sites.len());
        
        // Limitar sites por categoria para não exceder o limite total
        let sites_to_search = category.base_sites.iter()
            .take(config.total_sources_limit / config.categories.len().max(1))
            .cloned()
            .collect::<Vec<_>>();
        
        match search_with_site_filter(query, &sites_to_search, config.total_sources_limit).await {
            Ok(category_urls) => {
                for url in category_urls {
                    if let Some(cleaned) = clean_url(&url) {
                        if !is_domain_blocked(&cleaned, &config.excluded_domains) {
                            if seen_urls.insert(cleaned.clone()) {
                                all_urls.push(cleaned);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Erro ao buscar categoria '{}': {}", category.name, e);
            }
        }
    }
    
    // 3. Adicionar sites customizados do usuário
    if !config.user_custom_sites.is_empty() {
        log::info!("Buscando em {} sites customizados", config.user_custom_sites.len());
        match search_with_site_filter(query, &config.user_custom_sites, config.total_sources_limit).await {
            Ok(custom_urls) => {
                for url in custom_urls {
                    if let Some(cleaned) = clean_url(&url) {
                        if !is_domain_blocked(&cleaned, &config.excluded_domains) {
                            if seen_urls.insert(cleaned.clone()) {
                                all_urls.push(cleaned);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!("Erro ao buscar sites customizados: {}", e);
            }
        }
    }
    
    // Limitar ao total_sources_limit
    all_urls.truncate(config.total_sources_limit);
    
    log::info!("Total de {} URLs únicas coletadas", all_urls.len());
    Ok(all_urls)
}

/// Busca e extrai conteúdo de múltiplas URLs em paralelo com Semaphore
pub async fn search_and_scrape(
    query: &str,
    limit: usize,
    browser: Arc<Browser>,
    excluded_domains: Vec<String>,
) -> Result<Vec<ScrapedContent>> {
    // Configuração padrão (backward compatibility)
    let config = SearchConfig {
        max_concurrent_tabs: 5,
        total_sources_limit: limit,
        categories: Vec::new(),
        user_custom_sites: Vec::new(),
        excluded_domains,
    };
    
    search_and_scrape_with_config(query, &config, browser).await
}

/// Versão nova com SearchConfig completo
pub async fn search_and_scrape_with_config(
    query: &str,
    config: &SearchConfig,
    browser: Arc<Browser>,
) -> Result<Vec<ScrapedContent>> {
    // 1. Busca inteligente híbrida
    let urls = smart_search(query, config).await?;
    
    if urls.is_empty() {
        log::warn!("Nenhuma URL encontrada para a query: {}", query);
        return Ok(Vec::new());
    }

    // 2. Scraping paralelo com Semaphore (limita abas simultâneas)
    let semaphore = Arc::new(Semaphore::new(config.max_concurrent_tabs));
    let mut handles = Vec::new();
    
    for url in urls.clone() {
        let browser_clone = browser.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let url_clone = url.clone();
        let handle = tokio::task::spawn_blocking(move || {
            let res = fetch_and_convert_sync(&browser_clone, &url_clone);
            drop(permit);
            (url_clone, res)
        });
        handles.push(handle);
    }

    // 3. Coletar resultados (ignorar erros individuais, continuar com sucessos)
    let mut results = Vec::new();
    let mut failed_urls = Vec::new();
    let mut connection_closed = false;
    for handle in handles {
        match handle.await {
            Ok((_, Ok(content))) => {
                // Filtrar conteúdo muito curto (< 200 caracteres)
                let content_length = content.content.chars().count();
                let markdown_length = content.markdown.chars().count();
                
                if content_length < 200 && markdown_length < 200 {
                    log::debug!(
                        "Fonte descartada por conteúdo muito curto ({} chars): {}",
                        content_length.max(markdown_length),
                        content.url
                    );
                } else {
                    results.push(content);
                }
            }
            Ok((url, Err(e))) => {
                let err_msg = format!("{}", e);
                if err_msg.contains("Timeout") || err_msg.contains("ERR_HTTP") {
                    log::debug!("URL ignorada (timeout/erro HTTP): {}", err_msg);
                    failed_urls.push(url);
                } else {
                    log::warn!("Erro ao processar URL: {}", e);
                    if err_msg.contains("underlying connection is closed") {
                        connection_closed = true;
                        failed_urls.push(url);
                    }
                }
            }
            Err(e) => {
                log::warn!("Erro na task de scraping: {}", e);
            }
        }
    }
    
    if connection_closed && !failed_urls.is_empty() {
        let retry_concurrency = std::cmp::min(3, config.max_concurrent_tabs.max(1));
        let semaphore = Arc::new(Semaphore::new(retry_concurrency));
        let browser_new = Arc::new(create_browser()?);
        let mut retry_handles = Vec::new();
        for url in failed_urls.clone() {
            let browser_clone = browser_new.clone();
            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let url_clone = url.clone();
            let handle = tokio::task::spawn_blocking(move || {
                let res = fetch_and_convert_sync(&browser_clone, &url_clone);
                drop(permit);
                (url_clone, res)
            });
            retry_handles.push(handle);
        }
        for h in retry_handles {
            match h.await {
                Ok((_, Ok(content))) => {
                    let content_length = content.content.chars().count();
                    let markdown_length = content.markdown.chars().count();
                    if content_length >= 200 || markdown_length >= 200 {
                        results.push(content);
                    }
                }
                Ok((url, Err(e))) => {
                    log::warn!("Falha após retry para URL {}: {}", url, e);
                }
                Err(e) => log::warn!("Erro na task de retry: {}", e),
            }
        }
    }
    
    if results.is_empty() {
        log::warn!("Nenhuma fonte foi extraída com sucesso para a query: {}", query);
    } else {
        log::info!("Extraídas {} fontes com sucesso", results.len());
    }

    Ok(results)
}

/// Busca e extrai conteúdo de uma única URL
pub async fn scrape_url(
    url: &str,
    browser: Arc<Browser>,
) -> Result<ScrapedContent> {
    let browser_clone = browser.clone();
    let url_str = url.to_string();
    tokio::task::spawn_blocking(move || {
        fetch_and_convert_sync(&browser_clone, &url_str)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Erro na task: {}", e))?
}

/// Extrai conteúdo de múltiplas URLs já definidas (bulk)
pub async fn scrape_urls_bulk(
    urls: Vec<String>,
    browser: Arc<Browser>,
) -> Result<Vec<ScrapedContent>> {
    if urls.is_empty() { return Ok(Vec::new()); }
    let concurrency = 5usize;
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::new();

    for url in urls {
        let browser_clone = browser.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let url_clone = url.clone();
        let handle = tokio::task::spawn_blocking(move || {
            let res = fetch_and_convert_sync(&browser_clone, &url_clone);
            drop(permit);
            res
        });
        handles.push(handle);
    }

    let mut results = Vec::new();
    for h in handles {
        match h.await {
            Ok(Ok(content)) => {
                let content_len = content.content.chars().count();
                let md_len = content.markdown.chars().count();
                if content_len < 200 && md_len < 200 {
                    log::debug!("Descartado por conteúdo curto: {}", content.url);
                } else {
                    results.push(content);
                }
            }
            Ok(Err(e)) => {
                let msg = format!("{}", e);
                if msg.contains("Timeout") || msg.contains("ERR_HTTP") {
                    log::debug!("Ignorado (timeout/HTTP): {}", msg);
                } else {
                    log::warn!("Erro ao processar URL: {}", e);
                }
            }
            Err(e) => log::warn!("Erro na task de scraping: {}", e),
        }
    }

    Ok(results)
}

/// Extrai conteúdo de uma URL e converte para Markdown (versão síncrona)
/// Retorna erro se timeout ou falha HTTP, mas não mata o processo
fn fetch_and_convert_sync(browser: &Browser, url: &str) -> Result<ScrapedContent> {
    use std::time::Instant;
    
    let start_time = Instant::now();
    let max_duration = Duration::from_secs(10); // Timeout agressivo de 10s
    
    // Criar nova aba com tratamento de erro
    let tab = match browser.new_tab() {
        Ok(t) => t,
        Err(e) => {
            log::warn!("Falha ao criar aba para {}: {}", url, e);
            return Err(anyhow::anyhow!("Falha ao criar aba: {}", e));
        }
    };
    
    // Timeout reduzido para navegação
    tab.set_default_timeout(Duration::from_secs(8));
    
    // Tentar navegar com tratamento de erro HTTP
    match tab.navigate_to(url) {
        Ok(_) => {},
        Err(e) => {
            let err_msg = format!("{}", e);
            // Se for erro HTTP, apenas logar e retornar erro
            if err_msg.contains("ERR_HTTP_RESPONSE_CODE_FAILURE") || 
               err_msg.contains("net::ERR") {
                log::warn!("Erro HTTP ao navegar para {}: {}", url, e);
                return Err(anyhow::anyhow!("Erro HTTP: {}", err_msg));
            }
            return Err(anyhow::anyhow!("Falha ao navegar: {}", e));
        }
    }
    
    // Aguardar navegação com verificação de timeout
    match tab.wait_until_navigated() {
        Ok(_) => {},
        Err(e) => {
            let err_msg = format!("{}", e);
            if err_msg.contains("ERR_HTTP_RESPONSE_CODE_FAILURE") || 
               err_msg.contains("net::ERR") {
                log::warn!("Erro HTTP após navegação para {}: {}", url, e);
                return Err(anyhow::anyhow!("Erro HTTP: {}", err_msg));
            }
            // Timeout ou outro erro
            if start_time.elapsed() > max_duration {
                log::warn!("Timeout ao aguardar navegação para {}", url);
                return Err(anyhow::anyhow!("Timeout ao carregar página"));
            }
            return Err(anyhow::anyhow!("Falha ao aguardar navegação: {}", e));
        }
    }
    
    // Verificar timeout antes de continuar
    if start_time.elapsed() > max_duration {
        log::warn!("Timeout antes de extrair conteúdo de {}", url);
        return Err(anyhow::anyhow!("Timeout ao processar página"));
    }
    
    // Aguardar um pouco para JS/SPAs carregarem (máximo 1.5s)
    let wait_time = Duration::from_millis(1500);
    if start_time.elapsed() + wait_time < max_duration {
        std::thread::sleep(wait_time);
    } else {
        let remaining = max_duration.saturating_sub(start_time.elapsed());
        if !remaining.is_zero() {
            std::thread::sleep(remaining);
        }
    }
    
    // Verificar timeout final
    if start_time.elapsed() > max_duration {
        log::warn!("Timeout ao processar {}", url);
        return Err(anyhow::anyhow!("Timeout ao processar página"));
    }
    
    // Injetar script para bloquear autoplay de mídia
    // Isso garante que nenhum vídeo/áudio seja reproduzido durante o scraping
    match disable_media_autoplay(&tab) {
        Ok(_) => {
            log::debug!("Autoplay de mídia bloqueado para: {}", url);
        }
        Err(e) => {
            log::warn!("Aviso: Falha ao bloquear autoplay em {}: {}", url, e);
            // Não falhar o scraping por causa disso, apenas logar
        }
    }
    
    // Aguardar pequeno delay para garantir que script foi executado
    std::thread::sleep(Duration::from_millis(100));
    
    // Extrair HTML renderizado
    let content = match tab.get_content() {
        Ok(c) => c,
        Err(e) => {
            log::warn!("Falha ao extrair conteúdo de {}: {}", url, e);
            return Err(anyhow::anyhow!("Falha ao extrair HTML: {}", e));
        }
    };
    
    // Limpeza com Readability (remove ads, menus, footers)
    let mut reader = std::io::Cursor::new(content.as_bytes());
    let url_obj = match Url::parse(url) {
        Ok(u) => u,
        Err(e) => {
            log::warn!("URL inválida {}: {}", url, e);
            return Err(anyhow::anyhow!("URL inválida: {}", e));
        }
    };
    
    match readability::extractor::extract(&mut reader, &url_obj) {
        Ok(product) => {
            let markdown = html2text::from_read(product.content.as_bytes(), 80);
            // Se o markdown for muito curto, significa que o readability pode ter falhado
            if markdown.trim().chars().count() < 400 {
                if let Some(fallback) = extract_paragraph_fallback(url, &content) {
                    log::info!("Fallback de parágrafos aplicado para {}", url);
                    return Ok(fallback);
                }
            }
            
            let title = if product.title.is_empty() {
                fallback_title(&content).unwrap_or_else(|| "Fonte externa sem título".to_string())
            } else {
                product.title.clone()
            };
            
            Ok(ScrapedContent {
                title: title.clone(),
                url: url.to_string(),
                content: product.content,
                markdown: format!(
                    "---\nTitle: {}\nSource: {}\n---\n\n{}",
                    title,
                    url,
                    markdown
                ),
            })
        }
        Err(e) => {
            log::warn!("Falha ao extrair conteúdo legível de {}: {}. Tentando fallback...", url, e);
            if let Some(fallback) = extract_paragraph_fallback(url, &content) {
                return Ok(fallback);
            }
            Err(anyhow::anyhow!("Falha ao processar conteúdo: {}", e))
        }
    }
}

/// Desabilita autoplay de mídia injetando JavaScript na página
/// Esta função pausa todos os elementos de vídeo/áudio e previne autoplay
fn disable_media_autoplay(tab: &Tab) -> Result<()> {
    let script = r#"
(function() {
  // Função para pausar todos os elementos de mídia
  const pauseAllMedia = () => {
    const mediaElements = document.querySelectorAll('video, audio');
    let pausedCount = 0;
    
    mediaElements.forEach(media => {
      if (!media.paused) {
        media.pause();
        pausedCount++;
      }
      // Remover atributo autoplay
      media.removeAttribute('autoplay');
      media.autoplay = false;
      // Silenciar mídia
      media.muted = true;
      media.volume = 0;
    });
    
    return pausedCount;
  };
  
  // Executar imediatamente
  const initialPaused = pauseAllMedia();
  
  // Observar mudanças no DOM para novos elementos de mídia
  const observer = new MutationObserver(() => {
    pauseAllMedia();
  });
  
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Prevenir autoplay interceptando o método play()
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function() {
    // Bloquear play se página não estiver em foco ou estiver oculta
    if (document.hidden || !document.hasFocus()) {
      return Promise.reject(new Error('Autoplay blocked by scraper'));
    }
    // Pausar imediatamente após tentativa de play
    const result = originalPlay.call(this);
    if (result && typeof result.then === 'function') {
      result.then(() => {
        this.pause();
        this.muted = true;
      }).catch(() => {});
    } else {
      this.pause();
      this.muted = true;
    }
    return Promise.reject(new Error('Autoplay blocked'));
  };
  
  // Pausar quando página perder foco
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAllMedia();
    }
  });
  
  // Bloquear Web Audio API
  if (window.AudioContext) {
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = function() {
      console.warn('AudioContext blocked by scraper');
      return null;
    };
    window.AudioContext.prototype = OriginalAudioContext.prototype;
  }
  
  if (window.webkitAudioContext) {
    const OriginalWebkitAudioContext = window.webkitAudioContext;
    window.webkitAudioContext = function() {
      console.warn('webkitAudioContext blocked by scraper');
      return null;
    };
    window.webkitAudioContext.prototype = OriginalWebkitAudioContext.prototype;
  }
  
  // Bloquear mídia em iframes também
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        const iframeMedia = iframeDoc.querySelectorAll('video, audio');
        iframeMedia.forEach(media => {
          media.pause();
          media.muted = true;
          media.volume = 0;
          media.removeAttribute('autoplay');
        });
      }
    } catch (e) {
      // Ignorar erros de cross-origin
    }
  });
  
  // Retornar contagem para logging
  return initialPaused;
})();
"#;
    
    match tab.evaluate(script, false) {
        Ok(result) => {
            // Tentar extrair contagem de elementos pausados do resultado
            if let Some(count) = result.value {
                log::info!("Script de bloqueio de mídia injetado: {} elementos pausados", count);
            } else {
                log::debug!("Script de bloqueio de mídia injetado com sucesso");
            }
            Ok(())
        }
        Err(e) => {
            log::warn!("Erro ao injetar script de bloqueio de mídia: {}", e);
            // Não falhar o scraping por causa disso, apenas logar
            Ok(())
        }
    }
}

/// Cria uma instância do Browser (singleton para reutilização)
pub fn create_browser() -> Result<Browser> {
    use std::ffi::OsStr;
    
    // Argumentos do Chrome para bloquear autoplay de mídia
    // Nota: O bloqueio principal será feito via JavaScript injection, mas esses args ajudam
    let chrome_args: Vec<&OsStr> = vec![
        OsStr::new("--autoplay-policy=document-user-activation-required"), // Exige interação do usuário para autoplay
        OsStr::new("--disable-background-media-playback"), // Desabilita reprodução de mídia em segundo plano
        OsStr::new("--mute-audio"), // Silencia todo áudio (mais agressivo, mas garante silêncio)
        OsStr::new("--disable-features=AutoplayIgnoreWebAudio"), // Desabilita autoplay de Web Audio
    ];
    
    let options = LaunchOptions {
        headless: true,
        args: chrome_args,
        ..Default::default()
    };
    
    Browser::new(options)
        .map_err(|e| anyhow::anyhow!("Falha ao criar browser: {}", e))
}

fn extract_paragraph_fallback(url: &str, html: &str) -> Option<ScrapedContent> {
    use scraper::{Html, Selector};
    
    let document = Html::parse_document(html);
    let paragraph_selector = Selector::parse("p").ok()?;
    let mut paragraphs = Vec::new();
    
    for element in document.select(&paragraph_selector) {
        let text = element.text().collect::<Vec<_>>().join(" ");
        let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.chars().count() >= 100 {
            paragraphs.push(normalized);
        }
        if paragraphs.len() >= 20 {
            break;
        }
    }
    
    if paragraphs.len() < 3 {
        return None;
    }
    
    let fallback_body = paragraphs.join("\n\n");
    let title = fallback_title(html).unwrap_or_else(|| "Conteúdo externo".to_string());
    
    Some(ScrapedContent {
        title: title.clone(),
        url: url.to_string(),
        content: fallback_body.clone(),
        markdown: format!(
            "---\nTitle: {}\nSource: {}\n---\n\n{}",
            title,
            url,
            fallback_body
        ),
    })
}

fn fallback_title(html: &str) -> Option<String> {
    use scraper::{Html, Selector};
    
    let document = Html::parse_document(html);
    
    if let Ok(selector) = Selector::parse("title") {
        if let Some(node) = document.select(&selector).next() {
            let text = node.text().collect::<Vec<_>>().join(" ").trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    
    if let Ok(selector) = Selector::parse("h1") {
        if let Some(node) = document.select(&selector).next() {
            let text = node.text().collect::<Vec<_>>().join(" ").trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }
    
    None
}

