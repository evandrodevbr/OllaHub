use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    base_url: String,
    client: reqwest::Client,
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
        let mut response = self.client
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
}

