import type { ResearchEntry } from '@/hooks/use-deep-research';
import type { QueryContext } from './contextual-analyzer';
import { processContent, type Chunk, type ProcessedContent } from './content-condenser';
import { scoreAndSelectChunks } from './relevance-scorer';
import { summarizeMarkdown } from './content-condenser';
import { chatLog } from './terminal-logger';

export interface CondensationResult {
  context: string;
  totalTokens: number;
  originalTokens: number;
  compressionRatio: number;
  chunksUsed: number;
  chunksTotal: number;
  method: 'chunks' | 'summarized' | 'fallback';
  sources: Array<{ title: string; url: string; chunksUsed: number }>;
}

export interface CondensationOptions {
  maxTokens?: number;
  minRelevanceScore?: number;
  autoSummarize?: boolean;
  summarizeThreshold?: number;
  fallbackToSummarization?: boolean;
  context?: QueryContext; // Contexto analisado para ranqueamento semântico
}

const DEFAULT_OPTIONS: Omit<Required<CondensationOptions>, 'context'> & { context?: QueryContext } = {
  maxTokens: 12000,
  minRelevanceScore: 0.1,
  autoSummarize: true,
  summarizeThreshold: 5000,
  fallbackToSummarization: true,
  context: undefined,
};

/**
 * Estima tokens de um texto (aproximação: 1 token ≈ 4 caracteres)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Sumariza todas as entradas e combina em um único contexto
 * 
 * @param entries - Entradas da Knowledge Base
 * @param query - Query do usuário
 * @param maxSummaryLength - Comprimento máximo de cada sumário
 * @returns Contexto sumarizado
 */
function fallbackSummarization(
  entries: ResearchEntry[],
  query: string,
  maxSummaryLength: number = 1500
): string {
  const summaries: string[] = [];

  entries.forEach((entry, idx) => {
    const summary = summarizeMarkdown(entry.content, maxSummaryLength);
    summaries.push(
      `[ID: ${idx + 1}] **${entry.title}**\nURL: ${entry.sourceUrl}\n\n${summary}\n\n---\n\n`
    );
  });

  const combined = summaries.join('');
  return `## KNOWLEDGE BASE (Resumo Condensado)\n\n${combined}`;
}

/**
 * Condensa Knowledge Base usando chunking inteligente e scoring
 * 
 * @param entries - Entradas da Knowledge Base
 * @param query - Query do usuário
 * @param options - Opções de condensação
 * @returns Resultado da condensação
 */
export function condenseKnowledgeBase(
  entries: ResearchEntry[],
  query: string,
  options: CondensationOptions = {}
): CondensationResult {
  const condensationStart = Date.now();
  
  chatLog.info(`\n[KnowledgeBase] ========== CONDENSATION START ==========`);
  chatLog.info(`[KnowledgeBase] Query: "${query}"`);
  chatLog.info(`[KnowledgeBase] Entries: ${entries.length}`);
  chatLog.info(`[KnowledgeBase] Options:`, {
    maxTokens: options.maxTokens || DEFAULT_OPTIONS.maxTokens,
    minRelevanceScore: options.minRelevanceScore || DEFAULT_OPTIONS.minRelevanceScore,
    autoSummarize: options.autoSummarize ?? DEFAULT_OPTIONS.autoSummarize,
  });
  
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (entries.length === 0) {
    chatLog.warn(`[KnowledgeBase] ⚠️ No entries to condense`);
    return {
      context: '',
      totalTokens: 0,
      originalTokens: 0,
      compressionRatio: 0,
      chunksUsed: 0,
      chunksTotal: 0,
      method: 'fallback',
      sources: [],
    };
  }

  // Calcular tokens originais
  const originalContent = entries.map(e => e.content).join('\n\n');
  const originalTokens = estimateTokens(originalContent);
  
  chatLog.info(`[KnowledgeBase] Original content: ${originalContent.length} chars`);
  chatLog.info(`[KnowledgeBase] Original tokens (estimated): ${originalTokens}`);

  // Processar cada entrada
  const allChunks: Chunk[] = [];
  const processedEntries: Array<{
    entry: ResearchEntry;
    processed: ProcessedContent;
    chunks: Chunk[];
  }> = [];

  chatLog.info(`[KnowledgeBase] Processing ${entries.length} entries into chunks...`);
  
  entries.forEach((entry, entryIndex) => {
    const entryStart = Date.now();
    chatLog.info(`\n[KnowledgeBase] --- Processing Entry ${entryIndex + 1}/${entries.length} ---`);
    chatLog.info(`[KnowledgeBase] Title: ${entry.title}`);
    chatLog.info(`[KnowledgeBase] URL: ${entry.sourceUrl}`);
    chatLog.info(`[KnowledgeBase] Content length: ${entry.content.length} chars`);
    
    const processed = processContent(entry.content, query, {
      summarizeThreshold: opts.summarizeThreshold,
    });

    // Atribuir sourceIndex e metadados aos chunks
    const chunksWithSource = processed.chunks.map((chunk, chunkIdx) => ({
      ...chunk,
      sourceIndex: entryIndex,
      sourceUrl: entry.sourceUrl,
      sourceTitle: entry.title,
    }));

    const entryDuration = Date.now() - entryStart;
    chatLog.info(`[KnowledgeBase] Generated ${chunksWithSource.length} chunks in ${entryDuration}ms`);
    
    // Log detalhes dos chunks
    if (chunksWithSource.length > 0) {
      chunksWithSource.slice(0, 3).forEach((chunk, chunkIdx) => {
        chatLog.info(`  Chunk ${chunkIdx + 1}: ${chunk.content.length} chars, relevance: ${chunk.relevanceScore?.toFixed(3) || 'N/A'}`);
      });
      if (chunksWithSource.length > 3) {
        chatLog.info(`  ... and ${chunksWithSource.length - 3} more chunks`);
      }
    }

    processedEntries.push({
      entry,
      processed,
      chunks: chunksWithSource,
    });

    allChunks.push(...chunksWithSource);
  });
  
  chatLog.info(`[KnowledgeBase] Total chunks generated: ${allChunks.length}`);

  // Calcular tokens disponíveis (reservar 20% para margem)
  const availableTokens = Math.floor(opts.maxTokens * 0.8);
  chatLog.info(`[KnowledgeBase] Available tokens: ${availableTokens} (max: ${opts.maxTokens}, reserved 20%)`);
  chatLog.info(`[KnowledgeBase] Min relevance score: ${opts.minRelevanceScore}`);

  // Selecionar chunks mais relevantes (usando contexto se disponível)
  const selectionStart = Date.now();
  chatLog.info(`[KnowledgeBase] Selecting most relevant chunks...`);
  
  let selectedChunks = scoreAndSelectChunks(
    allChunks,
    query,
    availableTokens,
    opts.minRelevanceScore,
    opts.context
  );
  
  const selectionDuration = Date.now() - selectionStart;
  chatLog.info(`[KnowledgeBase] Selected ${selectedChunks.length} chunks from ${allChunks.length} total in ${selectionDuration}ms`);
  
  // Log top chunks selecionados
  if (selectedChunks.length > 0) {
    chatLog.info(`[KnowledgeBase] Top 5 selected chunks:`);
    selectedChunks.slice(0, 5).forEach((chunk, idx) => {
      chatLog.info(`  [${idx + 1}] Score: ${chunk.relevanceScore?.toFixed(3) || 'N/A'}, Length: ${chunk.content.length} chars`);
      chatLog.info(`      Source: ${chunk.sourceTitle || 'Unknown'}`);
      chatLog.info(`      Preview: ${chunk.content.substring(0, 100)}...`);
    });
  }

  // Se não selecionou chunks suficientes ou método de fallback está ativo
  let method: 'chunks' | 'summarized' | 'fallback' = 'chunks';
  let context = '';

  if (selectedChunks.length === 0 && opts.fallbackToSummarization) {
    // Fallback: sumarizar tudo
    method = 'fallback';
    context = fallbackSummarization(entries, query);
  } else {
    // Construir contexto a partir dos chunks selecionados
    const chunksBySource = new Map<number, Chunk[]>();
    
    selectedChunks.forEach(chunk => {
      if (!chunksBySource.has(chunk.sourceIndex)) {
        chunksBySource.set(chunk.sourceIndex, []);
      }
      chunksBySource.get(chunk.sourceIndex)!.push(chunk);
    });

    // Agrupar chunks por fonte
    const sourceBlocks: string[] = [];
    const sourceStats: Array<{ title: string; url: string; chunksUsed: number }> = [];

    chunksBySource.forEach((chunks, sourceIndex) => {
      const entry = entries[sourceIndex];
      if (!entry) return;

      const sourceChunks = chunks
        .sort((a, b) => a.startIndex - b.startIndex)
        .map(c => c.content)
        .join('\n\n');

      sourceBlocks.push(
        `[ID: ${sourceIndex + 1}] **${entry.title}**\nURL: ${entry.sourceUrl}\n\n${sourceChunks}\n\n---\n\n`
      );

      sourceStats.push({
        title: entry.title,
        url: entry.sourceUrl,
        chunksUsed: chunks.length,
      });
    });

    context = `## KNOWLEDGE BASE (Verified Sources)\n\n${sourceBlocks.join('')}`;

    // Verificar se contexto excede limite
    const contextTokens = estimateTokens(context);
    if (contextTokens > opts.maxTokens && opts.fallbackToSummarization) {
      // Se ainda exceder, usar sumarização
      method = 'summarized';
      context = fallbackSummarization(entries, query);
    }
  }

  const totalTokens = estimateTokens(context);
  const compressionRatio = originalTokens > 0 ? totalTokens / originalTokens : 0;
  const condensationDuration = Date.now() - condensationStart;

  // Log resultado final
  chatLog.info(`\n[KnowledgeBase] ========== CONDENSATION RESULTS ==========`);
  chatLog.info(`[KnowledgeBase] Method: ${method}`);
  chatLog.info(`[KnowledgeBase] Duration: ${condensationDuration}ms`);
  chatLog.info(`[KnowledgeBase] Original tokens: ${originalTokens}`);
  chatLog.info(`[KnowledgeBase] Final tokens: ${totalTokens}`);
  chatLog.info(`[KnowledgeBase] Compression ratio: ${(compressionRatio * 100).toFixed(1)}%`);
  chatLog.info(`[KnowledgeBase] Chunks used: ${selectedChunks.length} / ${allChunks.length}`);
  chatLog.info(`[KnowledgeBase] Final context length: ${context.length} chars`);
  
  // Log estatísticas por fonte
  chatLog.info(`[KnowledgeBase] Chunks per source:`);
  entries.forEach((entry, idx) => {
    const chunksUsed = selectedChunks.filter(c => c.sourceIndex === idx).length;
    chatLog.info(`  ${entry.title}: ${chunksUsed} chunks`);
  });
  
  chatLog.info(`[KnowledgeBase] ============================================\n`);

  return {
    context: context.trim(),
    totalTokens,
    originalTokens,
    compressionRatio,
    chunksUsed: selectedChunks.length,
    chunksTotal: allChunks.length,
    method,
    sources: entries.map((entry, idx) => ({
      title: entry.title,
      url: entry.sourceUrl,
      chunksUsed: selectedChunks.filter(c => c.sourceIndex === idx).length,
    })),
  };
}

/**
 * Valida se o contexto condensado contém informações relevantes
 * 
 * @param result - Resultado da condensação
 * @param query - Query do usuário
 * @returns true se válido
 */
export function validateCondensedContext(
  result: CondensationResult,
  query: string
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!result.context || result.context.length < 100) {
    return {
      isValid: false,
      warnings: ['Contexto condensado está vazio ou muito curto'],
    };
  }

  if (result.chunksUsed === 0 && result.method !== 'fallback') {
    warnings.push('Nenhum chunk relevante foi selecionado');
  }

  if (result.compressionRatio > 0.5) {
    warnings.push(`Alta taxa de compressão (${(result.compressionRatio * 100).toFixed(1)}%) - informações podem ter sido perdidas`);
  }

  if (result.chunksUsed < result.chunksTotal * 0.3) {
    warnings.push(`Apenas ${result.chunksUsed} de ${result.chunksTotal} chunks foram selecionados`);
  }

  // Verificar se query aparece no contexto (básico)
  const normalizedQuery = query.toLowerCase();
  const normalizedContext = result.context.toLowerCase();
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 3);
  const matchingWords = queryWords.filter(word => normalizedContext.includes(word));
  
  if (matchingWords.length < queryWords.length * 0.5) {
    warnings.push('Poucas palavras-chave da query aparecem no contexto');
  }

  return {
    isValid: result.context.length >= 100,
    warnings,
  };
}


