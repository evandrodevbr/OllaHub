import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React, { useState, useMemo } from 'react';
import { cn } from "@/lib/utils";
import { Message } from "@/hooks/use-chat";
import { Bot, User } from "lucide-react";
import { markdownRenderers } from "./markdown-renderers";
import { MessageActions } from "./message-actions";
import { MessageBackground } from "./message-background";
import { MessageStepThinking } from "./message-step-thinking";
import type { ThinkingMessageMetadata } from "@/hooks/use-chat";

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  highlightTerm?: string;
  highlightIndex?: number;
  messageIndex?: number;
}

/**
 * Componente de mensagem do chat otimizado com React.memo
 * 
 * Durante streaming, usa renderização simplificada (texto puro) para evitar
 * recálculo custoso da árvore DOM e syntax highlight a cada token.
 * Markdown completo é aplicado apenas quando a mensagem está finalizada.
 */
function ChatMessageComponent({ message, isStreaming = false, highlightTerm, highlightIndex = 0, messageIndex }: ChatMessageProps) {
  // Verificar se é mensagem de processo de pensamento
  const isThinkingMessage = message.metadata && 
    typeof message.metadata === 'object' && 
    'type' in message.metadata && 
    message.metadata.type === 'thinking';

  if (isThinkingMessage) {
    return <MessageStepThinking metadata={message.metadata as ThinkingMessageMetadata} />;
  }

  const isUser = message.role === 'user';
  const [selected, setSelected] = useState(false);
  const isEmpty = !message.content || message.content.trim() === '';
  
  // Memoizar processamento de conteúdo
  const processedContent = useMemo(() => {
    let content = message.content || '';
    // Remove metadata tags
    content = content.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '').trim();
    
    // Also remove common prefixes
    const prefixes = [
      'Bloco oculto de metadados:', 'Metadata:', 'Metadados:',
      'Hidden metadata block:', 'JSON metadata:', '---'
    ];
    
    for (const prefix of prefixes) {
      const regex = new RegExp(`${prefix}\\s*$`, 'i');
      if (regex.test(content)) {
        content = content.replace(regex, '').trim();
      }
    }
    
    return content || message.content;
  }, [message.content]);
  
  // Processar highlight separadamente (após limpeza de conteúdo)
  // Desabilitar durante streaming para performance
  const highlightedContent = useMemo(() => {
    // Não processar highlight durante streaming
    if (isStreaming) return null;
    
    if (!highlightTerm || highlightTerm.trim().length < 2 || (message.role !== 'user' && message.role !== 'assistant')) {
      return null; // Não há highlight
    }
    
    const term = highlightTerm.trim();
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    const content = processedContent;
    
    // Encontrar todos os matches
    const matches: Array<{ start: number; end: number; text: string }> = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
    }
    
    if (matches.length === 0) return null;
    
    // Construir conteúdo com highlights
    let highlighted = '';
    let lastIndex = 0;
    
    matches.forEach((match, idx) => {
      // Adicionar texto antes do match
      highlighted += content.substring(lastIndex, match.start);
      
      // Adicionar match com highlight (laranja para atual, amarelo para outros)
      const isCurrent = highlightIndex !== undefined && idx === highlightIndex;
      const className = isCurrent 
        ? 'bg-orange-400/60 dark:bg-orange-500/60 px-0.5 rounded' 
        : 'bg-yellow-200/50 dark:bg-yellow-800/50 px-0.5 rounded';
      
      highlighted += `<mark class="${className}">${match.text}</mark>`;
      lastIndex = match.end;
    });
    
    // Adicionar texto restante
    highlighted += content.substring(lastIndex);
    return highlighted;
  }, [processedContent, highlightTerm, highlightIndex, message.role, isStreaming]);

  return (
    <MessageBackground
      role={isUser ? 'user' : 'assistant'}
      state={selected ? 'selected' : 'normal'}
      className={cn(
        "cursor-default transition-colors rounded-xl", 
        selected && "bg-muted/40",
        isUser ? "mb-2" : "mb-8"
      )}
      onClick={() => setSelected((v) => !v)}
      tabIndex={0}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shadow-sm ring-1 ring-border/50 backdrop-blur-sm",
          isUser 
            ? "bg-background text-muted-foreground" 
            : "bg-primary/10 text-primary ring-primary/20"
        )}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-5 h-5" />}
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden min-w-0 pt-1" data-message-index={messageIndex}>
        {isUser ? (
             // Estilo específico para mensagem do usuário (mais destaque, fonte maior)
             <div 
               className="text-lg sm:text-xl font-medium tracking-tight text-foreground/90 leading-relaxed break-words whitespace-pre-wrap"
               dangerouslySetInnerHTML={highlightedContent ? { __html: highlightedContent } : undefined}
             >
                {!highlightedContent && processedContent}
             </div>
        ) : (
            // Estilo Assistant
            isEmpty && isStreaming ? (
              <div className="flex items-center gap-2 text-muted-foreground py-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-sm font-medium">Gerando resposta...</span>
              </div>
            ) : isStreaming ? (
              // Renderização LEVE durante streaming: texto simples com formatação básica
              // Evita recálculo de ReactMarkdown e syntax highlight a cada token
              <div className={cn(
                "prose prose-neutral dark:prose-invert max-w-none break-words leading-7 text-base text-foreground/90",
                "prose-headings:font-semibold prose-headings:tracking-tight",
                "relative"
              )}>
                <div className="whitespace-pre-wrap font-sans">
                  {processedContent}
                </div>
                <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse rounded-full align-middle" />
              </div>
            ) : (
              // Renderização COMPLETA quando mensagem finalizada: ReactMarkdown com syntax highlight
              <div className={cn(
                "prose prose-neutral dark:prose-invert max-w-none break-words leading-7 text-base text-foreground/90",
                "prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg",
                "prose-p:leading-7 prose-li:leading-7",
                "prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl",
                "prose-mark:bg-yellow-200/50 prose-mark:dark:bg-yellow-800/50 prose-mark:px-0.5 prose-mark:rounded"
              )}>
                {highlightedContent ? (
                  <div dangerouslySetInnerHTML={{ __html: highlightedContent }} />
                ) : (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={markdownRenderers}
                  >
                    {processedContent}
                  </ReactMarkdown>
                )}
              </div>
            )
        )}
      </div>
      
      {!isUser && !isStreaming && (
        <div className={cn(
            "absolute -bottom-8 left-12 flex items-center gap-2 opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100",
            selected && "opacity-100"
        )}>
          <MessageActions content={message.content} role={message.role} />
        </div>
      )}
    </MessageBackground>
  );
}

/**
 * ChatMessage com React.memo para evitar re-renders desnecessários
 * 
 * Comparação customizada:
 * - Compara conteúdo da mensagem
 * - Compara estado de streaming
 * - Compara termo de highlight e índice
 */
export const ChatMessage = React.memo(ChatMessageComponent, (prevProps, nextProps) => {
  // Se streaming mudou, sempre re-renderizar
  if (prevProps.isStreaming !== nextProps.isStreaming) {
    return false;
  }
  
  // Durante streaming, só re-renderizar se conteúdo mudou
  if (nextProps.isStreaming) {
    return prevProps.message.content === nextProps.message.content;
  }
  
  // Quando não está em streaming, comparar todas as props relevantes
  return (
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.role === nextProps.message.role &&
    prevProps.highlightTerm === nextProps.highlightTerm &&
    prevProps.highlightIndex === nextProps.highlightIndex &&
    prevProps.messageIndex === nextProps.messageIndex
  );
});

// Adicionar displayName para debugging
ChatMessage.displayName = 'ChatMessage';
