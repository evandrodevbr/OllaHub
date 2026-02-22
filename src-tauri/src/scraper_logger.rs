use serde::{Serialize, Deserialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use chrono::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LogLevel {
    INFO,
    WARNING,
    ERROR,
    DEBUG,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScraperLogEntry {
    pub timestamp: String,
    pub level: LogLevel,
    pub action: String,
    pub context: Option<String>,
    pub data: Option<serde_json::Value>,
    pub url: Option<String>,
    pub duration_ms: Option<u64>,
    pub error: Option<String>,
}

pub struct ScraperLogger {
    log_file_path: PathBuf,
    file_mutex: Arc<Mutex<()>>, // Simple mutex to coordinate file writes
}

impl ScraperLogger {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let log_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&log_dir).unwrap_or_else(|e| {
            eprintln!("Failed to create log directory: {}", e);
        });

        let date_str = Local::now().format("%Y-%m-%d").to_string();
        let log_file_path = log_dir.join(format!("scraper_{}.jsonl", date_str));

        ScraperLogger {
            log_file_path,
            file_mutex: Arc::new(Mutex::new(())),
        }
    }

    fn write_entry(&self, entry: &ScraperLogEntry) {
        let _guard = self.file_mutex.lock().unwrap();
        
        let json_line = match serde_json::to_string(entry) {
            Ok(json) => json,
            Err(e) => {
                eprintln!("Failed to serialize log entry: {}", e);
                return;
            }
        };

        let mut file = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file_path)
        {
            Ok(f) => f,
            Err(e) => {
                eprintln!("Failed to open log file: {}", e);
                return;
            }
        };

        if let Err(e) = writeln!(file, "{}", json_line) {
            eprintln!("Failed to write to log file: {}", e);
        }
    }

    pub fn log(&self, level: LogLevel, action: &str, context: Option<&str>, data: Option<serde_json::Value>, url: Option<&str>, duration_ms: Option<u64>, error: Option<&str>) {
        let entry = ScraperLogEntry {
            timestamp: Local::now().to_rfc3339(),
            level,
            action: action.to_string(),
            context: context.map(|s| s.to_string()),
            data,
            url: url.map(|s| s.to_string()),
            duration_ms,
            error: error.map(|s| s.to_string()),
        };
        self.write_entry(&entry);
    }

    pub fn info(&self, action: &str, context: Option<&str>, data: Option<serde_json::Value>) {
        self.log(LogLevel::INFO, action, context, data, None, None, None);
    }

    pub fn warn(&self, action: &str, context: Option<&str>, error: Option<&str>) {
        self.log(LogLevel::WARNING, action, context, None, None, None, error);
    }

    pub fn error(&self, action: &str, context: Option<&str>, error: Option<&str>, data: Option<serde_json::Value>) {
        self.log(LogLevel::ERROR, action, context, data, None, None, error);
    }

    pub fn log_access(&self, url: &str, action: &str) {
        self.log(LogLevel::INFO, action, Some("Access"), None, Some(url), None, None);
    }

    pub fn log_scraping_result(&self, url: &str, success: bool, duration_ms: u64, content_len: usize, error: Option<&str>) {
        let level = if success { LogLevel::INFO } else { LogLevel::ERROR };
        let data = serde_json::json!({
            "content_length": content_len,
            "success": success
        });
        self.log(level, "ScrapingResult", Some("Scraper"), Some(data), Some(url), Some(duration_ms), error);
    }
}
