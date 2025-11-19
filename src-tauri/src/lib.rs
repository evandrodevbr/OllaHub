use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::time::Duration;
use tauri::{command, Window, Emitter};
use sysinfo::System;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(serde::Serialize)]
struct SystemSpecs {
    total_memory: u64,
    cpu_count: usize,
    os_name: String,
}

#[derive(serde::Serialize, Clone)]
struct SystemStats {
    cpu_usage: f32,
    memory_used: u64,
    memory_total: u64,
}

#[derive(serde::Serialize)]
struct LocalModel {
    name: String,
    size: String,
    id: String,
    modified_at: String,
}

#[command]
fn get_system_specs() -> SystemSpecs {
    let mut sys = System::new_all();
    sys.refresh_all();

    SystemSpecs {
        total_memory: sys.total_memory(),
        cpu_count: sys.cpus().len(),
        os_name: System::name().unwrap_or("Unknown".to_string()),
    }
}

#[command]
fn start_system_monitor(window: Window) {
    std::thread::spawn(move || {
        let mut sys = System::new_all();
        loop {
            sys.refresh_cpu_all();
            sys.refresh_memory();

            let cpu_usage = sys.global_cpu_usage();
            let memory_used = sys.used_memory();
            let memory_total = sys.total_memory();

            let stats = SystemStats {
                cpu_usage,
                memory_used,
                memory_total,
            };

            if window.emit("system-stats", stats).is_err() {
                break; // Stop if window is closed
            }

            std::thread::sleep(Duration::from_secs(2));
        }
    });
}

#[command]
fn list_local_models() -> Vec<LocalModel> {
    let output = Command::new("ollama")
        .arg("list")
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut models = Vec::new();
            
            // Skip header line
            for line in stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 4 {
                    // NAME ID SIZE MODIFIED
                    // Note: Modified can be "2 days ago" (multiple parts)
                    // We'll take the first part as name, second as ID, third as size
                    // and the rest as modified
                    let name = parts[0].to_string();
                    let id = parts[1].to_string();
                    let size = parts[2].to_string();
                    let modified_at = parts[3..].join(" ");

                    models.push(LocalModel {
                        name,
                        id,
                        size,
                        modified_at,
                    });
                }
            }
            models
        }
        Err(_) => Vec::new(),
    }
}

#[command]
async fn delete_model(name: String) -> Result<(), String> {
    let output = Command::new("ollama")
        .arg("rm")
        .arg(&name)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[command]
fn check_if_model_installed(name: String) -> bool {
    let output = Command::new("ollama")
        .arg("list")
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout.contains(&name)
        }
        Err(_) => false,
    }
}

#[command]
async fn pull_model(window: Window, name: String) -> Result<(), String> {
    let mut child = Command::new("ollama")
        .arg("pull")
        .arg(&name)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let reader = BufReader::new(stdout);

    for line in reader.lines() {
        match line {
            Ok(l) => {
                window.emit("download-progress", l).unwrap_or(());
            }
            Err(_) => break,
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        Ok(())
    } else {
        Err("Failed to pull model".to_string())
    }
}

#[command]
fn check_ollama_installed() -> bool {
    match Command::new("ollama").arg("--version").output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[command]
async fn check_ollama_running() -> bool {
    match reqwest::get("http://localhost:11434").await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

#[command]
fn start_ollama_server() -> Result<(), String> {
    let mut cmd = Command::new("ollama");
    cmd.arg("serve");

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    // Spawn detached
    cmd.spawn()
        .map_err(|e| format!("Failed to start ollama: {}", e))?;
        
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        check_ollama_installed, 
        check_ollama_running,
        get_system_specs,
        check_if_model_installed,
        pull_model,
        start_ollama_server,
        start_system_monitor,
        list_local_models,
        delete_model
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
