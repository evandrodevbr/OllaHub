use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// Tipos de ações que uma task pode executar
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskAction {
    /// Pesquisar na web e resumir com IA
    SearchAndSummarize {
        query: String,
        model: String,
        max_results: usize,
    },
    /// Apenas enviar notificação (ping)
    JustPing {
        message: String,
    },
    /// Executar prompt customizado no Ollama
    CustomPrompt {
        prompt: String,
        model: String,
    },
}

/// Estrutura de uma Task agendada
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentinelTask {
    pub id: String,
    pub label: String,
    pub cron_schedule: String, // Ex: "0 8 * * *" (Todo dia às 8h)
    pub action: TaskAction,
    pub enabled: bool,
    pub last_run: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Estado do scheduler (gerenciado pelo Tauri)
pub type SchedulerState = Arc<Mutex<SchedulerService>>;

/// Serviço de agendamento de tarefas
pub struct SchedulerService {
    tasks: HashMap<String, SentinelTask>,
    tasks_file: PathBuf,
    app_handle: Option<AppHandle>,
}

impl SchedulerService {
    /// Cria novo serviço de scheduler
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
        let tasks_file = app_data_dir.join("tasks.json");
        
        // Carregar tasks existentes
        let tasks = if tasks_file.exists() {
            match fs::read_to_string(&tasks_file) {
                Ok(content) => {
                    match serde_json::from_str::<Vec<SentinelTask>>(&content) {
                        Ok(loaded_tasks) => {
                            loaded_tasks
                                .into_iter()
                                .map(|task| (task.id.clone(), task))
                                .collect()
                        }
                        Err(e) => {
                            log::warn!("Failed to parse tasks.json: {}. Starting with empty tasks.", e);
                            HashMap::new()
                        }
                    }
                }
                Err(e) => {
                    log::warn!("Failed to read tasks.json: {}. Starting with empty tasks.", e);
                    HashMap::new()
                }
            }
        } else {
            HashMap::new()
        };
        
        Ok(Self {
            tasks,
            tasks_file,
            app_handle: Some(app_handle),
        })
    }
    
    /// Salva tasks no arquivo
    fn save_tasks(&self) -> Result<(), String> {
        let tasks_vec: Vec<&SentinelTask> = self.tasks.values().collect();
        let json = serde_json::to_string_pretty(&tasks_vec)
            .map_err(|e| format!("Failed to serialize tasks: {}", e))?;
        
        // Escrever em arquivo temporário primeiro (atomic write)
        let temp_file = self.tasks_file.with_extension("json.tmp");
        fs::write(&temp_file, json)
            .map_err(|e| format!("Failed to write temp tasks file: {}", e))?;
        
        fs::rename(&temp_file, &self.tasks_file)
            .map_err(|e| format!("Failed to rename temp file: {}", e))?;
        
        Ok(())
    }
    
    /// Adiciona ou atualiza uma task
    pub fn upsert_task(&mut self, task: SentinelTask) -> Result<(), String> {
        self.tasks.insert(task.id.clone(), task);
        self.save_tasks()?;
        Ok(())
    }
    
    /// Remove uma task
    pub fn remove_task(&mut self, id: &str) -> Result<(), String> {
        self.tasks.remove(id);
        self.save_tasks()?;
        Ok(())
    }
    
    /// Lista todas as tasks
    pub fn list_tasks(&self) -> Vec<SentinelTask> {
        self.tasks.values().cloned().collect()
    }
    
    /// Obtém uma task por ID
    pub fn get_task(&self, id: &str) -> Option<&SentinelTask> {
        self.tasks.get(id)
    }
    
    /// Atualiza última execução de uma task
    pub fn update_last_run(&mut self, id: &str, timestamp: DateTime<Utc>) -> Result<(), String> {
        if let Some(task) = self.tasks.get_mut(id) {
            task.last_run = Some(timestamp);
            self.save_tasks()?;
        }
        Ok(())
    }
    
    /// Obtém tasks habilitadas
    pub fn get_enabled_tasks(&self) -> Vec<&SentinelTask> {
        self.tasks.values().filter(|t| t.enabled).collect()
    }
}

/// Helper para obter diretório de tasks
pub fn get_tasks_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    Ok(app_data_dir.join("tasks.json"))
}

