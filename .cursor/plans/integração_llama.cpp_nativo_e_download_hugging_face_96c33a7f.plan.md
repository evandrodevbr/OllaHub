---
name: Integração llama.cpp nativo e download Hugging Face
overview: Implementar download direto de modelos GGUF do Hugging Face, integração com llama.cpp nativo via Rust, listagem de modelos locais e UI experimental para alternar entre Ollama e llama.cpp nativo.
todos:
  - id: hf-download-module
    content: Criar módulo huggingface_download.rs com download_gguf_model() e streaming de progresso
    status: pending
  - id: hf-list-models
    content: Implementar list_huggingface_gguf_models() com cache de metadados (TTL 1h)
    status: pending
  - id: hf-validation
    content: Adicionar validação SHA256 obrigatória quando disponível, retry logic com resume e rate limiting (429)
    status: pending
  - id: hf-rate-limiting
    content: Implementar tratamento de rate limiting com Retry-After header e backoff exponencial
    status: pending
  - id: llama-cpp-deps
    content: Adicionar llama_cpp 0.4 no Cargo.toml com features condicionais por OS + feature flag dev-no-llama
    status: pending
  - id: llama-deps-parsing
    content: Adicionar dependências gguf 0.1 e lru 0.12 para parsing de metadados e cache LRU
    status: pending
  - id: llama-state
    content: Criar LlamaCppState com LRU cache (limite 3 modelos) para prevenir memory leaks
    status: pending
  - id: models-dir-structure
    content: Implementar get_models_dir() com estrutura hierárquica cross-platform (repo_owner/repo_name/quantization)
    status: pending
  - id: llama-chat-stream
    content: Implementar chat_stream_native() com streaming de tokens via llama-cpp-rs
    status: pending
  - id: llama-params
    content: Adicionar configuração de parâmetros (n_gpu_layers, n_ctx, threads) no settings store
    status: pending
  - id: local-scan
    content: Implementar list_local_gguf_models() com scan recursivo e parsing de metadados via crate gguf
    status: pending
  - id: local-cache
    content: Adicionar cache de metadados de modelos locais para evitar re-scan frequente
    status: pending
  - id: quantization-regex
    content: "Implementar regex corrigido para extração de quantização: [._-](Q\\d+_?[KM]?_?[MS]?|[FI]P?\\d+)[._-]"
    status: pending
  - id: vram-detection
    content: Adicionar detecção de VRAM disponível via sysinfo antes de carregar modelos grandes
    status: pending
  - id: concurrent-downloads
    content: Implementar semáforo para limitar downloads paralelos a 2 simultâneos
    status: pending
  - id: ui-runtime-toggle
    content: Criar toggle de runtime (Ollama/llama.cpp) nas configurações com indicador visual
    status: pending
  - id: ui-hf-selector
    content: Implementar seletor de modelos Hugging Face com busca e filtros de quantização
    status: pending
  - id: ui-integration
    content: Integrar runtime selection no use-chat.ts para alternar entre chat_stream e chat_stream_native
    status: pending
isProject: false
---

# Plano de Implementação: Integração llama.cpp e Download Hugging Face

## Contexto Arquitetural

O projeto atualmente usa Ollama como runtime de modelos via HTTP (`http://localhost:11434`). O chat streaming é feito através de `chat_stream` que chama `OllamaClient`. Modelos são baixados via `pull_model` que usa a API do Ollama. Existe suporte básico para instalar modelos GGUF locais via `install_gguf_model`.

**Decisão arquitetural:** Implementar runtime dual (Ollama + llama.cpp nativo) com abstração no backend Rust para permitir alternância transparente no frontend.

## Estrutura de Armazenamento

- **Modelos Ollama:** `~/.ollama/models` (Linux/Mac) ou `%USERPROFILE%\.ollama\models` (Windows)
- **Modelos llama.cpp nativo:** Estrutura hierárquica em `{app_data_dir}/models/gguf/{repo_owner}/{repo_name}/{quantization}/model.gguf`
  - Exemplo: `~/.local/share/OllaHub/models/gguf/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/Q4_K_M/mistral-7b-instruct-v0.2.Q4_K_M.gguf`
- **Cache de metadados:** `{app_data_dir}/cache/huggingface_models.json`
- **Cross-platform paths:**
  - Windows: `%APPDATA%\Roaming\com.ollahub.app\models\gguf`
  - Linux: `~/.local/share/com.ollahub.app/models/gguf`
  - macOS: `~/Library/Application Support/com.ollahub.app/models/gguf`

## Fase 1: Backend - Download Direto Hugging Face

### 1.1 Módulo de Download (`src-tauri/src/huggingface_download.rs`)

**Contrato técnico:**

```rust
pub struct HuggingFaceModel {
    pub id: String,
    pub filename: String,
    pub size: u64,
    pub quantization: String, // Q4_K_M, Q5_K_S, etc.
    pub sha256: Option<String>,
}

pub async fn download_gguf_model(
    app_handle: AppHandle,
    model_id: String,
    filename: String,
    quantization_filter: Option<String>,
    window: Option<Window>,
) -> Result<PathBuf, String>
```

**Implementação:**

- Usar `reqwest` com streaming (já presente no `Cargo.toml`)
- API Hugging Face: `https://huggingface.co/api/models/{model_id}/tree/main`
- Download direto: `https://huggingface.co/{model_id}/resolve/main/{filename}`
- Emitir eventos `download-progress` (reutilizar estrutura existente de `pull_model_impl_window`)
- **Validação SHA256 obrigatória** quando disponível no Hugging Face (usar `sha2` já presente)
- Retry logic com backoff exponencial (3 tentativas)
- **Rate limiting:** Tratar 429 Too Many Requests com `Retry-After` header
- **Resume de download:** Verificar arquivo parcial e continuar de onde parou

**Arquivos:**

- Criar `src-tauri/src/huggingface_download.rs`
- Adicionar comando `download_gguf_model` em `lib.rs`

### 1.2 Busca de Modelos (`list_huggingface_gguf_models`)

**Contrato:**

```rust
pub async fn list_huggingface_gguf_models(
    query: Option<String>,
    quantization: Option<String>,
) -> Result<Vec<HuggingFaceModel>, String>
```

**Implementação:**

- Usar API pública do Hugging Face: `https://huggingface.co/api/models?search={query}&filter=gguf`
- Filtrar por arquivos `.gguf` no tree
- Cache local com TTL de 1 hora (evitar requests repetidos)
- **Extrair quantização do filename** (regex corrigido: `[._-](Q\d+_?[KM]?_?[MS]?|[FI]P?\d+)[._-]`)
  - Suporta: `Q4_K_M`, `Q5_0`, `F16`, `FP32`, etc.

**Arquivos:**

- Adicionar função em `huggingface_download.rs`
- Comando `list_huggingface_gguf_models` em `lib.rs`

### 1.3 Cache de Metadados

**Estrutura:**

- Arquivo JSON em `{app_data_dir}/cache/huggingface_models.json`
- Estrutura: `{ "models": [...], "last_updated": "ISO8601" }`
- Atualizar cache apenas se `last_updated` > 1 hora

## Fase 2: Backend - Integração llama.cpp

### 2.1 Dependências (`Cargo.toml`)

**Correção crítica:** Usar `llama_cpp` (edgenai) versão 0.4 em vez de `llama-cpp-rs` 0.2

```toml
[features]
default = ["llama-cpp"]
llama-cpp = ["dep:llama_cpp"]
dev-no-llama = []  # Skip llama.cpp em dev builds (builds 30-45 min podem ser lentos)

[dependencies]
llama_cpp = { version = "0.4", optional = true }

# Features condicionais por OS (Metal/CUDA são mutuamente exclusivos)
[target.'cfg(target_os = "macos")'.dependencies]
llama_cpp = { version = "0.4", features = ["metal"], optional = true }

[target.'cfg(all(unix, not(target_os = "macos")))'.dependencies]
llama_cpp = { version = "0.4", features = ["cuda"], optional = true }

[target.'cfg(target_os = "windows")'.dependencies]
llama_cpp = { version = "0.4", features = ["cuda"], optional = true }

# Dependência para parsing de metadados GGUF
gguf = "0.1"
lru = "0.12"  # Para LRU cache de modelos carregados
```

**Build considerations:**

- `llama_cpp` compila `llama.cpp` via build script
- **Tempo de build:** 30-45 min em máquinas mais fracas (não 10-15 min)
- Feature flag `dev-no-llama` permite builds rápidos em desenvolvimento
- Requer CMake/Ninja instalados (documentar no README)

### 2.2 Gerenciamento de Estado (`AppState`)

**Estrutura (com LRU cache para prevenir memory leaks):**

```rust
use lru::LruCache;

pub struct LlamaCppState {
    models: Arc<Mutex<LruCache<String, LlamaModel>>>,  // Limite de 3 modelos
    default_params: LlamaParams,
}

impl LlamaCppState {
    pub fn new() -> Self {
        Self {
            models: Arc::new(Mutex::new(LruCache::new(3.try_into().unwrap()))),
            default_params: LlamaParams::default(),
        }
    }
}

pub struct LlamaModel {
    path: PathBuf,
    context: Option<LlamaContext>, // Lazy loading
    metadata: ModelMetadata,
}
```

**Arquivos:**

- Criar `src-tauri/src/llama_cpp_state.rs`
- Registrar state em `main()` via `.manage()`

### 2.3 Comando de Chat Streaming (`chat_stream_native`)

**Contrato:**

```rust
#[command]
async fn chat_stream_native(
    window: Window,
    app_handle: AppHandle,
    session_id: Option<String>,
    messages: Vec<Message>,
    model_path: String,
    system_prompt: Option<String>,
    params: Option<LlamaParams>,
) -> Result<String, String>
```

**Implementação:**

- Carregar modelo lazy (verificar se já está em `AppState`)
- Usar `llama-cpp-rs` para streaming de tokens
- Emitir eventos `chat-token` (mesmo formato que `chat_stream` atual)
- Reutilizar lógica de salvamento em DB existente
- Parâmetros: `n_gpu_layers`, `n_ctx`, `threads` (configuráveis via settings)

**Arquivos:**

- Criar `src-tauri/src/llama_cpp_chat.rs`
- Comando em `lib.rs`
- Integrar com `ProcessingState` existente

### 2.4 Configuração de Parâmetros

**Settings store (frontend):**

- Adicionar `llamaCppParams` em `settings-store.ts`:
  ```typescript
  llamaCppParams: {
    nGpuLayers: number;
    nCtx: number;
    threads: number;
  }
  ```


**Backend:**

- Struct `LlamaParams` serializável
- Valores padrão: `n_gpu_layers: 0` (CPU), `n_ctx: 4096`, `threads: auto`

## Fase 3: Backend - Listagem Local

### 3.1 Scan de Arquivos GGUF (`list_local_gguf_models`)

**Contrato:**

```rust
#[command]
fn list_local_gguf_models(app_handle: AppHandle) -> Result<Vec<LocalGgufModel>, String>
```

**Implementação:**

- Scan recursivo em `{app_data_dir}/models/gguf/` (estrutura hierárquica)
- Usar `walkdir` (já presente)
- **Parsing de metadados GGUF usando crate `gguf`:**
  ```rust
  use gguf::GGUFFile;
  
  pub fn extract_gguf_metadata(path: &Path) -> Result<GgufMetadata, String> {
      let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
      let gguf = GGUFFile::parse(file).map_err(|e| e.to_string())?;
      
      Ok(GgufMetadata {
          architecture: gguf.header.metadata.get("general.architecture"),
          quantization: gguf.header.metadata.get("general.quantization_version"),
          parameter_count: gguf.header.metadata.get("general.parameter_count"),
      })
  }
  ```

- Extrair metadados:
  - Tamanho do arquivo
  - Quantização do filename (regex corrigido)
  - **Arquitetura via parsing de header GGUF** (não inferir do filename)
- Cache de metadados para evitar re-scan frequente

**Estrutura de retorno:**

```rust
pub struct LocalGgufModel {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub quantization: Option<String>,
    pub architecture: Option<String>,
}
```

**Arquivos:**

- Função em `lib.rs` ou módulo separado `src-tauri/src/local_models.rs`

### 3.2 Detecção Automática

- Ao baixar modelo do Hugging Face, adicionar à lista local automaticamente
- Verificar integridade (tamanho, extensão) antes de listar

## Fase 4: Frontend - UI Experimental

### 4.1 Settings Store - Runtime Selection

**Modificações em `store/settings-store.ts`:**

```typescript
runtime: 'ollama' | 'llama-cpp';
llamaCppParams: { nGpuLayers: number; nCtx: number; threads: number };
setRuntime: (runtime: 'ollama' | 'llama-cpp') => void;
setLlamaCppParams: (params: Partial<LlamaCppParams>) => void;
```

### 4.2 Toggle de Runtime (`components/settings/`)

**Componente:**

- Toggle switch "Usar llama.cpp nativo"
- **Indicador visual melhorado** com ícone + tooltip:
  ```tsx
  <Badge variant={runtime === 'ollama' ? 'default' : 'secondary'}>
    {runtime === 'ollama' ? (
      <>🦙 Ollama</>
    ) : (
      <>⚡ llama.cpp (nativo)</>
    )}
  </Badge>
  <Tooltip>
    <TooltipContent>
      {runtime === 'ollama' 
        ? 'Usando Ollama como runtime (requer servidor externo)'
        : 'Usando llama.cpp nativo (mais rápido, sem servidor externo)'}
    </TooltipContent>
  </Tooltip>
  ```

- Desabilitar se nenhum modelo GGUF local disponível

**Arquivos:**

- Criar ou modificar `components/settings/runtime-settings-panel.tsx`

### 4.3 Seletor de Modelos Hugging Face

**Componente:**

- Input de busca
- Lista de modelos com filtros de quantização (Q4, Q5, Q8)
- Botão de download com progresso
- Integrar com `DownloadContext` existente

**Arquivos:**

- Criar `components/chat/huggingface-model-selector.tsx`
- Integrar em `components/chat/model-selector.tsx`

### 4.4 Página de Comparação

**Componente experimental:**

- Side-by-side: Ollama vs llama.cpp
- Mesmo prompt, comparar latência e qualidade
- Métricas: tokens/s, tempo total, uso de VRAM

**Arquivos:**

- Criar `app/benchmark/page.tsx` (opcional, pode ser feature flag)

### 4.5 Integração no Chat

**Modificações em `hooks/use-chat.ts`:**

- Verificar `runtime` do settings store
- Chamar `chat_stream` ou `chat_stream_native` conforme runtime
- Manter compatibilidade com código existente

**Arquivos:**

- Modificar `hooks/use-chat.ts`
- Atualizar `app/chat/page.tsx` se necessário

## Decisões Técnicas

### Abordagem Ingênua vs Sênior

| Aspecto | Ingênua | Sênior (Escolhida) |

|---------|---------|-------------------|

| Download | Polling de status | Streaming com eventos Tauri |

| Estado de Modelos | Sem cache | **LRU cache com limite de 3 modelos** |

| Integração Chat | Duplicar código | Abstração via enum Runtime |

| Validação | Apenas tamanho | **SHA256 obrigatório quando disponível** + tamanho + **parsing header GGUF** |

| Build llama.cpp | Sempre compilar | **Feature flags condicionais por OS + dev-no-llama** |

| Rate Limiting | Sem tratamento | **Backoff + Retry-After header** |

| Parsing Metadata | Inferir do filename | **Crate `gguf` para parsing correto** |

### Trade-offs

- **Performance:** llama.cpp nativo pode ser 10-30% mais rápido que Ollama (sem overhead HTTP)
- **Manutenção:** Duplicar lógica de chat aumenta complexidade; abstração Runtime reduz duplicação
- **VRAM:** llama.cpp permite controle fino de `n_gpu_layers`; Ollama gerencia automaticamente

### Modos de Falha

1. **Gargalo VRAM:** Modelos grandes podem não carregar; implementar fallback para CPU

   - **Solução:** Usar `sysinfo` crate para detectar VRAM disponível antes de carregar

2. **Download interrompido:** Retry logic com resume (verificar se arquivo parcial existe)
3. **Build llama.cpp falha:** Feature flag `dev-no-llama` para desabilitar em desenvolvimento
4. **Latência de rede:** Cache agressivo de metadados do Hugging Face
5. **Rate limiting Hugging Face:** Tratar 429 com `Retry-After` header
6. **Concurrent downloads:** Limitar a 2 downloads paralelos com semáforo
7. **Memory leaks:** LRU cache com limite de 3 modelos previne crescimento indefinido

### Antipadrões a Evitar

- Não fazer polling de status de download (usar eventos)
- Não carregar todos os modelos na inicialização (lazy loading)
- Não duplicar lógica de streaming (abstrair Runtime)
- Não hardcodar paths (usar `app_data_dir`)

## Ordem de Implementação (Reordenada)

1. **Estrutura de diretórios e AppState** (fundação)

   - Criar `get_models_dir()` com paths cross-platform
   - Implementar `LlamaCppState` com LRU cache

2. **Listagem local de GGUF** (valida estrutura)

   - `list_local_gguf_models()` com parsing via crate `gguf`
   - Cache de metadados

3. **Download Hugging Face** (adiciona modelos)

   - `download_gguf_model()` com SHA256 obrigatório
   - Rate limiting e retry logic

4. **Parsing de metadados GGUF** (enriquece listagem)

   - Integrar crate `gguf` para extrair arquitetura

5. **Integração llama.cpp** (runtime)

   - `chat_stream_native()` com lazy loading
   - Detecção de VRAM via `sysinfo`

6. **UI experimental** (camada final)

   - Toggle de runtime com indicador melhorado
   - Integração no `use-chat.ts`

## Validação

**Comandos de teste (Windows PowerShell):**

```powershell
# Verificar modelos baixados
Get-ChildItem "$env:APPDATA\OllaHub\models\gguf" -Recurse -Filter "*.gguf"

# Testar download (via Tauri command)
# Usar DevTools do app para invocar: download_gguf_model
```

**Comandos de teste (Linux Bash):**

```bash
# Verificar modelos baixados
find ~/.local/share/com.ollahub.app/models/gguf -name "*.gguf"

# Testar build llama.cpp (com feature flag)
cargo build --features llama-cpp  # Build completo
cargo build --no-default-features --features dev-no-llama  # Build rápido (dev)

# Verificar VRAM disponível (se NVIDIA)
nvidia-smi --query-gpu=memory.free --format=csv
```

## Correções Críticas Aplicadas

### 1. Crate llama.cpp

- ✅ Alterado de `llama-cpp-rs = "0.2"` para `llama_cpp = "0.4"` (edgenai, mais estável)

### 2. Feature Flags

- ✅ Features condicionais por OS (Metal/CUDA mutuamente exclusivos)
- ✅ Feature flag `dev-no-llama` para builds rápidos em desenvolvimento

### 3. Parsing de Metadados

- ✅ Adicionada dependência `gguf = "0.1"` para parsing correto de headers GGUF
- ✅ Removida inferência de arquitetura do filename

### 4. Memory Management

- ✅ Substituído `HashMap` por `LruCache` com limite de 3 modelos

### 5. Validação SHA256

- ✅ Tornada obrigatória quando disponível no Hugging Face

### 6. Rate Limiting

- ✅ Implementado tratamento de 429 com `Retry-After` header

### 7. Estrutura de Diretórios

- ✅ Hierárquica: `{repo_owner}/{repo_name}/{quantization}/model.gguf`

### 8. Regex de Quantização

- ✅ Corrigido: `[._-](Q\d+_?[KM]?_?[MS]?|[FI]P?\d+)[._-]`

### 9. Cross-Platform Paths

- ✅ Validação de `app_data_dir` para Windows/Linux/macOS

### 10. Indicador de Runtime

- ✅ Melhorado com ícone + tooltip explicativo

### 11. Ordem de Implementação

- ✅ Reordenada considerando dependências técnicas

### 12. Riscos Adicionais

- ✅ VRAM detection via `sysinfo`
- ✅ Limite de downloads paralelos (semáforo)
- ✅ Documentação de requisitos (CMake/Ninja)