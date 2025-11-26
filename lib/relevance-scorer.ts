import type { Chunk } from './content-condenser';
import type { QueryContext } from './contextual-analyzer';
import { normalizeText } from './text-normalization';

/**
 * Calcula similaridade simples entre query e chunk baseado em palavras-chave
 * Implementação simplificada de TF-IDF
 * 
 * @param query - Query do usuário
 * @param chunk - Chunk de conteúdo
 * @returns Score de similaridade (0-1)
 */
export function calculateSimilarity(query: string, chunk: string): number {
  if (!query || !chunk) {
    return 0;
  }

  // Normalizar textos
  const normalizedQuery = normalizeText(query);
  const normalizedChunk = normalizeText(chunk);

  // Extrair palavras-chave da query (remover stop words básicas)
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos',
    'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem',
    'que', 'qual', 'quais', 'onde', 'quando', 'como', 'porque',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were',
  ]);

  const queryWords = normalizedQuery
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  if (queryWords.length === 0) {
    return 0.1; // Score mínimo se não houver palavras-chave
  }

  // Contar ocorrências de cada palavra-chave no chunk
  let totalMatches = 0;
  let uniqueMatches = 0;
  const matchedWords = new Set<string>();

  for (const word of queryWords) {
    // Buscar palavra completa (word boundary)
    const wordRegex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = normalizedChunk.match(wordRegex);
    
    if (matches) {
      totalMatches += matches.length;
      if (!matchedWords.has(word)) {
        matchedWords.add(word);
        uniqueMatches++;
      }
    }
  }

  // Calcular score baseado em:
  // 1. Proporção de palavras-chave encontradas (peso: 0.6)
  // 2. Frequência de matches (peso: 0.3)
  // 3. Normalização por tamanho do chunk (peso: 0.1)
  const wordCoverage = uniqueMatches / queryWords.length;
  const frequencyScore = Math.min(totalMatches / queryWords.length, 2) / 2; // Cap em 2x
  const sizeNormalization = Math.min(1, 1000 / normalizedChunk.length); // Penalizar chunks muito longos

  const score = (
    wordCoverage * 0.6 +
    frequencyScore * 0.3 +
    sizeNormalization * 0.1
  );

  // Garantir que score esteja entre 0 e 1
  return Math.min(Math.max(score, 0), 1);
}

/**
 * Calcula similaridade semântica avançada usando contexto completo
 * Considera entidades, tópicos, relacionamentos e intenção
 * 
 * @param context - Contexto analisado da query
 * @param chunk - Chunk de conteúdo
 * @returns Score de similaridade semântica (0-1)
 */
export function calculateSemanticSimilarity(
  context: QueryContext,
  chunk: string
): number {
  if (!chunk || !context) {
    return 0;
  }

  const normalizedChunk = normalizeText(chunk).toLowerCase();
  let totalScore = 0;
  let weightSum = 0;

  // 1. Match de keywords (peso: 0.3)
  if (context.keywords.length > 0) {
    let keywordMatches = 0;
    for (const keyword of context.keywords) {
      const keywordLower = keyword.toLowerCase();
      if (normalizedChunk.includes(keywordLower)) {
        keywordMatches++;
      }
    }
    const keywordScore = keywordMatches / context.keywords.length;
    totalScore += keywordScore * 0.3;
    weightSum += 0.3;
  }

  // 2. Match de entidades (peso: 0.3)
  if (context.entities.length > 0) {
    let entityMatches = 0;
    for (const entity of context.entities) {
      const entityLower = entity.value.toLowerCase();
      // Buscar entidade completa (case-insensitive)
      if (normalizedChunk.includes(entityLower)) {
        entityMatches += entity.confidence; // Ponderar por confiança
      }
    }
    const entityScore = entityMatches / context.entities.length;
    totalScore += entityScore * 0.3;
    weightSum += 0.3;
  }

  // 3. Match de tópicos (peso: 0.2)
  if (context.topics.length > 0) {
    let topicMatches = 0;
    for (const topic of context.topics) {
      const topicLower = topic.toLowerCase();
      // Verificar se tópico aparece no chunk (pode ser parcial)
      const topicWords = topicLower.split(/\s+/);
      const matches = topicWords.filter(word => 
        word.length > 3 && normalizedChunk.includes(word)
      );
      if (matches.length >= topicWords.length * 0.5) { // 50% das palavras do tópico
        topicMatches++;
      }
    }
    const topicScore = context.topics.length > 0 
      ? topicMatches / context.topics.length 
      : 0;
    totalScore += topicScore * 0.2;
    weightSum += 0.2;
  }

  // 4. Match de sinônimos (peso: 0.1)
  if (context.synonyms.length > 0) {
    let synonymMatches = 0;
    for (const synonym of context.synonyms) {
      const synonymLower = synonym.toLowerCase();
      if (normalizedChunk.includes(synonymLower)) {
        synonymMatches++;
      }
    }
    const synonymScore = context.synonyms.length > 0
      ? Math.min(synonymMatches / context.synonyms.length, 0.5) // Cap em 0.5 para não dominar
      : 0;
    totalScore += synonymScore * 0.1;
    weightSum += 0.1;
  }

  // 5. Relevância contextual (peso: 0.1)
  // Verificar se contexto temporal/geográfico aparece no chunk
  let contextualScore = 0;
  if (context.temporalContext?.period) {
    if (normalizedChunk.includes(context.temporalContext.period)) {
      contextualScore += 0.5;
    }
  }
  if (context.temporalContext?.relative) {
    const relativeTerms = ['recente', 'atual', 'novo', 'último', 'atualizado'];
    if (relativeTerms.some(term => normalizedChunk.includes(term))) {
      contextualScore += 0.3;
    }
  }
  if (context.geographicContext?.location) {
    const locationLower = context.geographicContext.location.toLowerCase();
    if (normalizedChunk.includes(locationLower)) {
      contextualScore += 0.5;
    }
  }
  totalScore += Math.min(contextualScore, 1) * 0.1;
  weightSum += 0.1;

  // Normalizar pelo peso total
  const finalScore = weightSum > 0 ? totalScore / weightSum : 0;

  // Garantir que score esteja entre 0 e 1
  return Math.min(Math.max(finalScore, 0), 1);
}

/**
 * Calcula similaridade combinada (keywords + semântica)
 * 
 * @param query - Query original
 * @param context - Contexto analisado (opcional)
 * @param chunk - Chunk de conteúdo
 * @returns Score combinado (0-1)
 */
export function calculateCombinedSimilarity(
  query: string,
  chunk: string,
  context?: QueryContext
): number {
  // Score baseado em keywords
  const keywordScore = calculateSimilarity(query, chunk);

  // Se temos contexto, calcular score semântico também
  if (context) {
    const semanticScore = calculateSemanticSimilarity(context, chunk);
    
    // Combinar: 60% keywords, 40% semântica
    return keywordScore * 0.6 + semanticScore * 0.4;
  }

  return keywordScore;
}

/**
 * Calcula scores de relevância para todos os chunks
 * 
 * @param chunks - Array de chunks
 * @param query - Query do usuário
 * @param context - Contexto analisado (opcional, para ranqueamento semântico)
 * @returns Chunks com scores atribuídos, ordenados por relevância
 */
export function scoreChunks(
  chunks: Chunk[],
  query: string,
  context?: QueryContext
): Chunk[] {
  if (!query || chunks.length === 0) {
    return chunks;
  }

  // Calcular score para cada chunk
  const scoredChunks = chunks.map(chunk => ({
    ...chunk,
    score: context
      ? calculateCombinedSimilarity(query, chunk.content, context)
      : calculateSimilarity(query, chunk.content),
  }));

  // Ordenar por score (maior primeiro)
  return scoredChunks.sort((a, b) => b.score - a.score);
}

/**
 * Seleciona os chunks mais relevantes que cabem no limite de tokens
 * 
 * @param chunks - Chunks com scores
 * @param maxTokens - Limite máximo de tokens
 * @param query - Query do usuário (para contexto)
 * @returns Chunks selecionados
 */
export function selectTopChunks(
  chunks: Chunk[],
  maxTokens: number,
  query: string = ''
): Chunk[] {
  if (chunks.length === 0) {
    return [];
  }

  // Estimar tokens (aproximação: 1 token ≈ 4 caracteres)
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Garantir que pelo menos um chunk seja selecionado
  const selected: Chunk[] = [];
  let totalTokens = 0;
  const maxChars = maxTokens * 4; // Converter tokens para chars

  // Selecionar chunks por ordem de relevância até atingir limite
  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.content);
    
    if (totalTokens + chunkTokens <= maxTokens) {
      selected.push(chunk);
      totalTokens += chunkTokens;
    } else {
      // Se ainda não selecionou nenhum, forçar seleção do primeiro (mesmo que exceda)
      if (selected.length === 0) {
        selected.push(chunk);
        break;
      }
      
      // Verificar se podemos adicionar parte do chunk
      const remainingChars = maxChars - (totalTokens * 4);
      if (remainingChars > 200) { // Mínimo de 200 chars para valer a pena
        // Criar chunk truncado
        const truncatedChunk: Chunk = {
          ...chunk,
          content: chunk.content.substring(0, remainingChars) + '...',
        };
        selected.push(truncatedChunk);
      }
      break;
    }
  }

  return selected;
}

/**
 * Filtra chunks por score mínimo
 * 
 * @param chunks - Chunks com scores
 * @param minScore - Score mínimo (0-1)
 * @returns Chunks que atendem ao score mínimo
 */
export function filterByMinScore(chunks: Chunk[], minScore: number = 0.1): Chunk[] {
  return chunks.filter(chunk => chunk.score >= minScore);
}

/**
 * Combina scoring e seleção em uma única função
 * 
 * @param chunks - Chunks originais
 * @param query - Query do usuário
 * @param maxTokens - Limite máximo de tokens
 * @param minScore - Score mínimo (opcional)
 * @param context - Contexto analisado (opcional, para ranqueamento semântico)
 * @returns Chunks selecionados e ordenados por relevância
 */
export function scoreAndSelectChunks(
  chunks: Chunk[],
  query: string,
  maxTokens: number,
  minScore?: number,
  context?: QueryContext
): Chunk[] {
  // Calcular scores
  let scoredChunks = scoreChunks(chunks, query, context);

  // Filtrar por score mínimo se especificado
  if (minScore !== undefined) {
    scoredChunks = filterByMinScore(scoredChunks, minScore);
  }

  // Selecionar top chunks
  return selectTopChunks(scoredChunks, maxTokens, query);
}


