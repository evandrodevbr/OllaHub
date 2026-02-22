use std::path::Path;
use std::fs;
use walkdir::WalkDir;
use serde::{Deserialize, Serialize};
use regex::Regex;
use tauri::AppHandle;
use crate::models_dir;

/// Modelo GGUF local encontrado no sistema de arquivos
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalGgufModel {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub quantization: Option<String>,
    pub architecture: Option<String>,
    pub parameter_count: Option<u64>,
}

/// Extrai quantização do filename usando regex corrigido
fn extract_quantization(filename: &str) -> Option<String> {
    let re = Regex::new(r"[._-](Q\d+_?[KM]?_?[MS]?|[FI]P?\d+)[._-]").ok()?;
    
    re.captures(filename)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

/// Extrai metadados de um arquivo GGUF usando a crate gguf
/// Retorna None se o parsing falhar (não é crítico, temos fallback do filename)
fn extract_gguf_metadata(path: &Path) -> Option<GgufMetadata> {
    use gguf::GGUFFile;
    use std::io::Read;
    
    // Ler apenas os primeiros bytes para parsing (mais eficiente)
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = vec![0u8; 1024 * 1024]; // Ler 1MB (suficiente para header)
    let bytes_read = file.read(&mut buffer).ok()?;
    buffer.truncate(bytes_read);
    
    // Tentar parsear
    let _gguf_file = match GGUFFile::read(&buffer) {
        Ok(Some(file)) => file,
        Ok(None) | Err(_) => return None, // Dados incompletos ou erro
    };
    
    // A API do gguf 0.1 pode ser diferente, vamos tentar acessar metadados
    // Se a estrutura for diferente, retornamos None e usamos fallback
    // Por enquanto, retornamos None para evitar erros de compilação
    // TODO: Implementar acesso correto aos metadados quando a estrutura for conhecida
    None
    
    // Placeholder para quando soubermos a estrutura exata:
    // Some(GgufMetadata {
    //     architecture: None,
    //     quantization: None,
    //     parameter_count: None,
    // })
}

#[derive(Debug)]
struct GgufMetadata {
    architecture: Option<String>,
    quantization: Option<String>,
    parameter_count: Option<u64>,
}

/// Lista todos os modelos GGUF locais
pub fn list_local_gguf_models(app_handle: &AppHandle) -> Result<Vec<LocalGgufModel>, String> {
    let base_dir = models_dir::get_models_base_dir(app_handle)?;
    let mut models = Vec::new();
    
    // Scan recursivo de arquivos .gguf
    for entry in WalkDir::new(&base_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        
        // Verificar se é arquivo GGUF
        if let Some(ext) = path.extension() {
            if ext.to_string_lossy().to_lowercase() != "gguf" {
                continue;
            }
        } else {
            // Arquivo sem extensão - verificar pelo tamanho (modelos GGUF são grandes)
            let metadata = fs::metadata(path)
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            if metadata.len() < 50 * 1024 * 1024 {
                // Menos de 50MB, provavelmente não é um modelo GGUF
                continue;
            }
        }
        
        // Obter tamanho do arquivo
        let size = fs::metadata(path)
            .map_err(|e| format!("Failed to read file size: {}", e))?
            .len();
        
        // Extrair nome do arquivo
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        // Tentar extrair quantização do filename
        let quantization_from_filename = extract_quantization(&filename);
        
        // Tentar extrair metadados do arquivo GGUF (opcional, não crítico)
        let (architecture, quantization_from_file, parameter_count) = 
            match extract_gguf_metadata(path) {
                Some(meta) => (
                    meta.architecture,
                    meta.quantization,
                    meta.parameter_count,
                ),
                None => {
                    // Parsing falhou ou não disponível - usar apenas filename
                    (None, None, None)
                }
            };
        
        // Preferir quantização do arquivo, fallback para filename
        let quantization = quantization_from_file.or(quantization_from_filename);
        
        // Construir nome amigável (sem extensão)
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&filename)
            .to_string();
        
        models.push(LocalGgufModel {
            path: path.to_string_lossy().to_string(),
            name,
            size,
            quantization,
            architecture,
            parameter_count,
        });
    }
    
    // Ordenar por nome
    models.sort_by(|a, b| a.name.cmp(&b.name));
    
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_quantization() {
        assert_eq!(
            extract_quantization("mistral-7b-instruct-v0.2.Q4_K_M.gguf"),
            Some("Q4_K_M".to_string())
        );
        assert_eq!(
            extract_quantization("model.Q5_0.gguf"),
            Some("Q5_0".to_string())
        );
        assert_eq!(
            extract_quantization("model-F16.gguf"),
            Some("F16".to_string())
        );
        assert_eq!(
            extract_quantization("model_FP32.gguf"),
            Some("FP32".to_string())
        );
    }
}
