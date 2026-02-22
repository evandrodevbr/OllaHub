use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Obtém o diretório base para modelos GGUF
/// Estrutura: {app_data_dir}/models/gguf/
pub fn get_models_base_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let models_dir = app_data_dir.join("models").join("gguf");
    
    // Criar diretório se não existir
    std::fs::create_dir_all(&models_dir)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;
    
    Ok(models_dir)
}

/// Obtém o diretório para um modelo específico
/// Estrutura hierárquica: {base_dir}/{repo_owner}/{repo_name}/{quantization}/
pub fn get_model_dir(
    app_handle: &AppHandle,
    repo_owner: &str,
    repo_name: &str,
    quantization: &str,
) -> Result<PathBuf, String> {
    let base_dir = get_models_base_dir(app_handle)?;
    let model_dir = base_dir
        .join(sanitize_path_component(repo_owner))
        .join(sanitize_path_component(repo_name))
        .join(sanitize_path_component(quantization));
    
    // Criar diretório se não existir
    std::fs::create_dir_all(&model_dir)
        .map_err(|e| format!("Failed to create model dir: {}", e))?;
    
    Ok(model_dir)
}

/// Obtém o diretório de cache
pub fn get_cache_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let cache_dir = app_data_dir.join("cache");
    
    // Criar diretório se não existir
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache dir: {}", e))?;
    
    Ok(cache_dir)
}

/// Sanitiza um componente de path para evitar caracteres inválidos
fn sanitize_path_component(component: &str) -> String {
    component
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_path_component() {
        assert_eq!(sanitize_path_component("test/model"), "test_model");
        assert_eq!(sanitize_path_component("TheBloke/Mistral-7B"), "TheBloke_Mistral-7B");
        assert_eq!(sanitize_path_component("Q4_K_M"), "Q4_K_M");
    }
}
