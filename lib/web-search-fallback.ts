/**
 * Sistema de Fallback Progressivo para Pesquisa Web
 * 
 * Implementa múltiplas tentativas de busca com query expansion,
 * validação de relevância e fallback para conhecimento interno.
 * 
 * Agora suporta multi-round semantic search com estratégias diferentes.
 */

import type { ScrapedContent } from '@/services/webSearch';
import type { QueryContext } from './contextual-analyzer';
import type { EnrichedQueries } from './query-enricher';
import { chatLog } from '@/lib/terminal-logger';

export type SearchStrategy = 'literal' | 'semantic' | 'related' | 'expanded' | 'contextual';

export interface RoundConfig {
  strategy: SearchStrategy;
  queries: string[];
  minResults: number;
}

export interface FallbackConfig {
  maxRounds: number; // Máximo de rodadas de busca (padrão: 4)
  maxResultsPerRound: number; // Máximo de resultados por rodada (padrão: 10)
  maxTotalResults: number; // Máximo total de resultados analisados (padrão: 40)
  minRelevanceScore: number; // Score mínimo de relevância (0-1, padrão: 0.3)
  enableQueryExpansion: boolean; // Ativar expansão de queries (padrão: true)
  useSemanticSearch?: boolean; // Usar multi-round semantic search (padrão: false)
  context?: QueryContext; // Contexto analisado (para semantic search)
  enrichedQueries?: EnrichedQueries; // Queries enriquecidas (para semantic search)
}

export interface FallbackAttempt {
  round: number;
  strategy?: SearchStrategy;
  query: string;
  queries?: string[]; // Múltiplas queries se usar estratégia
  results: ScrapedContent[];
  relevanceScore: number;
  timestamp: number;
  duration: number;
}

export interface FallbackResult {
  success: boolean;
  knowledgeBaseContext: string;
  scrapedSources: ScrapedContent[];
  attempts: FallbackAttempt[];
  totalResultsAnalyzed: number;
  usedFallback: boolean; // true se usou conhecimento interno
  finalQuery?: string;
}

const DEFAULT_CONFIG: FallbackConfig = {
  maxRounds: 4,
  maxResultsPerRound: 10,
  maxTotalResults: 40,
  minRelevanceScore: 0.3,
  enableQueryExpansion: true,
};

/**
 * Expande uma query usando técnicas de query expansion
 */
export async function expandQuery(
  originalQuery: string,
  model: string,
  round: number
): Promise<string> {
  if (round === 1) {
    // Primeira rodada: usar query original
    return originalQuery;
  }

  try {
    const expansionPrompt = `Você é um especialista em busca de informações. Expanda e refine a query de busca abaixo para encontrar informações mais relevantes.

Query original: "${originalQuery}"

Instruções:
- Se a query for muito específica, generalize um pouco (ex: "bomba gás lacrimogêneo" → "gás lacrimogêneo composição química")
- Se a query for muito genérica, adicione termos específicos relacionados
- Use sinônimos e termos relacionados
- Mantenha o foco no tópico principal
- Retorne APENAS a query expandida, sem explicações

Query expandida:`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: expansionPrompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 100,
        },
      }),
    });

    if (!response.ok) {
      chatLog.warn('Failed to expand query, using original');
      return originalQuery;
    }

    const data = await response.json();
    const expanded = (data.response || '').trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\.$/, '')
      .trim();

    if (expanded.length < 3) {
      return originalQuery;
    }

    chatLog.info(`Query expanded: "${originalQuery}" → "${expanded}"`);
    return expanded;
  } catch (error) {
    chatLog.warn('Error expanding query, using original:', error);
    return originalQuery;
  }
}

/**
 * Calcula score de relevância de um resultado baseado na query
 * (Mantido para compatibilidade, mas agora usa função de relevance-scorer)
 */
export function calculateRelevanceScoreForFallback(
  result: ScrapedContent,
  query: string
): number {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  // Extrair texto para análise
  const title = (result.title || '').toLowerCase();
  const content = (result.markdown || '').toLowerCase();
  const combinedText = `${title} ${content}`;
  
  // Contar matches de palavras-chave
  let matches = 0;
  let totalWords = queryWords.length;
  
  for (const word of queryWords) {
    if (combinedText.includes(word)) {
      matches++;
    }
  }
  
  // Score base: proporção de palavras encontradas
  let score = matches / totalWords;
  
  // Bônus: título tem mais peso
  const titleMatches = queryWords.filter(w => title.includes(w)).length;
  if (titleMatches > 0) {
    score += (titleMatches / totalWords) * 0.3; // 30% de bônus
  }
  
  // Bônus: conteúdo não vazio
  if (content.length > 100) {
    score += 0.1;
  }
  
  // Penalidade: conteúdo muito curto
  if (content.length < 50) {
    score *= 0.5;
  }
  
  // Normalizar para 0-1
  return Math.min(1, Math.max(0, score));
}

/**
 * Verifica se os resultados são relevantes o suficiente
 */
export function areResultsRelevant(
  results: ScrapedContent[],
  query: string,
  minScore: number = 0.3
): boolean {
  if (results.length === 0) {
    return false;
  }
  
  // Calcular scores de relevância
  const scores = results.map(r => calculateRelevanceScoreForFallback(r, query));
  
  // Verificar se pelo menos um resultado tem score suficiente
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  chatLog.info(`Relevance scores - Max: ${maxScore.toFixed(2)}, Avg: ${avgScore.toFixed(2)}, Min required: ${minScore}`);
  
  // Considerar relevante se:
  // 1. Pelo menos um resultado tem score alto, OU
  // 2. Média dos scores é razoável
  return maxScore >= minScore || avgScore >= (minScore * 0.7);
}

/**
 * Cria configuração de rounds para multi-round semantic search
 */
function createSemanticRounds(
  enriched: EnrichedQueries,
  originalQuery: string
): RoundConfig[] {
  const rounds: RoundConfig[] = [];

  // Round 1: Literal + Semântico (mais direto)
  if (enriched.literal.length > 0 || enriched.semantic.length > 0) {
    rounds.push({
      strategy: 'literal',
      queries: [...enriched.literal, ...enriched.semantic].slice(0, 5),
      minResults: 3,
    });
  }

  // Round 2: Relacionadas (se Round 1 não foi suficiente)
  if (enriched.related.length > 0) {
    rounds.push({
      strategy: 'related',
      queries: enriched.related.slice(0, 4),
      minResults: 2,
    });
  }

  // Round 3: Contextual (adicionar contexto temporal/geográfico)
  if (enriched.contextual.length > 0) {
    rounds.push({
      strategy: 'contextual',
      queries: enriched.contextual.slice(0, 3),
      minResults: 2,
    });
  }

  // Round 4: Expandido (temas específicos, exemplos concretos)
  if (enriched.expanded.length > 0) {
    rounds.push({
      strategy: 'expanded',
      queries: enriched.expanded.slice(0, 3),
      minResults: 1,
    });
  }

  // Fallback: se não há queries enriquecidas, usar original
  if (rounds.length === 0) {
    rounds.push({
      strategy: 'literal',
      queries: [originalQuery],
      minResults: 1,
    });
  }

  return rounds;
}

/**
 * Executa busca progressiva com fallback
 * Agora suporta multi-round semantic search com estratégias diferentes
 */
export async function executeProgressiveSearch(
  originalQuery: string,
  searchFn: (query: string, limit: number) => Promise<ScrapedContent[]>,
  model: string,
  config: Partial<FallbackConfig> = {}
): Promise<FallbackResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const attempts: FallbackAttempt[] = [];
  let totalResultsAnalyzed = 0;
  let allResults: ScrapedContent[] = [];
  const seenUrls = new Set<string>();
  
  chatLog.info(`\n=== PROGRESSIVE SEARCH START ===`);
  chatLog.info(`Original Query: "${originalQuery}"`);
  chatLog.info(`Config: ${JSON.stringify({ ...finalConfig, context: finalConfig.context ? 'present' : 'none', enrichedQueries: finalConfig.enrichedQueries ? 'present' : 'none' })}`);
  
  // Se usar semantic search, criar rounds baseados em estratégias
  let rounds: Array<{ round: number; config: RoundConfig }> = [];
  
  if (finalConfig.useSemanticSearch && finalConfig.enrichedQueries) {
    const semanticRounds = createSemanticRounds(finalConfig.enrichedQueries, originalQuery);
    rounds = semanticRounds.map((roundConfig, idx) => ({
      round: idx + 1,
      config: roundConfig,
    }));
    chatLog.info(`[SemanticSearch] Created ${rounds.length} semantic rounds with strategies`);
  } else {
    // Modo tradicional: rounds sequenciais com expansão
    for (let i = 1; i <= finalConfig.maxRounds; i++) {
      rounds.push({
        round: i,
        config: {
          strategy: 'literal',
          queries: [originalQuery],
          minResults: finalConfig.maxResultsPerRound,
        },
      });
    }
  }
  
  // Limitar número de rounds
  rounds = rounds.slice(0, finalConfig.maxRounds);
  
  for (const { round, config: roundConfig } of rounds) {
    chatLog.info(`\n--- Round ${round}/${rounds.length} [${roundConfig.strategy}] ---`);
    
    const roundStartTime = Date.now();
    let roundResults: ScrapedContent[] = [];
    let roundQueries: string[] = [];
    
    // Executar todas as queries do round em paralelo
    const queryPromises = roundConfig.queries.map(async (query) => {
      // Expandir query se necessário (modo tradicional)
      const finalQuery = finalConfig.enableQueryExpansion && !finalConfig.useSemanticSearch
        ? await expandQuery(query, model, round)
        : query;
      
      try {
        const results = await searchFn(finalQuery, finalConfig.maxResultsPerRound);
        return { query: finalQuery, results };
      } catch (error) {
        chatLog.warn(`[Round ${round}] Query "${finalQuery}" failed:`, error);
        return { query: finalQuery, results: [] };
      }
    });
    
    const queryResults = await Promise.all(queryPromises);
    
    // Agregar resultados de todas as queries do round
    for (const { query, results } of queryResults) {
      roundQueries.push(query);
      
      // Filtrar duplicatas
      const uniqueResults = results.filter(r => {
        if (seenUrls.has(r.url)) {
          return false;
        }
        seenUrls.add(r.url);
        return true;
      });
      
      roundResults.push(...uniqueResults);
    }
    
    const roundDuration = Date.now() - roundStartTime;
    
    chatLog.info(`[Round ${round}] Executed ${roundQueries.length} queries, found ${roundResults.length} unique results in ${roundDuration}ms`);
    
    // Log detalhado se houver resultados
    if (roundResults.length > 0) {
      roundResults.slice(0, 3).forEach((result, idx) => {
        chatLog.info(`  → Result ${idx + 1}: ${result.title.substring(0, 60)}... (${result.url.substring(0, 50)}...)`);
      });
      if (roundResults.length > 3) {
        chatLog.info(`  ... and ${roundResults.length - 3} more results`);
      }
    }
    
    // Calcular relevância usando contexto se disponível
    const relevanceScore = roundResults.length > 0
      ? roundResults.reduce((sum, r) => {
          // Usar contexto para cálculo de relevância se disponível
          if (finalConfig.context) {
            // Importar função dinamicamente para evitar circular dependency
            const { calculateSemanticSimilarity } = require('./relevance-scorer');
            return sum + calculateSemanticSimilarity(finalConfig.context, r.markdown || r.title);
          }
          return sum + calculateRelevanceScoreForFallback(r, originalQuery);
        }, 0) / roundResults.length
      : 0;
    
    // Registrar tentativa
    const attempt: FallbackAttempt = {
      round,
      strategy: roundConfig.strategy,
      query: roundQueries[0] || originalQuery,
      queries: roundQueries.length > 1 ? roundQueries : undefined,
      results: roundResults,
      relevanceScore,
      timestamp: Date.now(),
      duration: roundDuration,
    };
    attempts.push(attempt);
    
    allResults.push(...roundResults);
    totalResultsAnalyzed += roundResults.length;
    
    // Verificar se encontrou resultados relevantes
    const queryForRelevance = roundQueries[0] || originalQuery;
    if (areResultsRelevant(roundResults, queryForRelevance, finalConfig.minRelevanceScore)) {
      chatLog.info(`[Round ${round}] ✓ Relevant results found!`);
      chatLog.info(`[Round ${round}] Total results: ${allResults.length}, Total analyzed: ${totalResultsAnalyzed}`);
      chatLog.info(`[Round ${round}] Final queries: ${roundQueries.join(', ')}`);
      
      return {
        success: true,
        knowledgeBaseContext: '', // Será preenchido pelo caller
        scrapedSources: allResults,
        attempts,
        totalResultsAnalyzed,
        usedFallback: false,
        finalQuery: roundQueries.join(' | '),
      };
    }
    
    // Verificar se atingiu limite de resultados
    if (totalResultsAnalyzed >= finalConfig.maxTotalResults) {
      chatLog.warn(`[Round ${round}] ⚠️ Reached max total results limit (${finalConfig.maxTotalResults})`);
      break;
    }
    
    // Se não encontrou resultados relevantes, continuar para próxima rodada
    chatLog.warn(`[Round ${round}] ⚠️ Did not find relevant results (min score: ${finalConfig.minRelevanceScore}), continuing...`);
  }
  
  // Se chegou aqui, não encontrou resultados relevantes
  chatLog.warn(`\n⚠️ PROGRESSIVE SEARCH FAILED`);
  chatLog.warn(`Total rounds: ${attempts.length}`);
  chatLog.warn(`Total results analyzed: ${totalResultsAnalyzed}`);
  chatLog.warn(`Using internal knowledge fallback`);
  
  return {
    success: false,
    knowledgeBaseContext: '',
    scrapedSources: allResults, // Retornar resultados encontrados mesmo que não relevantes
    attempts,
    totalResultsAnalyzed,
    usedFallback: true,
  };
}

