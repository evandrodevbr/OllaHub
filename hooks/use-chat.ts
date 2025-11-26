import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const rawContentRef = useRef<string>(''); // Track raw content including metadata during streaming

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

    abortControllerRef.current = new AbortController();

    try {
      // Função auxiliar para tentar enviar mensagem (usada no retry)
      const attemptSend = async (): Promise<void> => {
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

        // Timeout configurável (padrão 5 minutos)
        const timeoutMs = 5 * 60 * 1000; // 5 minutos
        const timeoutId = setTimeout(() => {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
        }, timeoutMs);

        let response: Response;
        try {
          response = await fetch('http://localhost:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              stream: true,
            }),
            signal: abortControllerRef.current.signal,
          });
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('RequestTimeout');
          }
          if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
            throw new Error('ConnectionError');
          }
          throw fetchError;
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('ModelNotFound');
          }
          if (response.status === 500) {
            throw new Error('ServerError');
          }
          throw new Error(`HTTPError: ${response.status}`);
        }
        if (!response.body) throw new Error('NoResponseBody');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Reset raw content buffer for this message
        rawContentRef.current = '';
        
        // Add empty assistant message to start streaming into
        // Verificar se já existe uma mensagem vazia do assistente (adicionada pelo handleSend)
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.content === '') {
            // Já existe mensagem vazia, não adicionar outra
            return prev;
          }
          // Adicionar mensagem vazia do assistente
          return [...prev, { role: 'assistant', content: '' }];
        });

        let streamFinished = false;
        let metadataProcessed = false;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            streamFinished = true;
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            // Validação básica: verificar se a linha parece ser JSON válido
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.length === 0) {
              continue; // Linha vazia, ignorar
            }
            
            // Verificar se começa com { e termina com } (formato básico de JSON)
            if (!trimmedLine.startsWith('{') || !trimmedLine.endsWith('}')) {
              // Linha parcial ou inválida, ignorar silenciosamente
              // Isso pode acontecer quando o streaming divide JSON em múltiplas chunks
              continue;
            }

            try {
              const json = JSON.parse(trimmedLine);
              if (json.message?.content) {
                // Accumulate raw content (including metadata) in ref
                rawContentRef.current += json.message.content;
                
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last.role === 'assistant') {
                    // For display: strip incomplete metadata tag if present (opening tag but not closed)
                    // This prevents showing "<metadata>..." in the UI while streaming
                    const displayContent = stripMetadataTag(rawContentRef.current);
                    return [
                      ...prev.slice(0, -1),
                      { ...last, content: displayContent }
                    ];
                  }
                  return prev;
                });
              }
              if (json.done) {
                streamFinished = true;
                metadataProcessed = true;
                
                // Process metadata FIRST before setting isLoading to false
                // This prevents race condition with saveSession useEffect
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last.role === 'assistant') {
                    // Parse metadata from raw accumulated content
                    const rawContent = rawContentRef.current;
                    const { content, metadata } = parseMetadata(rawContent);
                    
                    // Fallback: if content is empty after parse but we had content before,
                    // keep the stripped version (without metadata tag) to preserve user-visible text
                    const finalContent = removeMetadataNoise(content || last.content || stripMetadataTag(rawContent));
                    
                    // Clear ref for next message
                    rawContentRef.current = '';
                    
                    return [
                      ...prev.slice(0, -1),
                      { ...last, content: finalContent, metadata }
                    ];
                  }
                  return prev;
                });
                
                // Set loading to false AFTER processing metadata
                setIsLoading(false);
                break; // Exit inner loop when done
              }
            } catch (parseError) {
              // Log apenas em desenvolvimento para debug, não quebrar o fluxo
              if (process.env.NODE_ENV === 'development') {
                const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
                if (!errorMessage.includes('Unexpected end') && !errorMessage.includes('Unexpected token')) {
                  console.warn('Failed to parse JSON chunk:', errorMessage);
                }
              }
              // Continuar processamento mesmo se uma linha falhar
              continue;
            }
          }
        }

        // If stream finished without explicit json.done, process metadata anyway
        if (streamFinished && !metadataProcessed && rawContentRef.current) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
              const rawContent = rawContentRef.current;
              const { content, metadata } = parseMetadata(rawContent);
              const finalContent = removeMetadataNoise(content || last.content || stripMetadataTag(rawContent));
              rawContentRef.current = '';
              
              return [
                ...prev.slice(0, -1),
                { ...last, content: finalContent, metadata }
              ];
            }
            return prev;
          });
          setIsLoading(false);
        } else if (streamFinished && !metadataProcessed) {
          // Stream finished but no content to process, just set loading to false
          setIsLoading(false);
        }
      };

      // Tentar enviar com retry logic
      let lastError: any = null;
      const maxRetries = 2; // Máximo de 2 retries (3 tentativas no total)
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await attemptSend();
          return; // Sucesso, sair do loop
        } catch (error: any) {
          lastError = error;
          
          // Não fazer retry para certos erros
          if (error.message === 'ModelNotFound' || 
              error.message === 'OllamaNotRunning' ||
              error.message === 'ConnectionError' ||
              error.name === 'AbortError' ||
              attempt === maxRetries) { // Última tentativa
            break;
          }
          
          // Aguardar antes de tentar novamente (backoff exponencial)
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            console.log(`Tentativa ${attempt + 1} falhou, tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // Se chegou aqui, todas as tentativas falharam
      throw lastError;
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
  };

  return { messages, setMessages, sendMessage, isLoading, stop, clearChat };
}

