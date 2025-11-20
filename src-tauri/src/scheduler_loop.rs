use crate::scheduler::{SchedulerService, SchedulerState};
use crate::task_executor::execute_task;
use tokio_cron_scheduler::{Job, JobScheduler};
use std::sync::Arc;
use tauri::AppHandle;
use chrono::Utc;

/// Inicia o loop do scheduler
pub async fn start_scheduler_loop(
    app_handle: AppHandle,
    scheduler_state: SchedulerState,
    _browser_state: Option<()>, // Não usado mais - browser será criado quando necessário
    ollama_url: Option<String>,
) -> Result<(), String> {
    let mut sched = JobScheduler::new()
        .await
        .map_err(|e| format!("Failed to create job scheduler: {}", e))?;
    
    // Carregar tasks e agendar
    reload_scheduled_tasks(
        &mut sched,
        &app_handle,
        &scheduler_state,
        ollama_url.clone(),
    ).await?;
    
    // Iniciar scheduler em background
    tokio::spawn(async move {
        if let Err(e) = sched.start().await {
            log::error!("Scheduler error: {}", e);
        }
    });
    
    log::info!("Scheduler loop iniciado");
    Ok(())
}

/// Recarrega tasks do scheduler
pub async fn reload_scheduled_tasks(
    sched: &mut JobScheduler,
    app_handle: &AppHandle,
    scheduler_state: &SchedulerState,
    ollama_url: Option<String>,
) -> Result<(), String> {
    // Limpar jobs existentes
    sched.shutdown().await.ok();
    *sched = JobScheduler::new()
        .await
        .map_err(|e| format!("Failed to recreate scheduler: {}", e))?;
    
    let scheduler = scheduler_state.lock().await;
    let enabled_tasks = scheduler.get_enabled_tasks();
    
    for task in enabled_tasks {
        // Clonar valores ANTES de mover para a closure
        let task_id_for_job = task.id.clone();
        let task_id_for_log = task.id.clone();
        let task_label_for_job = task.label.clone();
        let task_label_for_log = task.label.clone();
        let cron_expr = task.cron_schedule.clone();
        let app_handle_clone = app_handle.clone();
        let scheduler_clone = scheduler_state.clone();
        let ollama_url_clone = ollama_url.clone();
        
        // Criar job para esta task
        let job = Job::new_async(cron_expr.as_str(), move |_uuid, _l| {
            let task_id = task_id_for_job.clone();
            let task_label = task_label_for_job.clone();
            let app_handle = app_handle_clone.clone();
            let scheduler = scheduler_clone.clone();
            let ollama_url = ollama_url_clone.clone();
            
            Box::pin(async move {
                log::info!("Executando task agendada: {} ({})", task_label, task_id);
                
                // Obter task atualizada
                let task_opt = {
                    let sched = scheduler.lock().await;
                    sched.get_task(&task_id).cloned()
                };
                
                if let Some(task) = task_opt {
                    if !task.enabled {
                        log::info!("Task {} está desabilitada, pulando", task_id);
                        return;
                    }
                    
                    // Obter browser - precisa acessar via app_handle
                    let browser_arc = {
                        // Criar browser diretamente se necessário
                        use crate::web_scraper::create_browser;
                        match create_browser() {
                            Ok(b) => Arc::new(b),
                            Err(e) => {
                                log::error!("Erro ao criar browser para task {}: {}", task_id, e);
                                return;
                            }
                        }
                    };
                    
                    // Executar task
                    match execute_task(&task, app_handle.clone(), browser_arc, ollama_url).await {
                        Ok(_) => {
                            // Atualizar last_run
                            let mut sched = scheduler.lock().await;
                            let _ = sched.update_last_run(&task_id, Utc::now());
                            log::info!("Task {} executada com sucesso", task_id);
                        }
                        Err(e) => {
                            log::error!("Erro ao executar task {}: {}", task_id, e);
                        }
                    }
                } else {
                    log::warn!("Task {} não encontrada", task_id);
                }
            })
        })
        .map_err(|e| format!("Failed to create job for task {}: {}", task_id_for_log, e))?;
        
        sched.add(job).await
            .map_err(|e| format!("Failed to add job to scheduler: {}", e))?;
        
        log::info!("Task '{}' agendada com cron: {}", task_label_for_log, cron_expr);
    }
    
    Ok(())
}

