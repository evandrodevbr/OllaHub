'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Settings, Server, Moon, Sun, PanelLeftClose, PanelLeftOpen, Loader2, ChevronDown, Plus, RefreshCw, Cpu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelSelector } from "@/components/chat/model-selector";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { ReasoningChain } from "@/components/chat/reasoning-chain";
import { TitleBar } from "@/components/titlebar";
 
import { SidebarList } from "@/components/chat/sidebar-list";
import { useChat } from "@/hooks/use-chat";
import { useLocalModels } from "@/hooks/use-local-models";
import { useModelSelection } from "@/hooks/use-model-selection";
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
import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { invoke } from "@tauri-apps/api/core";
import { ImperativePanelHandle } from "react-resizable-panels";
import { ModelDownloadDialog } from "@/components/chat/model-download-dialog";
import { chatLog } from "@/lib/terminal-logger";
import { useQueryPreprocessor, type PreprocessedQuery } from "@/hooks/use-query-preprocessor";
import type { Message, ThinkingMessageMetadata, ThinkingStepType, ThinkingStepStatus } from "@/hooks/use-chat";
import { executeProgressiveSearch } from "@/lib/web-search-fallback";
import type { DebugData } from "@/components/chat/debug-console";
// @ts-expect-error - MD file import
import defaultFormatPrompt from "@/data/prompts/default-format.md";


export default function ChatPage() {
  const router = useRouter();
  const { messages, setMessages, sendMessage, isLoading, stop, clearChat } = useChat();
  const { models, refresh } = useLocalModels();
  const { theme, setTheme } = useTheme();
  const { isSetupCompleted } = useSettingsStore();
  
  const { 
    sessions, 
    currentSessionId, 
    setCurrentSessionId, 
    loadSessionHistory,
    loadMoreMessages,
    paginationState,
    saveSession, 
    deleteSession,
    isGeneratingTitle,
    searchSessions,
    isSearching,
    searchQuery
  } = useChatStorage();

  const { isDownloading, progress } = useAutoLabelingModel();
  const webSearch = useWebSearch();
  const { generateQuery } = useQueryGenerator();
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
  }, [setMessages]);

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
  }, [setMessages]);

  const { selectedModel, setSelectedModel } = useModelSelection();
  
  // Sincronizar eventos de busca com thinking messages
  useEffect(() => {
    if (webSearch.activeQueries.length > 0 || webSearch.activeUrls.length > 0) {
      updateThinkingMessage('web-research', {
        activeQueries: webSearch.activeQueries,
        activeUrls: webSearch.activeUrls,
      });
    }
  }, [webSearch.activeQueries, webSearch.activeUrls, updateThinkingMessage]);
  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);
  
  // Refs para evitar loops e execuções múltiplas
  const hasCheckedIntegrityRef = useRef(false);
  const isRedirectingRef = useRef(false);

  // Guarda de roteamento: verificar se setup foi completado
  useEffect(() => {
    if (!isSetupCompleted && !isRedirectingRef.current) {
      isRedirectingRef.current = true;
      startTransition(() => {
        router.replace("/setup"); // Mudar de push para replace para consistência
      });
    }
  }, [isSetupCompleted, router]);

  // Guarda de integridade: verificar se Ollama está funcional
  // Executa SEMPRE que o componente montar, independente do status do setup
  useEffect(() => {
    if (hasCheckedIntegrityRef.current) return; // Proteção contra múltiplas execuções
    if (isRedirectingRef.current) return; // Evitar redirecionamentos múltiplos
    
    const checkIntegrity = async () => {
      try {
        const isOllamaIntact = await invoke<boolean>('verify_ollama_integrity_command');
        
        if (!isOllamaIntact && !isRedirectingRef.current) {
          isRedirectingRef.current = true;
          // Ollama não está funcional - redirecionar para setup
          console.warn("Integridade do Ollama falhou no chat. Redirecionando para Setup.");
          startTransition(() => {
            router.replace('/setup');
          });
        }
      } catch (e) {
        // Em caso de erro na verificação, redirecionar para setup (fallback seguro)
        if (!isRedirectingRef.current) {
          isRedirectingRef.current = true;
          console.error("Falha ao verificar integridade do Ollama no chat:", e);
          startTransition(() => {
            router.replace('/setup');
          });
        }
      } finally {
        hasCheckedIntegrityRef.current = true; // Marcar como executado
      }
    };

    checkIntegrity();
  }, [router]); // Remover isSetupCompleted das dependências - executar sempre
  // Initialize with default format prompt
  const [systemPrompt] = useState(defaultFormatPrompt || "Você é um assistente útil e prestativo.");
  const [isChatsSidebarCollapsed, setIsChatsSidebarCollapsed] = useState(true); // Iniciar colapsada
  // Removido: thinkingStep e processSteps - agora usando mensagens thinking agrupadas
  const [, setError] = useState<string | Error | null>(null);
  
  const chatsSidebarRef = useRef<ImperativePanelHandle>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedMessagesRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [debugDataMap, setDebugDataMap] = useState<Map<number, DebugData>>(new Map());
  
  // Resetar índice quando busca é limpa ou sessão muda
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchMatchIndex(0);
    }
  }, [searchQuery, currentSessionId]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
        chatLog.error(`Query validation failed: ${preprocessed.validation.errors.join(', ')}`);
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
  }, [settings.queryPreprocessing, webSearch.isEnabled, preprocess]);

  // ========== EXECUÇÃO ESPECULATIVA DE BUSCA ==========
  // Heurística rápida para detectar se a query provavelmente precisa de busca web
  const mightNeedWebSearch = useCallback((text: string): boolean => {
    if (!webSearch.isEnabled) return false;
    
    const lowerText = text.toLowerCase();
    
    // Padrões que indicam alta probabilidade de precisar de busca
    const questionPatterns = /\b(o que|como|quando|onde|quem|porque|por que|qual|quais|quanto|quantos|me explique|me diga|existe|há)\b/i;
    const recentPatterns = /\b(hoje|ontem|esta semana|este mês|este ano|atualmente|recentemente|últimas notícias|novo|novos|última|últimas|2024|2025)\b/i;
    const searchPatterns = /\?$|buscar|pesquisar|encontrar|procurar|descobrir/i;
    
    // Se contém padrões de pergunta ou busca, provavelmente precisa de pesquisa
    if (questionPatterns.test(lowerText) || recentPatterns.test(lowerText) || searchPatterns.test(lowerText)) {
      chatLog.debug('[SpeculativeSearch] Query might need web search (pattern match)');
      return true;
    }
    
    // Se tem mais de 5 palavras e termina com ?, provavelmente é uma pergunta
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 5 && text.trim().endsWith('?')) {
      chatLog.debug('[SpeculativeSearch] Query might need web search (question detected)');
      return true;
    }
    
    return false;
  }, [webSearch.isEnabled]);

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
    
    // ========== EXECUÇÃO ESPECULATIVA ==========
    // Iniciar busca web especulativamente se a query parecer precisar
    // Isso reduz latência sobrepondo busca com pré-processamento
    let speculativeSearchPromise: Promise<ScrapedContent[]> | null = null;
    const shouldSpeculate = mightNeedWebSearch(content);
    
    if (shouldSpeculate) {
      chatLog.info('[SpeculativeSearch] Starting speculative web search in parallel with preprocessing');
      // Iniciar busca sem await - será usada depois se confirmada
      speculativeSearchPromise = webSearch.smartSearchRag(content, settings.webSearch?.maxResults || 5)
        .catch(err => {
          chatLog.debug(`[SpeculativeSearch] Speculative search failed (will use normal flow): ${err}`);
          return [] as ScrapedContent[];
        });
    }
    
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
      const errorMsg = error instanceof Error ? error.message : String(error);
      updateThinkingMessage('preprocessing', {
        status: 'error',
        error: errorMsg,
        duration: Date.now() - preprocessingStart,
      });
      
      // Removido: setProcessSteps - agora usando mensagens thinking agrupadas
      
      // Definir erro global
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setError(errorObj);
      
      chatLog.error(`Preprocessing failed: ${errorObj.message}`);
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
    
    // Generate ID if new session (but don't create card yet - wait for title)
    if (!currentSessionId) {
      const newId = crypto.randomUUID();
      setCurrentSessionId(newId);
      chatLog.info(`New session created: ${newId}`);
    }
    
    // Função auxiliar para executar pesquisa web
    const executeWebResearch = async (
      content: string,
      preprocessed: PreprocessedQuery,
      speculativeResults?: ScrapedContent[] | null
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
      
      // Se temos resultados especulativos, usá-los como seed inicial
      if (speculativeResults && speculativeResults.length > 0) {
        chatLog.info(`[SpeculativeSearch] Using ${speculativeResults.length} speculative results as seed`);
        deepResearch.addToKnowledgeBase('speculative_seed', speculativeResults);
      }
      
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
             const queryStartTime = Date.now();
             chatLog.info(`\n[WebResearch] ========== QUERY ${idx + 1}/${searchPlan.length} ==========`);
             chatLog.info(`[WebResearch] Query: "${query}"`);
             chatLog.info(`[WebResearch] Timestamp: ${new Date().toISOString()}`);
             
             // Atualizar progresso
             updateThinkingMessage('web-research', {
               details: `Buscando consulta ${idx + 1}/${searchPlan.length}: "${query}"...`,
               progress: 10 + (idx * 20 / searchPlan.length),
             });
             
             try {
               // Obter contexto e queries enriquecidas do deep research
               const context = deepResearch.state.context;
               const enrichedQueries = deepResearch.state.enrichedQueries;
               
               if (context) {
                 chatLog.info(`[WebResearch] Using contextual analysis:`, {
                   intent: context.intent,
                   entities: context.entities.length,
                   topics: context.topics.length,
                 });
               }
               
               if (enrichedQueries) {
                 chatLog.info(`[WebResearch] Using enriched queries:`, {
                   literal: enrichedQueries.literal.length,
                   semantic: enrichedQueries.semantic.length,
                   related: enrichedQueries.related.length,
                 });
               }
               
               // Executar busca progressiva com semantic search se disponível
               const fallbackResult = await executeProgressiveSearch(
                 query,
                 async (q, limit, round = 1) => {
                   // Passar round para timeout adaptativo
                   return await webSearch.smartSearchRag(q, limit, round);
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
                   initialTimeout: settings.webSearch.timeout || 10000, // Usar timeout das configurações
                   maxTimeoutPerQuery: 25000, // 25s máximo por query
                   maxTimeoutPerRound: 15000, // 15s máximo por round
                 }
               );
               
               const queryDuration = Date.now() - queryStartTime;
               
               // Log detalhado do resultado
               chatLog.info(`\n[WebResearch] ========== QUERY ${idx + 1} RESULTS ==========`);
               chatLog.info(`[WebResearch] Duration: ${queryDuration}ms`);
               chatLog.info(`[WebResearch] Success: ${fallbackResult.success}`);
               chatLog.info(`[WebResearch] Total results: ${fallbackResult.scrapedSources.length}`);
               chatLog.info(`[WebResearch] Total analyzed: ${fallbackResult.totalResultsAnalyzed}`);
               chatLog.info(`[WebResearch] Attempts: ${fallbackResult.attempts.length}`);
               chatLog.info(`[WebResearch] Used fallback: ${fallbackResult.usedFallback}`);
               
               // Log detalhado de cada tentativa
               fallbackResult.attempts.forEach((attempt, attemptIdx) => {
                 chatLog.info(`\n  Attempt ${attemptIdx + 1}:`);
                 chatLog.info(`    Round: ${attempt.round}`);
                 chatLog.info(`    Strategy: ${attempt.strategy || 'N/A'}`);
                 chatLog.info(`    Query: "${attempt.query}"`);
                 chatLog.info(`    Results: ${attempt.results.length}`);
                 chatLog.info(`    Relevance score: ${attempt.relevanceScore.toFixed(3)}`);
                 chatLog.info(`    Duration: ${attempt.duration}ms`);
               });
               
               // Log detalhado de cada resultado extraído
               if (fallbackResult.scrapedSources.length > 0) {
                 chatLog.info(`\n[WebResearch] Extracted Sources:`);
                 fallbackResult.scrapedSources.forEach((result, resultIdx) => {
                   chatLog.info(`\n  [${resultIdx + 1}] ${result.title}`);
                   chatLog.info(`      URL: ${result.url}`);
                   const contentLength = result.markdown?.length || result.content?.length || 0;
                   const snippetLength = result.snippet?.length || 0;
                   chatLog.info(`      Markdown length: ${contentLength} chars`);
                   chatLog.info(`      Snippet length: ${snippetLength} chars`);
                   chatLog.info(`      Cached: ${result.cached ? 'Yes' : 'No'}`);
                   if (result.markdown) {
                     const preview = result.markdown.substring(0, 200);
                     chatLog.info(`      Preview: ${preview}${contentLength > 200 ? '...' : ''}`);
                   }
                 });
               }
               chatLog.info(`[WebResearch] ============================================\n`);
               
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
            content: entry.content,
            markdown: entry.content,
            snippet: entry.content.substring(0, 200),
            cached: false
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
             chatLog.info('\n[DeepResearch] ========== STEP 3: VALIDATION ==========');
             deepResearch.setStep('aggregating');
             
             // Adicionar mensagem: Processamento
             addThinkingMessage('processing', 'Processando contexto...', 'running');
             const validationStart = Date.now();
             validationReport = await deepResearch.validate(selectedModel, content);
             const validationDuration = Date.now() - validationStart;
             
             chatLog.info(`[DeepResearch] Validation duration: ${validationDuration}ms`);
             chatLog.info(`[DeepResearch] Validation report length: ${validationReport.length} chars`);
             if (validationReport) {
               const preview = validationReport.substring(0, 500);
               chatLog.info(`[DeepResearch] Validation preview: ${preview}${validationReport.length > 500 ? '...' : ''}`);
             }
             
             // Passo 4: Obter contexto curado (usando versão otimizada)
             chatLog.info('\n[DeepResearch] ========== STEP 4: CONTEXT CONDENSATION ==========');
             
             // Calcular tokens disponíveis dinamicamente
             const { getModelContextInfo } = await import('@/lib/model-context');
             const contextInfo = await getModelContextInfo(selectedModel, systemPrompt, messages);
             const availableTokens = contextInfo.recommendedContextWindow;
             
             chatLog.info(`[DeepResearch] Model: ${selectedModel}`);
             chatLog.info(`[DeepResearch] Max context window: ${contextInfo.maxContextWindow} tokens`);
             chatLog.info(`[DeepResearch] Available tokens for KB: ${availableTokens} tokens`);
             
             const condensationStart = Date.now();
             const optimizedResult = deepResearch.getCuratedContextOptimized(content, availableTokens);
             const condensationDuration = Date.now() - condensationStart;
             knowledgeBaseContext = optimizedResult.context;
             
             chatLog.info(`\n[DeepResearch] ========== CONDENSATION SUMMARY ==========`);
             chatLog.info(`[DeepResearch] Duration: ${condensationDuration}ms`);
             chatLog.info(`[DeepResearch] Final context length: ${knowledgeBaseContext.length} chars`);
             chatLog.info(`[DeepResearch] Method: ${optimizedResult.result.method}`);
             chatLog.info(`[DeepResearch] Chunks used: ${optimizedResult.result.chunksUsed} / ${optimizedResult.result.chunksTotal}`);
             chatLog.info(`[DeepResearch] Compression ratio: ${(optimizedResult.result.compressionRatio * 100).toFixed(1)}%`);
             chatLog.info(`[DeepResearch] Original tokens: ${optimizedResult.result.originalTokens}`);
             chatLog.info(`[DeepResearch] Final tokens: ${optimizedResult.result.totalTokens}`);
             
             // Log detalhado por fonte
             if (optimizedResult.result.sources.length > 0) {
               chatLog.info(`[DeepResearch] Chunks per source:`);
               optimizedResult.result.sources.forEach((source, idx) => {
                 chatLog.info(`  [${idx + 1}] ${source.title}: ${source.chunksUsed} chunks`);
                 chatLog.info(`      URL: ${source.url}`);
               });
             }
             
             // Log preview do contexto se não for muito longo
             if (knowledgeBaseContext.length > 0) {
               chatLog.info(`\n[DeepResearch] Context preview:`);
               if (knowledgeBaseContext.length > 2000) {
                 chatLog.info(`${knowledgeBaseContext.substring(0, 2000)}...`);
                 chatLog.info(`[DeepResearch] (truncated, ${knowledgeBaseContext.length} chars total)`);
               } else {
                 chatLog.info(knowledgeBaseContext);
               }
               
               // Validar contexto
               const { validateCondensedContext } = await import('@/lib/knowledge-base-processor');
               const validation = validateCondensedContext(optimizedResult.result, content);
               
               chatLog.info(`\n[DeepResearch] ========== CONTEXT VALIDATION ==========`);
               if (!validation.isValid) {
                 chatLog.error(`[DeepResearch] Validation failed: ${validation.warnings.join(', ')}`);
               } else if (validation.warnings.length > 0) {
                 validation.warnings.forEach(warning => {
                   chatLog.warn(`[DeepResearch] ⚠️ ${warning}`);
                 });
               } else {
                 chatLog.info(`[DeepResearch] ✓ Context validation passed`);
               }
               chatLog.info(`[DeepResearch] ============================================\n`);
             } else {
               chatLog.warn('[DeepResearch] ⚠️ Knowledge Base Context is empty!');
             }
               
             
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
             }
           } else {
             chatLog.info('Simple query returned NO_SEARCH, skipping web search');
           }
        }

      } catch (error) {
        // Tratar erro graciosamente sem quebrar o fluxo
        const errorMsg = error instanceof Error ? error.message : String(error);
        chatLog.warn(`⚠️ Error in Deep Research pipeline (using local model fallback): ${errorMsg}`);
        
        // Atualizar mensagem de processo com aviso (não erro fatal)
        updateThinkingMessage('web-research', {
          status: 'completed', // Marcar como completed mesmo com erro
          details: `Erro na pesquisa web (${errorMsg}). Usando modelo local como fallback.`,
          duration: Date.now() - webResearchStart,
        });
        
        // Garantir que o estado de erro seja registrado para ativar fallback
        // O erro já será detectado pelo hasWebSearchError através do estado do hook
        chatLog.info('Web search error registered - will use local model fallback');
        
        // Não definir erro global - permitir que o fluxo continue
        // O sistema continuará com conhecimento interno (fallback automático)
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
    
    // Aguardar resultado da busca especulativa se ela foi iniciada e shouldSearch é true
    let speculativeResults: ScrapedContent[] | null = null;
    if (speculativeSearchPromise && preprocessed.shouldSearch) {
      chatLog.info('[SpeculativeSearch] Waiting for speculative search results...');
      try {
        speculativeResults = await speculativeSearchPromise;
        chatLog.info(`[SpeculativeSearch] Got ${speculativeResults.length} speculative results`);
      } catch (err) {
        chatLog.debug(`[SpeculativeSearch] Failed to get speculative results: ${err}`);
      }
    } else if (speculativeSearchPromise && !preprocessed.shouldSearch) {
      chatLog.info('[SpeculativeSearch] Discarding speculative search (preprocessing determined search not needed)');
    }
    
    // Executar pesquisa web (usando resultados especulativos como seed se disponíveis)
    const { knowledgeBaseContext, scrapedSources, validationReport } = await executeWebResearch(
      content,
      preprocessed,
      speculativeResults
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
    // Verificar se houve fallback (nenhum resultado relevante encontrado ou erro na pesquisa)
    const usedFallback = knowledgeBaseContext.length === 0 || knowledgeBaseContext.length < 100;
    const hasWebSearchError = webSearch.status === 'error' || webSearch.error !== null;
    
    if (knowledgeBaseContext && knowledgeBaseContext.length > 100) {
       const strictPrompt = DEEP_RESEARCH_PROMPTS.STRICT_GENERATION
         .replace('{{knowledgeBase}}', knowledgeBaseContext)
         .replace('{{validationReport}}', validationReport || 'Nenhuma validação disponível.')
         .replace('{{userQuery}}', content);
         
       enhancedSystemPrompt = strictPrompt;
    } else if (usedFallback || hasWebSearchError) {
      // Fallback: usar prompt sem contexto web, mas informando que não encontrou fontes
      // Isso garante que o modelo local sempre gere uma resposta mesmo sem dados web
      const errorContext = hasWebSearchError && webSearch.error 
        ? `\n**Motivo:** ${webSearch.error}`
        : '';
      
      enhancedSystemPrompt = `${systemPrompt}

## ⚠️ FALLBACK PARA CONHECIMENTO INTERNO

Não foi possível acessar fontes web para esta consulta após múltiplas tentativas de busca.${errorContext}

**INSTRUÇÕES CRÍTICAS:**
- Você DEVE responder usando APENAS seu conhecimento interno (treinamento do modelo)
- Seja transparente: informe que não foi possível acessar fontes web, mas que você responderá com base no seu conhecimento
- Se tiver conhecimento sobre o tópico, compartilhe-o de forma útil e detalhada
- Seja honesto sobre limitações: se não souber algo, diga claramente
- NÃO invente informações ou cite fontes que não foram consultadas
- NÃO mencione "fontes consultadas" ou "pesquisa realizada" - apenas responda com seu conhecimento

**IMPORTANTE:** Este é um fallback legítimo. O usuário espera uma resposta útil mesmo sem dados web. Use seu conhecimento para ajudar da melhor forma possível.

## DATA E HORA ATUAL DO SISTEMA

**DATA/HORA FORMATADA:** ${currentDateTime}
**DATA/HORA NUMÉRICA:** ${currentDateExplicit}
**ISO 8601:** ${currentDateISO}

Use esta data exata para referências temporais quando relevante.`;
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
    } else if (usedFallback || hasWebSearchError) {
      // Quando usar fallback, garantir que o modelo saiba que deve usar conhecimento interno
      finalUserContent = `Pergunta do usuário: ${content}\n\nNota: Não foi possível acessar fontes web para esta consulta. Responda usando seu conhecimento interno de forma útil e detalhada.`;
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
    
<<<<<<< HEAD
    // Capturar dados antes do setMessages para garantir que estão no escopo correto
    const currentScrapedSources = scrapedSources.length > 0 
      ? scrapedSources 
      : deepResearch.state.knowledgeBase.map(entry => ({
          url: entry.sourceUrl,
          title: entry.title,
          content: entry.content,
          markdown: entry.content,
          cached: false,
        }));
    
    // Coletar thinking steps das mensagens (apenas os relacionados a esta query)
    const allThinkingSteps: ThinkingMessageMetadata[] = [];
    const currentMessages = messages; // Capturar referência atual
    currentMessages.forEach((msg, idx) => {
      // Coletar thinking steps das últimas mensagens (relacionadas a esta query)
      if (idx >= currentMessages.length - 10) { // Últimas 10 mensagens
        if (msg.metadata && typeof msg.metadata === 'object' && 'type' in msg.metadata && msg.metadata.type === 'thinking') {
          allThinkingSteps.push(msg.metadata as ThinkingMessageMetadata);
        }
      }
    });
    
    // Coletar sites pesquisados com detalhes completos
    const sitesResearched = currentScrapedSources.map((source, idx) => {
      // Tentar encontrar informações de duração e status dos logs
      const sourceLog = deepResearch.state.logs.find(log => {
        if (!log.parsedOutput || typeof log.parsedOutput !== 'object') return false;
        const parsed = log.parsedOutput as Record<string, unknown>;
        return 'url' in parsed && parsed.url === source.url;
      });
      
      let duration: number | undefined = undefined;
      if (sourceLog?.parsedOutput && typeof sourceLog.parsedOutput === 'object') {
        const parsed = sourceLog.parsedOutput as Record<string, unknown>;
        if ('duration' in parsed && typeof parsed.duration === 'number') {
          duration = parsed.duration;
        }
      }
      
      return {
        url: source.url,
        title: source.title || 'Sem título',
        status: source.cached ? 'cached' : 'scraped',
        source: source.cached ? 'cache' : 'nodriver',
        contentLength: source.content?.length || source.markdown?.length || 0,
        scrapedAt: sourceLog?.timestamp || Date.now(),
        duration: duration,
      };
    });
    
    // Coletar dados de raciocínio dos logs do deep research
    const reasoningSteps = deepResearch.state.logs
      .filter(log => log.stage === 'generation' || log.stage === 'validation')
      .map(log => ({
        stage: log.stage,
        input: log.input,
        output: log.rawOutput || JSON.stringify(log.parsedOutput),
        timestamp: log.timestamp,
      }));
    
    // Estimar token usage (aproximado)
    const estimatedInputTokens = Math.ceil((enhancedSystemPrompt.length + finalUserContent.length) / 4);
    const lastAssistantMsg = currentMessages.find(m => m.role === 'assistant');
    const estimatedOutputTokens = Math.ceil((lastAssistantMsg?.content?.length || 0) / 4);
    
=======
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
    // Construir dados de debug para a última mensagem do assistente
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsgIndex = newMessages.length - 1;
      if (lastMsgIndex >= 0 && newMessages[lastMsgIndex].role === 'assistant') {
        const lastMsg = newMessages[lastMsgIndex];
        const debugData: DebugData = {
          model: selectedModel,
          timestamp: Date.now(),
          latency: Date.now() - responseStart,
          systemPrompt: enhancedSystemPrompt,
          userQuery: content,
<<<<<<< HEAD
          contextUsed: prev.filter(m => m.role !== 'system' && m.role !== 'assistant'),
          webResearch: {
            queries: deepResearch.state.plan || [],
            enrichedQueries: deepResearch.state.enrichedQueries || undefined,
            sources: currentScrapedSources,
            sitesResearched: sitesResearched,
            logs: deepResearch.state.logs || [],
            plan: deepResearch.state.plan || [],
=======
          contextUsed: messages.filter(m => m.role !== 'system'),
          webResearch: {
            queries: deepResearch.state.plan || [],
            enrichedQueries: deepResearch.state.enrichedQueries || undefined,
            sources: scrapedSources,
            logs: deepResearch.state.logs,
            plan: deepResearch.state.plan,
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
            knowledgeBase: deepResearch.state.knowledgeBase.map(entry => ({
              sourceUrl: entry.sourceUrl,
              title: entry.title,
              content: entry.content,
            })),
<<<<<<< HEAD
            activeQueries: webSearch.activeQueries.length > 0 ? webSearch.activeQueries : undefined,
            activeUrls: webSearch.activeUrls.length > 0 ? webSearch.activeUrls : undefined,
          },
          deepResearchState: deepResearch.state,
          thinkingSteps: allThinkingSteps.length > 0 ? allThinkingSteps : undefined,
          reasoning: reasoningSteps.length > 0 ? {
            steps: reasoningSteps.map(r => `${r.stage}: ${r.input.substring(0, 100)}...`),
            intermediateResults: reasoningSteps.map(r => ({
              stage: r.stage,
              output: r.output,
              timestamp: r.timestamp,
            })),
          } : undefined,
          finalResponse: lastMsg.content || '',
          rawResponse: lastMsg.content || '',
          tokenUsage: {
            input: estimatedInputTokens,
            output: estimatedOutputTokens,
            total: estimatedInputTokens + estimatedOutputTokens,
          },
=======
          },
          deepResearchState: deepResearch.state,
          finalResponse: lastMsg.content,
          rawResponse: lastMsg.content,
>>>>>>> 593efd42e091a845dea82ee6646e027bce1e18c5
        };
        
        // Armazenar debug data usando o índice da mensagem
        setDebugDataMap(prevMap => {
          const newMap = new Map(prevMap);
          newMap.set(lastMsgIndex, debugData);
          return newMap;
        });
      }
      return newMessages;
    });
    
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
    
    // Se há busca ativa, encontrar matches e resetar índice
    if (searchQuery && searchQuery.trim().length >= 2) {
      setSearchMatchIndex(0);
      // Os matches serão encontrados quando as mensagens renderizarem
    }
  };
  
  // Handler para scroll infinito reverso (carregar mensagens mais antigas)
  const handleScroll = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (!container || !currentSessionId || paginationState.isLoadingMore) return;
    
    // Verificar se o usuário está próximo do topo (threshold de 100px)
    const isNearTop = container.scrollTop < 100;
    
    if (isNearTop && paginationState.hasMore) {
      // Salvar posição atual do scroll e altura do conteúdo
      const scrollHeightBefore = container.scrollHeight;
      
      // Carregar mais mensagens
      const olderMessages = await loadMoreMessages(currentSessionId);
      
      if (olderMessages.length > 0) {
        // Prepend as mensagens antigas
        setMessages(prev => [...olderMessages, ...prev]);
        
        // Restaurar posição do scroll para manter o contexto visual
        // (compensar o novo conteúdo adicionado no topo)
        requestAnimationFrame(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            const heightDiff = scrollHeightAfter - scrollHeightBefore;
            container.scrollTop = container.scrollTop + heightDiff;
          }
        });
      }
    }
  }, [currentSessionId, paginationState.hasMore, paginationState.isLoadingMore, loadMoreMessages, setMessages]);
  
  // Função para navegar entre matches
  const handleNavigateMatch = useCallback((sessionId: string, direction: 'prev' | 'next') => {
    if (sessionId !== currentSessionId || !searchQuery || searchQuery.trim().length < 2) {
      return;
    }
    
    // Encontrar todos os matches nas mensagens
    const query = searchQuery.trim();
    const matches: Array<{ messageIndex: number; matchIndex: number }> = [];
    
    messages.forEach((msg, msgIdx) => {
      if (msg.role === 'user' || msg.role === 'assistant') {
        const content = msg.content;
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let match;
        let matchIdx = 0;
        while ((match = regex.exec(content)) !== null) {
          matches.push({ messageIndex: msgIdx, matchIndex: matchIdx });
          matchIdx++;
        }
      }
    });
    
    if (matches.length === 0) return;
    
    // Navegar
    setSearchMatchIndex(prev => {
      const newIndex = direction === 'next' 
        ? (prev + 1) % matches.length
        : (prev - 1 + matches.length) % matches.length;
      
      // Scroll para o match após renderização
      setTimeout(() => {
        const messageElement = document.querySelector(`[data-message-index="${matches[newIndex].messageIndex}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Destacar o match atual visualmente
          const marks = messageElement.querySelectorAll('mark');
          if (marks.length > matches[newIndex].matchIndex) {
            marks[matches[newIndex].matchIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          }
        }
      }, 150);
      
      return newIndex;
    });
  }, [currentSessionId, searchQuery, messages]);

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


  return (
    <div className="h-screen w-full bg-background overflow-hidden flex flex-col overflow-x-hidden">
      {/* Custom Title Bar */}
      <TitleBar />
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden pt-8">
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
            onSearch={searchSessions}
            isSearching={isSearching}
            searchQuery={searchQuery}
            onNavigateMatch={handleNavigateMatch}
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
                  <ModelSelector />
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={refresh} title="Atualizar modelos">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages Area with Floating Input Layout */}
            <div className="flex-1 relative h-full overflow-hidden flex flex-col">
              {/* Scrollable Content Area */}
              <div 
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto scroll-smooth w-full min-h-0"
                onScroll={handleScroll}
              >
                <div className="max-w-3xl mx-auto w-full px-3 sm:px-4 md:px-6 pt-4 sm:pt-6 pb-4 transition-all duration-300" style={{ paddingLeft: 'clamp(12px, 4vw, 24px)', paddingRight: 'clamp(12px, 4vw, 24px)' }}>
                  {/* Indicador de carregamento de mensagens antigas */}
                  {paginationState.isLoadingMore && (
                    <div className="flex items-center justify-center py-4 mb-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                      <span className="text-sm text-muted-foreground">Carregando mensagens anteriores...</span>
                    </div>
                  )}
                  
                  {/* Indicador de que há mais mensagens para carregar */}
                  {paginationState.hasMore && !paginationState.isLoadingMore && messages.length > 0 && (
                    <div className="flex items-center justify-center py-2 mb-4">
                      <span className="text-xs text-muted-foreground/60">
                        Role para cima para ver mensagens anteriores ({paginationState.totalCount - messages.length} restantes)
                      </span>
                    </div>
                  )}
                  
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
                          
                          // Pular mensagens de sistema que não são thinking (system prompt)
                          // Essas mensagens nunca devem aparecer no chat
                          const isSystemPrompt = msg.role === 'system' && !isThinkingMessage;
                          if (isSystemPrompt) {
                            continue;
                          }
                          
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
                        
                        // Calcular posições de todos os matches uma vez
                        const allMatches: Array<{ messageIndex: number; matchIndex: number }> = [];
                        if (searchQuery && searchQuery.trim().length >= 2) {
                          const query = searchQuery.trim();
                          const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                          
                          messages.forEach((msg, msgIdx) => {
                            if (msg.role === 'user' || msg.role === 'assistant') {
                              const content = msg.content;
                              let match;
                              let matchIdx = 0;
                              while ((match = regex.exec(content)) !== null) {
                                allMatches.push({ messageIndex: msgIdx, matchIndex: matchIdx });
                                matchIdx++;
                              }
                            }
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
                            // Encontrar índice do match atual para esta mensagem
                            let messageMatchIndex: number | undefined = undefined;
                            
                            if (searchQuery && searchQuery.trim().length >= 2 && allMatches.length > 0 && group.index !== undefined) {
                              // Encontrar matches desta mensagem
                              const messageMatches = allMatches.filter(m => m.messageIndex === group.index);
                              
                              if (messageMatches.length > 0) {
                                // Verificar se o match atual está nesta mensagem
                                const currentMatch = allMatches[searchMatchIndex];
                                if (currentMatch && currentMatch.messageIndex === group.index) {
                                  messageMatchIndex = currentMatch.matchIndex;
                                }
                              }
                            }
                            
                            return (
                              <div key={group.index || idx} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <ChatMessage 
                                  message={group.message} 
                                  isStreaming={group.isStreaming}
                                  highlightTerm={searchQuery && searchQuery.trim().length >= 2 ? searchQuery.trim() : undefined}
                                  highlightIndex={messageMatchIndex}
                                  messageIndex={group.index}
                                  debugData={group.index !== undefined ? debugDataMap.get(group.index) : undefined}
                                />
                              </div>
                            );
                          }
                          return null;
                        });
                      })()}
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
      </div>

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
