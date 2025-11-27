import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Message } from './use-chat';
import { removeMetadataNoise } from '@/lib/metadata';

export interface SessionSummary {
  id: string;
  title: string;
  emoji: string;
  updated_at: string;
  preview: string;
  platform: string;
  match_count?: number;
}

const TITLE_MODEL = "qwen2.5:0.5b";

// Helper to generate fallback title from user's first message
function getFallbackTitleFromMessages(messages: Message[]): string {
  // Find the first user message
  const firstUserMessage = messages.find(msg => msg.role === 'user');
  
  if (firstUserMessage && firstUserMessage.content) {
    // Clean the content (remove metadata tags if any)
    let content = firstUserMessage.content.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '').trim();
    
    // Truncate to 50 characters
    if (content.length > 50) {
      content = content.substring(0, 50).trim() + '...';
    }
    
    return content || "Nova Conversa";
  }
  
  return "Nova Conversa";
}

export function useChatStorage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const list = await invoke<SessionSummary[]>('load_chat_sessions');
      setSessions(list);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, []);
  
  const searchSessions = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      // Se query muito curta, carregar todas as sessões
      await loadSessions();
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await invoke<SessionSummary[]>('search_chat_sessions', {
        query: query.trim(),
        limit: 50
      });
      setSessions(results);
    } catch (error) {
      console.error("Failed to search sessions:", error);
      // Em caso de erro, carregar todas as sessões
      await loadSessions();
    } finally {
      setIsSearching(false);
    }
  }, [loadSessions]);

  const loadSessionHistory = useCallback(async (id: string): Promise<Message[]> => {
    try {
      const rawMessages = await invoke<any[]>('load_chat_history', { id });
      // Convert role from String to type-safe union and ensure proper types
      return rawMessages.map(msg => ({
        role: (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') 
          ? msg.role as 'user' | 'assistant' | 'system'
          : 'user' as const, // fallback
        content: msg.content || '',
        metadata: msg.metadata || undefined
      }));
    } catch (error) {
      console.error("Failed to load history:", error);
      return [];
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await invoke('delete_chat_session', { id });
      await loadSessions();
      if (currentSessionId === id) {
        setCurrentSessionId(null);
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  }, [currentSessionId, loadSessions]);

  const generateTitleFromUserMessage = async (userMessage: string): Promise<string> => {
    // Generate title immediately from user's first message
    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: TITLE_MODEL,
          messages: [
            { role: 'system', content: 'Generate a short title (3-5 words) for a chat conversation based on this user message. Output ONLY the title, no explanation.' },
            { role: 'user', content: userMessage }
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        // If model not available, use fallback
        if (response.status === 404 || response.status >= 500) {
          throw new Error(`Model ${TITLE_MODEL} not available (status: ${response.status})`);
        }
        throw new Error(`Title generation failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      let title = data.message?.content?.trim() || "";
      
      // If empty from start, use fallback
      if (!title || title.length === 0) {
        throw new Error("Empty title returned from model");
      }
      
      // Remove quotes if present (both single and double)
      title = title.replace(/^["']+|["']+$/g, '').trim();
      
      // Remove any metadata tags that might have leaked through
      title = title.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '').trim();
      
      // Check if title is empty or contains only whitespace/punctuation
      if (!title || title.length === 0 || /^[\s\W]*$/.test(title)) {
        throw new Error("Title became empty or invalid after cleaning");
      }
      
      // Limit title length to reasonable size (max 60 chars for safety)
      if (title.length > 60) {
        title = title.substring(0, 60).trim() + '...';
      }
      
      return title;
    } catch (error) {
      console.error("Title generation failed:", error);
      // Use user message as fallback (truncated)
      let fallback = userMessage.trim();
      if (fallback.length > 50) {
        fallback = fallback.substring(0, 50).trim() + '...';
      }
      return fallback || "Nova Conversa";
    }
  };

  const generateTitle = async (messages: Message[]): Promise<string> => {
    // Only generate if we have enough context (e.g., 2 messages: user + assistant)
    // and use a lightweight model
    try {
      const sanitizedMessages = messages.slice(0, 4).map(m => ({
        ...m,
        content: removeMetadataNoise(m.content),
      }));

      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: TITLE_MODEL,
          messages: [
            { role: 'system', content: 'Summarize the following conversation in 3 to 5 words representing a short title. Output ONLY the title, sem metadados.' },
            ...sanitizedMessages
          ],
          stream: false,
        }),
      });

      if (!response.ok) {
        // If model not found or unavailable, throw to trigger fallback
        if (response.status === 404 || response.status >= 500) {
          throw new Error(`Model ${TITLE_MODEL} not available (status: ${response.status})`);
        }
        // For other errors, use fallback
        throw new Error(`Title generation failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      let title = removeMetadataNoise(data.message?.content?.trim() || "");
      
      // If empty from start, throw to trigger fallback
      if (!title || title.length === 0) {
        throw new Error("Empty title returned from model");
      }
      
      // Remove quotes if present (both single and double)
      title = title.replace(/^["']+|["']+$/g, '').trim();
      
      // Remove any metadata tags that might have leaked through
      title = removeMetadataNoise(title);
      
      // Check if title is empty or contains only whitespace/punctuation
      if (!title || title.length === 0 || /^[\s\W]*$/.test(title)) {
        throw new Error("Title became empty or invalid after cleaning");
      }
      
      // Limit title length to reasonable size (max 60 chars for safety)
      if (title.length > 60) {
        title = title.substring(0, 60).trim() + '...';
      }
      
      return title;
    } catch (error) {
      console.error("Title generation failed:", error);
      // Don't return "Nova Conversa" here - let the caller use the fallback
      throw error;
    }
  };

  const saveSession = useCallback(async (id: string, messages: Message[], currentTitle?: string) => {
    if (messages.length === 0) return;

    // Check if session already exists and has a valid title
    const existingSession = sessions.find(s => s.id === id);
    const existingTitle = existingSession?.title;
    
    // If session already exists with a valid title, always update it
    if (existingSession && existingTitle && existingTitle !== "Nova Conversa") {
      const title = currentTitle || existingTitle;
      
      // Extract memory context from metadata keywords
      const memoryContext: string[] = [];
      messages.forEach(msg => {
        if (msg.role === 'assistant' && msg.metadata?.keywords) {
          const keywords = Array.isArray(msg.metadata.keywords) 
            ? msg.metadata.keywords 
            : [];
          memoryContext.push(...keywords.filter(k => typeof k === 'string'));
        }
      });
      const uniqueMemoryContext = Array.from(new Set(memoryContext));

      const platform = typeof navigator !== 'undefined' 
        ? navigator.platform || navigator.userAgent.split(' ')[0] || 'Unknown'
        : 'Unknown';

      try {
        await invoke('save_chat_session', { 
          id, 
          title, 
          messages,
          platform: platform,
          memory_context: uniqueMemoryContext
        });
        await loadSessions();
      } catch (error) {
        console.error("Failed to save session:", error);
      }
      return;
    }

    // For new sessions, only save after title is generated
    // Check if we have at least user + assistant (first complete response)
    if (messages.length < 2) {
      // Don't save yet - wait for first AI response
      return;
    }

    let title: string | null = currentTitle || null;
    let shouldGenerateTitle = !currentTitle;

    // Check for metadata title in assistant messages (prioritize title over summary)
    if (shouldGenerateTitle) {
      for (const msg of messages) {
        if (msg.role === 'assistant' && msg.metadata) {
          // Prioritize title, fallback to summary
          if (msg.metadata.title) {
            const titleStr = msg.metadata.title.trim();
            if (titleStr && titleStr !== "") {
              title = titleStr;
              shouldGenerateTitle = false;
              break;
            }
          } else if (msg.metadata.summary) {
            const summary = msg.metadata.summary.trim();
            if (summary && summary !== "") {
              title = summary;
              shouldGenerateTitle = false;
              break;
            }
          }
        }
      }
    }

    // Extract memory context from metadata keywords
    const memoryContext: string[] = [];
    messages.forEach(msg => {
      if (msg.role === 'assistant' && msg.metadata?.keywords) {
        const keywords = Array.isArray(msg.metadata.keywords) 
          ? msg.metadata.keywords 
          : [];
        memoryContext.push(...keywords.filter(k => typeof k === 'string'));
      }
    });
    // Deduplicate
    const uniqueMemoryContext = Array.from(new Set(memoryContext));

    // Detect platform
    const platform = typeof navigator !== 'undefined' 
      ? navigator.platform || navigator.userAgent.split(' ')[0] || 'Unknown'
      : 'Unknown';

    // If we have title from metadata, save immediately
    if (title && !shouldGenerateTitle) {
      try {
        await invoke('save_chat_session', { 
          id, 
          title, 
          messages,
          platform: platform,
          memory_context: uniqueMemoryContext
        });
        await loadSessions();
      } catch (error) {
        console.error("Failed to save session:", error);
      }
      return;
    }

    // Auto-generate title using separate model - only create card when title is ready
    if (shouldGenerateTitle && !isGeneratingTitle) {
      setIsGeneratingTitle(true);
      generateTitle(messages)
        .then(async (newTitle) => {
          setIsGeneratingTitle(false);
          // Now create the card with the generated title
          try {
            await invoke('save_chat_session', { 
              id, 
              title: newTitle, 
              messages,
              platform: platform,
              memory_context: uniqueMemoryContext
            });
            await loadSessions();
          } catch (e) {
            console.error("Failed to save session with generated title:", e);
            setIsGeneratingTitle(false);
          }
        })
        .catch((error) => {
          setIsGeneratingTitle(false);
          // On error, use fallback title from user's first message
          // Only log if it's not an expected error (empty title, model unavailable)
          const isExpectedError = error.message?.includes("Empty title") || 
                                  error.message?.includes("not available") ||
                                  error.message?.includes("invalid after cleaning");
          
          if (!isExpectedError) {
            console.error("Title generation error:", error);
          } else {
            console.log(`Title generation failed (expected): ${error.message}`);
          }
          
          const fallbackTitle = getFallbackTitleFromMessages(messages);
          console.log(`Using fallback title from user message: "${fallbackTitle}"`);
          
          invoke('save_chat_session', {
            id,
            title: fallbackTitle,
            messages,
            platform: platform,
            memory_context: uniqueMemoryContext
          }).then(() => loadSessions()).catch(e => console.error("Failed to save session with fallback:", e));
        });
    }
  }, [loadSessions, isGeneratingTitle, sessions, generateTitle]);

  // Initial load
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loadSessions,
    loadSessionHistory,
    saveSession,
    deleteSession,
    isGeneratingTitle,
    setIsGeneratingTitle,
    generateTitleFromUserMessage,
    searchSessions,
    searchQuery,
    setSearchQuery,
    isSearching
  };
}

