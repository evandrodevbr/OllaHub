import { useState, useCallback } from 'react';
import { DEEP_RESEARCH_PROMPTS } from '@/data/prompts/deep-research';
import type { ScrapedContent } from '@/services/webSearch';
import { deepResearchLog as log } from '@/lib/terminal-logger';
import { condenseKnowledgeBase, validateCondensedContext } from '@/lib/knowledge-base-processor';
import type { CondensationResult } from '@/lib/knowledge-base-processor';
import { analyzeQueryContext, type QueryContext } from '@/lib/contextual-analyzer';
import { enrichQueries, type EnrichedQueries } from '@/lib/query-enricher';

export type DeepResearchStep = 'idle' | 'planning' | 'searching' | 'aggregating' | 'validating' | 'formulating' | 'complete' | 'error';

export interface ResearchEntry {
  id: string;
  query: string;
  sourceUrl: string;
  title: string;
  content: string;
  timestamp: number;
}

export interface DeepResearchLog {
  stage: 'decomposition' | 'search' | 'aggregation' | 'validation' | 'generation' | 'fallback';
  timestamp: number;
  input: string;
  rawOutput?: string;
  parsedOutput?: unknown;
  error?: string;
}

export interface DeepResearchState {
  step: DeepResearchStep;
  plan: string[];
  knowledgeBase: ResearchEntry[];
  validationReport: string;
  error?: string;
  logs: DeepResearchLog[];
  context?: QueryContext;
  enrichedQueries?: EnrichedQueries;
}

// ========== LOGGING UTILITIES ==========
function logSection(title: string) {
  log.info(`\n========== ${title} ==========`);
}

function logStep(message: string) {
  log.info(message);
}

function logData(label: string, data: unknown) {
  if (typeof data === 'string' && data.length > 500) {
    log.info(`${label}: ${data.substring(0, 500)}... [truncated, ${data.length} chars total]`);
  } else if (typeof data === 'object') {
    log.info(`${label}: ${JSON.stringify(data, null, 2)}`);
  } else {
    log.info(`${label}: ${data}`);
  }
}

function logError(message: string, error?: unknown) {
  log.error(`❌ ERROR: ${message}${error ? ` - ${error}` : ''}`);
}

function logSuccess(message: string) {
  log.info(`✅ ${message}`);
}

/**
 * Extracts an array of queries from various LLM response formats.
 * Handles: plain arrays, objects with "queries"/"plan"/"searches" keys,
 * markdown code blocks, and other common formats.
 */
function extractQueriesFromResponse(raw: string): string[] {
  logStep('--- Parsing LLM Response ---');
  logData('Raw response', raw);
  
  // 1. Strip markdown code blocks (```json ... ``` or ``` ... ```)
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // 2. Try to parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
    logStep('Direct JSON parse successful');
  } catch {
    logStep('Direct JSON parse failed, trying to extract JSON from string...');
    // If JSON parse fails, try to find JSON-like content in the string
    const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
        logStep('Extracted JSON from string successfully');
      } catch {
        logError('Could not extract JSON from response');
        throw new Error('Could not extract JSON from response');
      }
    } else {
      logError('No JSON found in response');
      throw new Error('No JSON found in response');
    }
  }

  // 3. Handle different formats
  if (Array.isArray(parsed)) {
    const result = (parsed as unknown[]).filter(item => typeof item === 'string' && (item as string).trim().length > 0) as string[];
    logSuccess(`Parsed as plain array: ${result.length} queries`);
    return result;
  }

  // 4. Check common object keys used by different models
  const commonKeys = ['queries', 'query', 'plan', 'searches', 'search_queries', 'questions'];
  for (const key of commonKeys) {
    const obj = parsed as Record<string, unknown>;
    const val = obj[key];
    if (Array.isArray(val)) {
      const result = (val as unknown[]).filter((item: unknown) => typeof item === 'string' && (item as string).trim().length > 0) as string[];
      logSuccess(`Found queries under key "${key}": ${result.length} queries`);
      return result;
    }
  }

  // 5. Fallback: find first array value in the object
  for (const val of Object.values(parsed as Record<string, unknown>)) {
    if (Array.isArray(val) && val.length > 0 && typeof (val as unknown[])[0] === 'string') {
      const result = (val as unknown[]).filter((item: unknown) => typeof item === 'string' && (item as string).trim().length > 0) as string[];
      logSuccess(`Found queries in object value: ${result.length} queries`);
      return result;
    }
  }

  logError('No array of queries found in response');
  throw new Error('No array of queries found in response');
}

export function useDeepResearch() {
  const [state, setState] = useState<DeepResearchState>({
    step: 'idle',
    plan: [],
    knowledgeBase: [],
    validationReport: '',
    logs: [],
  });

  const addLog = (log: DeepResearchLog) => {
    setState(s => ({ ...s, logs: [...s.logs, log] }));
  };

  const callLLM = async (model: string, prompt: string, json = false) => {
    logStep(`Calling LLM (model: ${model}, json: ${json})`);
    logData('Prompt length', `${prompt.length} chars`);
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const response = await invoke<string>('generate_completion', {
        model,
        prompt,
        options: {
          temperature: 0.2,
          num_predict: 2048,
          format: json ? 'json' : undefined,
        },
      });
      
      logSuccess(`LLM response received (${response?.length || 0} chars)`);
      return response;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logError('LLM Call Error', errorMsg);
      throw e;
    }
  };

  // --- CONTEXTUAL ANALYSIS ---
  const analyzeContext = useCallback(async (query: string, model: string): Promise<QueryContext | null> => {
    logStep('--- Contextual Analysis ---');
    try {
      const context = await analyzeQueryContext(query, model);
      logData('Context Analysis', {
        intent: context.intent,
        entities: context.entities.length,
        topics: context.topics.length,
        keywords: context.keywords.length,
      });
      setState(s => ({ ...s, context }));
      return context;
    } catch (error) {
      log.warn(`Contextual analysis failed, continuing without context: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }, []);

  // --- QUERY ENRICHMENT ---
  const enrich = useCallback(async (query: string, context: QueryContext | null, model: string): Promise<EnrichedQueries | null> => {
    if (!context) {
      return null;
    }
    
    logStep('--- Query Enrichment ---');
    try {
      const enriched = await enrichQueries(query, context, model);
      logData('Enriched Queries', {
        literal: enriched.literal.length,
        semantic: enriched.semantic.length,
        related: enriched.related.length,
        expanded: enriched.expanded.length,
        contextual: enriched.contextual.length,
      });
      setState(s => ({ ...s, enrichedQueries: enriched }));
      return enriched;
    } catch (error) {
      log.warn(`Query enrichment failed, continuing without enrichment: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }, []);

  // --- DECOMPOSITION ---
  const decompose = useCallback(async (query: string, model: string) => {
    logSection('DECOMPOSITION');
    logData('User Query', query);
    logData('Model', model);
    
    setState(s => ({ ...s, step: 'planning', error: undefined, logs: [], knowledgeBase: [] }));
    
    try {
      // Análise contextual (opcional, não bloqueia se falhar)
      const context = await analyzeContext(query, model);
      
      // Enriquecimento de queries (opcional, não bloqueia se falhar)
      const enriched = context ? await enrich(query, context, model) : null;
      
      const prompt = DEEP_RESEARCH_PROMPTS.DECOMPOSITION.replace('{{userQuery}}', query);
      logStep('Sending decomposition prompt to LLM...');
      const response = await callLLM(model, prompt, true);
      
      let plan: string[] = [];
      let parseError = undefined;
      
      try {
        plan = extractQueriesFromResponse(response);
        logData('Parsed Plan', plan);
      } catch (e) {
        logError('Failed to extract queries, falling back to original query', e);
        parseError = `JSON Parse Failed: ${e instanceof Error ? e.message : 'Unknown'}`;
        plan = [query];
      }

      logStep('--- Safety Check ---');
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      logData('Keywords from query', keywords);
      const isSmallModel = /(?:270m|0\.5b|1b|1\.7b|2b|mini|small|abliterated|uncensored|qwen3|llama2)/i.test(model);
      if (isSmallModel) {
        logStep('Safety Check bypassed for small/experimental model');
      } else {
        const isRelevant = plan.some(q => 
          keywords.some(k => q.toLowerCase().includes(k))
        );
        logData('Plan is relevant', isRelevant);
        if (!isRelevant && keywords.length > 0) {
          logError('Safety Check Failed: Plan is irrelevant to query');
          logData('Generated plan', plan);
          logStep('Falling back to original query');
          addLog({
            stage: 'decomposition',
            timestamp: Date.now(),
            input: prompt,
            rawOutput: response,
            parsedOutput: plan,
            error: 'Safety Check Failed: Plan irrelevant to query'
          });
          plan = [query];
        }
      }
      addLog({
        stage: 'decomposition',
        timestamp: Date.now(),
        input: prompt,
        rawOutput: response,
        parsedOutput: plan,
        error: parseError
      });
      logSuccess(`Decomposition complete: ${plan.length} search queries generated`);

      setState(s => ({ ...s, plan }));
      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('Decomposition failed', errorMessage);
      setState(s => ({ ...s, step: 'error', error: 'Failed to create research plan' }));
      addLog({ stage: 'decomposition', timestamp: Date.now(), input: query, error: errorMessage });
      return [];
    }
  }, []);

  // --- ADD TO KNOWLEDGE BASE ---
  const addToKnowledgeBase = useCallback((query: string, sources: ScrapedContent[]) => {
    logSection('ADDING TO KNOWLEDGE BASE');
    logData('Query', query);
    logData('Sources count', sources.length);
    logData('Timestamp', new Date().toISOString());
    
    const entries: ResearchEntry[] = sources.map((src, idx) => ({
      id: `${query.substring(0, 10)}-${idx}-${Date.now()}`,
      query,
      sourceUrl: src.url,
      title: src.title,
      content: src.markdown || src.content || '',
      timestamp: Date.now(),
    }));

    // Log detalhado de cada fonte
    sources.forEach((src, idx) => {
      logStep(`\n--- Source ${idx + 1}/${sources.length} ---`);
      logData('Title', src.title);
      logData('URL', src.url);
      
      const contentLength = src.markdown?.length || src.content?.length || 0;
      const snippetLength = src.snippet?.length || 0;
      
      logData('Content length (markdown)', `${contentLength} chars`);
      logData('Snippet length', `${snippetLength} chars`);
      logData('Cached', src.cached ? 'Yes' : 'No');
      
      if (src.markdown && contentLength > 0) {
        // Log preview mais detalhado
        const preview = src.markdown.substring(0, 500);
        logData('Content preview', preview + (contentLength > 500 ? '...' : ''));
        
        // Estatísticas do conteúdo
        const wordCount = src.markdown.split(/\s+/).length;
        const paragraphCount = src.markdown.split(/\n\n/).length;
        logData('Word count', wordCount);
        logData('Paragraph count', paragraphCount);
      } else if (src.content && src.content.length > 0) {
        const preview = src.content.substring(0, 500);
        logData('Content preview (raw)', preview + (src.content.length > 500 ? '...' : ''));
      } else {
        logError('No content extracted from this source');
      }
      
      // Log snippet se disponível
      if (src.snippet) {
        logData('Snippet', src.snippet.substring(0, 200) + (snippetLength > 200 ? '...' : ''));
      }
    });
    
    // Estatísticas agregadas
    const totalContentLength = entries.reduce((sum, e) => sum + e.content.length, 0);
    const avgContentLength = entries.length > 0 ? totalContentLength / entries.length : 0;
    logStep('\n--- Aggregated Statistics ---');
    logData('Total entries', entries.length);
    logData('Total content length', `${totalContentLength} chars`);
    logData('Average content length', `${Math.round(avgContentLength)} chars`);

    setState(s => ({
      ...s,
      knowledgeBase: [...s.knowledgeBase, ...entries]
    }));

    addLog({
      stage: 'search',
      timestamp: Date.now(),
      input: query,
      parsedOutput: entries.map(e => ({ 
        id: e.id, 
        title: e.title, 
        url: e.sourceUrl,
        contentLength: e.content.length,
        contentPreview: e.content.substring(0, 200) + (e.content.length > 200 ? '...' : '')
      }))
    });

    logSuccess(`Added ${entries.length} entries to Knowledge Base`);
    return entries;
  }, []);

  // --- DEDUPLICATE & FORMAT CONTEXT (LEGACY - mantido para compatibilidade) ---
  const getCuratedContext = useCallback((maxTokens: number = 12000) => {
    logSection('AGGREGATION');
    const kb = state.knowledgeBase;
    logData('Raw KB entries', kb.length);
    
    if (kb.length === 0) {
      logStep('Knowledge Base is empty, skipping aggregation');
      return '';
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = kb.filter(entry => {
      if (seen.has(entry.sourceUrl)) return false;
      seen.add(entry.sourceUrl);
      return true;
    });
    logData('Unique entries (after dedup)', unique.length);

    // Format as Knowledge Base
    let context = '## KNOWLEDGE BASE (Verified Sources)\n\n';
    let currentLength = context.length;
    const avgCharsPerToken = 4;
    const maxChars = maxTokens * avgCharsPerToken;
    logData('Max chars allowed', maxChars);

    unique.forEach((entry, idx) => {
      const snippet = entry.content.length > 1500 
        ? entry.content.substring(0, 1500) + '...' 
        : entry.content;
      
      const block = `[ID: ${idx + 1}] **${entry.title}**\nURL: ${entry.sourceUrl}\n${snippet}\n\n---\n\n`;
      
      if (currentLength + block.length < maxChars) {
        context += block;
        currentLength += block.length;
      } else {
        logStep(`  → Skipping entry ${idx + 1} (would exceed max chars)`);
      }
    });

    addLog({
      stage: 'aggregation',
      timestamp: Date.now(),
      input: `${kb.length} raw entries`,
      parsedOutput: `${unique.length} unique entries, ${currentLength} chars`
    });

    logSuccess(`Knowledge Base formatted: ${unique.length} entries, ${currentLength} chars`);
    return context;
  }, [state.knowledgeBase]);

  // --- OPTIMIZED CONTEXT WITH CONDENSATION ---
  const getCuratedContextOptimized = useCallback((
    query: string,
    maxTokens: number = 12000,
    options?: {
      minRelevanceScore?: number;
      autoSummarize?: boolean;
      fallbackToSummarization?: boolean;
    }
  ): { context: string; result: CondensationResult } => {
    logSection('AGGREGATION (OPTIMIZED)');
    const kb = state.knowledgeBase;
    logData('Raw KB entries', kb.length);
    logData('User Query', query);
    logData('Max Tokens', maxTokens);
    
    if (kb.length === 0) {
      logStep('Knowledge Base is empty, skipping aggregation');
      return {
        context: '',
        result: {
          context: '',
          totalTokens: 0,
          originalTokens: 0,
          compressionRatio: 0,
          chunksUsed: 0,
          chunksTotal: 0,
          method: 'fallback',
          sources: [],
        },
      };
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = kb.filter(entry => {
      if (seen.has(entry.sourceUrl)) return false;
      seen.add(entry.sourceUrl);
      return true;
    });
    logData('Unique entries (after dedup)', unique.length);

    // Condensar Knowledge Base
    const condensationResult = condenseKnowledgeBase(unique, query, {
      maxTokens,
      minRelevanceScore: options?.minRelevanceScore ?? 0.1,
      autoSummarize: options?.autoSummarize ?? true,
      fallbackToSummarization: options?.fallbackToSummarization ?? true,
    });

    // Log detalhado do resultado
    logData('Condensation Method', condensationResult.method);
    logData('Original Tokens', condensationResult.originalTokens);
    logData('Final Tokens', condensationResult.totalTokens);
    logData('Compression Ratio', `${(condensationResult.compressionRatio * 100).toFixed(1)}%`);
    logData('Chunks Used', `${condensationResult.chunksUsed} / ${condensationResult.chunksTotal}`);
    
    // Log preview dos chunks selecionados
    if (condensationResult.chunksUsed > 0) {
      logStep('--- Selected Chunks Preview ---');
      // O contexto já contém os chunks, vamos logar um preview
      const preview = condensationResult.context.substring(0, 500);
      logData('Context Preview', preview + (condensationResult.context.length > 500 ? '...' : ''));
    }

    // Log estatísticas por fonte
    logStep('--- Source Statistics ---');
    condensationResult.sources.forEach((source, idx) => {
      logData(`Source ${idx + 1}`, `${source.title}: ${source.chunksUsed} chunks used`);
    });

    // Validar contexto
    const validation = validateCondensedContext(condensationResult, query);
    if (!validation.isValid) {
      logError('Context validation failed', validation.warnings.join(', '));
    } else if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        logStep(`⚠️ Warning: ${warning}`);
      });
    }

    addLog({
      stage: 'aggregation',
      timestamp: Date.now(),
      input: `${kb.length} raw entries, query: "${query}"`,
      parsedOutput: {
        method: condensationResult.method,
        chunksUsed: condensationResult.chunksUsed,
        chunksTotal: condensationResult.chunksTotal,
        compressionRatio: condensationResult.compressionRatio,
        totalTokens: condensationResult.totalTokens,
      },
    });

    logSuccess(`Knowledge Base optimized: ${condensationResult.chunksUsed} chunks selected, ${condensationResult.totalTokens} tokens`);
    
    return {
      context: condensationResult.context,
      result: condensationResult,
    };
  }, [state.knowledgeBase]);

  // --- VALIDATION ---
  const validate = useCallback(async (model: string, userQuery: string) => {
    logSection('VALIDATION');
    logData('User Query', userQuery);
    
    setState(s => ({ ...s, step: 'validating' }));
    
    const context = getCuratedContext();
    if (!context || context.length < 100) {
      logError('Insufficient context for validation');
      addLog({ stage: 'validation', timestamp: Date.now(), input: 'No context', error: 'Insufficient data' });
      return '';
    }

    try {
      const prompt = DEEP_RESEARCH_PROMPTS.CONTEXT_CHECK
        .replace('{{knowledgeBase}}', context)
        .replace('{{userQuery}}', userQuery);
      
      logStep('Sending validation prompt to LLM...');
      logData('Prompt length', `${prompt.length} chars`);
      
      const report = await callLLM(model, prompt);
      
      logSuccess('Validation complete');
      logData('Validation Report', report);
      
      addLog({
        stage: 'validation',
        timestamp: Date.now(),
        input: prompt.substring(0, 200) + '...',
        rawOutput: report,
        parsedOutput: report
      });

      setState(s => ({ ...s, validationReport: report }));
      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError('Validation failed', errorMessage);
      setState(s => ({ ...s, step: 'error', error: 'Validation failed' }));
      addLog({ stage: 'validation', timestamp: Date.now(), input: 'Validation', error: errorMessage });
      return '';
    }
  }, [getCuratedContext]);

  // --- RESET ---
  const reset = useCallback(() => {
    logStep('Resetting Deep Research state');
    setState({
      step: 'idle',
      plan: [],
      knowledgeBase: [],
      validationReport: '',
      logs: [],
    });
  }, []);

  return {
    state,
    decompose,
    addToKnowledgeBase,
    getCuratedContext,
    getCuratedContextOptimized,
    validate,
    reset,
    setStep: (step: DeepResearchStep) => setState(s => ({ ...s, step }))
  };
}
