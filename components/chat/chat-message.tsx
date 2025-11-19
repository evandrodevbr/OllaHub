import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from "@/lib/utils";
import { Message } from "@/hooks/use-chat";
import { Bot, User } from "lucide-react";

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn(
      "flex w-full gap-4 p-6",
      isUser ? "bg-background" : "bg-muted/30"
    )}>
      <div className="flex-shrink-0 mt-1">
        <div className={cn(
          "w-8 h-8 rounded-sm flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        )}>
          {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="prose dark:prose-invert max-w-none break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

