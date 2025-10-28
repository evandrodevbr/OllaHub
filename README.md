# OllaHub

Plataforma desktop multiplataforma para integração de modelos IA locais com servidores Model Context Protocol

---

## Visão Geral

OllaHub é uma solução desktop nativa desenvolvida com Rust e Tauri que unifica o gerenciamento de Large Language Models locais através do Ollama com a extensibilidade do Model Context Protocol. A plataforma prioriza privacidade total, performance superior e experiência nativa, oferecendo uma alternativa local-first às soluções baseadas em nuvem.

O projeto segue uma metodologia de desenvolvimento progressivo, iniciando com um MVP web para validação de conceitos antes da implementação completa da aplicação desktop.

### Principais Características

**Inferência 100% Local**
Todo processamento de IA ocorre localmente através do Ollama, garantindo privacidade absoluta dos dados sem dependência de serviços externos.

**Integração Nativa com MCP**
Suporte completo ao Model Context Protocol permitindo extensão de capacidades através de servidores especializados para acesso a sistemas de arquivos, APIs externas, bancos de dados e ferramentas de desenvolvimento.

**Performance Excepcional**
Backend em Rust oferece velocidade de execução até 3x superior comparado a alternativas baseadas em Node.js ou Python, com consumo de memória reduzido em até 50%.

**Bundle Compacto**
Distribuição entre 3-5 MB comparado aos 85 MB típicos de aplicações Electron, facilitando download e instalação.

**Experiência Desktop Nativa**
Interface responsiva construída com Tauri 2.0 e SvelteKit, priorizando Linux com suporte planejado para Windows.

**Streaming em Tempo Real**
Sistema de streaming bidirecional para renderização progressiva de respostas longas, mantendo interface fluida durante processamento.

---

## Por Que OllaHub?

### Problemas Resolvidos

**Fragmentação de Ferramentas**
Elimina necessidade de múltiplas aplicações para gerenciar diferentes modelos IA e integrações contextuais.

**Dependência de Cloud**
Remove necessidade de conexão com serviços externos, permitindo uso completo offline após instalação inicial.

**Complexidade de Integração**
Abstrai complexidade do protocolo MCP oferecendo interface intuitiva para conexão com servidores especializados.

**Privacidade de Dados**
Garante que dados sensíveis nunca deixem a máquina do usuário durante interações com modelos.

### Casos de Uso

**Desenvolvimento Assistido por IA**
Integração com sistema de arquivos via MCP permite análise contextual de código-fonte, sugestões de refatoração e documentação automática.

**Análise Documental Local**
Implementação de RAG com documentos locais para pesquisa semântica, síntese de informações e geração de resumos.

**Automação de Workflows**
Criação de scripts e automações com acesso controlado a APIs externas através de servidores MCP especializados.

**Pesquisa e Agregação**
Combinação de múltiplas fontes de dados como repositórios GitHub, bancos de dados locais e sistemas de arquivos para análises complexas.

---

## Arquitetura

### Stack Tecnológico

#### Backend

- Rust: Linguagem core garantindo segurança de memória e performance
- Tauri 2.0: Framework desktop multiplataforma
- Axum: Framework web assíncrono para servidor REST interno
- Tokio: Runtime assíncrono de alta performance
- Reqwest: Cliente HTTP com suporte a streaming
- SQLx/Sled: Persistência de dados com queries type-safe
- Serde: Serialização JSON type-safe

#### Frontend

- SvelteKit 2.x: Meta-framework reativo com roteamento integrado
- TypeScript 5.x: Type-safety no frontend
- TailwindCSS: Framework CSS utility-first
- shadcn-svelte: Componentes UI acessíveis e customizáveis
- Marked: Renderização de Markdown para respostas formatadas

#### Infraestrutura

- Ollama: Gerenciamento de modelos LLM locais
- Model Context Protocol: Protocolo de extensibilidade via servidores especializados
- GitHub Actions: CI/CD para builds multiplataforma

### Componentes Principais

**Módulo de Gerenciamento Ollama**
Responsável por toda comunicação com a API REST do Ollama, incluindo listagem de modelos, inicialização de conversas, streaming de respostas e gerenciamento de contexto conversacional.

**Cliente MCP**
Implementa protocolo completo para descoberta, conexão e comunicação com servidores MCP via transports STDIO e HTTP+SSE, seguindo especificação JSON-RPC 2.0.

**Sistema de Persistência**
Gerencia armazenamento local de configurações, histórico de conversas, preferências do usuário e cache de dados utilizando banco embarcado para consultas eficientes.

**Engine de Streaming**
Implementa protocolo de streaming bidirecional permitindo renderização progressiva na interface durante geração de respostas longas.

**Camada de Segurança**
Gerencia autenticação de servidores MCP, validação de certificados, isolamento de processos e aplicação de políticas de segurança.

---

## Roadmap de Desenvolvimento

### Fase 1: Validação MVP Web (4-6 semanas)

**Objetivo**: Validar arquitetura técnica e fluxos de experiência do usuário antes de investimento no desenvolvimento Tauri completo.

**Sprint 1-2: Fundação Backend**
Inicialização de projeto Axum com estrutura modular, implementação de cliente Ollama com streaming via Server-Sent Events, desenvolvimento de endpoints REST para listagem de modelos e chat completion, criação de testes unitários.

**Sprint 3-4: Interface Web**
Setup de projeto SvelteKit com TypeScript, desenvolvimento de componente de chat com área de mensagens e seletor de modelos, implementação de sistema de histórico com persistência em LocalStorage, deploy de teste para validação externa.

**Sprint 5-6: Iteração e Refinamento**
Testes de usabilidade com desenvolvedores e entusiastas de IA, coleta de feedback qualitativo e quantitativo, otimização de performance do streaming, documentação de lições aprendidas para informar desenvolvimento Tauri.

### Fase 2: Aplicação Desktop Tauri (6-8 semanas)

**Sprint 7-9: Migração para Tauri**
Inicialização de projeto Tauri 2.0 com template SvelteKit, migração de lógica Axum para Tauri Commands, implementação de sistema IPC completo, desenvolvimento de sistema de eventos para comunicação backend-frontend.

**Sprint 10-12: Integração MCP**
Implementação completa de cliente MCP seguindo especificação oficial, sistema de descoberta automática de servidores MCP instalados, gerenciamento de múltiplas conexões simultâneas, interface de configuração para adicionar/remover servidores.

**Sprint 13-14: Features Avançadas**
Sistema de templates de prompt para casos de uso comuns, implementação de RAG básico com embeddings, configurações avançadas de modelos, sistema de plugins para extensibilidade, exportação de conversas em múltiplos formatos.

### Fase 3: Polish e Lançamento (3-4 semanas)

**Sprint 15-16: Qualidade e Performance**
Testes de carga e stress, profiling detalhado identificando gargalos, otimizações targeted de latências críticas, implementação de telemetria anonimizada, code review completo.

**Sprint 17-18: Documentação e Release**
Documentação completa de usuário com guias de início rápido, documentação técnica para desenvolvedores, vídeos tutoriais, setup de CI/CD para builds automáticos, lançamento em GitHub Releases e AUR para Arch Linux.

---

## Requisitos do Sistema

### Requisitos Mínimos

**Sistema Operacional**
Linux com kernel 5.10 ou superior (prioritário), Windows 10/11 com WSL2 (suporte planejado)

**Hardware**
Processador: 4 cores físicos, Memória RAM: 8 GB, Armazenamento: 10 GB disponíveis, GPU: Recomendado NVIDIA com CUDA ou AMD com ROCm para aceleração

**Dependências**
Ollama instalado e configurado, Node.js 20 LTS ou superior para desenvolvimento, Rust toolchain 1.75 ou superior para compilação

### Requisitos Recomendados

Processador: 8 cores físicos ou superior, Memória RAM: 16 GB ou superior, GPU: NVIDIA RTX 3060 ou superior com 12GB VRAM, Armazenamento: SSD NVMe para melhor performance

---

## Instalação

### Pré-requisitos

Antes de instalar o OllaHub, certifique-se que o Ollama está instalado e funcionando corretamente. Faça download do Ollama no site oficial e verifique a instalação executando o comando para listar modelos disponíveis.

### Instalação via Binário Pré-compilado

Faça download do binário apropriado para seu sistema operacional na seção Releases do repositório GitHub. Para Linux, escolha entre formato DEB para distribuições baseadas em Debian/Ubuntu, RPM para distribuições baseadas em Red Hat/Fedora, ou AppImage para distribuição universal.

Após download, instale o pacote conforme método de seu sistema operacional ou execute o AppImage diretamente após conceder permissões de execução.

### Compilação a partir do Código-fonte

Clone o repositório do GitHub, instale as dependências do frontend utilizando gerenciador de pacotes Node.js, compile o backend Rust, e execute o build final que gerará binário otimizado para produção.

---

## Uso

### Primeira Execução

Ao iniciar o OllaHub pela primeira vez, a aplicação realizará verificação de conexão com Ollama local. Caso não detecte instância em execução, será exibido alerta com instruções para iniciar o serviço.

Após conexão estabelecida, interface principal exibirá lista de modelos disponíveis baixados no Ollama. Selecione modelo desejado e inicie nova conversa.

### Gerenciamento de Modelos

A seção de modelos permite visualizar todos modelos disponíveis instalados localmente, incluindo informações sobre tamanho, capacidades e versão. Para adicionar novos modelos, utilize comandos do Ollama diretamente no terminal, e atualize a lista na interface do OllaHub.

### Integração com Servidores MCP

Acesse seção de configurações para adicionar servidores MCP. Para servidores locais, configure caminho do executável e argumentos necessários para inicialização via STDIO. Para servidores remotos, configure URL do endpoint HTTP e credenciais de autenticação se necessário.

Após configuração, OllaHub estabelecerá conexão e descobrirá automaticamente ferramentas e recursos disponíveis. Estas ferramentas aparecerão na interface e poderão ser invocadas durante conversas com modelos.

### Templates e Workflows

Utilize biblioteca de templates pré-configurados para casos de uso comuns como análise de código, revisão de documentos, geração de documentação técnica e debugging assistido. Templates podem ser customizados e salvos para reutilização futura.

### Exportação de Conversas

Conversas podem ser exportadas em formato Markdown para documentação, JSON para processamento programático, ou texto simples para compartilhamento. Acesse menu de contexto da conversa e selecione formato desejado.

---

## Segurança e Privacidade

### Processamento Local

Todo processamento de inferência ocorre localmente através do Ollama. Nenhum dado é transmitido para servidores externos durante uso normal da aplicação.

### Isolamento de Servidores MCP

Servidores MCP executam em processos separados com comunicação via pipes, prevenindo comprometimento do processo principal. Para servidores não-confiáveis, recomenda-se execução em containers Docker para camada adicional de isolamento.

### Persistência de Dados

Histórico de conversas e configurações são armazenados localmente em diretório de dados do usuário. Dados são salvos em formato SQLite ou JSON dependendo da configuração, permitindo backup e migração simples.

### Auditoria

Sistema de logging estruturado registra todas operações sensíveis incluindo conexões com servidores MCP, invocações de ferramentas externas e modificações de configuração. Logs podem ser revisados para auditoria de segurança.

---

## Contribuindo

OllaHub é um projeto open source e contribuições são bem-vindas. Antes de contribuir, leia as diretrizes de contribuição no arquivo CONTRIBUTING.md do repositório.

### Áreas de Contribuição

**Desenvolvimento de Features**
Implementação de novas funcionalidades seguindo roadmap do projeto ou propondo melhorias não planejadas.

**Correção de Bugs**
Identificação e correção de problemas reportados na seção Issues do GitHub.

**Documentação**
Melhoria de documentação de usuário, criação de tutoriais, tradução para outros idiomas.

**Testes**
Desenvolvimento de testes unitários e de integração, testes de usabilidade, identificação de casos extremos.

**Servidores MCP**
Desenvolvimento de servidores MCP especializados para integração com ferramentas e serviços específicos.

### Processo de Contribuição

Faça fork do repositório, crie branch para sua feature ou correção, implemente mudanças com commits descritivos, adicione testes quando apropriado, atualize documentação refletindo mudanças, envie pull request com descrição detalhada das alterações.

Todas contribuições serão revisadas pelos mantenedores do projeto antes de merge. Feedback construtivo será fornecido para auxiliar no processo de aprovação.

---

## Licença

Este projeto é licenciado sob a licença MIT. Veja arquivo LICENSE para detalhes completos.

A licença MIT permite uso comercial, modificação, distribuição e uso privado, desde que atribuição original seja mantida.

---

## Suporte e Comunidade

### Canais de Suporte

**GitHub Issues**
Para reportar bugs, solicitar features ou discutir aspectos técnicos do projeto.

**GitHub Discussions**
Para perguntas gerais, compartilhamento de casos de uso, discussões sobre arquitetura e decisões de design.

**Discord Community** (em planejamento)
Para suporte em tempo real, discussões da comunidade e compartilhamento de configurações e workflows.

### Recursos Adicionais

**Documentação Oficial**
Guias detalhados disponíveis no diretório docs do repositório cobrindo instalação, configuração, desenvolvimento e troubleshooting.

**Wiki do Projeto**
Artigos comunitários sobre casos de uso específicos, integrações com ferramentas populares e otimizações de performance.

**Exemplos de Código** (futuro)
Repositório de exemplos demonstrando integração do OllaHub com diferentes servidores MCP e casos de uso avançados.

---

## Reconhecimentos

Este projeto utiliza e é inspirado por diversos projetos open source extraordinários:

- Ollama pela plataforma de gerenciamento de modelos LLM locais
- Anthropic pelo desenvolvimento do Model Context Protocol
- Tauri pela framework de aplicações desktop com Rust
- SvelteKit pelo framework web reativo e performático
- Comunidade Rust pela linguagem e ecossistema de ferramentas excepcionais

Agradecimentos especiais aos early adopters e contribuidores que forneceram feedback valioso durante desenvolvimento do MVP.

---

## Status do Projeto

**Fase Atual**: MVP Web em desenvolvimento (Fase 1 - Sprint 3)

**Próximos Marcos**:

- Conclusão de testes de usabilidade do MVP web (2 semanas)
- Início da migração para Tauri (4 semanas)
- Implementação completa do cliente MCP (8 semanas)
- Lançamento da versão alpha para Linux (12 semanas)

Acompanhe progresso do desenvolvimento na seção Projects do GitHub e participe das discussões sobre features futuras.

---

**Desenvolvido com foco em privacidade, performance e experiência do usuário.**
