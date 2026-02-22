use serde::{Serialize, Deserialize};
use sysinfo::System;
use std::process::Command;
use anyhow::Result;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemRequirements {
    pub status: RequirementStatus,
    pub os: String,
    pub arch: String,
    pub ram_mb: u64,
    pub disk_gb: u64,
    pub cpu_cores: usize,
    pub kernel_version: Option<String>,
    pub issues: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum RequirementStatus {
    Pass,
    Fail,
    Warn,
}

/// Verifica requisitos do sistema para instalação do Docker
pub fn check_system_requirements() -> Result<SystemRequirements> {
    let os = get_operating_system();
    
    match os.as_str() {
        "linux" => check_linux_requirements(),
        "windows" => check_windows_requirements(),
        "mac" => check_macos_requirements(),
        _ => {
            Ok(SystemRequirements {
                status: RequirementStatus::Fail,
                os,
                arch: "unknown".to_string(),
                ram_mb: 0,
                disk_gb: 0,
                cpu_cores: 0,
                kernel_version: None,
                issues: vec!["Sistema operacional não suportado".to_string()],
                warnings: vec![],
            })
        }
    }
}

/// Verifica requisitos no Linux
fn check_linux_requirements() -> Result<SystemRequirements> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let mut status = RequirementStatus::Pass;
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    
    // Verificar versão do kernel
    let kernel_version = get_kernel_version();
    if let Some(kernel) = &kernel_version {
        if !is_kernel_version_sufficient(kernel) {
            issues.push(format!("Kernel {} menor que 3.10 requerido", kernel));
            status = RequirementStatus::Fail;
        }
    } else {
        warnings.push("Não foi possível verificar versão do kernel".to_string());
        status = match status {
            RequirementStatus::Fail => RequirementStatus::Fail,
            _ => RequirementStatus::Warn,
        };
    }
    
    // Verificar RAM (mínimo 2GB)
    let ram_mb = sys.total_memory() / (1024 * 1024);
    if ram_mb < 2048 {
        issues.push(format!("RAM insuficiente: {}MB (mínimo 2GB)", ram_mb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar espaço em disco (mínimo 10GB)
    let disk_gb = get_disk_space_gb();
    if disk_gb < 10 {
        issues.push(format!("Espaço em disco insuficiente: {}GB (mínimo 10GB)", disk_gb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar CPU cores (mínimo 2, mas apenas warning)
    let cpu_cores = sys.cpus().len();
    if cpu_cores < 2 {
        warnings.push(format!("CPU cores insuficientes: {} (recomendado 2+)", cpu_cores));
        if matches!(status, RequirementStatus::Pass) {
            status = RequirementStatus::Warn;
        }
    }
    
    // Verificar privilégios sudo
    if !check_sudo_available() {
        issues.push("Privilégios sudo necessários para instalação".to_string());
        status = RequirementStatus::Fail;
    }
    
    // Verificar dependências básicas
    let missing_deps = check_linux_dependencies();
    for dep in missing_deps {
        issues.push(format!("Pacote {} não instalado", dep));
        status = RequirementStatus::Fail;
    }
    
    Ok(SystemRequirements {
        status,
        os: "linux".to_string(),
        arch: get_arch(),
        ram_mb,
        disk_gb,
        cpu_cores,
        kernel_version,
        issues,
        warnings,
    })
}

/// Verifica requisitos no Windows
fn check_windows_requirements() -> Result<SystemRequirements> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let mut status = RequirementStatus::Pass;
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    
    // Verificar versão do Windows (Windows 10 20H1+ ou Windows 11)
    let windows_version = get_windows_version();
    if let Some(version) = windows_version {
        if version < 19041 {
            issues.push(format!("Windows build {} menor que 19041 (20H1) requerido", version));
            status = RequirementStatus::Fail;
        }
    } else {
        warnings.push("Não foi possível verificar versão do Windows".to_string());
        status = match status {
            RequirementStatus::Fail => RequirementStatus::Fail,
            _ => RequirementStatus::Warn,
        };
    }
    
    // Verificar RAM (mínimo 4GB para Windows)
    let ram_mb = sys.total_memory() / (1024 * 1024);
    if ram_mb < 4096 {
        issues.push(format!("RAM insuficiente: {}MB (mínimo 4GB)", ram_mb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar espaço em disco (mínimo 10GB)
    let disk_gb = get_disk_space_gb();
    if disk_gb < 10 {
        issues.push(format!("Espaço em disco insuficiente: {}GB (mínimo 10GB)", disk_gb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar CPU cores
    let cpu_cores = sys.cpus().len();
    if cpu_cores < 2 {
        warnings.push(format!("CPU cores insuficientes: {} (recomendado 2+)", cpu_cores));
        if matches!(status, RequirementStatus::Pass) {
            status = RequirementStatus::Warn;
        }
    }
    
    // Verificar VirtualMachinePlatform
    if !check_windows_feature("VirtualMachinePlatform") {
        issues.push("VirtualMachinePlatform não habilitado".to_string());
        status = RequirementStatus::Fail;
    }
    
    // Verificar WSL
    if !check_windows_feature("Microsoft-Windows-Subsystem-Linux") {
        issues.push("WSL não habilitado".to_string());
        status = RequirementStatus::Fail;
    }
    
    // Verificar versão WSL
    if !check_wsl_version() {
        issues.push("WSL 2 não configurado ou não disponível".to_string());
        status = RequirementStatus::Fail;
    }
    
    Ok(SystemRequirements {
        status,
        os: "windows".to_string(),
        arch: get_arch(),
        ram_mb,
        disk_gb,
        cpu_cores,
        kernel_version: None,
        issues,
        warnings,
    })
}

/// Verifica requisitos no macOS
fn check_macos_requirements() -> Result<SystemRequirements> {
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let mut status = RequirementStatus::Pass;
    let mut issues = Vec::new();
    let mut warnings = Vec::new();
    
    // Verificar versão do macOS (mínimo 11)
    let macos_version = get_macos_version();
    if let Some(version) = &macos_version {
        let major: u32 = version.split('.').next()
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);
        if major < 11 {
            warnings.push(format!("macOS {} pode não ser suportado (recomendado 11+)", version));
            if matches!(status, RequirementStatus::Pass) {
                status = RequirementStatus::Warn;
            }
        }
    } else {
        warnings.push("Não foi possível verificar versão do macOS".to_string());
        status = match status {
            RequirementStatus::Fail => RequirementStatus::Fail,
            _ => RequirementStatus::Warn,
        };
    }
    
    // Verificar RAM (mínimo 4GB para macOS)
    let ram_mb = sys.total_memory() / (1024 * 1024);
    if ram_mb < 4096 {
        issues.push(format!("RAM insuficiente: {}MB (mínimo 4GB)", ram_mb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar espaço em disco (mínimo 4GB para macOS)
    let disk_gb = get_disk_space_gb();
    if disk_gb < 4 {
        issues.push(format!("Espaço em disco insuficiente: {}GB (mínimo 4GB)", disk_gb));
        status = RequirementStatus::Fail;
    }
    
    // Verificar CPU cores
    let cpu_cores = sys.cpus().len();
    if cpu_cores < 2 {
        warnings.push(format!("CPU cores insuficientes: {} (recomendado 2+)", cpu_cores));
        if matches!(status, RequirementStatus::Pass) {
            status = RequirementStatus::Warn;
        }
    }
    
    // Verificar Homebrew (opcional, mas recomendado)
    if !check_homebrew_available() {
        warnings.push("Homebrew não instalado (recomendado para instalação)".to_string());
        if matches!(status, RequirementStatus::Pass) {
            status = RequirementStatus::Warn;
        }
    }
    
    // Verificar Rosetta 2 para Apple Silicon
    #[cfg(target_arch = "aarch64")]
    {
        if !check_rosetta_installed() {
            warnings.push("Rosetta 2 não instalado (necessário para imagens x86)".to_string());
            if matches!(status, RequirementStatus::Pass) {
                status = RequirementStatus::Warn;
            }
        }
    }
    
    Ok(SystemRequirements {
        status,
        os: "mac".to_string(),
        arch: get_arch(),
        ram_mb,
        disk_gb,
        cpu_cores,
        kernel_version: macos_version,
        issues,
        warnings,
    })
}

// Funções auxiliares

fn get_operating_system() -> String {
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    
    #[cfg(target_os = "macos")]
    return "mac".to_string();
    
    #[cfg(target_os = "linux")]
    return "linux".to_string();
    
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    return "unknown".to_string();
}

fn get_arch() -> String {
    std::env::consts::ARCH.to_string()
}

fn get_kernel_version() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        Command::new("uname")
            .arg("-r")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|v| v.trim().to_string())
    }
    
    #[cfg(not(target_os = "linux"))]
    None
}

fn is_kernel_version_sufficient(kernel: &str) -> bool {
    let parts: Vec<&str> = kernel.split('.').collect();
    if parts.len() < 2 {
        return false;
    }
    
    let major: u32 = parts[0].parse().unwrap_or(0);
    let minor: u32 = parts[1].parse().unwrap_or(0);
    
    major > 3 || (major == 3 && minor >= 10)
}

fn get_disk_space_gb() -> u64 {
    #[cfg(target_os = "windows")]
    {
        // Windows: usar wmic
        if let Ok(output) = Command::new("wmic")
            .args(&["logicaldisk", "get", "size,freespace", "/format:list"])
            .output()
        {
            if let Ok(text) = String::from_utf8(output.stdout) {
                // Parse output para obter espaço livre
                for line in text.lines() {
                    if line.starts_with("FreeSpace=") {
                        if let Some(bytes_str) = line.split('=').nth(1) {
                            if let Ok(bytes) = bytes_str.trim().parse::<u64>() {
                                return bytes / (1024 * 1024 * 1024);
                            }
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // Linux: usar df
        if let Ok(output) = Command::new("df")
            .arg("-BG")
            .arg("/")
            .output()
        {
            if let Ok(text) = String::from_utf8(output.stdout) {
                if let Some(line) = text.lines().nth(1) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 4 {
                        if let Ok(gb) = parts[3].trim_end_matches('G').parse::<u64>() {
                            return gb;
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // macOS: usar df
        if let Ok(output) = Command::new("df")
            .arg("-g")
            .arg("/")
            .output()
        {
            if let Ok(text) = String::from_utf8(output.stdout) {
                if let Some(line) = text.lines().nth(1) {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 4 {
                        if let Ok(gb) = parts[3].parse::<u64>() {
                            return gb;
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: retornar valor alto para não bloquear
    100
}

fn check_sudo_available() -> bool {
    #[cfg(target_os = "linux")]
    {
        Command::new("sudo")
            .arg("-n")
            .arg("true")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(not(target_os = "linux"))]
    true
}

fn check_linux_dependencies() -> Vec<String> {
    let mut missing = Vec::new();
    let deps = vec!["curl", "ca-certificates", "gnupg"];
    
    for dep in deps {
        let output = Command::new("dpkg")
            .args(&["-l", dep])
            .output();
        
        if let Ok(o) = output {
            let text = String::from_utf8_lossy(&o.stdout);
            if !text.contains(&format!("ii  {}", dep)) {
                missing.push(dep.to_string());
            }
        } else {
            missing.push(dep.to_string());
        }
    }
    
    missing
}

fn get_windows_version() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args(&["-Command", "[System.Environment]::OSVersion.Version.Build"])
            .output()
        {
            if let Ok(text) = String::from_utf8(output.stdout) {
                if let Ok(build) = text.trim().parse::<u32>() {
                    return Some(build);
                }
            }
        }
    }
    None
}

fn check_windows_feature(feature: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("powershell")
            .args(&[
                "-Command",
                &format!("(Get-WindowsOptionalFeature -Online -FeatureName {}).State", feature)
            ])
            .output()
        {
            if let Ok(text) = String::from_utf8(output.stdout) {
                return text.contains("Enabled");
            }
        }
    }
    false
}

fn check_wsl_version() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Verificar se WSL está disponível
        if let Ok(output) = Command::new("wsl")
            .arg("--version")
            .output()
        {
            if output.status.success() {
                // Verificar versão padrão
                if let Ok(output) = Command::new("wsl")
                    .args(&["--status"])
                    .output()
                {
                    let text = String::from_utf8_lossy(&output.stdout);
                    return text.contains("2") || text.contains("WSL 2");
                }
            }
        }
    }
    false
}

fn get_macos_version() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|v| v.trim().to_string())
    }
    
    #[cfg(not(target_os = "macos"))]
    None
}

fn check_homebrew_available() -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("brew")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(not(target_os = "macos"))]
    false
}

fn check_rosetta_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("/usr/bin/pgrep")
            .arg("oahd")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    
    #[cfg(not(target_os = "macos"))]
    false
}
