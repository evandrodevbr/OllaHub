import { Search, BookOpen, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScrapedContent } from '@/services/webSearch';
import { SearchStatus } from '@/hooks/use-web-search';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface SearchProgressProps {
  status: SearchStatus;
  query: string;
  sources: ScrapedContent[];
  error: string | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function SearchProgress({
  status,
  query,
  sources,
  error,
  isExpanded: controlledExpanded,
  onToggleExpand,
}: SearchProgressProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpanded = onToggleExpand || (() => setInternalExpanded(!internalExpanded));

  if (status === 'idle') return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'searching':
        return <Search className="w-3 h-3 text-muted-foreground" />;
      case 'scraping':
        return <BookOpen className="w-3 h-3 text-muted-foreground" />;
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-muted-foreground" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'searching':
        return `Pesquisando: "${query}"`;
      case 'scraping':
        return `Lendo ${sources.length || '...'} fonte${sources.length !== 1 ? 's' : ''}`;
      case 'completed':
        return `✓ ${sources.length} fonte${sources.length !== 1 ? 's' : ''} consultada${sources.length !== 1 ? 's' : ''}`;
      case 'error':
        return `Erro: ${error || 'Falha ao buscar'}`;
      default:
        return '';
    }
  };

  const getFaviconUrl = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return '';
    }
  };

  const isActive = status === 'searching' || status === 'scraping';
  const showExpandButton = status === 'completed' && sources.length > 0;

  return (
    <Card className={cn(
      "mx-4 mb-2 border border-border/50 bg-muted/30 transition-all",
      status === 'completed' && "opacity-60 hover:opacity-100",
      status === 'error' && "border-destructive/30 bg-destructive/5"
    )}>
      <CardContent className="p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {isActive ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : (
                <div className="w-3 h-3">
                  {getStatusIcon()}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate">
              {getStatusText()}
            </span>
          </div>
          
          {showExpandButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              className="h-7 w-7 p-0 flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Lista de fontes expandida */}
        {isExpanded && sources.length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-2">
            {sources.map((source, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 rounded-md bg-background/50 hover:bg-background/80 transition-colors"
              >
                <img
                  src={getFaviconUrl(source.url)}
                  alt=""
                  className="w-4 h-4 rounded mt-0.5 flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="flex-1 min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-primary hover:underline line-clamp-1 flex items-center gap-1"
                  >
                    {source.title || source.url}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  </a>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {source.url}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

