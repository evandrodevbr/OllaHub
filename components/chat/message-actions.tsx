import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Copy, FileJson, FileText, MoreHorizontal, Contrast } from "lucide-react";
import { useEffect, useState } from "react";

interface MessageActionsProps {
  content: string;
  role: string;
}

export function MessageActions({ content, role }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('highContrast') === 'true' : false;
    setHighContrast(saved);
    if (typeof document !== 'undefined') {
      if (saved) document.documentElement.setAttribute('data-high-contrast', 'true');
      else document.documentElement.removeAttribute('data-high-contrast');
    }
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyMarkdown = () => handleCopy(content);
  
  const copyText = () => {
    // Simple strip markdown (can be improved with a library if needed)
    const text = content
      .replace(/#{1,6}\s/g, '') // Headers
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // Bold
      .replace(/(\*|_)(.*?)\1/g, '$2') // Italic
      .replace(/`{3}[\s\S]*?`{3}/g, '$&') // Keep code blocks but maybe strip fences? For now keep raw
      .replace(/`(.+?)`/g, '$1') // Inline code
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // Links
      .replace(/>\s/g, ''); // Blockquotes
    handleCopy(text);
  };

  const copyJson = () => {
    const json = JSON.stringify({ role, content }, null, 2);
    handleCopy(json);
  };

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copyMarkdown}
        title="Copiar Markdown"
      >
        {copied ? (
          <span className="text-green-500 text-xs font-bold">✓</span>
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={copyText}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Copiar Texto Puro</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={copyJson}>
            <FileJson className="mr-2 h-4 w-4" />
            <span>Copiar JSON</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const next = !highContrast;
              setHighContrast(next);
              if (typeof document !== 'undefined') {
                if (next) document.documentElement.setAttribute('data-high-contrast', 'true');
                else document.documentElement.removeAttribute('data-high-contrast');
              }
              if (typeof window !== 'undefined') {
                localStorage.setItem('highContrast', String(next));
              }
            }}
          >
            <Contrast className="mr-2 h-4 w-4" />
            <span>{highContrast ? 'Desativar Alto Contraste' : 'Ativar Alto Contraste'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}



