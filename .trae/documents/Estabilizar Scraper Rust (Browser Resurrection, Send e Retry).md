## 📋 Análise
**Solicitação**: Corrigir falhas de conexão do browser headless e o erro de compilação `Send`, tornar o scraper resiliente com retry e ampliar resultados de busca.
**Objetivo real**: Garantir estabilidade contínua do backend de scraping, mesmo quando o Chrome headless cai, evitando violações de `Send` e melhorando a cobertura de fontes.

## 🔍 Contexto Identificado
### Arquivos Examinados
- `src-tauri/src/lib.rs:1176–1193` get_or_create_browser: cria/reutiliza `Browser` singleton.
- `src-tauri/src/lib.rs:1247–1277` search_web_metadata: comando Tauri que exige `Future + Send`.
- `src-tauri/src/web_scraper.rs:136–240` search_duckduckgo_metadata: parsing HTML, previously segurava `Html` atravessando `await`.
- `src-tauri/src/web_scraper.rs:469–538` search_and_scrape_with_config: coordena scraping paralelo e coleta resultados.
- `src-tauri/src/web_scraper.rs:605–736` fetch_and_convert_sync: cria aba, navega, extrai HTML e usa Readability.
- `src-tauri/src/lib.rs:1306–1399` force_kill_browser: encerra processos Chrome headless.

### Padrões Detectados
- **Singleton Browser** via `State<BrowserState>` com `Arc<Browser>`.
- **Concorrência controlada** com `Semaphore` e `tokio::spawn_blocking` para operações de Chrome.
- **Fallbacks**: limpeza de URL, filtros anti-ads, Readability + fallback por parágrafos.

### Dependências Mapeadas
```
web_scraper (modificado)
  ├─ headless_chrome::Browser/Tab
  ├─ reqwest (HTTP)
  ├─ scraper (Html, Selector) [não Send]
  └─ readability, html2text
lib (modificado)
  └─ tauri commands (Future + Send obrigatório)
```

## 🎯 Abordagens Viáveis

### Abordagem A: Verificação ativa de Browser + Retry cooperativo
**Conceito**: Validar liveness do `Browser` antes de uso; se cair durante scraping, recriar e repetir uma passada de URLs com limite de tentativas.
```
request → get_or_create_browser (is_alive?) → spawn scraping
  ↳ erro conn fechada → reset + recreate → retry restante (1x)
```
**Vantagens**: ✓ Simples de integrar, ✓ Minimiza impacto, ✓ Boa resiliência
**Desvantagens**: ✗ Retry global pode repetir algumas URLs
**Complexidade**: O(n) | Tempo: 3–4h | Risco: Médio

### Abordagem B: Pool/Auto-heal por task
**Conceito**: Cada task recupera o browser ao falhar e re-executa só sua URL.
```
spawn_blocking(url) → new_tab → erro conn → sinaliza reset → reobtem browser → reprocessa url
```
**Vantagens**: ✓ Isolamento por URL
**Desvantagens**: ✗ Coordenação de estado entre threads, ✗ Maior complexidade
**Complexidade**: O(n) | Tempo: 5–6h | Risco: Médio-Alto

## 🏆 Recomendação
**Abordagem A** porque:
- Alinha com o padrão singleton já existente.
- Menor acoplamento entre tarefas e estado global.
- Implementação direta com menor risco de condições de corrida.

## ⚠️ Riscos & Mitigações
| Risco | Prob | Impacto | Mitigação |
|-------|------|---------|-----------|
| Loop de retry infinito | Baixa | Médio | Limitar a 1–2 tentativas, backoff curto |
| Recriação concorrente do Browser | Média | Médio | Guardar lock no `BrowserState` e checar antes de recriar |
| Demasiadas abas simultâneas | Média | Médio | Reduzir `max_concurrent_tabs` ao detectar falha |
| DDG bloqueios 429 | Média | Baixo | Rotação User-Agent e backoff |

## 📝 Plano de Execução
1. Ajustes `Send` (consolidação)
   - Isolar parsing `scraper::Html` em escopo síncrono que retorna `Vec<SearchResultMetadata>` (já aplicado em parte na função; revisar para todos os caminhos).
   - Garantir que nenhum `Html`/`Selector` vive além do `await` nos métodos `search_*`.
   - Verificar pontos: `src-tauri/src/web_scraper.rs:136–240` e demais que usem `Html`.

2. Browser Resurrection
   - Adicionar `fn is_browser_alive(browser: &Browser) -> bool` em `web_scraper.rs` ou `lib.rs` (ex.: tentar `new_tab()` e descartar; ou `get_tabs()`; se falhar → false).
   - Alterar `get_or_create_browser` (`src-tauri/src/lib.rs:1176–1193`) para: se `Some(browser)` e `!is_alive(browser)` → `reset` e `create_browser()`.
   - Em `force_kill_browser` (`src-tauri/src/lib.rs:1306–1399`): após kill, setar `BrowserState` para `None` via lock (ou orientar UI a chamar `reset_browser` antes do kill), garantindo recriação no próximo uso.

3. Retry resiliente no Scraper
   - Envolver `fetch_and_convert_sync` com camada de retry (máx. 2 tentativas) na orquestração async (`search_and_scrape_with_config` em `src-tauri/src/web_scraper.rs:469–538`).
   - Se erro contiver "underlying connection is closed"/timeout global do browser:
     - Executar `reset_browser` e `get_or_create_browser` para novo `Arc<Browser)`.
     - Reprocessar as URLs que falharam apenas uma vez com o novo browser.
   - Reduzir temporariamente `max_concurrent_tabs` para 3 ao detectar queda, evitando sobrecarga imediata.

4. Paginação no DuckDuckGo
   - Em `search_duckduckgo` (`src-tauri/src/web_scraper.rs:78–133`): suportar paginação via parâmetro `s=<offset>` até atingir `limit` (30–50).
   - Extrair links por página, deduplicar, respeitar `excluded_domains`/ads.

5. Telemetria e Logs
   - Logar eventos de recreação de browser, tentativas de retry e motivos.
   - Contadores: quedas de browser, tentativas, tempo médio por URL.

6. Testes/Validação
   - Caso 1: Forçar `force_kill_browser` durante scraping → validar que a próxima chamada recria o browser e conclui.
   - Caso 2: Simular DDG com >= 40 resultados → paginar e coletar sem violar `Send`.
   - Caso 3: Stress com `max_concurrent_tabs=5` → se cair, reduzir e recuperar.

## Key Changes (Resumo de Implementação)
- `lib.rs:1176–1193`: `get_or_create_browser` verifica liveness; recria se morto.
- `lib.rs:1306–1399`: sincronia com `reset_browser` ao matar processos.
- `web_scraper.rs:469–538`: retry global (1x) e recriação de browser ao detectar conexão fechada; ajuste dinamicamente `Semaphore` na segunda passada.
- `web_scraper.rs:78–133`: paginação DDG com `s=` offset.
- `web_scraper.rs:136–240`: parsing isolado; garantir que `Html` é dropado antes do `await`.

## Entregáveis
- Código robusto em `web_scraper.rs` e `lib.rs` com:
  - Correção total do `Send`.
  - Resurreição automática do browser.
  - Retry controlado por erro de conexão.
  - Paginação para 30–50 resultados.
- Logs melhorados e validação manual automática.

## ❓ Aguardando Aprovação
- [ ] Posso prosseguir com as mudanças propostas?
- [ ] Preferências de `max_concurrent_tabs` e `limit` padrão (sugestão: 5 e 40)?
- [ ] Deseja manter `force_kill_browser` como utilitário avançado, com alerta na UI para reiniciar o scraper? 