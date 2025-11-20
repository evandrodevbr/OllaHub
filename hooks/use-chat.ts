import { useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { removeMetadataNoise } from '@/lib/metadata';
import { useSettingsStore } from '@/store/settings-store';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
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
    
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content }
    ];
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
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Reset raw content buffer for this message
      rawContentRef.current = '';
      
      // Add empty assistant message to start streaming into
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
          try {
            const json = JSON.parse(line);
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
          } catch (e) {
            console.error('Error parsing chunk', e);
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
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Chat error:', error);
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: Failed to get response from Ollama.' }]);
      }
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

