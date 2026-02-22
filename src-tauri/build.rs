use std::path::Path;
use std::process::Command;
use std::fs::File;
use std::io::Read;
use std::io::Write;
use std::time::Duration;

// Constantes para download e validação do OllamaSetup.exe
const OLLAMA_SETUP_URL: &str = "https://ollama.com/download/OllamaSetup.exe";
const MAX_RETRIES: u32 = 3;
const DOWNLOAD_TIMEOUT_SECS: u64 = 300;

// Hash SHA256 esperado do OllamaSetup.exe
// Pode ser sobrescrito via variável de ambiente OLLAMA_SETUP_EXE_SHA256
// IMPORTANTE: Atualizar este valor com o hash SHA256 oficial do instalador
const DEFAULT_EXPECTED_OLLAMA_SETUP_SHA256: &str = "AC9C74B41A8303E5566C5AD3ED6EF0E0123D58AEBC87D3109973F02A38D3FF61";

/// Calcula o hash SHA256 de um arquivo
/// Usa chunks de 8KB para leitura eficiente (padrão do projeto)
fn calculate_sha256(file_path: &Path) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    
    let mut file = File::open(file_path)
        .map_err(|e| format!("Failed to open file for hash calculation: {}", e))?;
    
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 8192]; // Buffer de 8KB para leitura em chunks
    
    loop {
        let bytes_read = file.read(&mut buffer)
            .map_err(|e| format!("Failed to read file for hash: {}", e))?;
        
        if bytes_read == 0 {
            break;
        }
        
        hasher.update(&buffer[..bytes_read]);
    }
    
    let hash = hasher.finalize();
    Ok(format!("{:x}", hash))
}

/// Faz download de um arquivo com retry logic e backoff exponencial
fn download_with_retry(url: &str, dest_path: &Path) -> Result<(), String> {
    use reqwest::blocking::Client;
    
    // Limpar arquivo parcial se existir antes de iniciar
    if dest_path.exists() {
        std::fs::remove_file(dest_path)
            .map_err(|e| format!("Failed to remove existing file before download: {}", e))?;
    }
    
    let client = Client::builder()
        .timeout(Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    let mut last_error = None;
    
    for attempt in 1..=MAX_RETRIES {
        println!("cargo:warning=Download attempt {}/{}: {}", attempt, MAX_RETRIES, url);
        
        // Limpar arquivo parcial antes de cada tentativa (exceto na primeira, já limpo acima)
        if attempt > 1 && dest_path.exists() {
            std::fs::remove_file(dest_path)
                .map_err(|e| format!("Failed to remove partial file before retry: {}", e))?;
        }
        
        // Garantir que o diretório pai existe
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
        
        match client.get(url).send() {
            Ok(response) => {
                if !response.status().is_success() {
                    let err_msg = format!("HTTP error: {}", response.status());
                    println!("cargo:warning={}", err_msg);
                    last_error = Some(err_msg);
                    
                    if attempt < MAX_RETRIES {
                        let backoff_secs = 2_u64.pow(attempt - 1); // 1s, 2s, 4s
                        println!("cargo:warning=Waiting {} seconds before retry...", backoff_secs);
                        std::thread::sleep(Duration::from_secs(backoff_secs));
                    }
                    continue;
                }
                
                // Obter bytes do response
                match response.bytes() {
                    Ok(bytes) => {
                        // Criar arquivo e escrever conteúdo
                        match File::create(dest_path) {
                            Ok(mut dest_file) => {
                                match dest_file.write_all(&bytes) {
                                    Ok(_) => {
                                        drop(dest_file); // Fechar arquivo antes de validar
                                        println!("cargo:warning=Download completed successfully");
                                        return Ok(());
                                    }
                                    Err(e) => {
                                        let err_msg = format!("Failed to write file: {}", e);
                                        println!("cargo:warning={}", err_msg);
                                        last_error = Some(err_msg);
                                        
                                        // Limpar arquivo parcial
                                        let _ = std::fs::remove_file(dest_path);
                                        
                                        if attempt < MAX_RETRIES {
                                            let backoff_secs = 2_u64.pow(attempt - 1);
                                            println!("cargo:warning=Waiting {} seconds before retry...", backoff_secs);
                                            std::thread::sleep(Duration::from_secs(backoff_secs));
                                        }
                                        continue;
                                    }
                                }
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to create destination file: {}", e);
                                println!("cargo:warning={}", err_msg);
                                last_error = Some(err_msg);
                                
                                if attempt < MAX_RETRIES {
                                    let backoff_secs = 2_u64.pow(attempt - 1);
                                    println!("cargo:warning=Waiting {} seconds before retry...", backoff_secs);
                                    std::thread::sleep(Duration::from_secs(backoff_secs));
                                }
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to read response bytes: {}", e);
                        println!("cargo:warning={}", err_msg);
                        last_error = Some(err_msg);
                        
                        // Limpar arquivo parcial
                        let _ = std::fs::remove_file(dest_path);
                        
                        if attempt < MAX_RETRIES {
                            let backoff_secs = 2_u64.pow(attempt - 1);
                            println!("cargo:warning=Waiting {} seconds before retry...", backoff_secs);
                            std::thread::sleep(Duration::from_secs(backoff_secs));
                        }
                        continue;
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Download failed: {}", e);
                println!("cargo:warning={}", err_msg);
                last_error = Some(err_msg);
                
                if attempt < MAX_RETRIES {
                    let backoff_secs = 2_u64.pow(attempt - 1);
                    println!("cargo:warning=Waiting {} seconds before retry...", backoff_secs);
                    std::thread::sleep(Duration::from_secs(backoff_secs));
                }
            }
        }
    }
    
    Err(format!(
        "Failed to download {} after {} attempts. Last error: {}",
        url,
        MAX_RETRIES,
        last_error.unwrap_or_else(|| "Unknown error".to_string())
    ))
}

/// Valida o hash SHA256 de um arquivo contra o hash esperado
fn validate_sha256(file_path: &Path, expected_hash: &str) -> Result<(), String> {
    println!("cargo:warning=Validating SHA256 hash...");
    
    let calculated_hash = calculate_sha256(file_path)?;
    let calculated_lower = calculated_hash.to_lowercase();
    let expected_lower = expected_hash.to_lowercase();
    
    if calculated_lower != expected_lower {
        // Remover arquivo corrompido
        let _ = std::fs::remove_file(file_path);
        return Err(format!(
            "SHA256 hash mismatch! Expected: {}, Got: {}. Corrupted file removed.",
            expected_hash,
            calculated_hash
        ));
    }
    
    println!("cargo:warning=SHA256 hash validated successfully");
    Ok(())
}

/// Obtém o hash SHA256 esperado (variável de ambiente ou constante padrão)
fn get_expected_sha256() -> String {
    std::env::var("OLLAMA_SETUP_EXE_SHA256")
        .unwrap_or_else(|_| DEFAULT_EXPECTED_OLLAMA_SETUP_SHA256.to_string())
}

/// Baixa e valida o instalador do Ollama
fn download_and_validate_ollama_setup(ollama_path: &Path) -> Result<(), String> {
    let expected_hash = get_expected_sha256();
    
    // Se o hash esperado está vazio, falhar imediatamente
    if expected_hash.is_empty() {
        panic!(
            "OLLAMA_SETUP_EXE_SHA256 não configurado! \
            Configure a variável de ambiente OLLAMA_SETUP_EXE_SHA256 ou \
            atualize DEFAULT_EXPECTED_OLLAMA_SETUP_SHA256 no build.rs"
        );
    }
    
    // Verificar se arquivo já existe
    if ollama_path.exists() {
        println!("cargo:warning=OllamaSetup.exe already exists, validating hash...");
        
        // Validar hash do arquivo existente
        match validate_sha256(ollama_path, &expected_hash) {
            Ok(_) => {
                println!("cargo:warning=Existing OllamaSetup.exe is valid, skipping download");
                return Ok(());
            }
            Err(e) => {
                println!("cargo:warning=Existing file failed validation: {}", e);
                println!("cargo:warning=Re-downloading...");
                // Continuar para baixar novamente
            }
        }
    }
    
    // Fazer download com retry
    println!("cargo:warning=Downloading Ollama installer...");
    download_with_retry(OLLAMA_SETUP_URL, ollama_path)?;
    
    // Validar hash após download
    validate_sha256(ollama_path, &expected_hash)?;
    
    println!("cargo:warning=Ollama installer downloaded and validated successfully");
    Ok(())
}

fn main() {
    // Criar estrutura de diretórios para bundle
    let bundle_dir = Path::new("bundle");
    let ollama_dir = bundle_dir.join("ollama");
    let embeddings_dir = bundle_dir.join("models/embeddings");
    
    std::fs::create_dir_all(&ollama_dir).ok();
    std::fs::create_dir_all(&embeddings_dir).ok();
    
    #[cfg(target_os = "windows")]
    {
        println!("cargo:warning=Preparing bundle resources for Windows...");
        
        // 1. Baixar e validar instalador do Ollama com SHA256
        let ollama_path = ollama_dir.join("OllamaSetup.exe");
        
        match download_and_validate_ollama_setup(&ollama_path) {
            Ok(_) => {}
            Err(e) => {
                panic!("cargo:error=Failed to download and validate OllamaSetup.exe: {}", e);
            }
        }
        
        // 2. Baixar modelo de embeddings ONNX (apenas se não existir)
        let model_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx";
        let model_path = embeddings_dir.join("all-MiniLM-L6-v2.onnx");
        
        if !model_path.exists() {
            println!("cargo:warning=Downloading ONNX embedding model (this may take a while, ~90MB)...");
            let status = Command::new("powershell")
                .args(&[
                    "-Command",
                    &format!(
                        "if (!(Test-Path '{}')) {{ Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing }}",
                        model_path.display(),
                        model_url,
                        model_path.display()
                    )
                ])
                .status();
            
            if let Ok(exit_status) = status {
                if exit_status.success() {
                    println!("cargo:warning=ONNX model downloaded successfully");
                } else {
                    println!("cargo:warning=Failed to download ONNX model (non-zero exit code)");
                }
            } else {
                println!("cargo:warning=Failed to download ONNX model (command failed)");
            }
        } else {
            println!("cargo:warning=ONNX model already exists, skipping download");
        }
        
        // 3. Baixar tokenizer
        let tokenizer_url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json";
        let tokenizer_path = embeddings_dir.join("tokenizer.json");
        
        if !tokenizer_path.exists() {
            println!("cargo:warning=Downloading tokenizer...");
            let status = Command::new("powershell")
                .args(&[
                    "-Command",
                    &format!(
                        "if (!(Test-Path '{}')) {{ Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing }}",
                        tokenizer_path.display(),
                        tokenizer_url,
                        tokenizer_path.display()
                    )
                ])
                .status();
            
            if let Ok(exit_status) = status {
                if exit_status.success() {
                    println!("cargo:warning=Tokenizer downloaded successfully");
                } else {
                    println!("cargo:warning=Failed to download tokenizer (non-zero exit code)");
                }
            } else {
                println!("cargo:warning=Failed to download tokenizer (command failed)");
            }
        } else {
            println!("cargo:warning=Tokenizer already exists, skipping download");
        }
        
        // 4. Baixar e extrair ONNX Runtime DLL
        let ort_url = "https://github.com/microsoft/onnxruntime/releases/download/v1.20.1/onnxruntime-win-x64-1.20.1.zip";
        let ort_zip_path = embeddings_dir.join("onnxruntime.zip");
        let ort_dll_path = embeddings_dir.join("onnxruntime.dll");
        
        if !ort_dll_path.exists() {
            if !ort_zip_path.exists() {
                println!("cargo:warning=Downloading ONNX Runtime library (~50MB)...");
                let status = Command::new("powershell")
                    .args(&[
                        "-Command",
                        &format!(
                            "if (!(Test-Path '{}')) {{ Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing }}",
                            ort_zip_path.display(),
                            ort_url,
                            ort_zip_path.display()
                        )
                    ])
                    .status();
                
                if let Ok(exit_status) = status {
                    if !exit_status.success() {
                        println!("cargo:warning=Failed to download ONNX Runtime (non-zero exit code)");
                    } else {
                        // Aguardar um pouco para garantir que o download foi concluído
                        std::thread::sleep(std::time::Duration::from_secs(1));
                    }
                } else {
                    println!("cargo:warning=Failed to download ONNX Runtime (command failed)");
                }
            }
            
            // Extrair DLL do zip se o zip existe e está completo
            if ort_zip_path.exists() && !ort_dll_path.exists() {
                // Verificar se o arquivo zip não está vazio e tem tamanho mínimo razoável (~40MB)
                let min_zip_size = 40 * 1024 * 1024; // 40MB
                let zip_valid = if let Ok(metadata) = std::fs::metadata(&ort_zip_path) {
                    let size = metadata.len();
                    if size < 1000 {
                        println!("cargo:warning=ONNX Runtime zip file appears to be incomplete (too small: {} bytes), will be downloaded at runtime", size);
                        false
                    } else if size < min_zip_size {
                        println!("cargo:warning=ONNX Runtime zip file appears to be incomplete ({} bytes, expected at least {} bytes), will be re-downloaded", size, min_zip_size);
                        // Tentar remover ZIP corrompido para forçar re-download
                        let _ = std::fs::remove_file(&ort_zip_path);
                        false
                    } else {
                        true
                    }
                } else {
                    println!("cargo:warning=Failed to get metadata for ONNX Runtime zip file");
                    false
                };
                
                if zip_valid {
                    println!("cargo:warning=Extracting ONNX Runtime DLL from zip...");
                    
                    // Usar zip crate para extrair (mais confiável que PowerShell)
                    match extract_onnx_dll_from_zip(&ort_zip_path, &ort_dll_path) {
                        Ok(_) => {
                            println!("cargo:warning=ONNX Runtime DLL extracted successfully");
                            // Remover zip após extração bem-sucedida
                            let _ = std::fs::remove_file(&ort_zip_path);
                        }
                        Err(e) => {
                            println!("cargo:warning=Failed to extract ONNX Runtime DLL: {}. ZIP may be corrupted, will be downloaded at runtime", e);
                            // Remover ZIP corrompido para forçar re-download em runtime
                            let _ = std::fs::remove_file(&ort_zip_path);
                            // Não falhar o build se a extração falhar - será baixado em runtime se necessário
                        }
                    }
                }
            }
        } else {
            println!("cargo:warning=ONNX Runtime DLL already exists, skipping download");
        }
    }
    
    tauri_build::build()
}

/// Extrai onnxruntime.dll do arquivo zip
fn extract_onnx_dll_from_zip(zip_path: &Path, dll_path: &Path) -> Result<(), String> {
    use zip::ZipArchive;
    
    let file = File::open(zip_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;
    
    // Procurar pela DLL no zip
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to read zip entry {}: {}", i, e))?;
        
        let name = file.name().to_string();
        
        // Procurar por onnxruntime.dll (pode estar em subdiretórios)
        if name.ends_with("onnxruntime.dll") {
            // Criar diretório de destino se não existir
            if let Some(parent) = dll_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create destination directory: {}", e))?;
            }
            
            // Extrair arquivo
            let mut outfile = File::create(dll_path)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
            
            return Ok(());
        }
    }
    
    Err("onnxruntime.dll not found in zip archive".to_string())
}
