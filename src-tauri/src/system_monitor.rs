use serde::Serialize;
use sysinfo::System;

/// Informações sobre uma GPU
#[derive(Serialize, Clone, Debug)]
pub struct GpuInfo {
    pub id: String,
    pub name: String,
    pub vendor: Option<String>,
    pub memory_mb: Option<u64>,
}

/// Estatísticas detalhadas de uma GPU
#[derive(Serialize, Clone, Debug, Default)]
pub struct GpuStats {
    pub id: String,
    pub name: String,
    pub vendor: Option<String>,
    // Memória VRAM
    pub vram_used_mb: Option<u64>,
    pub vram_total_mb: Option<u64>,
    pub vram_percent: Option<f32>,
    // Uso de processamento
    pub compute_usage_percent: Option<f32>,
    pub graphics_usage_percent: Option<f32>,
    pub overall_usage_percent: Option<f32>,
    // Temperatura
    pub temperature_celsius: Option<f32>,
    pub temperature_max_celsius: Option<f32>,
    // Energia
    pub power_watts: Option<f32>,
    pub power_max_watts: Option<f32>,
    // Ventilador
    pub fan_speed_rpm: Option<u32>,
    pub fan_speed_percent: Option<f32>,
    // Processos
    pub processes_count: Option<usize>,
    // Driver/API
    pub driver_version: Option<String>,
    pub api: Option<String>, // CUDA, Vulkan, OpenCL, etc.
}

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
    #[allow(dead_code)]
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
/// Mantido para compatibilidade com SystemStats
fn detect_gpu_name() -> Option<String> {
    let gpus = detect_all_gpus();
    gpus.first().map(|gpu| gpu.name.clone())
}

/// Detecta todas as GPUs disponíveis no sistema
pub fn detect_all_gpus() -> Vec<GpuInfo> {
    log::info!("Iniciando detecção de GPUs...");
    let mut gpus = Vec::new();
    
    // Primeiro, tentar obter informações do Ollama se estiver rodando
    if let Ok(ollama_gpus) = detect_gpus_ollama_api() {
        log::info!("GPUs detectadas via API do Ollama: {}", ollama_gpus.len());
        gpus.extend(ollama_gpus);
    }
    
    #[cfg(target_os = "windows")]
    {
        // Tentar múltiplas fontes de detecção
        let windows_gpus = detect_gpus_windows();
        
        // Mesclar com GPUs do Ollama, evitando duplicatas
        for windows_gpu in windows_gpus {
            if !gpus.iter().any(|g| g.name == windows_gpu.name) {
                log::info!("GPU detectada via wmic: {}", windows_gpu.name);
                gpus.push(windows_gpu);
            }
        }
        
        // Se não encontrou GPUs NVIDIA, tentar nvidia-smi
        let has_nvidia = gpus.iter().any(|g| g.vendor.as_ref().map(|v| v == "NVIDIA").unwrap_or(false));
        if !has_nvidia {
            log::info!("Tentando nvidia-smi como fallback...");
            if let Ok(nvidia_gpus) = detect_gpus_nvidia_smi() {
                // Mesclar resultados, evitando duplicatas
                for nvidia_gpu in nvidia_gpus {
                    if !gpus.iter().any(|g| g.name == nvidia_gpu.name) {
                        log::info!("GPU detectada via nvidia-smi: {}", nvidia_gpu.name);
                        gpus.push(nvidia_gpu);
                    }
                }
            }
        }
        
        log::info!("Total de GPUs detectadas no Windows: {}", gpus.len());
    }
    
    #[cfg(target_os = "linux")]
    {
        log::info!("Tentando detectar GPUs no Linux...");
        gpus = detect_gpus_linux();
        log::info!("Total de GPUs detectadas no Linux: {}", gpus.len());
    }
    
    #[cfg(target_os = "macos")]
    {
        log::info!("Tentando detectar GPUs no macOS...");
        gpus = detect_gpus_macos();
        log::info!("Total de GPUs detectadas no macOS: {}", gpus.len());
    }
    
    // Se não encontrou nenhuma GPU, retornar GPU genérica
    if gpus.is_empty() {
        log::warn!("Nenhuma GPU detectada, usando fallback genérico");
        gpus.push(GpuInfo {
            id: "gpu_default".to_string(),
            name: "GPU não detectada".to_string(),
            vendor: None,
            memory_mb: None,
        });
    }
    
    log::info!("Detecção de GPUs concluída: {} GPU(s) encontrada(s)", gpus.len());
    gpus
}

/// Detecta GPUs no Windows usando wmic (formato CSV melhorado)
#[cfg(target_os = "windows")]
fn detect_gpus_windows() -> Vec<GpuInfo> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    let mut gpus = Vec::new();
    
    log::info!("Tentando detectar GPUs via wmic...");
    
    // Tentar formato CSV primeiro (mais confiável)
    if let Ok(output) = Command::new("wmic")
        .args(&["path", "win32_VideoController", "get", "name,AdapterRAM,PNPDeviceID", "/format:csv"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
    {
        // wmic pode retornar UTF-16LE no Windows, precisamos converter
        let stdout = if let Ok(utf8) = String::from_utf8(output.stdout.clone()) {
            utf8
        } else {
            // Tentar UTF-16LE (little-endian)
            let bytes = output.stdout;
            let mut utf16_chars = Vec::new();
            let mut i = 0;
            while i + 1 < bytes.len() {
                let low = bytes[i] as u16;
                let high = bytes[i + 1] as u16;
                utf16_chars.push(low | (high << 8));
                i += 2;
            }
            String::from_utf16_lossy(&utf16_chars)
        };
        
        log::debug!("wmic output (primeiros 500 chars): {}", stdout.chars().take(500).collect::<String>());
        
        // Parse CSV: Node,Name,AdapterRAM,PNPDeviceID
        let lines: Vec<&str> = stdout.lines().collect();
        for (idx, line) in lines.iter().enumerate() {
            if idx == 0 {
                continue; // Skip header
            }
            
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() >= 4 {
                let name = parts[1].trim_matches('"').to_string();
                if !name.is_empty() && name != "Name" {
                    let adapter_ram_str = parts[2].trim_matches('"');
                    let pnp_id = parts[3].trim_matches('"').to_string();
                    
                    let memory_mb = if !adapter_ram_str.is_empty() && adapter_ram_str != "AdapterRAM" {
                        adapter_ram_str.parse::<u64>().ok().map(|bytes| bytes / (1024 * 1024))
                    } else {
                        None
                    };
                    
                    let vendor = detect_vendor_from_name(&name);
                    let id = if !pnp_id.is_empty() && pnp_id != "PNPDeviceID" {
                        format!("gpu_{}", pnp_id.replace("\\", "_").replace("/", "_"))
                    } else {
                        format!("gpu_{}", gpus.len())
                    };
                    
                    log::info!("GPU detectada via wmic: {} (VRAM: {:?} MB)", name, memory_mb);
                    
                    gpus.push(GpuInfo {
                        id,
                        name,
                        vendor,
                        memory_mb,
                    });
                }
            }
        }
    } else {
        log::warn!("Falha ao executar wmic, tentando formato list...");
        
        // Fallback para formato list
        if let Ok(output) = Command::new("wmic")
            .args(&["path", "win32_VideoController", "get", "name,AdapterRAM,PNPDeviceID", "/format:list"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                let mut current_gpu: Option<GpuInfo> = None;
                
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        if let Some(gpu) = current_gpu.take() {
                            gpus.push(gpu);
                        }
                        continue;
                    }
                    
                    if line.starts_with("Name=") {
                        let name = line.replace("Name=", "").trim().to_string();
                        if !name.is_empty() {
                            let vendor = detect_vendor_from_name(&name);
                            current_gpu = Some(GpuInfo {
                                id: format!("gpu_{}", gpus.len()),
                                name,
                                vendor,
                                memory_mb: None,
                            });
                        }
                    } else if line.starts_with("AdapterRAM=") {
                        if let Some(gpu) = &mut current_gpu {
                            if let Ok(memory_bytes) = line.replace("AdapterRAM=", "").trim().parse::<u64>() {
                                gpu.memory_mb = Some(memory_bytes / (1024 * 1024));
                            }
                        }
                    } else if line.starts_with("PNPDeviceID=") {
                        if let Some(gpu) = &mut current_gpu {
                            let pnp_id = line.replace("PNPDeviceID=", "").trim().to_string();
                            if !pnp_id.is_empty() {
                                gpu.id = format!("gpu_{}", pnp_id.replace("\\", "_").replace("/", "_"));
                            }
                        }
                    }
                }
                
                if let Some(gpu) = current_gpu {
                    gpus.push(gpu);
                }
            }
        }
    }
    
    gpus
}

/// Detecta GPUs NVIDIA usando nvidia-smi
#[cfg(target_os = "windows")]
fn detect_gpus_nvidia_smi() -> Result<Vec<GpuInfo>, String> {
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    log::info!("Executando nvidia-smi...");
    
    let output = Command::new("nvidia-smi")
        .args(&["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("nvidia-smi não encontrado: {}", e))?;
    
    if !output.status.success() {
        return Err("nvidia-smi falhou".to_string());
    }
    
    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Erro ao parsear output do nvidia-smi: {}", e))?;
    
    log::debug!("nvidia-smi output: {}", stdout);
    
    let mut gpus = Vec::new();
    for (idx, line) in stdout.lines().enumerate() {
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() >= 2 {
            let name = parts[0].trim().to_string();
            let memory_mb = parts[1].trim().parse::<u64>().ok();
            
            if !name.is_empty() {
                log::info!("GPU NVIDIA detectada via nvidia-smi: {} ({} MB)", name, memory_mb.unwrap_or(0));
                
                gpus.push(GpuInfo {
                    id: format!("nvidia_gpu_{}", idx),
                    name,
                    vendor: Some("NVIDIA".to_string()),
                    memory_mb,
                });
            }
        }
    }
    
    Ok(gpus)
}

/// Tenta detectar GPUs via API do Ollama (quando disponível)
/// Nota: O Ollama não expõe diretamente informações de GPU via API pública
/// Esta função verifica se o Ollama está rodando, mas a detecção real
/// é feita via métodos do sistema operacional (wmic, nvidia-smi, etc)
fn detect_gpus_ollama_api() -> Result<Vec<GpuInfo>, String> {
    // Por enquanto, retornamos vazio pois o Ollama não tem endpoint público de GPU
    // A detecção é feita via métodos do sistema operacional que são mais confiáveis
    // Esta função pode ser expandida no futuro se o Ollama adicionar um endpoint de GPU
    
    log::debug!("Verificação de API do Ollama não implementada (não há endpoint público de GPU)");
    Ok(Vec::new())
}

/// Detecta GPUs no Linux usando múltiplas fontes
#[cfg(target_os = "linux")]
fn detect_gpus_linux() -> Vec<GpuInfo> {
    use std::process::Command;
    let mut gpus = Vec::new();
    
    // 1. Tentar lspci primeiro
    log::info!("Tentando lspci...");
    if let Ok(output) = Command::new("lspci")
        .args(&["-m", "-d", "::0300"]) // Apenas dispositivos VGA
        .output()
    {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            for (index, line) in stdout.lines().enumerate() {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 2 {
                    let name = parts[1].trim().to_string();
                    if !name.is_empty() {
                        let vendor = detect_vendor_from_name(&name);
                        log::info!("GPU detectada via lspci: {}", name);
                        gpus.push(GpuInfo {
                            id: format!("gpu_{}", index),
                            name,
                            vendor,
                            memory_mb: None,
                        });
                    }
                }
            }
        }
    }
    
    // 2. Se não encontrou, tentar método alternativo
    if gpus.is_empty() {
        log::info!("Tentando lspci | grep como fallback...");
        if let Ok(output) = Command::new("sh")
            .args(&["-c", "lspci | grep -i vga"])
            .output()
        {
            if let Ok(stdout) = String::from_utf8(output.stdout) {
                for (index, line) in stdout.lines().enumerate() {
                    let line = line.trim();
                    if !line.is_empty() && (line.contains("VGA") || line.contains("Display")) {
                        let parts: Vec<&str> = line.splitn(2, ':').collect();
                        if parts.len() >= 2 {
                            let name = parts[1].trim().to_string();
                            if !name.is_empty() {
                                let vendor = detect_vendor_from_name(&name);
                                log::info!("GPU detectada via lspci grep: {}", name);
                                gpus.push(GpuInfo {
                                    id: format!("gpu_{}", index),
                                    name,
                                    vendor,
                                    memory_mb: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 3. Tentar nvidia-smi se não encontrou GPUs NVIDIA
    let has_nvidia = gpus.iter().any(|g| g.vendor.as_ref().map(|v| v == "NVIDIA").unwrap_or(false));
    if !has_nvidia {
        log::info!("Tentando nvidia-smi...");
        if let Ok(nvidia_gpus) = detect_gpus_nvidia_smi_linux() {
            for nvidia_gpu in nvidia_gpus {
                if !gpus.iter().any(|g| g.name == nvidia_gpu.name) {
                    gpus.push(nvidia_gpu);
                }
            }
        }
    }
    
    // 4. Tentar /sys/class/drm/ como último recurso
    if gpus.is_empty() {
        log::info!("Tentando /sys/class/drm/...");
        if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
            for (idx, entry) in entries.enumerate() {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("card") && name != "card" {
                            if let Ok(name_file) = std::fs::read_to_string(path.join("name")) {
                                let gpu_name = name_file.trim().to_string();
                                if !gpu_name.is_empty() {
                                    let vendor = detect_vendor_from_name(&gpu_name);
                                    log::info!("GPU detectada via /sys/class/drm/: {}", gpu_name);
                                    gpus.push(GpuInfo {
                                        id: format!("gpu_{}", idx),
                                        name: gpu_name,
                                        vendor,
                                        memory_mb: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    gpus
}

/// Detecta GPUs NVIDIA no Linux usando nvidia-smi
#[cfg(target_os = "linux")]
fn detect_gpus_nvidia_smi_linux() -> Result<Vec<GpuInfo>, String> {
    use std::process::Command;
    
    let output = Command::new("nvidia-smi")
        .args(&["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
        .map_err(|e| format!("nvidia-smi não encontrado: {}", e))?;
    
    if !output.status.success() {
        return Err("nvidia-smi falhou".to_string());
    }
    
    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Erro ao parsear output do nvidia-smi: {}", e))?;
    
    let mut gpus = Vec::new();
    for (idx, line) in stdout.lines().enumerate() {
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if parts.len() >= 2 {
            let name = parts[0].trim().to_string();
            let memory_mb = parts[1].trim().parse::<u64>().ok();
            
            if !name.is_empty() {
                log::info!("GPU NVIDIA detectada via nvidia-smi: {} ({} MB)", name, memory_mb.unwrap_or(0));
                gpus.push(GpuInfo {
                    id: format!("nvidia_gpu_{}", idx),
                    name,
                    vendor: Some("NVIDIA".to_string()),
                    memory_mb,
                });
            }
        }
    }
    
    Ok(gpus)
}

/// Detecta GPUs no macOS usando system_profiler
#[cfg(target_os = "macos")]
fn detect_gpus_macos() -> Vec<GpuInfo> {
    use std::process::Command;
    let mut gpus = Vec::new();
    
    log::info!("Executando system_profiler...");
    
    if let Ok(output) = Command::new("system_profiler")
        .args(&["SPDisplaysDataType"])
        .output()
    {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            let mut current_gpu: Option<GpuInfo> = None;
            let mut gpu_index = 0;
            
            for line in stdout.lines() {
                let line = line.trim();
                
                if line.starts_with("Chipset Model:") {
                    // Finalizar GPU anterior se houver
                    if let Some(gpu) = current_gpu.take() {
                        gpus.push(gpu);
                    }
                    
                    let name = line.replace("Chipset Model:", "").trim().to_string();
                    if !name.is_empty() {
                        let vendor = detect_vendor_from_name(&name);
                        log::info!("GPU detectada no macOS: {}", name);
                        current_gpu = Some(GpuInfo {
                            id: format!("gpu_{}", gpu_index),
                            name,
                            vendor,
                            memory_mb: None,
                        });
                        gpu_index += 1;
                    }
                } else if line.starts_with("VRAM (Total):") {
                    if let Some(gpu) = &mut current_gpu {
                        let vram_str = line.replace("VRAM (Total):", "").trim().to_string();
                        if let Some(mb) = parse_memory_string(&vram_str) {
                            gpu.memory_mb = Some(mb);
                            log::info!("VRAM detectada: {} MB", mb);
                        }
                    }
                }
            }
            
            // Adicionar última GPU se houver
            if let Some(gpu) = current_gpu {
                gpus.push(gpu);
            }
        }
    }
    
    gpus
}

/// Detecta o vendor (fabricante) da GPU baseado no nome
fn detect_vendor_from_name(name: &str) -> Option<String> {
    let name_lower = name.to_lowercase();
    
    if name_lower.contains("nvidia") || name_lower.contains("geforce") || name_lower.contains("quadro") || name_lower.contains("tesla") {
        return Some("NVIDIA".to_string());
    }
    
    if name_lower.contains("amd") || name_lower.contains("radeon") || name_lower.contains("firepro") {
        return Some("AMD".to_string());
    }
    
    if name_lower.contains("intel") || name_lower.contains("iris") || name_lower.contains("uhd") || name_lower.contains("hd graphics") {
        return Some("Intel".to_string());
    }
    
    if name_lower.contains("apple") {
        return Some("Apple".to_string());
    }
    
    None
}

/// Parse string de memória (ex: "8 GB" -> 8192 MB)
#[allow(dead_code)]
fn parse_memory_string(s: &str) -> Option<u64> {
    let s = s.trim().to_lowercase();
    
    // Tentar extrair número e unidade
    let parts: Vec<&str> = s.split_whitespace().collect();
    if parts.is_empty() {
        return None;
    }
    
    if let Ok(value) = parts[0].parse::<f64>() {
        let multiplier = if s.contains("gb") || s.contains("g") {
            1024 // GB para MB
        } else if s.contains("mb") || s.contains("m") {
            1 // Já está em MB
        } else {
            // Assumir GB se não especificado
            1024
        };
        
        return Some((value * multiplier as f64) as u64);
    }
    
    None
}

/// Obtém estatísticas detalhadas de uma GPU específica
pub fn get_gpu_stats(gpu_id: Option<&str>) -> Option<GpuStats> {
    let gpus = detect_all_gpus();
    
    // Se gpu_id fornecido, buscar GPU específica, senão usar primeira GPU
    let target_gpu = if let Some(id) = gpu_id {
        gpus.iter().find(|g| g.id == id)
    } else {
        gpus.first()
    }?;
    
    // Tentar obter stats detalhados baseado no vendor
    if let Some(vendor) = &target_gpu.vendor {
        match vendor.as_str() {
            "NVIDIA" => get_nvidia_gpu_stats(target_gpu),
            "AMD" => get_amd_gpu_stats(target_gpu),
            "Intel" => get_intel_gpu_stats(target_gpu),
            _ => get_generic_gpu_stats(target_gpu),
        }
    } else {
        get_generic_gpu_stats(target_gpu)
    }
}

/// Obtém estatísticas detalhadas de GPU NVIDIA via nvidia-smi
fn get_nvidia_gpu_stats(gpu: &GpuInfo) -> Option<GpuStats> {
    use std::process::Command;
    
    log::info!("Coletando stats detalhados da GPU NVIDIA: {}", gpu.name);
    
    // Query nvidia-smi para obter todas as métricas
    let query = "name,memory.used,memory.total,utilization.gpu,utilization.memory,temperature.gpu,temperature.max,power.draw,power.limit,fan.speed,driver_version";
    
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(&[
        "--query-gpu", query,
        "--format=csv,noheader,nounits"
    ]);
    
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    let output = cmd.output().ok()?;
    
    if !output.status.success() {
        log::warn!("nvidia-smi falhou ao coletar stats");
        return get_generic_gpu_stats(gpu);
    }
    
    let stdout = String::from_utf8(output.stdout).ok()?;
    let line = stdout.lines().next()?;
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    
    if parts.len() < 11 {
        log::warn!("nvidia-smi retornou formato inesperado");
        return get_generic_gpu_stats(gpu);
    }
    
    // Parse dos valores
    let vram_used_mb = parts[1].parse::<u64>().ok();
    let vram_total_mb = parts[2].parse::<u64>().ok();
    let vram_percent = if let (Some(used), Some(total)) = (vram_used_mb, vram_total_mb) {
        if total > 0 {
            Some((used as f32 / total as f32) * 100.0)
        } else {
            None
        }
    } else {
        None
    };
    
    let compute_usage_percent = parts[3].parse::<f32>().ok();
    let _memory_usage_percent = parts[4].parse::<f32>().ok();
    let overall_usage_percent = compute_usage_percent;
    
    let temperature_celsius = parts[5].parse::<f32>().ok();
    let temperature_max_celsius = parts[6].parse::<f32>().ok();
    
    let power_watts = parts[7].parse::<f32>().ok();
    let power_max_watts = parts[8].parse::<f32>().ok();
    
    let fan_speed_percent = parts[9].parse::<f32>().ok();
    let fan_speed_rpm = None; // nvidia-smi não retorna RPM diretamente
    
    let driver_version = Some(parts[10].to_string());
    
    // Contar processos usando GPU
    let processes_count = count_nvidia_gpu_processes().unwrap_or(0);
    
    Some(GpuStats {
        id: gpu.id.clone(),
        name: gpu.name.clone(),
        vendor: gpu.vendor.clone(),
        vram_used_mb,
        vram_total_mb,
        vram_percent,
        compute_usage_percent,
        graphics_usage_percent: compute_usage_percent, // NVIDIA não diferencia
        overall_usage_percent,
        temperature_celsius,
        temperature_max_celsius,
        power_watts,
        power_max_watts,
        fan_speed_rpm,
        fan_speed_percent,
        processes_count: Some(processes_count),
        driver_version,
        api: Some("CUDA".to_string()),
    })
}

/// Conta processos usando GPU NVIDIA
fn count_nvidia_gpu_processes() -> Result<usize, String> {
    use std::process::Command;
    
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(&["--query-compute-apps=pid", "--format=csv,noheader"]);
    
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    let output = cmd.output()
        .map_err(|e| format!("nvidia-smi não encontrado: {}", e))?;
    
    if !output.status.success() {
        return Ok(0);
    }
    
    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Erro ao parsear output: {}", e))?;
    
    // Contar linhas não vazias
    let count = stdout.lines().filter(|l| !l.trim().is_empty()).count();
    Ok(count)
}

/// Obtém estatísticas de GPU AMD (implementação básica)
fn get_amd_gpu_stats(gpu: &GpuInfo) -> Option<GpuStats> {
    log::info!("Coletando stats da GPU AMD: {} (suporte limitado)", gpu.name);
    // AMD requer rocm-smi ou outras ferramentas específicas
    // Por enquanto, retornar stats genéricos
    get_generic_gpu_stats(gpu)
}

/// Obtém estatísticas de GPU Intel (implementação básica)
fn get_intel_gpu_stats(gpu: &GpuInfo) -> Option<GpuStats> {
    log::info!("Coletando stats da GPU Intel: {} (suporte limitado)", gpu.name);
    // Intel requer intel_gpu_top ou outras ferramentas específicas
    get_generic_gpu_stats(gpu)
}

/// Retorna stats genéricos quando não há suporte específico
fn get_generic_gpu_stats(gpu: &GpuInfo) -> Option<GpuStats> {
    Some(GpuStats {
        id: gpu.id.clone(),
        name: gpu.name.clone(),
        vendor: gpu.vendor.clone(),
        vram_total_mb: gpu.memory_mb,
        ..Default::default()
    })
}

