'use client';

import { Loader2, CheckCircle2, Globe, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ActiveQuery } from '@/hooks/use-web-search-events';

interface SearchQueriesMonitorProps {
  queries: ActiveQuery[];
  className?: string;
}

export function SearchQueriesMonitor({ queries, className }: SearchQueriesMonitorProps) {
  if (queries.length === 0) return null;

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'brave':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'searxng':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'duckduckgo':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
      default:
        return 'bg-muted text-muted-foreground border-muted';
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'brave':
        return 'Brave';
      case 'searxng':
        return 'SearXNG';
      case 'duckduckgo':
        return 'DuckDuckGo';
      default:
        return source;
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Consultas Ativas ({queries.length})
      </div>
      {queries.map((query, idx) => (
        <div
          key={`${query.query}-${query.source}-${idx}`}
          className="flex items-center gap-2 p-2 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <Loader2 className="w-3 h-3 animate-spin text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs truncate">{query.query}</span>
              <Badge variant="outline" className={cn('text-xs', getSourceColor(query.source))}>
                {getSourceLabel(query.source)}
              </Badge>
              {query.round && (
                <Badge variant="outline" className="text-xs">
                  Round {query.round}
                </Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
