use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use lru::LruCache;

/// Parâmetros de configuração para llama.cpp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaParams {
    /// Número de camadas para carregar na GPU (0 = CPU apenas)
    pub n_gpu_layers: i32,
    /// Tamanho do contexto
    pub n_ctx: u32,
    /// Número de threads (0 = auto)
    pub threads: u32,
    /// Temperatura para sampling
    pub temperature: f32,
    /// Top-p para sampling
    pub top_p: f32,
    /// Top-k para sampling
    pub top_k: i32,
}

impl Default for LlamaParams {
    fn default() -> Self {
        Self {
            n_gpu_layers: 0,  // CPU por padrão
            n_ctx: 4096,
            threads: 0,  // Auto
            temperature: 0.7,
            top_p: 0.9,
            top_k: 40,
        }
    }
}

/// Metadados de um modelo GGUF
#[derive(Debug, Clone)]
pub struct ModelMetadata {
    pub path: PathBuf,
    pub architecture: Option<String>,
    pub quantization: Option<String>,
    pub parameter_count: Option<u64>,
    pub size: u64,
}

/// Estado de um modelo carregado
#[derive(Debug, Clone)]
pub struct LlamaModel {
    pub path: PathBuf,
    #[cfg(feature = "llama-cpp")]
    pub context: Option<()>, // Placeholder - será LlamaContext quando feature estiver ativa
    pub metadata: ModelMetadata,
    pub last_used: std::time::Instant,
}

/// Estado global do llama.cpp com LRU cache
pub struct LlamaCppState {
    /// Cache LRU de modelos carregados (limite de 3 para prevenir memory leaks)
    pub models: Arc<Mutex<LruCache<String, LlamaModel>>>,
    pub default_params: LlamaParams,
}

impl LlamaCppState {
    pub fn new() -> Self {
        Self {
            models: Arc::new(Mutex::new(LruCache::new(
                std::num::NonZeroUsize::new(3).unwrap()
            ))),
            default_params: LlamaParams::default(),
        }
    }

    /// Obtém um modelo do cache ou retorna None
    pub fn get_model(&self, model_id: &str) -> Option<LlamaModel> {
        let mut cache = self.models.lock().unwrap();
        cache.get(model_id).cloned()
    }

    /// Adiciona um modelo ao cache (LRU remove automaticamente o mais antigo se necessário)
    pub fn add_model(&self, model_id: String, model: LlamaModel) {
        let mut cache = self.models.lock().unwrap();
        cache.put(model_id, model);
    }

    /// Remove um modelo do cache
    pub fn remove_model(&self, model_id: &str) -> Option<LlamaModel> {
        let mut cache = self.models.lock().unwrap();
        cache.pop(model_id)
    }

    /// Limpa todos os modelos do cache
    pub fn clear(&self) {
        let mut cache = self.models.lock().unwrap();
        cache.clear();
    }

    /// Lista todos os modelos no cache
    pub fn list_models(&self) -> Vec<String> {
        let cache = self.models.lock().unwrap();
        cache.iter().map(|(k, _)| k.clone()).collect()
    }
}

impl Default for LlamaCppState {
    fn default() -> Self {
        Self::new()
    }
}
