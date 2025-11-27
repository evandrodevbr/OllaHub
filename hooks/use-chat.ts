import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { removeMetadataNoise } from '@/lib/metadata';
import { useSettingsStore } from '@/store/settings-store';

export type ThinkingStepType = 
  | 'preprocessing'
  | 'web-research'
  | 'sources-found'
  | 'processing'
  | 'response-generation'
  | 'fallback'
  | 'error';

export type ThinkingStepStatus = 'running' | 'completed' | 'error';

export interface ThinkingMessageMetadata {
  type: 'thinking';
  stepType: ThinkingStepType;
  status: ThinkingStepStatus;
  label: string;
  progress?: number; // 0-100
  details?: string;
  sources?: Array<{ url: string; title: string }>;
  error?: string;
  timestamp: number;
  duration?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any | ThinkingMessageMetadata;
}

interface ToolCall {
  server_name: string;
  tool_name: string;
  arguments: any;
}

function parseMetadata(fullContent: string): { content: string, metadata?: any } {
  if (!fullContent || fullContent.trim() === '') {
    return { content: fullContent || '' };
  }
  
  // More flexible regex that handles whitespace and line breaks (case-insensitive)
  const metadataRegex = /<metadata>\s*([\s\S]*?)\s*<\/metadata>/gi;
  
  // First, extract all metadata blocks
  const metadataMatches: Array<{ match: string, json: any }> = [];
  let match;
  let lastIndex = 0;
  
  while ((match = metadataRegex.exec(fullContent)) !== null) {
    const metadataStr = match[1].trim();
    try {
      const json = JSON.parse(metadataStr);
      metadataMatches.push({ match: match[0], json });
    } catch (e) {
      // Invalid JSON, just remove the tag
      console.error("Failed to parse metadata JSON", e, "Raw:", metadataStr);
    }
    lastIndex = metadataRegex.lastIndex;
  }
  
  // Remove ALL metadata blocks from content
  let content = fullContent.replace(/<metadata>\s*[\s\S]*?\s*<\/metadata>/gi, '').trim();
  content = removeMetadataNoise(content);
  
  // Also remove common prefixes if they appear at the end of the content
  const prefixes = [
    'Bloco oculto de metadados:',
    'Metadata:',
    'Metadados:',
    'Hidden metadata block:',
    'JSON metadata:',
    '---'
  ];
  
  for (const prefix of prefixes) {
    const regex = new RegExp(`${prefix}\\s*$`, 'i');
    if (regex.test(content)) {
      content = content.replace(regex, '').trim();
    }
  }
  
  // Ensure we don't return empty content if there was content before metadata
  if (!content && fullContent.length > 0) {
    // If all content was metadata, keep nothing (shouldn't happen but safe fallback)
    content = '';
  }
  
  // Return first valid metadata (if any)
  const metadata = metadataMatches.length > 0 ? metadataMatches[0].json : undefined;
  
  return { content, metadata };
}

// Helper to strip metadata in real-time during streaming (for display)
function stripMetadataTag(content: string): string {
  if (!content) return '';
  
  // Common prefixes that models might output before the metadata block
  const prefixes = [
    'Bloco oculto de metadados:',
    'Metadata:',
    'Metadados:',
    'Hidden metadata block:',
    'JSON metadata:',
    '---'
  ];
  
  let cleaned = content;
  
  // Remove any metadata tags (complete or incomplete) for real-time display
  // Case-insensitive regex to catch variations
  cleaned = cleaned.replace(/<metadata>[\s\S]*?$/gi, '').replace(/<metadata>[\s\S]*?<\/metadata>/gi, '').trim();
  
  // Aggressively strip known prefixes if they appear at the very end of the content
  // This helps hide "Bloco oculto de metadados:" while the tag is being generated
  for (const prefix of prefixes) {
    const regex = new RegExp(`${prefix}\\s*$`, 'i');
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim();
    }
  }
  
  return removeMetadataNoise(cleaned);
}

// Helper to detect tool calls in LLM response
export function detectToolCalls(content: string, availableTools: any[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];
  
  // Simple pattern matching for tool calls
  // Pattern: "use tool X with args Y" or "execute X(args)"
  // This is a basic implementation - can be enhanced with better NLP
  
  // Look for common patterns
  const patterns = [
    // Pattern 1: "use [tool_name] with [args]" or "use [tool_name] (args)"
    /(?:use|call|execute|run)\s+([a-z_]+)\s+(?:with|\(|\[)\s*([^\n)]+)/gi,
    // Pattern 2: "[tool_name](args)"
    /([a-z_]+)\s*\(([^)]+)\)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const potentialToolName = match[1].toLowerCase().trim();
      const potentialArgs = match[2]?.trim() || '{}';
      
      // Find matching tool in available tools
      for (const toolInfo of availableTools) {
        if (toolInfo.tool.name.toLowerCase() === potentialToolName) {
          // Try to parse arguments
          let args: any = {};
          try {
            // Try JSON first
            args = JSON.parse(potentialArgs);
          } catch {
            // If not JSON, try to parse key-value pairs
            try {
              // Simple key=value parsing
              const pairs = potentialArgs.split(',').map(p => p.trim());
              args = {};
              for (const pair of pairs) {
                const [key, value] = pair.split('=').map(s => s.trim());
                if (key && value) {
                  args[key] = value.replace(/^["']|["']$/g, '');
                }
              }
            } catch {
              // If all fails, use empty object
              args = {};
            }
          }
          
          toolCalls.push({
            server_name: toolInfo.server_name,
            tool_name: toolInfo.tool.name,
            arguments: args,
          });
          break;
        }
      }
    }
  }
  
  return toolCalls;
}

// Helper to execute a tool call
export async function executeToolCall(toolCall: ToolCall): Promise<string> {
  try {
    const result = await invoke<any>('call_mcp_tool', {
      serverName: toolCall.server_name,
      toolName: toolCall.tool_name,
      arguments: toolCall.arguments,
    });
    
    // Format result for display
    if (typeof result === 'string') {
      return result;
    } else if (result.content) {
      return result.content;
    } else {
      return JSON.stringify(result, null, 2);
    }
  } catch (error) {
    console.error('Tool execution error:', error);
    return `Error executing tool ${toolCall.tool_name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Tipos para eventos Tauri
interface ChatCreatedEvent {
  session_id: string;
  title: string;
  emoji: string;
}

interface ChatTokenEvent {
  session_id: string;
  content: string;
  done: boolean;
}

interface ChatErrorEvent {
  session_id: string;
  error: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rawContentRef = useRef<string>(''); // Track raw content including metadata during streaming
  const currentSessionIdRef = useRef<string | null>(null);
  const lastTokenRef = useRef<string>(''); // Track last token to detect duplicates
  const renderScheduledRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);
  
  // Função para atualizar o estado visual com o conteúdo acumulado
  const flushToState = () => {
    renderScheduledRef.current = false;
    const displayContent = stripMetadataTag(rawContentRef.current);
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: displayContent }];
      }
      return [...prev, { role: 'assistant', content: displayContent }];
    });
  };

  // Agendar flush com requestAnimationFrame (limita a ~60fps)
  const scheduleFlush = () => {
    if (!renderScheduledRef.current) {
      renderScheduledRef.current = true;
      rafIdRef.current = requestAnimationFrame(flushToState);
    }
  };
  
  // Listener para eventos do Rust
  useEffect(() => {
    let unlistenCreated: (() => void) | null = null;
    let unlistenToken: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    
    // Listener para chat-created (título gerado)
    listen<ChatCreatedEvent>('chat-created', (event) => {
      const { session_id, title, emoji } = event.payload;
      currentSessionIdRef.current = session_id;
      // TODO: Atualizar sidebar com novo chat (será implementado no componente de sidebar)
      console.log('Chat criado:', { session_id, title, emoji });
    }).then(unlisten => {
      unlistenCreated = unlisten;
    });
    
    // Listener para chat-token (streaming de tokens)
    listen<ChatTokenEvent>('chat-token', (event) => {
      const { content, done } = event.payload;
      
      if (content && content.length > 0) {
        // Detecção de duplicatas (MANTER LÓGICA ORIGINAL)
        if (content === lastTokenRef.current && rawContentRef.current.endsWith(content)) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Token duplicado detectado, ignorando:', content.substring(0, 30));
          }
          return;
        }
        
        lastTokenRef.current = content;
        rawContentRef.current += content;
        
        // MUDANÇA: Agendar flush em vez de chamar setMessages diretamente
        scheduleFlush();
      }
      
      if (done) {
        // Cancelar qualquer flush pendente
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
          renderScheduledRef.current = false;
        }
        
        // Flush IMEDIATO com processamento de metadata
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const rawContent = rawContentRef.current;
            const { content: finalContent, metadata } = parseMetadata(rawContent);
            rawContentRef.current = '';
            lastTokenRef.current = '';
            return [...prev.slice(0, -1), { ...last, content: finalContent || last.content, metadata }];
          }
          return prev;
        });
        setIsLoading(false);
      }
    }).then(unlisten => {
      unlistenToken = unlisten;
    });
    
    // Listener para chat-error
    listen<ChatErrorEvent>('chat-error', (event) => {
      const { error } = event.payload;
      console.error('Erro no chat:', error);
      setIsLoading(false);
      // TODO: Mostrar erro ao usuário
    }).then(unlisten => {
      unlistenError = unlisten;
    });
    
    // Cleanup
    return () => {
      unlistenCreated?.();
      unlistenToken?.();
      unlistenError?.();
      // Cancelar RAF pendente
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const sendMessage = async (
    content: string,
    model: string,
    systemPrompt?: string,
    options?: {
      onBeforeModelRequest?: (pendingMessages: Message[]) => Promise<void>;
      // Quando presente, substitui SOMENTE o conteúdo da última mensagem do usuário
      // no payload enviado ao LLM, mantendo a UI com o conteúdo original.
      payloadContentOverride?: string;
    }
  ) => {
    setIsLoading(true);
    
    // Verificar se a última mensagem já é do usuário (para evitar duplicação)
    // Se for, usar as mensagens existentes; caso contrário, adicionar nova mensagem do usuário
    const lastMessage = messages[messages.length - 1];
    const newMessages: Message[] = lastMessage?.role === 'user' && lastMessage?.content === content
      ? [...messages] // Já existe, não adicionar novamente
      : [...messages, { role: 'user', content }]; // Adicionar nova mensagem do usuário
    
    setMessages(newMessages);

    // Prepare messages for API (include system prompt if present)
    // Strip metadata from previous messages before sending to context to save tokens?
    // Or keep it? The model might benefit from seeing previous metadata.
    // Let's keep it for now, but we need to make sure we send what the API expects.
    // Ollama API expects { role, content }. It ignores extra fields usually, but let's be safe.
    if (options?.onBeforeModelRequest) {
      await options.onBeforeModelRequest(newMessages);
    }

    // Aplicar janela deslizante para limitar contexto
    const settings = useSettingsStore.getState();
    const maxTokens = settings.contextWindow || 4096;
    const maxMessages = 10; // Máximo de mensagens a manter
    
    // Estimar tokens (aproximação: 1 token ≈ 4 caracteres)
    function estimateTokens(text: string): number {
      return Math.ceil(text.length / 4);
    }
    
    // Aplicar janela deslizante: manter últimas N mensagens que cabem no limite de tokens
    let truncatedMessages = [...newMessages];
    let totalTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    
    // Sempre manter a última mensagem do usuário
    const lastUserMessage = truncatedMessages[truncatedMessages.length - 1];
    truncatedMessages = truncatedMessages.slice(0, -1);
    
    // Adicionar mensagens de trás para frente até atingir o limite
    const selectedMessages: Message[] = [];
    for (let i = truncatedMessages.length - 1; i >= 0; i--) {
      const msg = truncatedMessages[i];
      const msgTokens = estimateTokens(msg.content);
      
      // Limitar por número de mensagens E por tokens
      if (selectedMessages.length >= maxMessages - 1) break; // -1 porque vamos adicionar a última depois
      if (totalTokens + msgTokens > maxTokens * 0.9) break; // 90% do limite para margem de segurança
      
      selectedMessages.unshift(msg);
      totalTokens += msgTokens;
    }
    
    // Adicionar a última mensagem do usuário
    selectedMessages.push(lastUserMessage);
    totalTokens += estimateTokens(lastUserMessage.content);

    // Constrói mensagens para payload, aplicando override apenas à última mensagem do usuário
    const baseMessages = systemPrompt 
      ? [{ role: 'system', content: systemPrompt }, ...selectedMessages]
      : selectedMessages;

    const apiMessages = baseMessages.map((m, idx) => {
      // Detecta última mensagem do usuário
      const isLastUser = m.role === 'user' && idx === baseMessages.length - 1;
      const payloadContent = isLastUser && options?.payloadContentOverride
        ? options.payloadContentOverride
        : m.content;
      return {
        role: m.role,
        content: payloadContent,
      };
    });

    // [DEBUG INJECTION START]
    const systemMsg = apiMessages.find(m => m.role === 'system');
    console.group('📦 Debug: Ollama Payload');
    console.log('1. Total Messages:', apiMessages.length);
    console.log('2. Has System Message?', !!systemMsg);
    if (systemMsg) {
      console.log('3. System Message Length:', systemMsg.content.length);
      console.log('4. System Content Preview:', systemMsg.content.substring(0, 300) + '...');
      console.log('5. Web Context Present in Payload?', systemMsg.content.includes('CONTEXTO WEB RECUPERADO'));
      if (systemMsg.content.includes('CONTEXTO WEB RECUPERADO')) {
        const contextStart = systemMsg.content.indexOf('CONTEXTO WEB RECUPERADO');
        console.log('6. Web Context Position in Payload:', contextStart);
        console.log('7. Web Context Preview in Payload:', systemMsg.content.substring(contextStart, contextStart + 200) + '...');
      }
    } else {
      console.error('❌ CRITICAL: System Message is MISSING in payload!');
      console.log('Available roles:', apiMessages.map(m => m.role));
    }
    console.groupEnd();
    // [DEBUG INJECTION END]

    // Reset raw content buffer for this message
    rawContentRef.current = '';
    lastTokenRef.current = ''; // Reset last token tracker
    
    // Add empty assistant message to start streaming into
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.content === '') {
        // Já existe mensagem vazia, não adicionar outra
        return prev;
      }
      // Adicionar mensagem vazia do assistente
      return [...prev, { role: 'assistant', content: '' }];
    });

    try {
      // Verificar se Ollama está rodando antes de fazer requisição
      try {
        const isRunning = await invoke<boolean>('check_ollama_running');
        if (!isRunning) {
          throw new Error('OllamaNotRunning');
        }
      } catch (checkError: any) {
        if (checkError.message === 'OllamaNotRunning') {
          throw checkError;
        }
        console.warn('Erro ao verificar status do Ollama:', checkError);
        // Continuar mesmo se a verificação falhar
      }

      // Chamar comando Rust para streaming
      await invoke('chat_stream', {
        sessionId: currentSessionIdRef.current || null,
        messages: apiMessages,
        model,
        systemPrompt: systemPrompt || null,
        enableRag: false, // TODO: Implementar RAG depois
      });
      
      // O streaming será processado pelos listeners de eventos
      // Não precisamos fazer mais nada aqui, os eventos cuidam do resto
    } catch (error: any) {
      console.error('Chat error:', error);
      
      let errorMessage = 'Erro ao obter resposta do Ollama.';
      
      if (error.name === 'AbortError' || error.message === 'RequestTimeout') {
        errorMessage = '**Timeout:** A requisição demorou muito para responder. Tente novamente ou use um modelo menor.';
      } else if (error.message === 'OllamaNotRunning') {
        errorMessage = '**Erro:** Ollama não está rodando. Por favor, inicie o Ollama e tente novamente.\n\nVocê pode verificar o status do Ollama na página inicial do aplicativo.';
      } else if (error.message === 'ConnectionError' || error.message?.includes('Failed to fetch')) {
        errorMessage = '**Erro de Conexão:** Não foi possível conectar ao Ollama. Verifique se o Ollama está rodando em `http://localhost:11434`.';
      } else if (error.message === 'ModelNotFound') {
        errorMessage = `**Modelo Não Encontrado:** O modelo "${model}" não está instalado. Por favor, baixe o modelo primeiro na página de configuração.`;
      } else if (error.message === 'ServerError') {
        errorMessage = '**Erro do Servidor:** O Ollama retornou um erro interno. Verifique os logs do Ollama para mais detalhes.';
      } else if (error.message === 'NoResponseBody') {
        errorMessage = '**Erro:** O Ollama não retornou uma resposta válida. Tente novamente.';
      } else if (error.message?.includes('HTTPError')) {
        const statusMatch = error.message.match(/HTTPError: (\d+)/);
        const status = statusMatch ? statusMatch[1] : 'desconhecido';
        errorMessage = `**Erro HTTP ${status}:** O Ollama retornou um erro. Verifique se o modelo está instalado e tente novamente.`;
      } else {
        // Erro genérico com mais contexto
        const errorDetails = error.message || error.toString();
        errorMessage = `**Erro:** Falha ao obter resposta do Ollama.\n\nDetalhes: ${errorDetails}`;
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    rawContentRef.current = '';
    lastTokenRef.current = '';
  };

  return { messages, setMessages, sendMessage, isLoading, stop, clearChat };
}

