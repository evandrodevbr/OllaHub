import { useState, useRef } from 'react';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string, model: string, systemPrompt?: string) => {
    setIsLoading(true);
    
    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content }
    ];
    setMessages(newMessages);

    // Prepare messages for API (include system prompt if present)
    const apiMessages = systemPrompt 
      ? [{ role: 'system', content: systemPrompt }, ...newMessages]
      : newMessages;

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
      
      // Add empty assistant message to start streaming into
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.message?.content) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last.role === 'assistant') {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + json.message.content }
                  ];
                }
                return prev;
              });
            }
            if (json.done) {
              setIsLoading(false);
            }
          } catch (e) {
            console.error('Error parsing chunk', e);
          }
        }
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
  };

  return { messages, sendMessage, isLoading, stop, clearChat };
}

