use serde::{Deserialize, Serialize};

/// Mensagem para o Ollama API
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaMessage {
    pub role: String,
    pub content: String,
}

/// Request para chat do Ollama
#[derive(Debug, Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
}

/// Response do Ollama (streaming)
#[derive(Debug, Deserialize)]
struct OllamaChunk {
    message: Option<OllamaMessageResponse>,
    done: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct OllamaMessageResponse {
    content: String,
}

/// Cliente Ollama headless (para execução em background)
pub struct OllamaClient {
    pub(crate) base_url: String,
    pub(crate) client: reqwest::Client,
}

impl OllamaClient {
    /// Cria novo cliente Ollama
    pub fn new(base_url: Option<String>) -> Self {
        let base = base_url.unwrap_or_else(|| "http://localhost:11434".to_string());
        
        Self {
            base_url: base,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300)) // 5 minutos timeout
                .build()
                .expect("Failed to create HTTP client"),
        }
    }
    
    /// Verifica se o Ollama está rodando
    pub async fn check_connection(&self) -> Result<(), String> {
        let url = format!("{}/api/tags", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("Ollama returned status: {}", response.status()))
        }
    }
    
    /// Envia prompt para o Ollama e retorna resposta completa (não streaming)
    pub async fn query_ollama_headless(
        &self,
        model: &str,
        system_prompt: Option<&str>,
        user_prompt: &str,
    ) -> Result<String, String> {
        log::info!("[LLM] Headless query model={} system_prompt_present={} user_prompt_len={}", model, system_prompt.is_some(), user_prompt.len());
        if let Some(sys) = system_prompt { log::info!("[LLM] System Prompt:\n{}", sys); }
        log::info!("[LLM] User Prompt:\n{}", user_prompt);
        // Verificar conexão primeiro
        self.check_connection().await?;
        
        let mut messages = Vec::new();
        
        // Adicionar system prompt se fornecido
        if let Some(sys_prompt) = system_prompt {
            messages.push(OllamaMessage {
                role: "system".to_string(),
                content: sys_prompt.to_string(),
            });
        }
        
        // Adicionar mensagem do usuário
        messages.push(OllamaMessage {
            role: "user".to_string(),
            content: user_prompt.to_string(),
        });
        
        let request = OllamaChatRequest {
            model: model.to_string(),
            messages,
            stream: true, // Streaming para economizar memória
        };
        
        let url = format!("{}/api/chat", self.base_url);
        log::info!("[LLM_DEBUG] Iniciando request HTTP para o modelo (chat stream)...");
        let response = self.client
            .post(&url)
            .json(&request)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;
        log::info!("[LLM] HTTP response received (chat stream). Status: {}", response.status());
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        // Ler stream e acumular resposta
        let mut full_response = String::new();
        let mut stream = response.bytes_stream();
        
        use futures_util::StreamExt;
        
        let mut logged_first_chunk = false;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);
            if !logged_first_chunk {
                log::debug!("[LLM] First chunk received ({} bytes)", text.len());
                logged_first_chunk = true;
            }
            
            // Processar cada linha (Ollama envia JSON por linha)
            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                
                match serde_json::from_str::<OllamaChunk>(line) {
                    Ok(chunk_data) => {
                        if let Some(message) = chunk_data.message {
                            full_response.push_str(&message.content);
                        }
                        
                        // Se done, parar
                        if chunk_data.done == Some(true) {
                            break;
                        }
                    }
                    Err(e) => {
                        log::debug!("Failed to parse Ollama chunk: {} - Line: {}", e, line);
                        // Continuar mesmo com erro de parse
                    }
                }
            }
        }
        log::info!("[LLM] Headless Raw Output ({} chars):\n{}", full_response.len(), full_response.trim());
        if full_response.is_empty() {
            return Err("Empty response from Ollama".to_string());
        }
        
        Ok(full_response.trim().to_string())
    }
    
    /// Gera um título curto (3-5 palavras) para a pergunta do usuário
    pub async fn generate_title(&self, model: &str, user_input: &str) -> Result<String, String> {
        let system_prompt = "Você é um gerador de títulos. Responda APENAS com um título de 3-5 palavras que resuma a pergunta. Nada mais, sem explicações.";
        
        let messages = vec![
            OllamaMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            OllamaMessage {
                role: "user".to_string(),
                content: format!("Gere um título para: {}", user_input),
            },
        ];
        
        let request = OllamaChatRequest {
            model: model.to_string(),
            messages,
            stream: true,
        };
        
        let url = format!("{}/api/chat", self.base_url);
        let response = self.client
            .post(&url)
            .json(&request)
            .timeout(std::time::Duration::from_secs(10)) // Timeout curto para resposta rápida
            .send()
            .await
            .map_err(|e| format!("Failed to send title request: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        // Ler stream e acumular resposta (limitado a ~50 caracteres)
        let mut full_response = String::new();
        let mut stream = response.bytes_stream();
        
        use futures_util::StreamExt;
        
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);
            
            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                
                match serde_json::from_str::<OllamaChunk>(line) {
                    Ok(chunk_data) => {
                        if let Some(message) = chunk_data.message {
                            full_response.push_str(&message.content);
                            
                            // Limitar tamanho para evitar respostas longas
                            if full_response.len() > 50 {
                                break;
                            }
                        }
                        
                        if chunk_data.done == Some(true) {
                            break;
                        }
                    }
                    Err(_) => continue,
                }
            }
            
            // Se já temos resposta suficiente, parar
            if full_response.len() > 30 {
                break;
            }
        }
        
        let title = full_response.trim().to_string();
        
        // Fallback se título estiver vazio ou muito longo
        if title.is_empty() || title.len() > 50 {
            // Extrair primeiras palavras da pergunta como fallback
            let words: Vec<&str> = user_input.split_whitespace().take(5).collect();
            Ok(words.join(" "))
        } else {
            Ok(title)
        }
    }
    
    /// Gera emoji baseado no título
    pub fn generate_emoji(title: &str) -> String {
        let title_lower = title.to_lowercase();
        
        // Keywords para emojis
        if title_lower.contains("código") || title_lower.contains("program") || title_lower.contains("code") {
            "💻".to_string()
        } else if title_lower.contains("pergunta") || title_lower.contains("question") || title_lower.contains("como") {
            "❓".to_string()
        } else if title_lower.contains("explica") || title_lower.contains("explain") {
            "📚".to_string()
        } else if title_lower.contains("ajuda") || title_lower.contains("help") {
            "🆘".to_string()
        } else {
            "💬".to_string() // Default
        }
    }
    
    /// Gera completion usando /api/generate (não streaming)
    pub async fn generate_completion(
        &self,
        model: &str,
        prompt: &str,
        options: Option<GenerationOptions>,
    ) -> Result<String, String> {
        log::info!("[LLM] generate_completion model={} prompt_len={}", model, prompt.len());
        log::info!("[LLM] Prompt:\n{}", prompt);
        self.check_connection().await?;
        
        let mut request_body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": false,
        });
        
        // Adicionar options se fornecidas
        if let Some(opts) = options.as_ref() {
            let mut opts_json = serde_json::Map::new();
            if let Some(temp) = opts.temperature {
                // serde_json::Number não implementa From<f64>, usar json! macro ou Number::from_f64
                if let Some(num) = serde_json::Number::from_f64(temp) {
                    opts_json.insert("temperature".to_string(), serde_json::Value::Number(num));
                } else {
                    // Fallback: usar como string se não conseguir converter
                    opts_json.insert("temperature".to_string(), serde_json::Value::String(temp.to_string()));
                }
            }
            if let Some(num_predict) = opts.num_predict {
                opts_json.insert("num_predict".to_string(), serde_json::Value::Number(num_predict.into()));
            }
            if let Some(format) = opts.format.clone() {
                opts_json.insert("format".to_string(), serde_json::Value::String(format));
            }
            if !opts_json.is_empty() {
                request_body["options"] = serde_json::Value::Object(opts_json);
            }
            log::info!("[LLM] Options: temperature={:?} num_predict={:?} format={:?}", opts.temperature, opts.num_predict, opts.format.as_deref());
        }
        
        let url = format!("{}/api/generate", self.base_url);
        log::info!("[LLM_DEBUG] Iniciando request HTTP para o modelo (generate)...");
        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;
        log::info!("[LLM] HTTP response received (generate). Status: {}", response.status());
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        #[derive(serde::Deserialize)]
        struct GenerateResponse {
            response: String,
        }
        
        let body_text = response.text()
            .await
            .map_err(|e| format!("Failed to read response text: {}", e))?;
        log::info!("[LLM] Raw HTTP Body ({} chars)", body_text.len());
        let result: GenerateResponse = match serde_json::from_str::<GenerateResponse>(&body_text) {
            Ok(val) => val,
            Err(e) => {
                log::error!("[LLM] Failed to parse JSON body: {}", e);
                log::error!("[LLM] Body content: {}", body_text);
                return Err(format!("Failed to parse response: {}", e));
            }
        };
        let mut raw = result.response.trim().to_string();
        if let Ok(re) = regex::Regex::new(r"(?s)<think>.*?</think>") { raw = re.replace_all(&raw, "").to_string(); }
        if let Ok(re) = regex::Regex::new(r"(?i)^\s*(here\s+is\s+the\s+query|sure|okay|final\s+query)\s*[:,-]*\s*") { raw = re.replace(&raw, "").to_string(); }
        if let Ok(re) = regex::Regex::new(r"^\s*```[a-zA-Z]*\s*") { raw = re.replace(&raw, "").to_string(); }
        if let Ok(re) = regex::Regex::new(r"\s*```\s*$") { raw = re.replace(&raw, "").to_string(); }
        raw = raw.trim().to_string();
        log::info!("[LLM] Raw Output ({} chars):\n{}", raw.len(), raw);
        if let Some(fmt) = options.as_ref().and_then(|o| o.format.as_ref()) {
            if fmt.to_lowercase() == "json" {
                match serde_json::from_str::<serde_json::Value>(&raw) {
                    Ok(val) => {
                        let kind = if val.is_array() { "array" } else if val.is_object() { "object" } else { "other" };
                        log::info!("[LLM] JSON parse ok ({})", kind);
                    }
                    Err(e) => {
                        log::warn!("[LLM] JSON parse failed: {}", e);
                    }
                }
            }
        }
        Ok(raw)
    }
    
    /// Gera chat completion usando /api/chat (não streaming)
    pub async fn generate_chat_completion(
        &self,
        model: &str,
        messages: Vec<OllamaMessage>,
        options: Option<GenerationOptions>,
    ) -> Result<String, String> {
        let msgs_json = serde_json::to_string(&messages).unwrap_or_else(|_| "[]".to_string());
        log::info!("[LLM] generate_chat_completion model={} messages_len={} messages_json={} options_temp={:?} options_num_predict={:?}", model, messages.len(), msgs_json, options.as_ref().and_then(|o| o.temperature), options.as_ref().and_then(|o| o.num_predict));
        self.check_connection().await?;
        
        let mut request_body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
        });
        
        // Adicionar options se fornecidas
        if let Some(opts) = options {
            let mut opts_json = serde_json::Map::new();
            if let Some(temp) = opts.temperature {
                // serde_json::Number não implementa From<f64>, usar Number::from_f64
                if let Some(num) = serde_json::Number::from_f64(temp) {
                    opts_json.insert("temperature".to_string(), serde_json::Value::Number(num));
                } else {
                    // Fallback: usar como string se não conseguir converter
                    opts_json.insert("temperature".to_string(), serde_json::Value::String(temp.to_string()));
                }
            }
            if let Some(num_predict) = opts.num_predict {
                opts_json.insert("num_predict".to_string(), serde_json::Value::Number(num_predict.into()));
            }
            if !opts_json.is_empty() {
                request_body["options"] = serde_json::Value::Object(opts_json);
            }
        }
        
        let url = format!("{}/api/chat", self.base_url);
        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        #[derive(serde::Deserialize)]
        struct ChatResponse {
            message: OllamaMessageResponse,
        }
        
        let result: ChatResponse = response.json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        let raw = result.message.content.trim().to_string();
        log::info!("[LLM] Chat Raw Output ({} chars):\n{}", raw.len(), raw);
        Ok(raw)
    }
    
    /// Obtém informações de um modelo usando /api/show
    pub async fn get_model_info(&self, model_name: &str) -> Result<serde_json::Value, String> {
        self.check_connection().await?;
        
        let url = format!("{}/api/show", self.base_url);
        let response = self.client
            .post(&url)
            .json(&serde_json::json!({ "name": model_name }))
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        let result: serde_json::Value = response.json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        Ok(result)
    }
    
    /// Lista modelos disponíveis usando /api/tags
    pub async fn get_tags(&self) -> Result<Vec<OllamaModel>, String> {
        self.check_connection().await?;
        
        let url = format!("{}/api/tags", self.base_url);
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        #[derive(serde::Deserialize)]
        struct TagsResponse {
            models: Vec<OllamaModel>,
        }
        
        let result: TagsResponse = response.json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        Ok(result.models)
    }
}

/// Opções para geração de texto
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GenerationOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
}

/// Modelo Ollama retornado por /api/tags
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OllamaModel {
    pub name: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub modified_at: Option<String>,
    #[serde(default)]
    pub digest: Option<String>,
}
