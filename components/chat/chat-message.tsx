import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { cn } from "@/lib/utils";
import { Message } from "@/hooks/use-chat";
import { Bot, User } from "lucide-react";
import { markdownRenderers } from "./markdown-renderers";
import { MessageActions } from "./message-actions";
import { MessageBackground } from "./message-background";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const [selected, setSelected] = useState(false);

  return (
    <MessageBackground
      role={isUser ? 'user' : 'assistant'}
      state={selected ? 'selected' : 'normal'}
      className={cn("cursor-pointer")}
      onClick={() => setSelected((v) => !v)}
      tabIndex={0}
    >
      <div className="flex-shrink-0 mt-1">
        <div className={cn(
          "w-8 h-8 rounded-md flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        )}>
          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>
      </div>
      <div className="flex-1 overflow-hidden min-w-0">
        <div className="prose dark:prose-invert max-w-none break-words leading-relaxed">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={markdownRenderers}
          >
            {(() => {
              let content = message.content || '';
              // Remove metadata tags
              content = content.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '').trim();
              
              // Also remove common prefixes if they appear at the end
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
              
              return content || message.content;
            })()}
          </ReactMarkdown>
        </div>
      </div>
      {!isUser && (
        <div className="absolute top-4 right-4">
          <MessageActions content={message.content} role={message.role} />
        </div>
      )}
    </MessageBackground>
  );
}
