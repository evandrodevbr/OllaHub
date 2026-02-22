use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use url::Url;

/// Estratégia de circuit breaker por domínio
pub struct DomainStrategy {
    // Armazena taxa de sucesso por domínio (últimas 10 tentativas)
    success_rates: Arc<RwLock<HashMap<String, Vec<bool>>>>,
}

impl DomainStrategy {
    pub fn new() -> Self {
        Self {
            success_rates: Arc::new(RwLock::new(HashMap::new())),
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

    /// Verifica se deve fazer scraping de um domínio
    pub async fn should_scrape(&self, url: &str) -> bool {
        let domain = match Self::extract_domain(url) {
            Some(d) => d,
            None => return true, // Se não conseguir extrair domínio, permite scraping
        };

        let rates = self.success_rates.read().await;

        if let Some(history) = rates.get(&domain) {
            if history.is_empty() {
                return true;
            }

            let success_count = history.iter().filter(|&&s| s).count();
            let success_rate = success_count as f32 / history.len() as f32;

            // Se taxa de sucesso < 30%, pula scraping e usa apenas snippet
            if success_rate < 0.3 {
                log::warn!(
                    "Domain {} has low success rate ({:.0}%), skipping scrape",
                    domain,
                    success_rate * 100.0
                );
                return false;
            }
        }

        true
    }

    /// Registra resultado de scraping
    pub async fn record_result(&self, url: &str, success: bool) {
        let domain = match Self::extract_domain(url) {
            Some(d) => d,
            None => return,
        };

        let mut rates = self.success_rates.write().await;
        let history = rates.entry(domain).or_insert_with(Vec::new);

        history.push(success);

        // Mantém apenas últimas 10 tentativas
        if history.len() > 10 {
            history.remove(0);
        }
    }

    /// Limpa histórico de um domínio (útil para resetar após mudanças)
    pub async fn clear_domain(&self, url: &str) {
        let domain = match Self::extract_domain(url) {
            Some(d) => d,
            None => return,
        };

        let mut rates = self.success_rates.write().await;
        rates.remove(&domain);
    }

    /// Limpa todo o histórico
    pub async fn clear_all(&self) {
        let mut rates = self.success_rates.write().await;
        rates.clear();
    }
}

impl Clone for DomainStrategy {
    fn clone(&self) -> Self {
        Self {
            success_rates: Arc::clone(&self.success_rates),
        }
    }
}

impl Default for DomainStrategy {
    fn default() -> Self {
        Self::new()
    }
}
