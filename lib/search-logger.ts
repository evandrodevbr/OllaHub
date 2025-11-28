import type { QueryContext } from './contextual-analyzer';
import type { EnrichedQueries } from './query-enricher';
import type { FallbackAttempt } from './web-search-fallback';
import type { ScrapedContent } from '@/services/webSearch';
import type { UnifiedContext } from './context-unifier';

/**
 * Log completo de uma pesquisa
 */
export interface SearchLog {
  timestamp: number;
  originalQuery: string;
  contextAnalysis?: QueryContext;
  enrichedQueries?: EnrichedQueries;
  rounds: Array<{
    round: number;
    strategy?: string;
    queries: string[];
    results: Array<{
      query: string;
      engine?: string;
      resultsCount: number;
      duration: number;
      topResults: Array<{
        title: string;
        url: string;
        score?: number;
      }>;
    }>;
    totalResults: number;
    relevanceScore: number;
  }>;
  finalResults: {
    totalSources: number;
    unifiedContext?: UnifiedContext;
    keyFacts?: number;
    contradictions?: number;
  };
  usedFallback: boolean;
  totalDuration: number;
}

/**
 * Armazena logs de pesquisa em memória
 * (Pode ser expandido para salvar em arquivo ou banco de dados)
 */
class SearchLogger {
  private logs: SearchLog[] = [];
  private maxLogs = 100; // Manter apenas os últimos 100 logs

  /**
   * Adiciona um novo log
   */
  addLog(log: SearchLog): void {
    this.logs.unshift(log); // Adicionar no início
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
  }

  /**
   * Obtém todos os logs
   */
  getLogs(): SearchLog[] {
    return [...this.logs];
  }

  /**
   * Obtém log por query
   */
  getLogByQuery(query: string): SearchLog | undefined {
    return this.logs.find(log => 
      log.originalQuery.toLowerCase() === query.toLowerCase()
    );
  }

  /**
   * Limpa todos os logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Exporta logs como JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Instância singleton
export const searchLogger = new SearchLogger();

/**
 * Cria um log de pesquisa a partir de dados coletados
 */
export function createSearchLog(
  originalQuery: string,
  contextAnalysis: QueryContext | null,
  enrichedQueries: EnrichedQueries | null,
  attempts: FallbackAttempt[],
  finalSources: ScrapedContent[],
  unifiedContext: UnifiedContext | null,
  usedFallback: boolean,
  startTime: number
): SearchLog {
  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  // Processar rounds dos attempts
  const rounds = attempts.map(attempt => {
    const queryResults = attempt.queries
      ? attempt.queries.map(q => ({
          query: q,
          resultsCount: attempt.results.length,
          duration: attempt.duration,
          topResults: attempt.results.slice(0, 3).map(r => ({
            title: r.title,
            url: r.url,
            score: attempt.relevanceScore,
          })),
        }))
      : [{
          query: attempt.query,
          resultsCount: attempt.results.length,
          duration: attempt.duration,
          topResults: attempt.results.slice(0, 3).map(r => ({
            title: r.title,
            url: r.url,
            score: attempt.relevanceScore,
          })),
        }];

    return {
      round: attempt.round,
      strategy: attempt.strategy,
      queries: attempt.queries || [attempt.query],
      results: queryResults,
      totalResults: attempt.results.length,
      relevanceScore: attempt.relevanceScore,
    };
  });

  return {
    timestamp: startTime,
    originalQuery,
    contextAnalysis: contextAnalysis || undefined,
    enrichedQueries: enrichedQueries || undefined,
    rounds,
    finalResults: {
      totalSources: finalSources.length,
      unifiedContext: unifiedContext || undefined,
      keyFacts: unifiedContext?.keyFacts.length,
      contradictions: unifiedContext?.contradictions.length,
    },
    usedFallback,
    totalDuration,
  };
}

/**
 * Formata log para exibição
 */
export function formatSearchLog(log: SearchLog): string {
  const lines: string[] = [];

  lines.push(`=== SEARCH LOG ===`);
  lines.push(`Timestamp: ${new Date(log.timestamp).toISOString()}`);
  lines.push(`Query: "${log.originalQuery}"`);
  lines.push(`Duration: ${log.totalDuration}ms`);
  lines.push(`Used Fallback: ${log.usedFallback}`);
  lines.push('');

  if (log.contextAnalysis) {
    lines.push(`--- Context Analysis ---`);
    lines.push(`Intent: ${log.contextAnalysis.intent}`);
    lines.push(`Entities: ${log.contextAnalysis.entities.length}`);
    lines.push(`Topics: ${log.contextAnalysis.topics.join(', ')}`);
    lines.push('');
  }

  if (log.enrichedQueries) {
    lines.push(`--- Enriched Queries ---`);
    lines.push(`Literal: ${log.enrichedQueries.literal.length}`);
    lines.push(`Semantic: ${log.enrichedQueries.semantic.length}`);
    lines.push(`Related: ${log.enrichedQueries.related.length}`);
    lines.push(`Expanded: ${log.enrichedQueries.expanded.length}`);
    lines.push(`Contextual: ${log.enrichedQueries.contextual.length}`);
    lines.push('');
  }

  lines.push(`--- Rounds (${log.rounds.length}) ---`);
  log.rounds.forEach((round, idx) => {
    lines.push(`Round ${round.round} [${round.strategy || 'N/A'}]:`);
    lines.push(`  Queries: ${round.queries.join(', ')}`);
    lines.push(`  Results: ${round.totalResults}`);
    lines.push(`  Relevance Score: ${round.relevanceScore.toFixed(2)}`);
    lines.push('');
  });

  lines.push(`--- Final Results ---`);
  lines.push(`Total Sources: ${log.finalResults.totalSources}`);
  if (log.finalResults.keyFacts) {
    lines.push(`Key Facts: ${log.finalResults.keyFacts}`);
  }
  if (log.finalResults.contradictions) {
    lines.push(`Contradictions: ${log.finalResults.contradictions}`);
  }

  return lines.join('\n');
}

