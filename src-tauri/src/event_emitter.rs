use tauri::{AppHandle, Manager, Emitter};
use serde::Serialize;

/// Evento de query de busca iniciada
#[derive(Serialize, Clone)]
pub struct SearchQueryEvent {
    pub query: String,
    pub source: String, // "brave", "searxng", "duckduckgo"
    pub round: Option<u32>,
    pub timestamp: u64,
}

/// Evento de query de busca completada
#[derive(Serialize, Clone)]
pub struct SearchQueryCompletedEvent {
    pub query: String,
    pub source: String,
    pub results_count: usize,
    pub success: bool,
    pub timestamp: u64,
}

/// Evento de mudança de fonte de busca
#[derive(Serialize, Clone)]
pub struct SearchSourceSwitchEvent {
    pub from: String,
    pub to: String,
    pub reason: String, // "timeout", "error", "quota_exceeded", "empty_results"
    pub timestamp: u64,
}

/// Evento de URL sendo scraped
#[derive(Serialize, Clone)]
pub struct ScrapingUrlEvent {
    pub url: String,
    pub title: Option<String>,
    pub status: String, // "started", "completed", "failed", "cached"
    pub duration_ms: Option<u64>,
    pub source: Option<String>, // "static", "nodriver", "playwright"
    pub timestamp: u64,
}

/// Helper para emitir eventos de busca
pub fn emit_search_event(app_handle: &AppHandle, event: &SearchQueryEvent) {
    // Emitir para todas as janelas
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("search-query-started", event.clone());
    }
}

/// Helper para emitir eventos de busca completada
pub fn emit_search_completed_event(app_handle: &AppHandle, event: &SearchQueryCompletedEvent) {
    // Emitir para todas as janelas
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("search-query-completed", event.clone());
    }
}

/// Helper para emitir eventos de mudança de fonte
pub fn emit_source_switch_event(app_handle: &AppHandle, event: &SearchSourceSwitchEvent) {
    // Emitir para todas as janelas
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("search-source-switched", event.clone());
    }
}

/// Helper para emitir eventos de scraping
pub fn emit_scraping_event(app_handle: &AppHandle, event: &ScrapingUrlEvent) {
    // Emitir para todas as janelas
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("scraping-url-event", event.clone());
    }
}
