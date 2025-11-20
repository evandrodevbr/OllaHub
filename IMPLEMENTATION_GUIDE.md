# Guia de Implementação: System Tray, Background Mode e Task Scheduler

## Status da Implementação

### ✅ Concluído

1. **Estrutura de Tasks** (`src-tauri/src/scheduler.rs`)
   - `SentinelTask` com suporte a múltiplos tipos de ações
   - Persistência em `tasks.json`
   - Gerenciamento de estado thread-safe

2. **Cliente Ollama Headless** (`src-tauri/src/ollama_client.rs`)
   - Comunicação direta com Ollama via `reqwest`
   - Suporte a streaming
   - Verificação de conexão

3. **Executor de Tasks** (`src-tauri/src/task_executor.rs`)
   - Execução de `SearchAndSummarize`
   - Execução de `JustPing`
   - Execução de `CustomPrompt`
   - Integração com file locks para escrita segura

4. **Scheduler Loop** (`src-tauri/src/scheduler_loop.rs`)
   - Integração com `tokio-cron-scheduler`
   - Recarregamento dinâmico de tasks
   - Execução assíncrona em background

### 🔨 Pendente (Próximos Passos)

#### 1. Comandos Tauri para CRUD de Tasks

Adicione ao `src-tauri/src/lib.rs`:

```rust
use scheduler::{SchedulerService, SchedulerState, SentinelTask, TaskAction};
use chrono::Utc;
use uuid::Uuid;

#[command]
async fn create_task(
    scheduler: State<'_, SchedulerState>,
    label: String,
    cron_schedule: String,
    action: TaskAction,
) -> Result<String, String> {
    let task = SentinelTask {
        id: Uuid::new_v4().to_string(),
        label,
        cron_schedule,
        action,
        enabled: true,
        last_run: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    
    let mut sched = scheduler.lock().await;
    sched.upsert_task(task.clone())?;
    Ok(task.id)
}

#[command]
async fn list_tasks(
    scheduler: State<'_, SchedulerState>,
) -> Result<Vec<SentinelTask>, String> {
    let sched = scheduler.lock().await;
    Ok(sched.list_tasks())
}

#[command]
async fn update_task(
    scheduler: State<'_, SchedulerState>,
    task: SentinelTask,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    let mut updated = task;
    updated.updated_at = Utc::now();
    sched.upsert_task(updated)
}

#[command]
async fn delete_task(
    scheduler: State<'_, SchedulerState>,
    id: String,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    sched.remove_task(&id)
}

#[command]
async fn toggle_task(
    scheduler: State<'_, SchedulerState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let mut sched = scheduler.lock().await;
    if let Some(mut task) = sched.get_task(&id).cloned() {
        task.enabled = enabled;
        task.updated_at = Utc::now();
        sched.upsert_task(task)
    } else {
        Err("Task not found".to_string())
    }
}
```

#### 2. System Tray Setup

No `src-tauri/src/lib.rs`, modifique o `.setup()`:

```rust
use tauri::{Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};

.setup(|app| {
    // ... código existente ...
    
    // Criar System Tray
    let tray_menu = SystemTrayMenu::new()
        .add_item(SystemTrayMenuItem::with_id("show", "Mostrar OllaHub", true, None))
        .add_item(SystemTrayMenuItem::with_id("pause", "Pausar Tasks", true, None))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(SystemTrayMenuItem::with_id("quit", "Sair", true, None));
    
    let system_tray = SystemTray::new().with_menu(tray_menu);
    
    app.handle().system_tray(system_tray)?;
    
    // Handler de eventos do Tray
    app.handle().on_system_tray_event(|app, event| {
        if let SystemTrayEvent::MenuItemClick { id, .. } = event {
            match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
                "pause" => {
                    // Implementar lógica de pausar tasks
                    log::info!("Pausar tasks - implementar");
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        }
    });
    
    // Modificar comportamento de fechar janela
    if let Some(window) = app.get_window("main") {
        window.on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Ocultar ao invés de fechar
                if let Some(window) = event.window() {
                    window.hide().unwrap();
                }
                api.prevent_close();
            }
        });
    }
    
    Ok(())
})
```

#### 3. Inicializar Scheduler no Setup

No mesmo `.setup()`, após criar o scheduler:

```rust
// Inicializar scheduler
let scheduler_service = SchedulerService::new(app.handle().clone())?;
let scheduler_state: SchedulerState = Arc::new(Mutex::new(scheduler_service));
let browser_state: BrowserState = app.state();

// Iniciar loop do scheduler em background
let app_handle = app.handle().clone();
let scheduler_clone = scheduler_state.clone();
let browser_clone = browser_state.clone();
tokio::spawn(async move {
    if let Err(e) = scheduler_loop::start_scheduler_loop(
        app_handle,
        scheduler_clone,
        browser_clone,
        None, // Ollama URL - pode vir do settings
    ).await {
        log::error!("Erro ao iniciar scheduler: {}", e);
    }
});

// Adicionar ao manage
.manage(scheduler_state)
```

#### 4. Adicionar Comandos ao Invoke Handler

```rust
.invoke_handler(tauri::generate_handler![
    // ... comandos existentes ...
    create_task,
    list_tasks,
    update_task,
    delete_task,
    toggle_task,
])
```

#### 5. Interface React (app/tasks/page.tsx)

Crie uma página básica para gerenciar tasks:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Task {
  id: string;
  label: string;
  cron_schedule: string;
  action: any;
  enabled: boolean;
  last_run: string | null;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  
  useEffect(() => {
    loadTasks();
  }, []);
  
  const loadTasks = async () => {
    try {
      const loaded = await invoke<Task[]>('list_tasks');
      setTasks(loaded);
    } catch (error) {
      console.error('Erro ao carregar tasks:', error);
    }
  };
  
  const toggleTask = async (id: string, enabled: boolean) => {
    try {
      await invoke('toggle_task', { id, enabled: !enabled });
      await loadTasks();
    } catch (error) {
      console.error('Erro ao alternar task:', error);
    }
  };
  
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Tarefas Agendadas</h1>
      <div className="space-y-4">
        {tasks.map(task => (
          <Card key={task.id}>
            <CardHeader>
              <CardTitle>{task.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Cron: {task.cron_schedule}</p>
              <p>Status: {task.enabled ? 'Ativa' : 'Pausada'}</p>
              <Button onClick={() => toggleTask(task.id, task.enabled)}>
                {task.enabled ? 'Pausar' : 'Ativar'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

## Dependências Adicionais Necessárias

No `Cargo.toml`, já foram adicionadas:
- `tokio-cron-scheduler = "0.9"`
- `futures-util = "0.3"`
- `tauri-plugin-notification = "2"`

**Nota para Linux:** Para System Tray funcionar, pode ser necessário:
```bash
# Ubuntu/Debian
sudo apt-get install libappindicator3-1

# Arch/Manjaro
sudo pacman -S libappindicator-gtk3
```

## Próximos Passos

1. Compilar e testar: `cd src-tauri && cargo build`
2. Corrigir erros de compilação
3. Testar criação de task via frontend
4. Verificar se scheduler executa corretamente
5. Testar System Tray em diferentes plataformas

## Notas Importantes

- **File Locking**: Já implementado - tasks usam o mesmo sistema de locks que salvar sessões
- **Concorrência**: Scheduler roda em thread separada, não bloqueia UI
- **Persistência**: Tasks são salvas em `app_data_dir/tasks.json`
- **Notificações**: Usa `tauri-plugin-notification` para notificações nativas

