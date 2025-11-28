//! Módulo de Embeddings ONNX para ranking de relevância
//!
//! Usa o modelo all-MiniLM-L6-v2 para gerar embeddings de texto
//! e calcular similaridade de cosseno para ranking de resultados de busca.

use anyhow::{Result, anyhow};
use ndarray::Array2;
use ort::session::{Session, builder::GraphOptimizationLevel};
use ort::value::Value;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use tokenizers::Tokenizer;

/// Flag para controlar se o ort já foi inicializado
static ORT_INITIALIZED: OnceLock<Result<(), String>> = OnceLock::new();

/// Dimensão dos embeddings do modelo all-MiniLM-L6-v2
pub const EMBEDDING_DIM: usize = 384;

/// Tamanho máximo de tokens para o modelo
const MAX_SEQ_LENGTH: usize = 256;

/// Global lazy-initialized embedding model (com Mutex para permitir mutabilidade)
static EMBEDDING_MODEL: OnceLock<Result<Arc<Mutex<EmbeddingModel>>, String>> = OnceLock::new();

/// Modelo de embeddings para cálculo de similaridade semântica
pub struct EmbeddingModel {
    session: Session,
    tokenizer: Tokenizer,
}

impl EmbeddingModel {
    /// Carrega o modelo ONNX e tokenizer
    pub fn new(model_path: &str, tokenizer_path: &str) -> Result<Self> {
        // Verificar se arquivos existem
        if !Path::new(model_path).exists() {
            return Err(anyhow!("Model file not found: {}", model_path));
        }
        if !Path::new(tokenizer_path).exists() {
            return Err(anyhow!("Tokenizer file not found: {}", tokenizer_path));
        }
        
        log::info!("[Embeddings] Loading ONNX model from: {}", model_path);
        
        // Criar sessão ONNX
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .commit_from_file(model_path)?;
        
        // Carregar tokenizer
        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow!("Failed to load tokenizer: {}", e))?;
        
        log::info!("[Embeddings] Model loaded successfully");
        
        Ok(Self { session, tokenizer })
    }
    
    /// Gera embedding para um texto
    pub fn embed(&mut self, text: &str) -> Result<Vec<f32>> {
        // Tokenizar texto
        let encoding = self.tokenizer
            .encode(text, true)
            .map_err(|e| anyhow!("Tokenization failed: {}", e))?;
        
        let mut input_ids: Vec<i64> = encoding.get_ids()
            .iter()
            .map(|&id| id as i64)
            .collect();
        let mut attention_mask: Vec<i64> = encoding.get_attention_mask()
            .iter()
            .map(|&m| m as i64)
            .collect();
        let mut token_type_ids: Vec<i64> = encoding.get_type_ids()
            .iter()
            .map(|&t| t as i64)
            .collect();
        
        // Truncar/pad para MAX_SEQ_LENGTH
        input_ids.truncate(MAX_SEQ_LENGTH);
        attention_mask.truncate(MAX_SEQ_LENGTH);
        token_type_ids.truncate(MAX_SEQ_LENGTH);
        
        while input_ids.len() < MAX_SEQ_LENGTH {
            input_ids.push(0);
            attention_mask.push(0);
            token_type_ids.push(0);
        }
        
        // Criar arrays para inferência (batch size = 1)
        let input_ids_array = Array2::from_shape_vec((1, MAX_SEQ_LENGTH), input_ids)?;
        let attention_mask_array = Array2::from_shape_vec((1, MAX_SEQ_LENGTH), attention_mask)?;
        let token_type_ids_array = Array2::from_shape_vec((1, MAX_SEQ_LENGTH), token_type_ids)?;
        
        // Criar inputs ONNX
        let input_ids_value = Value::from_array(input_ids_array)?;
        let attention_mask_value = Value::from_array(attention_mask_array)?;
        let token_type_ids_value = Value::from_array(token_type_ids_array)?;
        
        // Executar inferência usando vetor de inputs
        let inputs: Vec<(std::borrow::Cow<str>, ort::session::SessionInputValue)> = vec![
            ("input_ids".into(), input_ids_value.into()),
            ("attention_mask".into(), attention_mask_value.into()),
            ("token_type_ids".into(), token_type_ids_value.into()),
        ];
        
        let outputs = self.session.run(inputs)?;
        
        // Extrair output (last_hidden_state ou sentence_embedding dependendo do modelo)
        // Para all-MiniLM-L6-v2, fazemos mean pooling do last_hidden_state
        let output = outputs.get("last_hidden_state")
            .or_else(|| outputs.get("sentence_embedding"))
            .ok_or_else(|| anyhow!("Output tensor not found"))?;
        
        let (shape, raw_data) = output.try_extract_tensor::<f32>()?;
        // Shape implementa Deref para [i64], então podemos usar diretamente
        let dims: &[i64] = &*shape;
        let data: &[f32] = raw_data;
        
        // Mean pooling: média ao longo da dimensão de sequência
        let embedding = if dims.len() == 3 {
            // Shape: (batch, seq_len, hidden_dim)
            let seq_len = dims[1] as usize;
            let hidden_dim = dims[2] as usize;
            
            let mut pooled = vec![0.0f32; hidden_dim];
            for i in 0..seq_len {
                for j in 0..hidden_dim {
                    let idx = i * hidden_dim + j;
                    pooled[j] += data[idx];
                }
            }
            for v in &mut pooled {
                *v /= seq_len as f32;
            }
            
            // Normalizar L2
            let norm: f32 = pooled.iter().map(|x| x * x).sum::<f32>().sqrt();
            if norm > 0.0 {
                for v in &mut pooled {
                    *v /= norm;
                }
            }
            
            pooled
        } else {
            // Shape: (batch, hidden_dim) - já pooled
            let hidden_dim = dims[1] as usize;
            let mut embedding = Vec::with_capacity(hidden_dim);
            for j in 0..hidden_dim {
                embedding.push(data[j]);
            }
            
            // Normalizar L2
            let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
            if norm > 0.0 {
                for v in &mut embedding {
                    *v /= norm;
                }
            }
            
            embedding
        };
        
        Ok(embedding)
    }
    
    /// Calcula embeddings em batch (mais eficiente para múltiplos textos)
    pub fn embed_batch(&mut self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        // Para simplificar, processa um por um (pode ser otimizado para batch real)
        let mut results = Vec::with_capacity(texts.len());
        for text in texts {
            results.push(self.embed(text)?);
        }
        Ok(results)
    }
}

/// Calcula similaridade de cosseno entre dois vetores
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    
    dot / (norm_a * norm_b)
}

/// URLs para download do modelo (Hugging Face)
const MODEL_URL: &str = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx";
const TOKENIZER_URL: &str = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json";

/// URL para download da biblioteca ONNX Runtime (Windows x64)
#[cfg(target_os = "windows")]
const ORT_DLL_URL: &str = "https://github.com/microsoft/onnxruntime/releases/download/v1.20.1/onnxruntime-win-x64-1.20.1.zip";

/// Inicializa o ONNX Runtime com a biblioteca dinâmica
fn init_ort_runtime(app_data_dir: &Path) -> Result<()> {
    let result = ORT_INITIALIZED.get_or_init(|| {
        let ort_dir = app_data_dir.join("ort");
        
        #[cfg(target_os = "windows")]
        let dll_path = ort_dir.join("onnxruntime.dll");
        #[cfg(target_os = "macos")]
        let dll_path = ort_dir.join("libonnxruntime.dylib");
        #[cfg(target_os = "linux")]
        let dll_path = ort_dir.join("libonnxruntime.so");
        
        if dll_path.exists() {
            // Definir variável de ambiente para o ort encontrar a DLL
            std::env::set_var("ORT_DYLIB_PATH", &dll_path);
            log::info!("[Embeddings] ORT_DYLIB_PATH set to: {:?}", dll_path);
            Ok(())
        } else {
            // Tentar usar a biblioteca do sistema
            log::warn!("[Embeddings] ONNX Runtime library not found at {:?}, will try system path", dll_path);
            Ok(())
        }
    });
    
    match result {
        Ok(()) => Ok(()),
        Err(e) => Err(anyhow!("{}", e))
    }
}

/// Baixa um arquivo de uma URL para o caminho especificado
async fn download_file(url: &str, path: &Path) -> Result<()> {
    log::info!("[Embeddings] Downloading: {} -> {:?}", url, path);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300)) // 5 min timeout
        .build()?;
    
    let response = client.get(url).send().await?;
    
    if !response.status().is_success() {
        return Err(anyhow!("Download failed with status: {}", response.status()));
    }
    
    let bytes = response.bytes().await?;
    
    // Criar diretório pai se não existir
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    
    std::fs::write(path, bytes)?;
    log::info!("[Embeddings] Downloaded successfully: {:?}", path);
    
    Ok(())
}

/// Baixa e extrai a biblioteca ONNX Runtime
#[cfg(target_os = "windows")]
async fn ensure_ort_library(app_data_dir: &Path) -> Result<()> {
    let ort_dir = app_data_dir.join("ort");
    let dll_path = ort_dir.join("onnxruntime.dll");
    
    if dll_path.exists() {
        log::info!("[Embeddings] ONNX Runtime library already exists");
        return Ok(());
    }
    
    log::info!("[Embeddings] Downloading ONNX Runtime library...");
    
    // Criar diretório
    std::fs::create_dir_all(&ort_dir)?;
    
    // Baixar arquivo zip
    let zip_path = ort_dir.join("onnxruntime.zip");
    download_file(ORT_DLL_URL, &zip_path).await?;
    
    // Extrair DLL do zip
    log::info!("[Embeddings] Extracting ONNX Runtime library...");
    
    let file = std::fs::File::open(&zip_path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    
    // Procurar pela DLL dentro do zip
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();
        
        if name.ends_with("onnxruntime.dll") {
            let mut outfile = std::fs::File::create(&dll_path)?;
            std::io::copy(&mut entry, &mut outfile)?;
            log::info!("[Embeddings] Extracted onnxruntime.dll");
            break;
        }
    }
    
    // Remover arquivo zip
    let _ = std::fs::remove_file(&zip_path);
    
    if !dll_path.exists() {
        return Err(anyhow!("Failed to extract onnxruntime.dll from archive"));
    }
    
    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn ensure_ort_library(_app_data_dir: &Path) -> Result<()> {
    // Em outros sistemas, assumimos que a biblioteca está no sistema
    log::info!("[Embeddings] Using system ONNX Runtime library");
    Ok(())
}

/// Garante que os arquivos do modelo existem, baixando se necessário
pub async fn ensure_model_files(app_data_dir: &Path) -> Result<(std::path::PathBuf, std::path::PathBuf)> {
    let models_dir = app_data_dir.join("models");
    let model_path = models_dir.join("all-MiniLM-L6-v2.onnx");
    let tokenizer_path = models_dir.join("tokenizer.json");
    
    // Criar diretório de modelos
    std::fs::create_dir_all(&models_dir)?;
    
    // Baixar biblioteca ONNX Runtime se necessário (apenas Windows)
    ensure_ort_library(app_data_dir).await?;
    
    // Inicializar ort com o caminho da DLL
    init_ort_runtime(app_data_dir)?;
    
    // Baixar modelo se não existir
    if !model_path.exists() {
        log::info!("[Embeddings] Model not found, downloading...");
        download_file(MODEL_URL, &model_path).await?;
    }
    
    // Baixar tokenizer se não existir
    if !tokenizer_path.exists() {
        log::info!("[Embeddings] Tokenizer not found, downloading...");
        download_file(TOKENIZER_URL, &tokenizer_path).await?;
    }
    
    Ok((model_path, tokenizer_path))
}

/// Verifica se o modelo está disponível
pub fn is_model_available(app_data_dir: &Path) -> bool {
    let models_dir = app_data_dir.join("models");
    let model_path = models_dir.join("all-MiniLM-L6-v2.onnx");
    let tokenizer_path = models_dir.join("tokenizer.json");
    
    model_path.exists() && tokenizer_path.exists()
}

/// Obtém ou inicializa o modelo global de embeddings
pub fn get_or_init_model(app_data_dir: &Path) -> Result<Arc<Mutex<EmbeddingModel>>> {
    // Inicializar ort com o caminho da DLL antes de criar o modelo
    init_ort_runtime(app_data_dir)?;
    
    let result = EMBEDDING_MODEL.get_or_init(|| {
        let model_path = app_data_dir.join("models").join("all-MiniLM-L6-v2.onnx");
        let tokenizer_path = app_data_dir.join("models").join("tokenizer.json");
        
        match EmbeddingModel::new(
            model_path.to_str().unwrap_or(""),
            tokenizer_path.to_str().unwrap_or("")
        ) {
            Ok(model) => Ok(Arc::new(Mutex::new(model))),
            Err(e) => Err(format!("Failed to load embedding model: {}", e))
        }
    });
    
    match result {
        Ok(model) => Ok(model.clone()),
        Err(e) => Err(anyhow!("{}", e))
    }
}

/// Calcula scores de relevância para múltiplos textos em relação a uma query
pub fn rank_by_relevance(
    model: &mut EmbeddingModel,
    query: &str,
    texts: &[&str],
) -> Result<Vec<(usize, f32)>> {
    let query_embedding = model.embed(query)?;
    
    let mut scores: Vec<(usize, f32)> = Vec::with_capacity(texts.len());
    for (idx, text) in texts.iter().enumerate() {
        let text_embedding = model.embed(text).unwrap_or_else(|_| vec![0.0; EMBEDDING_DIM]);
        let score = cosine_similarity(&query_embedding, &text_embedding);
        scores.push((idx, score));
    }
    
    // Ordenar por score decrescente
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    Ok(scores)
}

/// Poda o contexto mantendo apenas os parágrafos mais relevantes
/// 
/// Argumentos:
/// - model: Modelo de embeddings
/// - query: Query do usuário
/// - context: Contexto completo (texto separado por parágrafos)
/// - max_tokens: Número máximo de tokens (aproximado por palavras)
/// - min_score: Score mínimo de relevância (0.0 a 1.0)
/// 
/// Retorna: Contexto podado com os parágrafos mais relevantes
pub fn prune_context(
    model: &mut EmbeddingModel,
    query: &str,
    context: &str,
    max_tokens: usize,
    min_score: f32,
) -> Result<String> {
    // Dividir contexto em parágrafos
    let paragraphs: Vec<&str> = context
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty() && p.len() > 20) // Filtrar parágrafos muito curtos
        .collect();
    
    if paragraphs.is_empty() {
        return Ok(context.to_string());
    }
    
    // Calcular embedding da query
    let query_embedding = model.embed(query)?;
    
    // Calcular scores para cada parágrafo
    let mut scored_paragraphs: Vec<(f32, &str, usize)> = Vec::with_capacity(paragraphs.len());
    for (idx, &p) in paragraphs.iter().enumerate() {
        let embedding = model.embed(p).unwrap_or_else(|_| vec![0.0; EMBEDDING_DIM]);
        let score = cosine_similarity(&query_embedding, &embedding);
        scored_paragraphs.push((score, p, idx));
    }
    
    // Ordenar por score decrescente
    scored_paragraphs.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    
    // Filtrar por score mínimo
    scored_paragraphs.retain(|(score, _, _)| *score >= min_score);
    
    // Selecionar parágrafos até atingir max_tokens
    let mut result = Vec::new();
    let mut total_tokens = 0;
    
    for (score, paragraph, original_idx) in scored_paragraphs {
        let paragraph_tokens = paragraph.split_whitespace().count();
        
        if total_tokens + paragraph_tokens > max_tokens {
            // Se ainda não temos nenhum parágrafo, incluir o primeiro mesmo que exceda
            if result.is_empty() {
                result.push((original_idx, paragraph));
            }
            break;
        }
        
        result.push((original_idx, paragraph));
        total_tokens += paragraph_tokens;
    }
    
    // Ordenar pelo índice original para manter a ordem do contexto
    result.sort_by_key(|(idx, _)| *idx);
    
    // Reconstruir contexto
    let pruned: Vec<&str> = result.into_iter().map(|(_, p)| p).collect();
    
    log::info!(
        "[Embeddings] Context pruned: {} paragraphs -> {} paragraphs, {} tokens",
        paragraphs.len(),
        pruned.len(),
        total_tokens
    );
    
    Ok(pruned.join("\n\n"))
}

/// Versão simplificada de poda usando apenas BM25-like (sem embeddings)
/// Útil quando o modelo não está disponível
pub fn prune_context_bm25(
    query: &str,
    context: &str,
    max_tokens: usize,
) -> String {
    let paragraphs: Vec<&str> = context
        .split("\n\n")
        .map(|p| p.trim())
        .filter(|p| !p.is_empty() && p.len() > 20)
        .collect();
    
    if paragraphs.is_empty() {
        return context.to_string();
    }
    
    let query_lower = query.to_lowercase();
    let query_terms: Vec<&str> = query_lower
        .split_whitespace()
        .filter(|w| w.len() > 2)
        .collect();
    
    // Calcular score BM25-like simples
    let mut scored: Vec<(f32, &str, usize)> = paragraphs.iter()
        .enumerate()
        .map(|(idx, &p)| {
            let p_lower = p.to_lowercase();
            let mut score = 0.0f32;
            
            for term in &query_terms {
                let count = p_lower.matches(term).count();
                if count > 0 {
                    // TF com saturação logarítmica
                    score += (1.0 + (count as f32).ln()) * (1.0 / (1.0 + query_terms.len() as f32));
                }
            }
            
            (score, p, idx)
        })
        .collect();
    
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    
    let mut result = Vec::new();
    let mut total_tokens = 0;
    
    for (_, paragraph, original_idx) in scored {
        let paragraph_tokens = paragraph.split_whitespace().count();
        
        if total_tokens + paragraph_tokens > max_tokens {
            if result.is_empty() {
                result.push((original_idx, paragraph));
            }
            break;
        }
        
        result.push((original_idx, paragraph));
        total_tokens += paragraph_tokens;
    }
    
    result.sort_by_key(|(idx, _)| *idx);
    
    let pruned: Vec<&str> = result.into_iter().map(|(_, p)| p).collect();
    pruned.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &b) - 1.0).abs() < 0.001);
        
        let c = vec![0.0, 1.0, 0.0];
        assert!((cosine_similarity(&a, &c) - 0.0).abs() < 0.001);
        
        let d = vec![-1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &d) - (-1.0)).abs() < 0.001);
    }
}

