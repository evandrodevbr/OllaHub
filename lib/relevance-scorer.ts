import type { Chunk } from './content-condenser';
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
 * Calcula scores de relevância para todos os chunks
 * 
 * @param chunks - Array de chunks
 * @param query - Query do usuário
 * @returns Chunks com scores atribuídos, ordenados por relevância
 */
export function scoreChunks(chunks: Chunk[], query: string): Chunk[] {
  if (!query || chunks.length === 0) {
    return chunks;
  }

  // Calcular score para cada chunk
  const scoredChunks = chunks.map(chunk => ({
    ...chunk,
    score: calculateSimilarity(query, chunk.content),
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
 * @returns Chunks selecionados e ordenados por relevância
 */
export function scoreAndSelectChunks(
  chunks: Chunk[],
  query: string,
  maxTokens: number,
  minScore?: number
): Chunk[] {
  // Calcular scores
  let scoredChunks = scoreChunks(chunks, query);

  // Filtrar por score mínimo se especificado
  if (minScore !== undefined) {
    scoredChunks = filterByMinScore(scoredChunks, minScore);
  }

  // Selecionar top chunks
  return selectTopChunks(scoredChunks, maxTokens, query);
}


