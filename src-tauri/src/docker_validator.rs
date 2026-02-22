use serde::{Serialize, Deserialize};
use std::process::Command;
use anyhow::Result;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ValidationResult {
    pub status: ValidationStatus,
    pub tests: Vec<ValidationTest>,
    pub docker_version: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ValidationTest {
    pub name: String,
    pub status: TestStatus,
    pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum ValidationStatus {
    Pass,
    Fail,
    Partial,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum TestStatus {
    Pass,
    Fail,
    Warn,
}

/// Valida instalação do Docker executando testes
pub fn validate_docker_installation() -> Result<ValidationResult> {
    let mut tests = Vec::new();
    let mut docker_version: Option<String> = None;
    
    // Teste 1: Verificar versão
    match test_docker_version() {
        Ok(Some(version)) => {
            docker_version = Some(version.clone());
            tests.push(ValidationTest {
                name: "Versão do Docker".to_string(),
                status: TestStatus::Pass,
                message: Some(format!("Docker {} instalado", version)),
            });
        }
        Ok(None) => {
            tests.push(ValidationTest {
                name: "Versão do Docker".to_string(),
                status: TestStatus::Fail,
                message: Some("Docker não encontrado no PATH".to_string()),
            });
        }
        Err(e) => {
            tests.push(ValidationTest {
                name: "Versão do Docker".to_string(),
                status: TestStatus::Fail,
                message: Some(format!("Erro ao verificar versão: {}", e)),
            });
        }
    }
    
    // Teste 2: Verificar serviço
    match test_docker_service() {
        Ok(true) => {
            tests.push(ValidationTest {
                name: "Serviço Docker".to_string(),
                status: TestStatus::Pass,
                message: Some("Serviço Docker está rodando".to_string()),
            });
        }
        Ok(false) => {
            tests.push(ValidationTest {
                name: "Serviço Docker".to_string(),
                status: TestStatus::Fail,
                message: Some("Serviço Docker não está rodando".to_string()),
            });
        }
        Err(e) => {
            tests.push(ValidationTest {
                name: "Serviço Docker".to_string(),
                status: TestStatus::Fail,
                message: Some(format!("Erro ao verificar serviço: {}", e)),
            });
        }
    }
    
    // Teste 3: Executar container de teste
    match test_docker_container() {
        Ok(true) => {
            tests.push(ValidationTest {
                name: "Container de Teste".to_string(),
                status: TestStatus::Pass,
                message: Some("Container hello-world executado com sucesso".to_string()),
            });
        }
        Ok(false) => {
            tests.push(ValidationTest {
                name: "Container de Teste".to_string(),
                status: TestStatus::Fail,
                message: Some("Falha ao executar container de teste".to_string()),
            });
        }
        Err(e) => {
            tests.push(ValidationTest {
                name: "Container de Teste".to_string(),
                status: TestStatus::Fail,
                message: Some(format!("Erro ao testar container: {}", e)),
            });
        }
    }
    
    // Teste 4: Verificar permissões
    match test_docker_permissions() {
        Ok(true) => {
            tests.push(ValidationTest {
                name: "Permissões Docker".to_string(),
                status: TestStatus::Pass,
                message: Some("Usuário pode executar comandos Docker".to_string()),
            });
        }
        Ok(false) => {
            tests.push(ValidationTest {
                name: "Permissões Docker".to_string(),
                status: TestStatus::Warn,
                message: Some("Pode ser necessário adicionar usuário ao grupo docker ou usar sudo".to_string()),
            });
        }
        Err(e) => {
            tests.push(ValidationTest {
                name: "Permissões Docker".to_string(),
                status: TestStatus::Warn,
                message: Some(format!("Erro ao verificar permissões: {}", e)),
            });
        }
    }
    
    // Determinar status geral
    let pass_count = tests.iter().filter(|t| matches!(t.status, TestStatus::Pass)).count();
    let fail_count = tests.iter().filter(|t| matches!(t.status, TestStatus::Fail)).count();
    
    let status = if fail_count == 0 {
        ValidationStatus::Pass
    } else if pass_count > 0 {
        ValidationStatus::Partial
    } else {
        ValidationStatus::Fail
    };
    
    Ok(ValidationResult {
        status,
        tests,
        docker_version,
    })
}

/// Testa se Docker está instalado e retorna versão
fn test_docker_version() -> Result<Option<String>> {
    let output = Command::new("docker")
        .arg("--version")
        .output();
    
    match output {
        Ok(o) if o.status.success() => {
            let version = String::from_utf8_lossy(&o.stdout);
            let version = version.trim();
            // Extrair apenas número da versão (ex: "Docker version 24.0.5" -> "24.0.5")
            let version = version
                .split_whitespace()
                .nth(2)
                .map(|s| s.trim_end_matches(',').to_string())
                .unwrap_or_else(|| version.to_string());
            Ok(Some(version))
        }
        Ok(_) => Ok(None),
        Err(_) => Ok(None),
    }
}

/// Testa se serviço Docker está rodando
fn test_docker_service() -> Result<bool> {
    // Tentar docker info (mais portável que systemctl)
    let output = Command::new("docker")
        .arg("info")
        .output();
    
    match output {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

/// Testa executando container hello-world
fn test_docker_container() -> Result<bool> {
    // Primeiro, remover container antigo se existir
    let _ = Command::new("docker")
        .args(&["rm", "-f", "docker-test-hello-world"])
        .output();
    
    // Executar container de teste
    let output = Command::new("docker")
        .args(&["run", "--rm", "--name", "docker-test-hello-world", "hello-world"])
        .output();
    
    match output {
        Ok(o) => {
            if o.status.success() {
                Ok(true)
            } else {
                // Verificar se erro é por falta de imagem (normal na primeira vez)
                let stderr = String::from_utf8_lossy(&o.stderr);
                if stderr.contains("Unable to find image") {
                    // Tentar pull e executar novamente
                    let pull_output = Command::new("docker")
                        .args(&["pull", "hello-world"])
                        .output();
                    
                    if let Ok(pull_o) = pull_output {
                        if pull_o.status.success() {
                            // Tentar executar novamente
                            let run_output = Command::new("docker")
                                .args(&["run", "--rm", "--name", "docker-test-hello-world-2", "hello-world"])
                                .output();
                            
                            if let Ok(run_o) = run_output {
                                return Ok(run_o.status.success());
                            }
                        }
                    }
                }
                Ok(false)
            }
        }
        Err(_) => Ok(false),
    }
}

/// Testa se usuário tem permissões para executar docker ps
fn test_docker_permissions() -> Result<bool> {
    let output = Command::new("docker")
        .arg("ps")
        .output();
    
    match output {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}
