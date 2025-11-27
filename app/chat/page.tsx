'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquare, Settings, Server, Moon, Sun, PanelLeftClose, PanelLeftOpen, Loader2, ChevronDown, Plus, ScrollText, Copy, Check, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { ReasoningChain } from "@/components/chat/reasoning-chain";
 
import { SidebarList } from "@/components/chat/sidebar-list";
import { useChat } from "@/hooks/use-chat";
import { useLocalModels } from "@/hooks/use-local-models";
import { useChatStorage } from "@/hooks/use-chat-storage";
import { useAutoLabelingModel } from "@/hooks/use-auto-labeling-model";
import { useWebSearch } from "@/hooks/use-web-search";
// SearchProgress removido - informações agora nas mensagens de processo
// ThinkingIndicator removido - usando mensagens de processo integradas
// Componentes de processamento removidos - agora usando mensagens de processo integradas na timeline
import { useQueryGenerator } from "@/hooks/use-query-generator";
import { useDeepResearch } from "@/hooks/use-deep-research";
import { DEEP_RESEARCH_PROMPTS } from "@/data/prompts/deep-research";
import { useSettingsStore } from "@/store/settings-store";
import type { ScrapedContent } from "@/services/webSearch";
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ImperativePanelHandle } from "react-resizable-panels";
import { ModelDownloadDialog } from "@/components/chat/model-download-dialog";
import { sanitizeWebSources } from "@/lib/sanitize-web-content";
import { chatLog } from "@/lib/terminal-logger";
import { useQueryPreprocessor, type PreprocessedQuery } from "@/hooks/use-query-preprocessor";
import type { Message, ThinkingMessageMetadata, ThinkingStepType, ThinkingStepStatus } from "@/hooks/use-chat";
import { executeProgressiveSearch, type FallbackResult } from "@/lib/web-search-fallback";
// @ts-ignore
import defaultFormatPrompt from "@/data/prompts/default-format.md";


export default function ChatPage() {
  const router = useRouter();
  const { messages, setMessages, sendMessage, isLoading, stop, clearChat } = useChat();
  const { models, refresh } = useLocalModels();
  const { theme, setTheme } = useTheme();
  
  const { 
    sessions, 
    currentSessionId, 
    setCurrentSessionId, 
    loadSessionHistory,
    loadSessions,
    saveSession, 
    deleteSession,
    isGeneratingTitle
  } = useChatStorage();

  const { isDownloading, progress } = useAutoLabelingModel();
  const webSearch = useWebSearch();
  const { generateQuery, isGenerating: isGeneratingQuery } = useQueryGenerator();
  const deepResearch = useDeepResearch();
  const settings = useSettingsStore();
  const { preprocess } = useQueryPreprocessor();
  
  // Funções auxiliares para gerenciar mensagens de processo
  const addThinkingMessage = useCallback((
    stepType: ThinkingStepType,
    label: string,
    status: ThinkingStepStatus = 'running',
    details?: string,
    progress?: number
  ): string => {
    const messageId = `thinking-${stepType}-${Date.now()}`;
    const thinkingMessage: Message = {
      role: 'system',
      content: '',
      metadata: {
        type: 'thinking',
        stepType,
        status,
        label,
        details,
        progress,
        timestamp: Date.now(),
      } as ThinkingMessageMetadata,
    };
    
    setMessages(prev => [...prev, thinkingMessage]);
    return messageId;
  }, []);

  const updateThinkingMessage = useCallback((
    stepType: ThinkingStepType,
    updates: Partial<ThinkingMessageMetadata>
  ) => {
    setMessages(prev => prev.map(msg => {
      const metadata = msg.metadata as ThinkingMessageMetadata | undefined;
      if (metadata?.type === 'thinking' && metadata.stepType === stepType) {
        return {
          ...msg,
          metadata: {
            ...metadata,
            ...updates,
          } as ThinkingMessageMetadata,
        };
      }
      return msg;
    }));
  }, []);

  const removeThinkingMessage = useCallback((stepType: ThinkingStepType) => {
    setMessages(prev => prev.filter(msg => {
      const metadata = msg.metadata as ThinkingMessageMetadata | undefined;
      return !(metadata?.type === 'thinking' && metadata.stepType === stepType);
    }));
  }, []);
  
  const [selectedModel, setSelectedModel] = useState("");
  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);
  // Initialize with default format prompt
  const [systemPrompt, setSystemPrompt] = useState(defaultFormatPrompt || "Você é um assistente útil e prestativo.");
  const [isChatsSidebarCollapsed, setIsChatsSidebarCollapsed] = useState(true); // Iniciar colapsada
  // Removido: thinkingStep e processSteps - agora usando mensagens thinking agrupadas
  const [error, setError] = useState<string | Error | null>(null);
  
  const chatsSidebarRef = useRef<ImperativePanelHandle>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedMessagesRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showContextDebug, setShowContextDebug] = useState(false);
  const [showProcessDebug, setShowProcessDebug] = useState(false);
  const [lastWebContext, setLastWebContext] = useState('');
  const [lastContextSources, setLastContextSources] = useState<ScrapedContent[]>([]);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [logsCopied, setLogsCopied] = useState(false);
  const [lastUserQuery, setLastUserQuery] = useState('');

  // Auto-select first model
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    const stored = settings.selectedModel;
    const first = models.length > 0 ? models[0].name : "";
    const next = stored || first || "";
    if (next) {
      setSelectedModel(next);
      if (!stored) {
        settings.setSelectedModel(next);
      }
    }
    initializedRef.current = true;
  }, [settings.selectedModel, models]);

  // Auto-scroll para o final durante streaming
  useEffect(() => {
    if (messagesEndRef.current && (isLoading || messages.length > 0)) {
      // Pequeno delay para garantir que o DOM foi atualizado
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'end'
        });
      }, 100);
    }
  }, [messages, isLoading]);

  // Save session when loading finishes (with debounce to avoid race conditions)
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only save if:
    // 1. Not currently loading
    // 2. We have a session ID
    // 3. We have messages
    // 4. Messages actually changed (by count or reference)
    if (!isLoading && currentSessionId && messages.length > 0) {
      // Check if messages actually changed (simple length check, could be improved)
      const currentMessageCount = messages.length;
      if (currentMessageCount !== lastSavedMessagesRef.current) {
        // Small delay to ensure metadata processing is complete
        saveTimeoutRef.current = setTimeout(() => {
          lastSavedMessagesRef.current = currentMessageCount;
          saveSession(currentSessionId, messages);
        }, 100);
      }
    }

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [isLoading, currentSessionId, messages, saveSession]);


  // Função auxiliar para pré-processar query (memoizada com useCallback)
  const preprocessQuery = useCallback(async (content: string): Promise<{
    preprocessed: PreprocessedQuery;
    finalContent: string;
  }> => {
    const preprocessingConfig = settings.queryPreprocessing || {
      enabled: true,
      minLength: 3,
      maxLength: 2000,
      autoSplitQuestions: true,
      irrelevantPatterns: [],
    };
    
    let preprocessed: PreprocessedQuery;
    if (preprocessingConfig.enabled) {
      chatLog.info('\n========== PRE-PROCESSING ==========');
      preprocessed = await preprocess(content);
      chatLog.info(`Original: "${preprocessed.original}"`);
      chatLog.info(`Normalized: "${preprocessed.normalized}"`);
      chatLog.info(`Intent: ${preprocessed.intent}`);
      chatLog.info(`Should Search: ${preprocessed.shouldSearch}`);
      chatLog.info(`Questions Split: ${preprocessed.splitResult.splitCount}`);
      
      // Se inválida, retornar erro
      if (!preprocessed.validation.isValid) {
        chatLog.error('Query validation failed:', preprocessed.validation.errors);
        throw new Error(`Query validation failed: ${preprocessed.validation.errors.join(', ')}`);
      }
      
      // Se múltiplas perguntas detectadas, usar apenas a primeira (com aviso)
      let finalContent = preprocessed.original;
      if (preprocessed.questions.length > 1) {
        chatLog.warn(`Multiple questions detected (${preprocessed.questions.length}). Processing first question only.`);
        finalContent = preprocessed.questions[0];
      }
      
      return { preprocessed, finalContent };
    } else {
      // Se pré-processamento desabilitado, criar objeto básico
      preprocessed = {
        original: content,
        normalized: content,
        questions: [content],
        intent: 'unknown' as const,
        validation: { isValid: true, errors: [], warnings: [], normalizedLength: content.length },
        shouldSearch: webSearch.isEnabled,
        splitResult: { questions: [content], originalText: content, splitCount: 1 },
      };
      return { preprocessed, finalContent: content };
    }
  }, [settings.queryPreprocessing, webSearch.isEnabled]);

  const handleSend = async (content: string) => {
    if (!selectedModel) return;
    
    // ========== ADICIONAR MENSAGENS IMEDIATAMENTE ==========
    // Adicionar mensagem do usuário ao estado antes de qualquer processamento
    // para feedback visual instantâneo
    setMessages(prev => [...prev, { role: 'user', content }]);
    
    // Adicionar mensagem de processo: Pré-processamento
    addThinkingMessage('preprocessing', 'Pré-processamento', 'running');
    
    // Removido: setProcessSteps - agora usando mensagens thinking agrupadas
    
    // Limpar erros anteriores
    setError(null);
    
    // ========== PRÉ-PROCESSAMENTO ==========
    let preprocessed: PreprocessedQuery;
    let finalContent: string;
    const preprocessingStart = Date.now();
    try {
      const result = await preprocessQuery(content);
      preprocessed = result.preprocessed;
      finalContent = result.finalContent;
      content = finalContent; // Atualizar content para uso posterior
      
      // Atualizar mensagem de processo: Pré-processamento concluído
      updateThinkingMessage('preprocessing', {
        status: 'completed',
        duration: Date.now() - preprocessingStart,
      });
    } catch (error) {
      // Se validação falhar, remover mensagens adicionadas e mostrar erro
      setMessages(prev => {
        const newMessages = [...prev];
        // Remover última mensagem de processo e última do usuário
        return newMessages.slice(0, -2);
      });
      
      // Atualizar step com erro
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateThinkingMessage('preprocessing', {
        status: 'error',
        error: errorMessage,
        duration: Date.now() - preprocessingStart,
      });
      
      // Removido: setProcessSteps - agora usando mensagens thinking agrupadas
      
      // Definir erro global
      setError(error);
      
      chatLog.error('Preprocessing failed:', error);
      // Erro já será mostrado no chat-input, apenas retornar
      return;
    }
    
    // ========== TERMINAL LOGGING ==========
    chatLog.info('\n========== NEW QUERY ==========');
    chatLog.info(`User Query: "${content}"`);
    chatLog.info(`Model: ${selectedModel}`);
    chatLog.info(`Web Search: ${webSearch.isEnabled ? 'ENABLED' : 'DISABLED'}`);
    chatLog.info(`Intent: ${preprocessed.intent}`);
    chatLog.info(`Should Search: ${preprocessed.shouldSearch}`);
    chatLog.info(`Timestamp: ${new Date().toISOString()}`);
    
    setShowContextDebug(false);
    setShowProcessDebug(false);
    setLastWebContext('');
    setLastContextSources([]);
    setLastUserQuery(content); // Store for copy logs
    setLogsCopied(false);
    
    // Generate ID if new session (but don't create card yet - wait for title)
    if (!currentSessionId) {
      const newId = crypto.randomUUID();
      setCurrentSessionId(newId);
      chatLog.info(`New session created: ${newId}`);
    }
    
    // Função auxiliar para executar pesquisa web
    const executeWebResearch = async (
      content: string,
      preprocessed: PreprocessedQuery
    ): Promise<{
      knowledgeBaseContext: string;
      scrapedSources: ScrapedContent[];
      validationReport: string;
    }> => {
      let knowledgeBaseContext = '';
      let scrapedSources: ScrapedContent[] = [];
      let validationReport = '';
      
      // Roteamento inteligente: só buscar se shouldSearch for true
      if (webSearch.isEnabled && preprocessed.shouldSearch) {
      chatLog.info('\n--- STARTING DEEP RESEARCH PIPELINE ---');
      
      // Adicionar mensagem de processo: Pesquisa Web
      addThinkingMessage('web-research', 'Pesquisando na Web...', 'running');
      const webResearchStart = Date.now();
      
      try {
        webSearch.reset();
        deepResearch.reset();

        // Passo 1: Decomposição
        chatLog.info('Step 1: Decomposition');
        const searchPlan = await deepResearch.decompose(content, selectedModel);
        chatLog.info(`Search Plan: ${JSON.stringify(searchPlan)}`);
        
        if (searchPlan && searchPlan.length > 0) {
           // Passo 2: Executar buscas com fallback progressivo
           chatLog.info(`\nStep 2: Executing ${searchPlan.length} searches with progressive fallback`);
           
           // Atualizar progresso: decomposição concluída
           updateThinkingMessage('web-research', {
             label: `Buscando ${searchPlan.length} consultas...`,
             progress: 10,
             details: `Executando busca progressiva com fallback automático...`,
           });
           
           const maxResults = Math.max(2, Math.floor(settings.webSearch.maxResults / searchPlan.length));
           chatLog.info(`Max results per query: ${maxResults}`);
           
           // Executar busca progressiva para cada query do plano
           const searchPromises = searchPlan.map(async (query, idx) => {
             chatLog.info(`  → Starting progressive search ${idx + 1}/${searchPlan.length}: "${query}"`);
             
             // Atualizar progresso
             updateThinkingMessage('web-research', {
               details: `Buscando consulta ${idx + 1}/${searchPlan.length}: "${query}"...`,
               progress: 10 + (idx * 20 / searchPlan.length),
             });
             
             try {
               // Obter contexto e queries enriquecidas do deep research
               const context = deepResearch.state.context;
               const enrichedQueries = deepResearch.state.enrichedQueries;
               
               // Executar busca progressiva com semantic search se disponível
               const fallbackResult = await executeProgressiveSearch(
                 query,
                 async (q, limit) => {
                   return await webSearch.smartSearchRag(q, limit);
                 },
                 selectedModel,
                 {
                   maxRounds: 3, // Máximo 3 rodadas por query
                   maxResultsPerRound: maxResults,
                   maxTotalResults: 30, // Máximo 30 resultados por query
                   minRelevanceScore: 0.3,
                   enableQueryExpansion: !enrichedQueries, // Desabilitar expansão tradicional se usar enriquecimento
                   useSemanticSearch: !!enrichedQueries, // Usar semantic search se temos queries enriquecidas
                   context: context || undefined,
                   enrichedQueries: enrichedQueries || undefined,
                 }
               );
               
               // Log do resultado
               chatLog.info(`  ✓ Progressive search ${idx + 1} complete:`);
               chatLog.info(`     - Success: ${fallbackResult.success}`);
               chatLog.info(`     - Total results: ${fallbackResult.scrapedSources.length}`);
               chatLog.info(`     - Total analyzed: ${fallbackResult.totalResultsAnalyzed}`);
               chatLog.info(`     - Attempts: ${fallbackResult.attempts.length}`);
               chatLog.info(`     - Used fallback: ${fallbackResult.usedFallback}`);
               
               // Log detalhado de cada resultado
               fallbackResult.scrapedSources.forEach((result, resultIdx) => {
                 chatLog.info(`    → Result ${resultIdx + 1}: ${result.title}`);
                 chatLog.info(`       URL: ${result.url}`);
                 const contentLength = result.markdown?.length || 0;
                 chatLog.info(`       Content length: ${contentLength} chars`);
               });
               
               // Adicionar resultados à Knowledge Base
               if (fallbackResult.scrapedSources.length > 0) {
                 deepResearch.addToKnowledgeBase(query, fallbackResult.scrapedSources);
               }
               
               // Se usou fallback, notificar no frontend
               if (fallbackResult.usedFallback) {
                 updateThinkingMessage('web-research', {
                   details: `Consulta ${idx + 1}: Nenhum resultado relevante encontrado após ${fallbackResult.attempts.length} tentativas. Usando conhecimento interno.`,
                 });
               }
               
               // Se houve falhas mas ainda tem resultados, avisar discretamente
               const failedRounds = fallbackResult.attempts.filter(a => a.results.length === 0);
               if (failedRounds.length > 0 && fallbackResult.scrapedSources.length > 0) {
                 updateThinkingMessage('web-research', {
                   details: `Consulta ${idx + 1}: Algumas tentativas falharam, mas ${fallbackResult.scrapedSources.length} resultados foram encontrados.`,
                 });
               }
               
               return { query, results: fallbackResult.scrapedSources, fallbackResult };
             } catch (err) {
               // Logar erro mas continuar (não quebrar o fluxo)
               const errorMsg = err instanceof Error ? err.message : String(err);
               chatLog.warn(`  ⚠️ Progressive search ${idx + 1} failed (continuando): ${errorMsg}`);
               
               // Atualizar mensagem de processo com aviso
               updateThinkingMessage('web-research', {
                 details: `Consulta ${idx + 1}: Erro na busca (${errorMsg}). Continuando com outras consultas...`,
               });
               
               return { query, results: [] as ScrapedContent[], fallbackResult: null };
             }
           });

           await Promise.all(searchPromises);
           chatLog.info(`All searches complete. Knowledge Base size: ${deepResearch.state.knowledgeBase.length}`);
           
           // Coletar todas as fontes para exibição
           scrapedSources = deepResearch.state.knowledgeBase.map(entry => ({
             url: entry.sourceUrl,
             title: entry.title,
             markdown: entry.content,
             snippet: entry.content.substring(0, 200)
           }));

           // Adicionar mensagem: Fontes encontradas
           if (scrapedSources.length > 0) {
             addThinkingMessage('sources-found', `Fontes encontradas (${scrapedSources.length})`, 'completed');
             // Atualizar com fontes
             updateThinkingMessage('sources-found', {
               sources: scrapedSources.map(s => ({ url: s.url, title: s.title })),
             });
           }

           if (deepResearch.state.knowledgeBase.length > 0) {
             // Passo 3: Validação e Contexto
             chatLog.info('\nStep 3: Validation');
             deepResearch.setStep('aggregating');
             
             // Adicionar mensagem: Processamento
             addThinkingMessage('processing', 'Processando contexto...', 'running');
             validationReport = await deepResearch.validate(selectedModel, content);
             chatLog.info(`Validation Report Length: ${validationReport.length} chars`);
             
             // Passo 4: Obter contexto curado (usando versão otimizada)
             chatLog.info('\nStep 4: Getting Curated Context (Optimized)');
             
             // Calcular tokens disponíveis dinamicamente
             const { getModelContextInfo } = await import('@/lib/model-context');
             const contextInfo = await getModelContextInfo(selectedModel, systemPrompt, messages);
             const availableTokens = contextInfo.recommendedContextWindow;
             
             chatLog.info(`Model Context Window: ${contextInfo.maxContextWindow} tokens`);
             chatLog.info(`Available Tokens for KB: ${availableTokens} tokens`);
             
             const optimizedResult = deepResearch.getCuratedContextOptimized(content, availableTokens);
             knowledgeBaseContext = optimizedResult.context;
             
             chatLog.info(`Knowledge Base Context Length: ${knowledgeBaseContext.length} chars`);
             chatLog.info(`Condensation Method: ${optimizedResult.result.method}`);
             chatLog.info(`Chunks Used: ${optimizedResult.result.chunksUsed} / ${optimizedResult.result.chunksTotal}`);
             chatLog.info(`Compression Ratio: ${(optimizedResult.result.compressionRatio * 100).toFixed(1)}%`);
             
             // Log preview do contexto se não for muito longo
             if (knowledgeBaseContext.length > 0) {
               if (knowledgeBaseContext.length > 2000) {
                 chatLog.info(`Context Preview (first 2000 chars):\n${knowledgeBaseContext.substring(0, 2000)}...`);
               } else {
                 chatLog.info(`Full Context:\n${knowledgeBaseContext}`);
               }
               
               // Validar contexto
               const { validateCondensedContext } = await import('@/lib/knowledge-base-processor');
               const validation = validateCondensedContext(optimizedResult.result, content);
               
               if (!validation.isValid) {
                 chatLog.error('Context validation failed:', validation.warnings.join(', '));
               } else if (validation.warnings.length > 0) {
                 validation.warnings.forEach(warning => {
                   chatLog.warn(`⚠️ ${warning}`);
                 });
               } else {
                 chatLog.info('✓ Context validation passed');
               }
             } else {
               chatLog.warn('⚠️ Knowledge Base Context is empty!');
             }
               
             setLastWebContext(knowledgeBaseContext);
             setLastContextSources(scrapedSources);
             
             // Atualizar mensagem: Processamento concluído
             updateThinkingMessage('processing', {
               status: 'completed',
               label: 'Contexto processado',
             });
           } else {
             chatLog.warn('⚠️ No results found in Knowledge Base');
           }
           
           // Atualizar mensagem: Pesquisa Web concluída
           updateThinkingMessage('web-research', {
             status: 'completed',
             duration: Date.now() - webResearchStart,
           });
        } else {
          // Fallback para busca simples
           chatLog.info('Decomposition returned empty, falling back to simple search');
           const simpleQuery = await generateQuery(content, selectedModel);
           chatLog.info(`Simple query generated: "${simpleQuery}"`);
           if (simpleQuery && simpleQuery !== 'NO_SEARCH') {
             const results = await webSearch.smartSearchRag(simpleQuery, settings.webSearch.maxResults);
             chatLog.info(`Simple search results: ${results.length}`);
             if (results.length > 0) {
               deepResearch.addToKnowledgeBase(simpleQuery, results);
               knowledgeBaseContext = deepResearch.getCuratedContext();
               scrapedSources = results;
               setLastWebContext(knowledgeBaseContext);
               setLastContextSources(scrapedSources);
             }
           } else {
             chatLog.info('Simple query returned NO_SEARCH, skipping web search');
           }
        }

      } catch (error) {
        // Tratar erro graciosamente sem quebrar o fluxo
        const errorMsg = error instanceof Error ? error.message : String(error);
        chatLog.warn(`⚠️ Error in Deep Research pipeline (continuing with partial results): ${errorMsg}`);
        
        // Atualizar mensagem de processo com aviso (não erro fatal)
        updateThinkingMessage('web-research', {
          status: 'completed', // Marcar como completed mesmo com erro parcial
          details: `Alguns erros ocorreram durante a pesquisa: ${errorMsg}. Continuando com resultados parciais...`,
          duration: Date.now() - webResearchStart,
        });
        
        // Não definir erro global - permitir que o fluxo continue
        // O sistema continuará com conhecimento interno se necessário
      }
    } else {
      if (!webSearch.isEnabled) {
        chatLog.info('Web Search disabled, skipping research pipeline');
      } else if (!preprocessed.shouldSearch) {
        chatLog.info(`Intent "${preprocessed.intent}" does not require web search, skipping research pipeline`);
      }
    }
    
    return {
      knowledgeBaseContext,
      scrapedSources,
      validationReport,
    };
  };
    
    // ========== LÓGICA DE DEEP RESEARCH (Knowledge Base Aggregation) ==========
    // Removido: setThinkingStep e setProcessSteps - agora usando mensagens thinking agrupadas
    
    const researchStart = Date.now();
    // Executar pesquisa web
    const { knowledgeBaseContext, scrapedSources, validationReport } = await executeWebResearch(
      content,
      preprocessed
    );
    
    // Passo 5: Formular resposta
    chatLog.info('\nStep 5: Formulating Response');
    // Removido: setThinkingStep e setProcessSteps - agora usando mensagens thinking agrupadas
    
    // ========== MONTAR SYSTEM PROMPT COM CONTEXTO TEMPORAL E VALIDAÇÃO ==========
    // Usar timezone do sistema do usuário (não fixo)
    const now = new Date();
    const currentDateTime = now.toLocaleString('pt-BR', {
      dateStyle: 'full',
      timeStyle: 'short',
      // Não especificar timeZone - usar o do sistema
    });
    
    // Formato adicional mais explícito para garantir que a IA entenda
    const currentDateISO = now.toISOString();
    const currentDateExplicit = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    let enhancedSystemPrompt = systemPrompt;
    
    // Se tivermos uma Knowledge Base, usar o prompt STRICT_GENERATION
    // Verificar se houve fallback (nenhum resultado relevante encontrado)
    const usedFallback = knowledgeBaseContext.length === 0 || knowledgeBaseContext.length < 100;
    
    if (knowledgeBaseContext && knowledgeBaseContext.length > 100) {
       const strictPrompt = DEEP_RESEARCH_PROMPTS.STRICT_GENERATION
         .replace('{{knowledgeBase}}', knowledgeBaseContext)
         .replace('{{validationReport}}', validationReport || 'Nenhuma validação disponível.')
         .replace('{{userQuery}}', content);
         
       enhancedSystemPrompt = strictPrompt;
    } else if (usedFallback) {
      // Fallback: usar prompt sem contexto web, mas informando que não encontrou fontes
      enhancedSystemPrompt = `${systemPrompt}

## ⚠️ AVISO IMPORTANTE

Não foi possível encontrar informações relevantes nas fontes web consultadas após múltiplas tentativas de busca.

**INSTRUÇÕES:**
- Responda usando APENAS seu conhecimento interno (treinamento)
- Seja honesto e diga: "Não encontrei essa informação nas fontes consultadas."
- Se tiver conhecimento sobre o tópico, compartilhe, mas deixe claro que não há fontes externas verificadas
- Não invente informações ou cite fontes que não foram consultadas

## DATA E HORA ATUAL DO SISTEMA

**DATA/HORA FORMATADA:** ${currentDateTime}

Use esta data exata para referências temporais.`;
    }
    // Fallback para lógica antiga se não tiver Knowledge Base
    else if (knowledgeBaseContext) {
      enhancedSystemPrompt = `${systemPrompt}

## ⚠️ DATA E HORA ATUAL DO SISTEMA (USE ESTA DATA EXATA)

**DATA/HORA FORMATADA:** ${currentDateTime}
**DATA/HORA NUMÉRICA:** ${currentDateExplicit}
**ISO 8601:** ${currentDateISO}

**REGRA CRÍTICA:** Você DEVE usar EXATAMENTE esta data e hora. NÃO invente ou calcule datas diferentes. Se o sistema diz que é ${currentDateTime}, então é ${currentDateTime}. Não use "amanhã" ou "ontem" a menos que seja explicitamente solicitado pelo usuário.

## INSTRUÇÕES ESPECÍFICAS PARA RESPOSTAS COM CONTEXTO WEB

1. **Contextualização Temporal Obrigatória:**
   - Inicie respostas sobre notícias ou eventos citando a data atual EXATA fornecida acima.
   - Use EXATAMENTE: "${currentDateTime}" (não invente outra data).
   - Exemplo: "Com base nas notícias de ${currentDateTime}, os principais destaques são..."

2. **Densidade e Profundidade:**
   - NUNCA responda com listas de tópicos curtos e vagos (ex: "Houve um protesto").
   - Cada ponto deve conter detalhes específicos: Números, Nomes Próprios, Locais e Citações Diretas do contexto.
   - Explique o *contexto* da notícia, não apenas a manchete.
   - Prefira parágrafos explicativos com "quem, quando, onde, porquê".

3. **Uso Estrito de Fontes:**
   - Use SOMENTE as informações do bloco [CONTEXTO WEB RECUPERADO] abaixo para fatos recentes. Não alucine.
   - Se o contexto trouxer múltiplas notícias diferentes, agrupe-as por temas usando títulos Markdown (ex: "## Economia", "## Política").
   - NÃO cite fontes no meio do texto. Use as informações do contexto web naturalmente, sem mencionar [1], [2], [3] ou outras referências numéricas.
   - Se o contexto não for suficiente para responder completamente, diga isso claramente.

4. **Formato Jornalístico:**
   - Use títulos Markdown (##) para separar seções temáticas.
   - Texto corrido para explicações detalhadas.
   - Bullets apenas para listar dados brutos (números, estatísticas).

## CONTEXTO WEB RECUPERADO
${knowledgeBaseContext}

---
`;
    } else {
      // Mesmo sem contexto web, adicionar data/hora e instruções temporais
      enhancedSystemPrompt = `${systemPrompt}

## ⚠️ DATA E HORA ATUAL DO SISTEMA (USE ESTA DATA EXATA)

**DATA/HORA FORMATADA:** ${currentDateTime}
**DATA/HORA NUMÉRICA:** ${currentDateExplicit}
**ISO 8601:** ${currentDateISO}

**REGRA CRÍTICA:** Você DEVE usar EXATAMENTE esta data e hora. NÃO invente ou calcule datas diferentes. Se o sistema diz que é ${currentDateTime}, então é ${currentDateTime}.

Ao responder sobre fatos atuais ou notícias, inicie mencionando explicitamente a data EXATA fornecida acima (${currentDateTime}). Forneça detalhes ricos (nomes, valores, locais) extraídos do seu conhecimento. Evite resumos de uma linha - prefira explicações detalhadas e contextualizadas.

---
`;
    }
    
    // ========== TERMINAL LOGGING: PROMPT INFO ==========
    chatLog.info('\n--- PROMPT CONSTRUCTION ---');
    chatLog.info(`System Prompt Length: ${enhancedSystemPrompt.length} chars`);
    chatLog.info(`Has Knowledge Base Context: ${knowledgeBaseContext && knowledgeBaseContext.length > 100 ? 'YES' : 'NO'}`);
    chatLog.info(`Using STRICT_GENERATION prompt: ${knowledgeBaseContext && knowledgeBaseContext.length > 100 ? 'YES' : 'NO'}`);
    
    let finalUserContent = content;
    if (knowledgeBaseContext && knowledgeBaseContext.length > 100) {
      finalUserContent = `[KNOWLEDGE BASE - ÚNICA FONTE DE VERDADE]\n${knowledgeBaseContext}\n[/KNOWLEDGE BASE]\n\nResponda a pergunta usando APENAS os dados acima. Se a informação não estiver na Knowledge Base, diga "Não encontrei essa informação nas fontes consultadas."\n\nPergunta: ${content}`;
    }
    
    chatLog.info(`Final User Content Length: ${finalUserContent.length} chars`);
    chatLog.info('\n--- SENDING TO LLM ---');
    chatLog.info('Starting response generation...');
    
    // Adicionar mensagem de processo: Geração de Resposta
    addThinkingMessage('response-generation', 'Gerando resposta...', 'running');
    
    // Adicionar mensagem vazia do assistente para feedback visual imediato
    // Esta será preenchida quando o streaming começar
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
    
    // Enviar o conteúdo original para UI, mas com override no payload para incluir contexto
    const responseStart = Date.now();
    await sendMessage(content, selectedModel, enhancedSystemPrompt, {
      payloadContentOverride: finalUserContent,
    });
    
    // Atualizar mensagem de processo: Geração concluída
    updateThinkingMessage('response-generation', {
      status: 'completed',
      duration: Date.now() - responseStart,
    });
    
    // Removido: setProcessSteps - agora usando mensagens thinking agrupadas
    
    chatLog.info('✅ Response generation complete');
    chatLog.info('========== QUERY COMPLETE ==========\n');
    
    // Persistir fontes na mensagem do assistente (metadata)
    if (scrapedSources.length > 0) {
      // Aguardar um pouco para garantir que o sendMessage iniciou e criou a mensagem do assistente
      // O sendMessage é async mas retorna void enquanto a stream acontece. 
      // O setMessages dentro dele adiciona a mensagem do assistente.
      
      // Nota: Como sendMessage roda em background (streaming), não podemos garantir que a mensagem 
      // do assistente já existe aqui imediatamente se não esperarmos.
      // Mas o sendMessage faz `setMessages` com assistant vazio logo no início.
      
      // Vamos atualizar o estado usando callback para garantir que pegamos o mais recente
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsgIndex = newMessages.length - 1;
        if (lastMsgIndex >= 0 && newMessages[lastMsgIndex].role === 'assistant') {
          const lastMsg = newMessages[lastMsgIndex];
          newMessages[lastMsgIndex] = {
            ...lastMsg,
            metadata: {
              ...(lastMsg.metadata || {}),
              sources: scrapedSources
            }
          };
        }
        return newMessages;
      });
    }
    
    // Removido: setThinkingStep - agora usando mensagens thinking agrupadas
  };

  const handleSelectSession = async (id: string) => {
    if (id === currentSessionId) return;
    
    // Clear any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    const history = await loadSessionHistory(id);
    setMessages(history);
    setCurrentSessionId(id);
    lastSavedMessagesRef.current = history.length;
  };

  const handleNewChat = () => {
    stop();
    clearChat();
    setCurrentSessionId(null);
    
    // Reset save tracking
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    lastSavedMessagesRef.current = 0;
  };

  const toggleChatsSidebar = () => {
    const panel = chatsSidebarRef.current;
    if (panel) {
      if (isChatsSidebarCollapsed) {
        // No mobile, apenas atualizar estado (overlay será mostrado)
        if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setIsChatsSidebarCollapsed(false);
        } else {
          panel.expand();
        }
      } else {
        panel.collapse();
      }
    }
  };

  // Copy Logs to Clipboard
  const handleCopyLogs = async () => {
    const logs = deepResearch.state.logs;
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    
    let logText = `# Deep Research Debug Log\n\n`;
    logText += `## User Query\n${lastUserQuery}\n\n`;
    logText += `## Model\n${selectedModel}\n\n`;
    logText += `## Process Logs\n\n`;
    
    logs.forEach((log, idx) => {
      logText += `### ${idx + 1}. Stage: ${log.stage.toUpperCase()}\n`;
      logText += `- **Time**: ${new Date(log.timestamp).toLocaleTimeString()}\n`;
      logText += `- **Input**: ${log.input.substring(0, 500)}${log.input.length > 500 ? '...' : ''}\n`;
      if (log.rawOutput) {
        logText += `- **Raw Output**: ${log.rawOutput.substring(0, 500)}${log.rawOutput.length > 500 ? '...' : ''}\n`;
      }
      if (log.parsedOutput) {
        logText += `- **Parsed Output**: \`\`\`json\n${JSON.stringify(log.parsedOutput, null, 2)}\n\`\`\`\n`;
      }
      if (log.error) {
        logText += `- **Error**: ${log.error}\n`;
      }
      logText += '\n';
    });
    
    logText += `## AI Response\n`;
    logText += lastAssistantMessage?.content || '[No response yet]';
    logText += '\n\n---\n';
    logText += `Generated at: ${new Date().toISOString()}`;
    
    try {
      await navigator.clipboard.writeText(logText);
      setLogsCopied(true);
      setTimeout(() => setLogsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  return (
    <div className="h-screen w-full bg-background overflow-hidden flex">
      {/* Left Sidebar (Nav) */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        
        <ResizablePanel 
          defaultSize={4} 
          minSize={4} 
          maxSize={4}
          className="border-r flex flex-col items-center py-4 gap-4 bg-muted/20 w-[60px] min-w-[60px] max-w-[60px] flex-shrink-0"
        >
          <Button variant="ghost" size="icon" className="rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-foreground">
            <Server className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            {mounted ? (theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />) : null}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/settings')}
          >
            <Settings className="w-5 h-5" />
          </Button>
        </ResizablePanel>

        <ResizableHandle className="hidden md:block" />

        {/* Sessions List - Desktop: ResizablePanel, Mobile: Overlay */}
        <ResizablePanel 
          ref={chatsSidebarRef}
          defaultSize={0}
          minSize={0} 
          maxSize={25} 
          collapsible={true}
          collapsedSize={0}
          onCollapse={() => setIsChatsSidebarCollapsed(true)}
          onExpand={() => setIsChatsSidebarCollapsed(false)}
          className="min-w-0 md:min-w-[220px] md:max-w-[360px] hidden md:block"
          style={{
            minWidth: 'clamp(220px, 20vw, 360px)',
            maxWidth: '360px',
          }}
        >
          <SidebarList 
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={(id) => {
              handleSelectSession(id);
              // Fechar sidebar no mobile após seleção
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setIsChatsSidebarCollapsed(true);
                chatsSidebarRef.current?.collapse();
              }
            }}
            onDeleteSession={deleteSession}
            onNewChat={handleNewChat}
          />
        </ResizablePanel>

        <ResizableHandle className="hidden md:block" />

        {/* Main Chat Area */}
        <ResizablePanel defaultSize={100} minSize={75} className="transition-all duration-300">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="h-14 border-b flex items-center px-3 sm:px-4 justify-between bg-background/50 backdrop-blur gap-2 sm:gap-4 flex-shrink-0" style={{ paddingLeft: 'clamp(12px, 2vw, 16px)', paddingRight: 'clamp(12px, 2vw, 16px)' }}>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleChatsSidebar} 
                  className="h-8 w-8 flex-shrink-0"
                  aria-label={isChatsSidebarCollapsed ? "Abrir conversas" : "Fechar conversas"}
                >
                  {isChatsSidebarCollapsed ? (
                    <PanelLeftOpen className="w-4 h-4" />
                  ) : (
                    <PanelLeftClose className="w-4 h-4" />
                  )}
                </Button>
                <div className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <span className="hidden sm:inline">Chat</span>
                  {isGeneratingTitle && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {isDownloading && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {progress}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 max-w-full sm:max-w-[420px] flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <TooltipProvider>
                    <Select 
                      value={selectedModel || undefined} 
                      onValueChange={(v) => {
                        if (v === "__add_model__") {
                          setShowDownloadDialog(true);
                          // Não alterar selectedModel quando abrir dialog
                        } else {
                          setSelectedModel(v);
                          settings.setSelectedModel(v);
                        }
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SelectTrigger className="h-9 min-w-0 max-w-full">
                            <SelectValue placeholder="Selecione um modelo..." className="truncate" />
                          </SelectTrigger>
                        </TooltipTrigger>
                        {selectedModel && (
                          <TooltipContent side="top" className="max-w-[70vw] break-words">
                            <p className="text-sm">{selectedModel}</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                      <SelectContent className="max-w-[90vw] sm:max-w-[420px]">
                        {models.map(m => (
                          <Tooltip key={m.name}>
                            <TooltipTrigger asChild>
                              <SelectItem value={m.name} className="min-w-0">
                                <span className="flex items-center justify-between w-full min-w-0 gap-2">
                                  <span className="truncate flex-1 min-w-0" style={{ maxWidth: '70vw' }}>
                                    {m.name}
                                  </span>
                                  <span className="ml-2 text-xs text-muted-foreground shrink-0">{m.size}</span>
                                </span>
                              </SelectItem>
                            </TooltipTrigger>
                            {m.name.length > 40 && (
                              <TooltipContent side="right" className="max-w-[70vw] break-words">
                                <p className="text-sm">{m.name}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                        <SelectItem value="__add_model__" className="text-primary font-medium">
                          <span className="flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Adicionar modelo...
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TooltipProvider>
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={refresh} title="Atualizar modelos">
                  <Loader2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area with Floating Input Layout */}
            <div className="flex-1 relative h-full overflow-hidden flex flex-col">
              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto scroll-smooth w-full min-h-0">
                <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 md:px-6 pt-4 sm:pt-6 pb-4 transition-all duration-300" style={{ paddingLeft: 'clamp(12px, 4vw, 24px)', paddingRight: 'clamp(12px, 4vw, 24px)' }}>
                  {messages.length === 0 ? (
                    <div className="min-h-[50vh] flex flex-col items-center justify-center text-muted-foreground space-y-6">
                      <div className="p-6 rounded-2xl bg-muted/30 ring-1 ring-border/50 shadow-sm">
                        <MessageSquare className="w-8 h-8 text-primary/60" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-lg font-medium text-primary/80">Como posso ajudar você hoje?</p>
                        <p className="text-sm text-muted-foreground">Selecione um modelo e comece uma conversa.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 sm:gap-6">
                      {(() => {
                        // Agrupar mensagens thinking consecutivas
                        const groupedMessages: Array<{
                          type: 'thinking-group' | 'regular';
                          messages?: Message[];
                          thinkingSteps?: ThinkingMessageMetadata[];
                          searchQueries?: string[];
                          index?: number;
                          message?: Message;
                          isStreaming?: boolean;
                        }> = [];
                        
                        let currentThinkingGroup: ThinkingMessageMetadata[] = [];
                        let currentSearchQueries: string[] = [];
                        
                        for (let i = 0; i < messages.length; i++) {
                          const msg = messages[i];
                          const isThinkingMessage = msg.metadata && 
                            typeof msg.metadata === 'object' && 
                            'type' in msg.metadata && 
                            msg.metadata.type === 'thinking';
                          
                          if (isThinkingMessage) {
                            const thinkingMeta = msg.metadata as ThinkingMessageMetadata;
                            currentThinkingGroup.push(thinkingMeta);
                            
                            // Extrair queries de busca dos detalhes
                            if (thinkingMeta.details && thinkingMeta.stepType === 'web-research') {
                              const queryMatch = thinkingMeta.details.match(/Buscando consulta \d+\/\d+: "([^"]+)"/);
                              if (queryMatch && queryMatch[1]) {
                                if (!currentSearchQueries.includes(queryMatch[1])) {
                                  currentSearchQueries.push(queryMatch[1]);
                                }
                              }
                            }
                          } else {
                            // Se havia um grupo thinking, adicionar antes desta mensagem
                            if (currentThinkingGroup.length > 0) {
                              groupedMessages.push({
                                type: 'thinking-group',
                                thinkingSteps: [...currentThinkingGroup],
                                searchQueries: [...currentSearchQueries],
                              });
                              currentThinkingGroup = [];
                              currentSearchQueries = [];
                            }
                            
                            // Adicionar mensagem regular
                            const isLastMessage = i === messages.length - (isLoading ? 1 : 0);
                            const isAssistantStreaming = i === messages.length - 1 && msg.role === 'assistant' && isLoading;
                            
                            groupedMessages.push({
                              type: 'regular',
                              message: msg,
                              index: i,
                              isStreaming: isAssistantStreaming,
                            });
                          }
                        }
                        
                        // Adicionar grupo thinking final se houver
                        if (currentThinkingGroup.length > 0) {
                          groupedMessages.push({
                            type: 'thinking-group',
                            thinkingSteps: currentThinkingGroup,
                            searchQueries: currentSearchQueries,
                          });
                        }
                        
                        return groupedMessages.map((group, idx) => {
                          if (group.type === 'thinking-group' && group.thinkingSteps) {
                            return (
                              <div key={`thinking-${idx}`} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ReasoningChain 
                                  steps={group.thinkingSteps} 
                                  searchQueries={group.searchQueries}
                                />
                              </div>
                            );
                          } else if (group.type === 'regular' && group.message) {
                            return (
                              <div key={group.index || idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ChatMessage 
                                  message={group.message} 
                                  isStreaming={group.isStreaming} 
                                />
                              </div>
                            );
                          }
                          return null;
                        });
                      })()}
                    </div>
                  )}

                  {/* Debug Info (Moved inside scroll) */}
                  {(deepResearch.state.logs.length > 0 || lastWebContext) && (
                    <div className="mt-12 pt-6 border-t border-dashed border-muted/50 opacity-70 hover:opacity-100 transition-opacity">
                      <div className="space-y-4">
                         {/* Process Log Toggle */}
                         {deepResearch.state.logs.length > 0 && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowProcessDebug((prev) => !prev)}
                                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <ScrollText className="w-3 h-3" />
                                    Debug: Processo de Pensamento
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showProcessDebug ? 'rotate-180' : ''}`} />
                                </button>
                                {showProcessDebug && (
                                    <div className="mt-2 space-y-2 p-4 rounded-lg bg-muted/30 text-xs border border-muted/50 max-h-60 overflow-y-auto">
                                        <div className="flex justify-end mb-2">
                                            <Button variant="ghost" size="sm" onClick={handleCopyLogs} className="h-6 px-2 text-[10px]">
                                                {logsCopied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />} Copiar Logs
                                            </Button>
                                        </div>
                                        {deepResearch.state.logs.map((log, idx) => (
                                            <div key={idx} className="grid grid-cols-[60px_1fr] gap-2 border-b border-muted/20 pb-2 last:border-0">
                                                <span className="text-muted-foreground uppercase text-[10px]">{log.stage}</span>
                                                <span>{log.input ? (log.input.length > 50 ? log.input.substring(0, 50) + '...' : log.input) : '-'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                         )}
                         
                         {/* Context Debug Toggle */}
                         {lastWebContext && (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowContextDebug((prev) => !prev)}
                                    className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <Globe className="w-3 h-3" />
                                    Debug: Contexto Web ({lastContextSources.length} fontes)
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showContextDebug ? 'rotate-180' : ''}`} />
                                </button>
                                {showContextDebug && (
                                    <div className="mt-2 p-4 rounded-lg bg-muted/30 text-xs border border-muted/50 space-y-3">
                                        <div className="max-h-32 overflow-y-auto space-y-1">
                                            {lastContextSources.map((s, i) => (
                                                <a key={i} href={s.url} target="_blank" className="block hover:underline text-primary truncate">{s.title || s.url}</a>
                                            ))}
                                        </div>
                                        <div className="border-t border-muted/20 pt-2">
                                            <p className="mb-1 font-semibold">Preview Contexto:</p>
                                            <pre className="max-h-32 overflow-y-auto p-2 bg-background rounded border text-[10px]">{lastWebContext.substring(0, 500)}...</pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                         )}
                      </div>
                    </div>
                  )}

                  {/* Spacer for Bottom Input */}
                  <div className="h-32 md:h-40 w-full shrink-0" ref={messagesEndRef} />
                </div>
              </div>

              {/* Fixed Input Container */}
              <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
                {/* Gradient Overlay */}
                <div className="absolute inset-0 -top-20 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none" />
                
                {/* Input Wrapper */}
                <div className="relative max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pb-4 sm:pb-6 pt-4 pointer-events-auto transition-all duration-300" style={{ paddingLeft: 'clamp(12px, 4vw, 24px)', paddingRight: 'clamp(12px, 4vw, 24px)' }}>
                   <ChatInput 
                      onSend={handleSend} 
                      onStop={stop} 
                      isLoading={isLoading}
                      webSearchEnabled={webSearch.isEnabled}
                      onWebSearchToggle={webSearch.setEnabled}
                      categories={settings.webSearch.categories}
                      onToggleCategory={(id, enabled) => {
                        const cat = settings.webSearch.categories.find(c => c.id === id);
                        if (!cat) return;
                        settings.updateCategory({ ...cat, enabled });
                      }}
                    />
                    <div className="text-center mt-2">
                        <p className="text-[10px] text-muted-foreground/60">OllaHub pode cometer erros. Verifique informações importantes.</p>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Mobile Sidebar Overlay */}
      {!isChatsSidebarCollapsed && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity"
            onClick={() => {
              setIsChatsSidebarCollapsed(true);
              chatsSidebarRef.current?.collapse();
            }}
          />
          <div className="fixed left-0 top-0 bottom-0 w-[280px] min-w-[220px] max-w-[85vw] bg-background border-r z-50 md:hidden shadow-xl animate-in slide-in-from-left duration-300 overflow-y-auto">
            <SidebarList 
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSelectSession={(id) => {
                handleSelectSession(id);
                setIsChatsSidebarCollapsed(true);
              }}
              onDeleteSession={deleteSession}
              onNewChat={() => {
                handleNewChat();
                setIsChatsSidebarCollapsed(true);
              }}
            />
          </div>
        </>
      )}

      <ModelDownloadDialog
        open={showDownloadDialog}
        onOpenChange={(open) => {
          setShowDownloadDialog(open);
          // Se fechando, garantir que o Select não mantenha o valor especial
          if (!open && selectedModel === "__add_model__") {
            setSelectedModel("");
          }
        }}
        onSuccess={(modelName) => {
          // Atualizar lista de modelos
          refresh();
          // Selecionar o modelo recém-baixado após um pequeno delay para garantir que a lista foi atualizada
          setTimeout(() => {
            setSelectedModel(modelName);
            settings.setSelectedModel(modelName);
          }, 500);
        }}
      />
    </div>
  );
}

