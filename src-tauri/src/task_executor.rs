use crate::scheduler::{SentinelTask, TaskAction};
use crate::ollama_client::OllamaClient;
use crate::web_scraper::search_and_scrape;
use crate::{Message, ChatSession, get_chats_dir};
use std::sync::Arc;
use std::fs;
use headless_chrome::Browser;
use chrono::Utc;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use sysinfo::System;

/// Executa uma task agendada
pub async fn execute_task(
    task: &SentinelTask,
    app_handle: AppHandle,
    browser: Arc<Browser>,
    ollama_url: Option<String>,
) -> Result<(), String> {
    log::info!("Executando task: {} ({})", task.label, task.id);
    
    let client = OllamaClient::new(ollama_url);
    
    match &task.action {
        TaskAction::SearchAndSummarize { query, model, max_results } => {
            execute_search_and_summarize(
                task,
                query,
                model,
                *max_results,
                &app_handle,
                browser,
                &client,
            ).await
        }
        TaskAction::JustPing { message } => {
            execute_just_ping(task, message, &app_handle).await
        }
        TaskAction::CustomPrompt { prompt, model } => {
            execute_custom_prompt(
                task,
                prompt,
                model,
                &app_handle,
                &client,
            ).await
        }
    }
}

/// Executa pesquisa e resumo
async fn execute_search_and_summarize(
    task: &SentinelTask,
    query: &str,
    model: &str,
    max_results: usize,
    app_handle: &AppHandle,
    browser: Arc<Browser>,
    ollama_client: &OllamaClient,
) -> Result<(), String> {
    // 1. Buscar conteúdo na web
    log::info!("Buscando conteúdo para: {}", query);
    let scraped = search_and_scrape(query, max_results, browser, vec![])
        .await
        .map_err(|e| format!("Erro ao buscar conteúdo: {}", e))?;
    
    if scraped.is_empty() {
        return Err("Nenhum resultado encontrado na busca".to_string());
    }
    
    // 2. Combinar conteúdo em markdown
    let web_context: String = scraped
        .iter()
        .map(|s| format!("---\nTítulo: {}\nURL: {}\n---\n\n{}", s.title, s.url, s.markdown))
        .collect::<Vec<_>>()
        .join("\n\n");
    
    // 3. Criar prompt para o Ollama
    let system_prompt = format!(
        "Você é um assistente especializado em resumir e analisar informações da web.\n\
        DATA ATUAL: {}\n\n\
        Use as informações fornecidas abaixo para criar um resumo detalhado e útil.",
        Utc::now().format("%d/%m/%Y %H:%M")
    );
    
    let user_prompt = format!(
        "Com base nas informações abaixo sobre '{}', crie um resumo detalhado e estruturado.\n\n\
        ## CONTEXTO WEB\n{}\n\n\
        Por favor, forneça:\n\
        1. Resumo executivo (2-3 parágrafos)\n\
        2. Principais pontos encontrados\n\
        3. Conclusões ou insights relevantes",
        query,
        web_context
    );
    
    // 4. Enviar para Ollama
    log::info!("Enviando para Ollama (modelo: {})", model);
    let summary = ollama_client
        .query_ollama_headless(model, Some(&system_prompt), &user_prompt)
        .await
        .map_err(|e| format!("Erro ao consultar Ollama: {}", e))?;
    
    // 5. Salvar como sessão de chat
    let session_id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now();
    
    let messages = vec![
        Message {
            role: "user".to_string(),
            content: format!("Pesquisa agendada: {}", query),
            metadata: Some(serde_json::json!({
                "task_id": task.id,
                "task_label": task.label,
                "sources_count": scraped.len(),
            })),
        },
        Message {
            role: "assistant".to_string(),
            content: summary,
            metadata: Some(serde_json::json!({
                "task_id": task.id,
                "sources": scraped.iter().map(|s| serde_json::json!({
                    "title": s.title,
                    "url": s.url,
                })).collect::<Vec<_>>(),
            })),
        },
    ];
    
    // Salvar sessão diretamente (helper function)
    save_task_session_internal(
        app_handle,
        &session_id,
        &format!("[Agendado] {}", task.label),
        messages,
    )?;
    
    // 6. Enviar notificação
    app_handle
        .notification()
        .builder()
        .title("Pesquisa Agendada Concluída")
        .body(&format!("{} está pronta! Verifique sua sessão de chat.", task.label))
        .show()
        .map_err(|e| format!("Erro ao enviar notificação: {}", e))?;
    
    log::info!("Task {} executada com sucesso. Sessão salva: {}", task.id, session_id);
    Ok(())
}

/// Executa apenas ping/notificação
async fn execute_just_ping(
    task: &SentinelTask,
    message: &str,
    app_handle: &AppHandle,
) -> Result<(), String> {
    app_handle
        .notification()
        .builder()
        .title(&task.label)
        .body(message)
        .show()
        .map_err(|e| format!("Erro ao enviar notificação: {}", e))?;
    
    log::info!("Ping enviado para task: {}", task.id);
    Ok(())
}

/// Helper para salvar sessão de task (sem usar State do Tauri)
fn save_task_session_internal(
    app_handle: &AppHandle,
    session_id: &str,
    title: &str,
    messages: Vec<Message>,
) -> Result<(), String> {
    let chats_dir = get_chats_dir(app_handle)?;
    let file_path = chats_dir.join(format!("{}.json", session_id));
    let file_path = chats_dir.join(format!("{}.json", session_id));
    
    let now = Utc::now();
    
    // Try to load existing to keep created_at, or use now
    let created_at = if file_path.exists() {
        if let Ok(content) = fs::read_to_string(&file_path) {
            if let Ok(session) = serde_json::from_str::<ChatSession>(&content) {
                session.created_at
            } else {
                now
            }
        } else {
            now
        }
    } else {
        now
    };

    let platform = System::name().unwrap_or("Unknown".to_string());

    let session = ChatSession {
        id: session_id.to_string(),
        title: title.to_string(),
        messages,
        created_at,
        updated_at: now,
        platform,
        memory_context: Vec::new(),
    };

    let json = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;
    
    // Escrever em arquivo temporário primeiro, depois renomear (atomic write)
    let temp_path = file_path.with_extension("json.tmp");
    fs::write(&temp_path, json)
        .map_err(|e| format!("Failed to write temp session file: {}", e))?;
    
    // Renomear atomicamente
    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename temp file to session file: {}", e))?;
    
    Ok(())
}

/// Executa prompt customizado
async fn execute_custom_prompt(
    task: &SentinelTask,
    prompt: &str,
    model: &str,
    app_handle: &AppHandle,
    ollama_client: &OllamaClient,
) -> Result<(), String> {
    let response = ollama_client
        .query_ollama_headless(model, None, prompt)
        .await
        .map_err(|e| format!("Erro ao consultar Ollama: {}", e))?;
    
    // Salvar como sessão
    let session_id = uuid::Uuid::new_v4().to_string();
    let messages = vec![
        Message {
            role: "user".to_string(),
            content: prompt.to_string(),
            metadata: Some(serde_json::json!({
                "task_id": task.id,
                "task_label": task.label,
            })),
        },
        Message {
            role: "assistant".to_string(),
            content: response,
            metadata: Some(serde_json::json!({
                "task_id": task.id,
            })),
        },
    ];
    
    save_task_session_internal(
        app_handle,
        &session_id,
        &format!("[Agendado] {}", task.label),
        messages,
    )?;
    
    // Notificação
    app_handle
        .notification()
        .builder()
        .title("Task Executada")
        .body(&format!("{} foi executada com sucesso!", task.label))
        .show()
        .map_err(|e| format!("Erro ao enviar notificação: {}", e))?;
    
    Ok(())
}

