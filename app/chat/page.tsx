'use client';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquare, Settings, Server, Moon, Sun, PanelLeftClose, PanelLeftOpen, Loader2, ChevronDown } from "lucide-react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
 
import { SidebarList } from "@/components/chat/sidebar-list";
import { useChat } from "@/hooks/use-chat";
import { useLocalModels } from "@/hooks/use-local-models";
import { useChatStorage } from "@/hooks/use-chat-storage";
import { useAutoLabelingModel } from "@/hooks/use-auto-labeling-model";
import { useWebSearch } from "@/hooks/use-web-search";
import { SearchProgress } from "@/components/chat/search-progress";
import { ThinkingIndicator, ThinkingStep } from "@/components/chat/thinking-indicator";
import { useQueryGenerator } from "@/hooks/use-query-generator";
import { useSettingsStore } from "@/store/settings-store";
import type { ScrapedContent } from "@/services/webSearch";
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { ImperativePanelHandle } from "react-resizable-panels";
import { sanitizeWebSources } from "@/lib/sanitize-web-content";
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
  const settings = useSettingsStore();
  
  const [selectedModel, setSelectedModel] = useState("");
  const [mounted, setMounted] = useState(false);
  const initializedRef = useRef(false);
  // Initialize with default format prompt
  const [systemPrompt, setSystemPrompt] = useState(defaultFormatPrompt || "Você é um assistente útil e prestativo.");
  const [isChatsSidebarCollapsed, setIsChatsSidebarCollapsed] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<ThinkingStep | null>(null);
  
  const chatsSidebarRef = useRef<ImperativePanelHandle>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedMessagesRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showContextDebug, setShowContextDebug] = useState(false);
  const [lastWebContext, setLastWebContext] = useState('');
  const [lastContextSources, setLastContextSources] = useState<ScrapedContent[]>([]);

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


  const handleSend = async (content: string) => {
    if (!selectedModel) return;
    setShowContextDebug(false);
    setLastWebContext('');
    setLastContextSources([]);
    
    // Generate ID if new session (but don't create card yet - wait for title)
    if (!currentSessionId) {
      const newId = crypto.randomUUID();
      setCurrentSessionId(newId);
      // Card will be created after title is generated (after first AI response)
    }
    
    // ========== LÓGICA DE AGENTE DE PESQUISA ==========
    let webContext = '';
    let searchQuery = '';
    let scrapedSources: ScrapedContent[] = [];
    
    // Iniciar indicador de pensamento
    setThinkingStep('analyzing');
    
    if (webSearch.isEnabled) {
      try {
        webSearch.reset(); // Resetar estado anterior
        
        // Passo 1: Gerar query otimizada
        setThinkingStep('analyzing');
        searchQuery = await generateQuery(content, selectedModel);
        
        // Passo 2: Se precisar de busca, executar
        if (searchQuery && searchQuery !== 'NO_SEARCH') {
          setThinkingStep('searching');
          // Pipeline em duas etapas: metadados → scraping de top URLs
          const maxResults = settings.webSearch.maxResults;
          scrapedSources = await webSearch.smartSearchRag(searchQuery, maxResults);
          
          // Atualizar indicador enquanto lê fontes
          setThinkingStep('reading');
          
          if (scrapedSources.length > 0) {
            // Sanitizar e combinar markdown de todas as fontes
            // Priorizamos o markdown completo (não apenas snippets) para garantir densidade de informação
            // O scraper Rust já filtra conteúdo muito curto (< 200 chars) automaticamente
            // Sanitização previne prompt injection e limita tamanho
            webContext = sanitizeWebSources(scrapedSources, {
              maxLength: 8000, // ~8k chars por fonte (ajustável)
              removeControlChars: true,
              removeHiddenText: true,
            });
            
            // [DEBUG INJECTION START]
            console.group('🔍 Debug: Web Context Generation');
            console.log('1. Raw Sources Count:', scrapedSources.length);
            console.log('2. Web Context Length:', webContext.length);
            console.log('3. Is Context Empty?', webContext === '');
            if (webContext.length > 0) {
              console.log('4. Context Preview:', webContext.substring(0, 200) + '...');
            } else {
              console.warn('⚠️ ALERT: Web Context is EMPTY even with sources!');
              console.log('4. Sources Details:', scrapedSources.map(s => ({
                url: s.url,
                title: s.title,
                hasMarkdown: !!s.markdown,
                markdownLength: s.markdown?.length || 0
              })));
            }
            console.groupEnd();
            // [DEBUG INJECTION END]
            
            // Log para debug: verificar tamanho do contexto gerado
            const contextLength = webContext.length;
            console.debug(`Contexto web gerado (sanitizado): ${contextLength} caracteres de ${scrapedSources.length} fontes`);
            setLastWebContext(webContext);
            setLastContextSources(scrapedSources);
            setShowContextDebug(false);
          }
        } else {
          setLastWebContext('');
          setLastContextSources([]);
        }
      } catch (error) {
        console.error('Erro na pesquisa web:', error);
        // Continuar mesmo se a pesquisa falhar
      }
    }
    
    // Passo 3: Formular resposta
    setThinkingStep('formulating');
    
    // ========== MONTAR SYSTEM PROMPT COM CONTEXTO TEMPORAL ==========
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
    
    // Adicionar contexto temporal e web
    if (webContext) {
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
${webContext}

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
    
    // [DEBUG INJECTION START]
    console.log('5. Enhanced System Prompt Length:', enhancedSystemPrompt.length);
    console.log('6. Contains "CONTEXTO WEB"?', enhancedSystemPrompt.includes('CONTEXTO WEB RECUPERADO'));
    if (enhancedSystemPrompt.includes('CONTEXTO WEB RECUPERADO')) {
      const contextStart = enhancedSystemPrompt.indexOf('CONTEXTO WEB RECUPERADO');
      console.log('7. Web Context Position:', contextStart);
      console.log('8. Web Context in Prompt Preview:', enhancedSystemPrompt.substring(contextStart, contextStart + 300) + '...');
    }
    // [DEBUG INJECTION END]
    
    let finalUserContent = content;
    if (webContext) {
      finalUserContent = `[CONTEXTO WEB OBRIGATÓRIO]\n${webContext}\n[/CONTEXTO WEB]\n\nCom base EXCLUSIVAMENTE no texto acima, responda: ${content}`;
    }
    
    // Enviar o conteúdo original para UI, mas com override no payload para incluir contexto
    await sendMessage(content, selectedModel, enhancedSystemPrompt, {
      payloadContentOverride: finalUserContent,
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
    
    // Marcar como completo quando começar a streamar
    setTimeout(() => setThinkingStep('complete'), 100);
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
        panel.expand();
      } else {
        panel.collapse();
      }
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
          className="border-r flex flex-col items-center py-4 gap-4 bg-muted/20 w-[60px]"
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

        <ResizableHandle />

        {/* Sessions List */}
        <ResizablePanel 
          ref={chatsSidebarRef}
          defaultSize={15} 
          minSize={10} 
          maxSize={25} 
          collapsible={true}
          collapsedSize={0}
          onCollapse={() => setIsChatsSidebarCollapsed(true)}
          onExpand={() => setIsChatsSidebarCollapsed(false)}
          className="min-w-[200px]"
        >
          <SidebarList 
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onDeleteSession={deleteSession}
            onNewChat={handleNewChat}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Main Chat Area */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="h-14 border-b flex items-center px-4 justify-between bg-background/50 backdrop-blur gap-4">
              <div className="flex items-center gap-2">
                {isChatsSidebarCollapsed ? (
                  <Button variant="ghost" size="icon" onClick={toggleChatsSidebar} className="h-8 w-8">
                    <PanelLeftOpen className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" onClick={toggleChatsSidebar} className="h-8 w-8 text-muted-foreground">
                    <PanelLeftClose className="w-4 h-4" />
                  </Button>
                )}
                <div className="font-semibold flex items-center gap-2">
                  Chat
                  {isGeneratingTitle && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {isDownloading && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {progress}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 max-w-[420px] flex items-center gap-2">
                <div className="flex-1">
                  <Select value={selectedModel} onValueChange={(v) => { setSelectedModel(v); settings.setSelectedModel(v); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione um modelo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(m => (
                        <SelectItem key={m.name} value={m.name}>
                          <span className="flex items-center justify-between w-full">
                            <span className="truncate">{m.name}</span>
                            <span className="ml-3 text-xs text-muted-foreground">{m.size}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={refresh} title="Atualizar modelos">
                  <Loader2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scroll-smooth">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                  <div className="p-4 rounded-full bg-muted/50">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <p>Inicie uma conversa com {selectedModel}</p>
                </div>
              ) : (
                <div className="flex flex-col pb-4 max-w-3xl mx-auto w-full space-y-6">
                  {messages.map((msg, i) => {
                    // Verificar fontes nos metadados (preferencial)
                    const msgSources = msg.metadata?.sources || [];
                    const hasWebSources = msgSources.length > 0;
                    
                    // Verificar se devemos mostrar o progresso em tempo real
                    // Apenas para a interação atual (quando isLoading é true ou acabou de terminar)
                    const isCurrentInteraction = i === messages.length - (isLoading ? 2 : 1) || i === messages.length - 1;
                    const showRealtimeProgress = 
                      msg.role === 'user' &&
                      isCurrentInteraction &&
                      (webSearch.status === 'searching' || 
                       webSearch.status === 'scraping' || 
                       webSearch.status === 'completed' || 
                       webSearch.status === 'error') &&
                       webSearch.currentQuery; // Só mostra se tiver query

                    return (
                      <div key={i}>
                        <ChatMessage message={msg} />
                        {(msg.role === 'user') && showRealtimeProgress && (
                            <SearchProgress
                              status={webSearch.status}
                              query={webSearch.currentQuery}
                              sources={webSearch.scrapedSources}
                              error={webSearch.error}
                            />
                        )}
                        {/* Mostrar fontes após resposta do assistente que usou web search */}
                        {msg.role === 'assistant' && hasWebSources && (
                          <div className="px-6 pb-4">
                            <div className="pt-2 border-t border-muted">
                              <p className="text-xs font-medium text-muted-foreground mb-2">
                                Fontes consultadas:
                              </p>
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                                {msgSources.map((source: ScrapedContent, idx: number) => (
                                  <a
                                    key={idx}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors border border-muted text-xs max-w-[200px]"
                                  >
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${new URL(source.url).hostname}&sz=16`}
                                      alt=""
                                      className="w-4 h-4 rounded"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                    <span className="truncate font-medium">
                                      {source.title || `Fonte ${idx + 1}`}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {isLoading && thinkingStep === 'complete' && (
                    <div className="px-6 py-4 text-xs text-muted-foreground animate-pulse">
                      Gerando resposta...
                    </div>
                  )}
                </div>
              )}
              {/* Elemento invisível para scroll automático */}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Thinking Indicator - aparece apenas quando não há web search ativo */}
            {thinkingStep && thinkingStep !== 'complete' && (webSearch.status === 'idle') && (
              <ThinkingIndicator
                currentStep={thinkingStep}
                searchQuery={webSearch.currentQuery}
                sourcesRead={webSearch.scrapedSources.length}
                totalSources={settings.webSearch.maxResults}
              />
            )}

            {/* Raw Context Debug */}
            {lastContextSources.length > 0 && (
              <div className="border-t border-muted px-6 py-4 bg-muted/40 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowContextDebug((prev) => !prev)}
                  className="w-full flex items-center justify-between text-left text-sm font-medium"
                >
                  <span>Ver contexto extraído (debug)</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showContextDebug ? 'rotate-180' : ''}`}
                  />
                </button>
                {showContextDebug && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Fontes utilizadas ({lastContextSources.length}):
                      </p>
                      <div className="space-y-1 max-h-32 overflow-auto pr-2">
                        {lastContextSources.map((source, idx) => (
                          <a
                            key={`${source.url}-${idx}`}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-primary hover:underline truncate"
                          >
                            {source.title || source.url}
                          </a>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        Bloco enviado na mensagem do usuário:
                      </p>
                      <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap bg-background border border-muted rounded-lg p-3 max-h-64 overflow-auto">
                        {lastWebContext.trim().length > 0 ? lastWebContext : '[Contexto vazio após sanitização]'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
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
          </div>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
}
