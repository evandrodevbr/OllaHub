use anyhow::Result;
use reqwest::header::USER_AGENT;
<<<<<<< HEAD
use std::sync::Arc;
=======
use scraper::{Html, Selector};
use std::sync::{Arc, Mutex, OnceLock};
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
use std::time::Duration;
use url::Url;
use rand::Rng;
use tokio::sync::Semaphore;
use regex::Regex;
use std::time::Instant;
use crate::content_store::ContentStore;

use crate::python_scraper::{get_or_create_python_scraper, PythonSearchResult};
use crate::scraper_state::ScraperState;

/// Lazy-initialized global browser instance
/// Evita criar o browser no startup, economizando ~500MB de RAM até ser necessário
static LAZY_BROWSER: OnceLock<Mutex<Option<Arc<Browser>>>> = OnceLock::new();

/// Obtém ou cria a instância global do browser (lazy initialization)
pub fn get_or_create_browser() -> Result<Arc<Browser>> {
    let mutex = LAZY_BROWSER.get_or_init(|| Mutex::new(None));
    let mut guard = mutex.lock().map_err(|e| anyhow::anyhow!("Browser mutex poisoned: {}", e))?;
    
    if guard.is_none() {
        log::info!("[LazyBrowser] Initializing headless browser on first use...");
        let browser = create_browser()?;
        *guard = Some(Arc::new(browser));
        log::info!("[LazyBrowser] Browser initialized successfully");
    }
    
    Ok(guard.as_ref().unwrap().clone())
}

/// Limpa a instância do browser (para liberar memória quando não em uso)
pub fn clear_browser() {
    if let Some(mutex) = LAZY_BROWSER.get() {
        if let Ok(mut guard) = mutex.lock() {
            if guard.is_some() {
                log::info!("[LazyBrowser] Clearing browser instance to free memory");
                *guard = None;
            }
        }
    }
}

/// Resultado da extração de conteúdo de uma URL
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ScrapedContent {
    pub title: String,
    pub url: String,
    pub content: String,
    pub markdown: String,
    pub cached: bool,
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

/// Configuração do SearXNG
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SearxngConfig {
    pub enabled: bool,
    pub url: String,
}

impl Default for SearxngConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            url: "http://localhost:8080".to_string(),
        }
    }
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
    #[serde(default)]
    pub searxng: SearxngConfig,
}

fn default_max_concurrent() -> usize {
    5
}

fn default_total_sources() -> usize {
    100
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
pub fn get_random_user_agent() -> &'static str {
    let mut rng = rand::thread_rng();
    let index = rng.gen_range(0..USER_AGENTS.len());
    USER_AGENTS[index]
}

fn get_proxies_from_env() -> Vec<String> {
    if let Ok(val) = std::env::var("SCRAPER_HTTP_PROXIES") {
        val.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else {
        Vec::new()
    }
}

fn build_client_with_optional_proxy(timeout_secs: u64) -> Result<reqwest::Client> {
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(timeout_secs)).redirect(reqwest::redirect::Policy::limited(5));
    let proxies = get_proxies_from_env();
    if !proxies.is_empty() {
        let mut rng = rand::thread_rng();
        let idx = rng.gen_range(0..proxies.len());
        if let Ok(http_proxy) = reqwest::Proxy::http(&proxies[idx]) {
            builder = builder.proxy(http_proxy);
        }
        if let Ok(https_proxy) = reqwest::Proxy::https(&proxies[idx]) {
            builder = builder.proxy(https_proxy);
        }
    }
    Ok(builder.build()?)
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

/// Busca usando query "site:" para categorias específicas via DuckDuckGo
async fn search_with_site_filter(
    query: &str,
    sites: &[String],
    limit: usize,
) -> Result<Vec<String>> {
    if sites.is_empty() {
        return Ok(Vec::new());
    }
    
    // Construir query: site:site1.com OR site:site2.com ... {query}
    let site_filters: Vec<String> = sites.iter()
        .map(|site| format!("site:{}", site))
        .collect();
    
    let site_query = format!("({}) {}", site_filters.join(" OR "), query);
    
    // Usar DuckDuckGo via Python
    match search_via_duckduckgo(&site_query, limit).await {
        Ok(results) => {
            let urls: Vec<String> = results.iter().map(|r| r.url.clone()).collect();
            Ok(urls.into_iter().take(limit).collect())
        }
        Err(e) => {
            log::warn!("DuckDuckGo search failed for site filter: {}", e);
            Err(anyhow::anyhow!("DuckDuckGo search failed: {}", e))
        }
    }
}

/// Busca via DuckDuckGo usando Python microservice
pub async fn search_via_duckduckgo(query: &str, max_results: usize) -> Result<Vec<PythonSearchResult>> {
    let python_scraper = get_or_create_python_scraper()
        .map_err(|e| anyhow::anyhow!("Failed to get Python scraper: {}", e))?;
    
    let mut scraper = python_scraper.lock().await;
    
    scraper.search_duckduckgo(query, "wt-wt", "moderate", max_results)
        .await
        .map_err(|e| anyhow::anyhow!("DuckDuckGo search error: {}", e))
}

/// Converte resultados DuckDuckGo para URLs
pub fn duckduckgo_results_to_urls(results: &[PythonSearchResult]) -> Vec<String> {
    results.iter().map(|r| r.url.clone()).collect()
}

/// Converte resultados DuckDuckGo para metadata
pub fn duckduckgo_results_to_metadata(results: &[PythonSearchResult]) -> Vec<SearchResultMetadata> {
    results.iter().map(|r| SearchResultMetadata {
        title: r.title.clone(),
        url: r.url.clone(),
        snippet: r.content.clone(),
    }).collect()
}

/// Busca inteligente usando apenas SearXNG
/// Nodriver é usado para scraping das URLs encontradas (fonte primária)
pub async fn smart_search(
    query: &str,
    config: &SearchConfig,
) -> Result<Vec<String>> {
    use crate::search_orchestrator::search_with_waterfall;
    
    if !config.searxng.enabled {
        return Err(anyhow::anyhow!("SearXNG não está habilitado. Configure SearXNG nas configurações."));
    }
    
    log::info!("Executando busca via SearXNG para: {}", query);
    
    // Buscar metadados via SearXNG
    match search_with_waterfall(query, config.total_sources_limit, config, None).await {
        Ok(metadata) => {
            let mut all_urls = Vec::new();
            let mut seen_urls = std::collections::HashSet::new();
            
            // Extrair URLs dos metadados
            for meta in metadata {
                if let Some(cleaned) = clean_url(&meta.url) {
                    if !is_domain_blocked(&cleaned, &config.excluded_domains) {
                        if seen_urls.insert(cleaned.clone()) {
                            all_urls.push(cleaned);
                        }
                    }
                }
            }
            
            // Limitar ao total_sources_limit
            all_urls.truncate(config.total_sources_limit);
            
            log::info!("Total de {} URLs únicas coletadas via SearXNG", all_urls.len());
            Ok(all_urls)
        }
        Err(e) => {
            log::error!("Erro na busca via SearXNG: {}", e);
            Err(anyhow::anyhow!("SearXNG search failed: {}", e))
        }
    }
}

/// Busca e extrai conteúdo de múltiplas URLs em paralelo com Semaphore
/// Usa DuckDuckGo para busca
pub async fn search_and_scrape(
    query: &str,
    limit: usize,
    excluded_domains: Vec<String>,
) -> Result<Vec<ScrapedContent>> {
    // Configuração padrão (backward compatibility)
    let config = SearchConfig {
        max_concurrent_tabs: 5,
        total_sources_limit: limit,
        categories: Vec::new(),
        user_custom_sites: Vec::new(),
        excluded_domains,
        searxng: SearxngConfig::default(),
    };
    
    search_and_scrape_with_config(query, &config, None).await
}

/// Versão nova com SearchConfig completo
pub async fn search_and_scrape_with_config(
    query: &str,
    config: &SearchConfig,
    state: Option<ScraperState>,
) -> Result<Vec<ScrapedContent>> {
    // 1. Busca inteligente híbrida via DuckDuckGo
    let urls = smart_search(query, config).await?;
    
    if urls.is_empty() {
        log::warn!("Nenhuma URL encontrada para a query: {}", query);
        return Ok(Vec::new());
    }

<<<<<<< HEAD
    // 2. Scraping paralelo usando PythonScraper com Semaphore
    scrape_urls_bulk(urls, state).await
=======
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
        let browser_new = get_or_create_browser()?;
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
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
}

/// Scraping estático usando apenas reqwest (sem headless browser)
/// Muito mais rápido (~100ms vs ~3s) e consome menos RAM
/// Retorna None se o conteúdo for insuficiente (SPA/JavaScript-heavy)
pub async fn scrape_url_static(url: &str) -> Result<Option<ScrapedContent>> {
    let client = reqwest::Client::builder()
<<<<<<< HEAD
        .timeout(Duration::from_secs(5)) // Reduzido de 8s para 5s para maior velocidade
=======
        .timeout(Duration::from_secs(8))
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()?;
    
    let user_agent = get_random_user_agent();
    let start_time = Instant::now();
    
    log::debug!("[StaticScrape] Fetching: {}", url);
    
    let response = match client
        .get(url)
        .header(USER_AGENT, user_agent)
        .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            log::debug!("[StaticScrape] Request failed for {}: {}", url, e);
            return Ok(None);
        }
    };
    
    if !response.status().is_success() {
        log::debug!("[StaticScrape] HTTP {} for {}", response.status(), url);
        return Ok(None);
    }
    
    let html = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            log::debug!("[StaticScrape] Failed to read body for {}: {}", url, e);
            return Ok(None);
        }
    };
    
    let duration = start_time.elapsed().as_millis();
    
    // Usar extract_paragraph_fallback existente
    let result = extract_paragraph_fallback(url, &html);
    
    if let Some(ref content) = result {
        log::info!("[StaticScrape] Success for {} ({} chars, {}ms)", 
            url, content.content.len(), duration);
    } else {
        log::debug!("[StaticScrape] Insufficient content for {} ({}ms)", url, duration);
    }
    
    Ok(result)
}

<<<<<<< HEAD
/// Busca e extrai conteúdo de uma única URL usando Python scraper
/// Otimizado: Cache primeiro, depois Nodriver (PRIMÁRIO), depois estático (fallback rápido)
=======
/// Busca e extrai conteúdo de uma única URL (híbrido: tenta estático primeiro)
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
pub async fn scrape_url(
    url: &str,
) -> Result<ScrapedContent> {
<<<<<<< HEAD
    log::info!("[Scraper_DEBUG] Invocando scraper para URL: {}", url);
    
    // 1. Verificar Cache PRIMEIRO (mais rápido)
    if let Some(cached) = ContentStore::get_cached_content(url).await {
        log::info!("[Cache] Hit for {}", url);
        ContentStore::log_operation(url, "CACHE_HIT", 0, cached.content_markdown.len()).await;
        return Ok(ScrapedContent {
            title: cached.title,
            url: cached.url,
            content: cached.content_markdown.clone(),
            markdown: cached.content_markdown,
            cached: true,
        });
    }

    // 2. Nodriver PRIMEIRO (fonte primária, anti-detecção)
    let python_scraper = get_or_create_python_scraper()?;
    let mut scraper = python_scraper.lock().await;
    
    let start_time = Instant::now();
    match scraper.scrape_url(url).await {
        Ok(python_content) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::info!("[Nodriver] Successfully scraped {} ({} chars, {}ms)", url, python_content.content.len(), duration);
            
            // Salvar no Cache
            if let Err(e) = ContentStore::save_content(
                &python_content.url,
                &python_content.title,
                &python_content.markdown,
                None
            ).await {
                log::warn!("Failed to save to cache: {}", e);
            }
            
            ContentStore::log_operation(url, "SCRAPE_NODRIVER_SUCCESS", duration, python_content.content.len()).await;
            
            return Ok(ScrapedContent {
                title: python_content.title,
                url: python_content.url,
                content: python_content.content,
                markdown: python_content.markdown,
                cached: false,
            });
        }
        Err(e) => {
            let duration = start_time.elapsed().as_millis() as u64;
            log::warn!("[Nodriver] Failed for {} after {}ms: {}, trying static fallback", url, duration, e);
            // Continuar para fallback estático
        }
    }
    
    // 3. Fallback: Scraping estático (rápido, ~100ms) apenas se nodriver falhar
    if let Ok(static_result) = scrape_url_static(url).await {
        if let Some(content) = static_result {
            let _ = ContentStore::save_content(&content.url, &content.title, &content.markdown, None).await;
            ContentStore::log_operation(url, "SCRAPE_STATIC_SUCCESS", 0, content.content.len()).await;
=======
    // OTIMIZAÇÃO: Tentar scraping estático primeiro (muito mais rápido)
    if let Ok(Some(content)) = scrape_url_static(url).await {
        // Se conseguiu conteúdo suficiente (>500 chars), usar resultado estático
        if content.content.len() > 500 {
            log::info!("[ScrapeHybrid] Using static result for {} ({} chars)", url, content.content.len());
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
            return Ok(content);
        }
    }
    
<<<<<<< HEAD
    // Se ambos falharam, retornar erro do nodriver
    Err(anyhow::anyhow!("Both nodriver and static scraping failed for {}", url))
=======
    // Fallback: usar headless browser para SPAs/JS-heavy pages
    log::info!("[ScrapeHybrid] Falling back to headless for {}", url);
    let browser_clone = browser.clone();
    let url_str = url.to_string();
    tokio::task::spawn_blocking(move || {
        fetch_and_convert_sync(&browser_clone, &url_str)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Erro na task: {}", e))?
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
}

/// Extrai conteúdo de múltiplas URLs já definidas (bulk)
pub async fn scrape_urls_bulk(
    urls: Vec<String>,
    state: Option<ScraperState>,
) -> Result<Vec<ScrapedContent>> {
    use crate::domain_strategy::DomainStrategy;
    
    log::info!("[Scraper_DEBUG] Scrape bulk iniciado ({} URLs)", urls.len());
    if urls.is_empty() { return Ok(Vec::new()); }
    
    // Criar instância de DomainStrategy (Arc para compartilhar entre tasks)
    let domain_strategy_arc = Arc::new(DomainStrategy::new());
    
    let python_scraper = get_or_create_python_scraper()?;
    let concurrency = 14usize; // Aumentado para 14 URLs simultâneas para máxima velocidade
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let mut handles = Vec::new();

    if let Some(s) = &state {
        s.logger.info("ScrapeBulkStarted", Some("BulkScraper"), Some(serde_json::json!({"urls_count": urls.len()})));
    }

    for url in urls.clone() {
        // Verificar se deve fazer scraping baseado em histórico do domínio
        if !domain_strategy_arc.should_scrape(&url).await {
            log::info!("[DomainStrategy] Skipping scrape for {} (low success rate)", url);
            // Registrar como falha para manter histórico
            domain_strategy_arc.record_result(&url, false).await;
            continue;
        }
        // Check cancellation before starting new task
        if let Some(s) = &state {
            if s.check_cancelled() {
                s.logger.warn("ScrapeBulkCancelled", Some("BulkScraper"), None);
                break;
            }
        }

        let scraper = python_scraper.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let url_clone = url.clone();
        let state_clone = state.clone();
        let domain_strategy_clone = domain_strategy_arc.clone();

        let handle = tokio::spawn(async move {
            // Check cancellation inside task
            if let Some(s) = &state_clone {
                if s.check_cancelled() {
                    drop(permit);
                    return Err(anyhow::anyhow!("Cancelled"));
                }
                s.logger.log_access(&url_clone, "ScrapeStart");
            }

            // Check cache inside the task PRIMEIRO (mais rápido)
            if let Some(cached) = ContentStore::get_cached_content(&url_clone).await {
                drop(permit); // Release semaphore immediately
                
                if let Some(s) = &state_clone {
                    s.logger.info("CacheHit", Some("ContentStore"), Some(serde_json::json!({"url": url_clone})));
                } else {
                    log::info!("[Cache] Hit for {}", url_clone);
                }
                
                ContentStore::log_operation(&url_clone, "CACHE_HIT", 0, cached.content_markdown.len()).await;
                // Registrar sucesso no DomainStrategy (cache hit é considerado sucesso)
                domain_strategy_clone.record_result(&url_clone, true).await;
                return Ok(ScrapedContent {
                    title: cached.title,
                    url: cached.url,
                    content: cached.content_markdown.clone(),
                    markdown: cached.content_markdown,
                    cached: true,
                });
            }

            // Tentar Nodriver PRIMEIRO (fonte primária)
            let mut scraper_guard = scraper.lock().await;
            
            // Double check cancellation before heavy lifting
            if let Some(s) = &state_clone {
                if s.check_cancelled() {
                    drop(scraper_guard);
                    drop(permit);
                    return Err(anyhow::anyhow!("Cancelled"));
                }
            }

            let start_time = Instant::now();
            log::info!("[Scraper_DEBUG] Chamando Nodriver (primário) para {}", url_clone);
            let result = scraper_guard.scrape_url(&url_clone).await;
            let duration = start_time.elapsed().as_millis() as u64;
            drop(scraper_guard);
            
            // Se nodriver falhou rapidamente (< 3s), tentar fallback estático
            if result.is_err() && duration < 3000 {
                log::info!("[Scraper_DEBUG] Nodriver falhou rapidamente, tentando fallback estático para {}", url_clone);
                if let Ok(static_opt) = scrape_url_static(&url_clone).await {
                    if let Some(content) = static_opt {
                        if let Some(s) = &state_clone {
                            s.logger.log_scraping_result(&content.url, true, 0, content.content.len(), None);
                        }
                        let _ = ContentStore::save_content(&content.url, &content.title, &content.markdown, None).await;
                        ContentStore::log_operation(&content.url, "SCRAPE_STATIC_SUCCESS", 0, content.content.len()).await;
                        domain_strategy_clone.record_result(&url_clone, true).await;
                        drop(permit);
                        return Ok(content);
                    }
                }
            }
            
            drop(permit);
            
            // Registrar resultado no DomainStrategy
            let success = result.is_ok();
            domain_strategy_clone.record_result(&url_clone, success).await;
            
            if let Ok(ref content) = result {
                 if let Some(s) = &state_clone {
                     s.logger.log_scraping_result(&content.url, true, duration, content.content.len(), None);
                     // Log raw data as requested
                     s.logger.info("RawDataCaptured", Some("Scraper"), Some(serde_json::json!({
                         "url": content.url,
                         "raw_length": content.content.len(),
                         "snippet": content.content.chars().take(200).collect::<String>()
                     })));
                 }

                 let _ = ContentStore::save_content(
                     &content.url,
                     &content.title,
                     &content.markdown,
                     None
                 ).await;
                 ContentStore::log_operation(&content.url, "SCRAPE_SUCCESS", duration, content.content.len()).await;
            } else if let Err(ref e) = result {
                 if let Some(s) = &state_clone {
                     s.logger.log_scraping_result(&url_clone, false, duration, 0, Some(&e.to_string()));
                 }
                 ContentStore::log_operation(&url_clone, "SCRAPE_ERROR", duration, 0).await;
            }
            
            result.map(|python_content| ScrapedContent {
                title: python_content.title,
                url: python_content.url,
                content: python_content.content,
                markdown: python_content.markdown,
                cached: false,
            })
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
                    if let Some(s) = &state {
                        s.logger.info("ContentFiltered", Some("Filter"), Some(serde_json::json!({
                            "url": content.url,
                            "reason": "too_short",
                            "length": content_len
                        })));
                    } else {
                        log::debug!("Descartado por conteúdo curto: {}", content.url);
                    }
                } else {
                    results.push(content);
                }
            }
            Ok(Err(e)) => {
                let msg = format!("{}", e);
                if msg == "Cancelled" {
                    // Just ignore
                } else if msg.contains("Timeout") || msg.contains("ERR_HTTP") || msg.contains("ERR_SPA_JS_REQUIRED") {
                    if let Some(s) = &state {
                        s.logger.warn("ScrapeIgnored", Some("BulkScraper"), Some(&msg));
                    } else {
                        log::debug!("Ignorado (timeout/HTTP/SPA): {}", msg);
                    }
                } else {
                    if let Some(s) = &state {
                        s.logger.error("ScrapeTaskError", Some("BulkScraper"), Some(&msg), None);
                    } else {
                        log::warn!("Erro ao processar URL: {}", e);
                    }
                }
            }
            Err(e) => {
                if let Some(s) = &state {
                    s.logger.error("JoinError", Some("BulkScraper"), Some(&e.to_string()), None);
                } else {
                    log::warn!("Erro na task de scraping: {}", e);
                }
            },
        }
    }

    Ok(results)
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
        cached: false,
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

