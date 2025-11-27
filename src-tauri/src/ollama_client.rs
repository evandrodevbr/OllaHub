use serde::{Deserialize, Serialize};

/// Mensagem para o Ollama API
#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
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
        let response = self.client
            .post(&url)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to send request to Ollama: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Ollama returned status: {}", response.status()));
        }
        
        // Ler stream e acumular resposta
        let mut full_response = String::new();
        let mut stream = response.bytes_stream();
        
        use futures_util::StreamExt;
        
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Failed to read chunk: {}", e))?;
            let text = String::from_utf8_lossy(&chunk);
            
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
}

