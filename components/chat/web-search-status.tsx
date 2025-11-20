import { Search, BookOpen, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ScrapedContent } from '@/services/webSearch';
import { SearchStatus } from '@/hooks/use-web-search';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface WebSearchStatusProps {
  status: SearchStatus;
  query: string;
  sources: ScrapedContent[];
  error: string | null;
  onViewSources?: () => void;
}

export function WebSearchStatus({
  status,
  query,
  sources,
  error,
}: WebSearchStatusProps) {
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);

  if (status === 'idle') return null;

  const getStatusIcon = () => {
    switch (status) {
      case 'searching':
        return <Search className="w-4 h-4 animate-pulse" />;
      case 'scraping':
        return <BookOpen className="w-4 h-4 animate-pulse" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'searching':
        return `🔍 Pesquisando por: "${query}"...`;
      case 'scraping':
        return `📖 Lendo ${sources.length || '...'} fonte${sources.length !== 1 ? 's' : ''}...`;
      case 'completed':
        return `✅ ${sources.length} fonte${sources.length !== 1 ? 's' : ''} encontrada${sources.length !== 1 ? 's' : ''}`;
      case 'error':
        return `❌ Erro: ${error || 'Falha ao buscar'}`;
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

  return (
    <>
      <Card className={cn(
        "mx-4 mb-2 border-l-4",
        status === 'completed' && "border-l-green-500",
        status === 'error' && "border-l-red-500",
        (status === 'searching' || status === 'scraping') && "border-l-blue-500"
      )}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-shrink-0">
                {status === 'searching' || status === 'scraping' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                ) : (
                  getStatusIcon()
                )}
              </div>
              <span className="text-sm font-medium truncate">
                {getStatusText()}
              </span>
            </div>
            
            {status === 'completed' && sources.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Favicons das fontes */}
                <div className="flex items-center gap-1">
                  {sources.slice(0, 3).map((source, idx) => (
                    <img
                      key={idx}
                      src={getFaviconUrl(source.url)}
                      alt=""
                      className="w-4 h-4 rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ))}
                  {sources.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{sources.length - 3}</span>
                  )}
                </div>
                
                <Dialog open={isSourcesOpen} onOpenChange={setIsSourcesOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      Ver Fontes
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Fontes Encontradas</DialogTitle>
                      <DialogDescription>
                        {sources.length} fonte{sources.length !== 1 ? 's' : ''} analisada{sources.length !== 1 ? 's' : ''} para: "{query}"
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                      {sources.map((source, idx) => (
                        <Card key={idx} className="border">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-sm mb-1 line-clamp-2">
                                  {source.title}
                                </h4>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate"
                                >
                                  {source.url}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                            <div className="prose dark:prose-invert prose-sm max-w-none max-h-[300px] overflow-y-auto">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {source.markdown}
                              </ReactMarkdown>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

