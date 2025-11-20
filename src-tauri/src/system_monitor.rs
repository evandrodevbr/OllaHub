use serde::Serialize;
use sysinfo::System;

/// Estatísticas do sistema em tempo real
#[derive(Serialize, Clone, Debug)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    pub ram_percent: f32,
    pub gpu_name: Option<String>,
    pub uptime: u64,
    pub processes_count: usize,
    pub cpu_name: String,
}

/// Estado persistente do sistema para cálculo de CPU
pub struct SystemMonitorState {
    system: System,
    last_cpu_check: std::time::Instant,
}

impl SystemMonitorState {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        
        Self {
            system,
            last_cpu_check: std::time::Instant::now(),
        }
    }
    
    pub fn get_stats(&mut self) -> SystemStats {
        // Refresh system info
        self.system.refresh_all();
        
        // Refresh CPU para cálculo preciso
        self.system.refresh_cpu_all();
        
        // Pequeno delay para cálculo preciso de CPU
        std::thread::sleep(std::time::Duration::from_millis(100));
        self.system.refresh_cpu_all();
        
        // CPU usage global
        let cpu_usage = self.system.global_cpu_usage();
        
        // RAM
        let ram_total = self.system.total_memory();
        let ram_used = self.system.used_memory();
        let ram_percent = if ram_total > 0 {
            (ram_used as f32 / ram_total as f32) * 100.0
        } else {
            0.0
        };
        
        // CPU Name
        let cpu_name = self.system
            .cpus()
            .first()
            .map(|cpu| cpu.name().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());
        
        // GPU Name (tentativa básica - sysinfo não tem suporte direto)
        let gpu_name = detect_gpu_name();
        
        // Uptime do sistema (em segundos desde o boot)
        let boot_time = System::boot_time();
        let uptime = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_sub(boot_time);
        
        // Contagem de processos
        let processes_count = self.system.processes().len();
        
        SystemStats {
            cpu_usage,
            ram_used,
            ram_total,
            ram_percent,
            gpu_name,
            uptime,
            processes_count,
            cpu_name,
        }
    }
}

/// Tenta detectar o nome da GPU (implementação básica)
fn detect_gpu_name() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        // Tenta usar wmic para detectar GPU no Windows
        if let Ok(output) = Command::new("wmic")
            .args(&["path", "win32_VideoController", "get", "name"])
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for line in stdout.lines() {
                    let line = line.trim();
                    if !line.is_empty() && line != "Name" {
                        return Some(line.to_string());
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        
        // Tenta usar lspci no Linux
        if let Ok(output) = Command::new("lspci")
            .args(&["-v", "-s", "$(lspci | grep VGA | cut -d' ' -f1)"])
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for line in stdout.lines() {
                    if line.contains("VGA") || line.contains("Display") {
                        return Some(line.to_string());
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        
        // Tenta usar system_profiler no macOS
        if let Ok(output) = Command::new("system_profiler")
            .args(&["SPDisplaysDataType"])
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for line in stdout.lines() {
                    if line.contains("Chipset Model") {
                        return Some(line.replace("Chipset Model:", "").trim().to_string());
                    }
                }
            }
        }
    }
    
    None
}

