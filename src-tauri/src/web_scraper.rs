use anyhow::Result;
use headless_chrome::{Browser, LaunchOptions};
use reqwest::header::USER_AGENT;
use scraper::{Html, Selector};
use std::sync::Arc;
use std::time::Duration;
use url::Url;
use rand::Rng;
use tokio::sync::Semaphore;
use regex::Regex;

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
    40
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
    
    let url = format!("https://html.duckduckgo.com/html/?q={}", 
        urlencoding::encode(query));
    
    // User-Agent rotativo para evitar bloqueios
    let user_agent = get_random_user_agent();
    log::debug!("Usando User-Agent: {}", user_agent);
    
    let res = client
        .get(&url)
        .header(USER_AGENT, user_agent)
        .send()
        .await?
        .text()
        .await?;

    let document = Html::parse_document(&res);
    
    // Seletores para links orgânicos do DuckDuckGo
    // Tenta múltiplos seletores para maior compatibilidade
    let selectors = vec![
        ".result__a",
        ".web-result__link",
        "a.result__a",
    ];

    let mut links = Vec::new();
    
    for selector_str in selectors {
        if let Ok(selector) = Selector::parse(selector_str) {
            for element in document.select(&selector).take(limit) {
                if let Some(href) = element.value().attr("href") {
                    // DuckDuckGo usa redirecionamento, extrair URL real
                    if let Some(real_url) = extract_real_url(href) {
                        if !links.contains(&real_url) {
                            links.push(real_url);
                            if links.len() >= limit {
                                break;
                            }
                        }
                    }
                }
            }
            if !links.is_empty() {
                break;
            }
        }
    }

    Ok(links)
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
    
    for url in urls {
        let browser_clone = browser.clone();
        let permit = semaphore.clone().acquire_owned().await.unwrap();
        
        let handle = tokio::task::spawn_blocking(move || {
            let result = fetch_and_convert_sync(&browser_clone, &url);
            drop(permit); // Libera o semáforo após processar
            result
        });
        handles.push(handle);
    }

    // 3. Coletar resultados (ignorar erros individuais, continuar com sucessos)
    let mut results = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(content)) => {
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
            Ok(Err(e)) => {
                let err_msg = format!("{}", e);
                if err_msg.contains("Timeout") || err_msg.contains("ERR_HTTP") {
                    log::debug!("URL ignorada (timeout/erro HTTP): {}", err_msg);
                } else {
                    log::warn!("Erro ao processar URL: {}", e);
                }
            }
            Err(e) => {
                log::warn!("Erro na task de scraping: {}", e);
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

/// Cria uma instância do Browser (singleton para reutilização)
pub fn create_browser() -> Result<Browser> {
    let options = LaunchOptions {
        headless: true,
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

