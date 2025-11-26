/**
 * Sistema de Fallback Progressivo para Pesquisa Web
 * 
 * Implementa múltiplas tentativas de busca com query expansion,
 * validação de relevância e fallback para conhecimento interno.
 */

import type { ScrapedContent } from '@/services/webSearch';
import { chatLog } from '@/lib/terminal-logger';

export interface FallbackConfig {
  maxRounds: number; // Máximo de rodadas de busca (padrão: 4)
  maxResultsPerRound: number; // Máximo de resultados por rodada (padrão: 10)
  maxTotalResults: number; // Máximo total de resultados analisados (padrão: 40)
  minRelevanceScore: number; // Score mínimo de relevância (0-1, padrão: 0.3)
  enableQueryExpansion: boolean; // Ativar expansão de queries (padrão: true)
}

export interface FallbackAttempt {
  round: number;
  query: string;
  results: ScrapedContent[];
  relevanceScore: number;
  timestamp: number;
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
 */
export function calculateRelevanceScore(
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
  const scores = results.map(r => calculateRelevanceScore(r, query));
  
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
 * Executa busca progressiva com fallback
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
  chatLog.info(`Config: ${JSON.stringify(finalConfig)}`);
  
  for (let round = 1; round <= finalConfig.maxRounds; round++) {
    chatLog.info(`\n--- Round ${round}/${finalConfig.maxRounds} ---`);
    
    // Expandir query se necessário
    const query = finalConfig.enableQueryExpansion
      ? await expandQuery(originalQuery, model, round)
      : originalQuery;
    
    chatLog.info(`Searching with query: "${query}"`);
    
    try {
      // Executar busca
      const results = await searchFn(query, finalConfig.maxResultsPerRound);
      
      // Filtrar duplicatas
      const uniqueResults = results.filter(r => {
        if (seenUrls.has(r.url)) {
          return false;
        }
        seenUrls.add(r.url);
        return true;
      });
      
      chatLog.info(`Found ${uniqueResults.length} unique results (${results.length} total)`);
      
      // Calcular relevância
      const relevanceScore = uniqueResults.length > 0
        ? uniqueResults.reduce((sum, r) => sum + calculateRelevanceScore(r, query), 0) / uniqueResults.length
        : 0;
      
      // Registrar tentativa
      const attempt: FallbackAttempt = {
        round,
        query,
        results: uniqueResults,
        relevanceScore,
        timestamp: Date.now(),
      };
      attempts.push(attempt);
      
      allResults.push(...uniqueResults);
      totalResultsAnalyzed += uniqueResults.length;
      
      // Verificar se encontrou resultados relevantes
      if (areResultsRelevant(uniqueResults, query, finalConfig.minRelevanceScore)) {
        chatLog.info(`✓ Relevant results found in round ${round}!`);
        chatLog.info(`Total results: ${allResults.length}, Total analyzed: ${totalResultsAnalyzed}`);
        
        return {
          success: true,
          knowledgeBaseContext: '', // Será preenchido pelo caller
          scrapedSources: allResults,
          attempts,
          totalResultsAnalyzed,
          usedFallback: false,
          finalQuery: query,
        };
      }
      
      // Verificar se atingiu limite de resultados
      if (totalResultsAnalyzed >= finalConfig.maxTotalResults) {
        chatLog.warn(`⚠️ Reached max total results limit (${finalConfig.maxTotalResults})`);
        break;
      }
      
      // Se não encontrou resultados relevantes, continuar para próxima rodada
      chatLog.warn(`⚠️ Round ${round} did not find relevant results, continuing...`);
      
    } catch (error) {
      chatLog.error(`✗ Error in round ${round}:`, error);
      attempts.push({
        round,
        query,
        results: [],
        relevanceScore: 0,
        timestamp: Date.now(),
      });
    }
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

