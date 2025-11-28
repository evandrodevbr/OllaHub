import type { ResearchEntry } from '@/hooks/use-deep-research';
import type { QueryContext } from './contextual-analyzer';
import { chatLog } from './terminal-logger';

/**
 * Fato extraído de uma fonte
 */
export interface ExtractedFact {
  fact: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  confidence: number; // 0-1
  entities?: string[]; // Entidades mencionadas no fato
}

/**
 * Resultado da unificação de contexto
 */
export interface UnifiedContext {
  unifiedText: string;
  keyFacts: ExtractedFact[];
  contradictions: Array<{
    fact1: ExtractedFact;
    fact2: ExtractedFact;
    description: string;
  }>;
  sources: Array<{
    id: string;
    title: string;
    url: string;
    factsCount: number;
  }>;
  totalFacts: number;
  uniqueFacts: number;
}

/**
 * Prompt para extração de fatos usando LLM
 */
const FACT_EXTRACTION_PROMPT = `Você é um especialista em extração de fatos e análise de informações.

Analise o conteúdo abaixo e extraia os fatos principais relevantes para responder à query do usuário.

## QUERY DO USUÁRIO
"{{query}}"

## CONTEXTO ANALISADO
- Intenção: {{intent}}
- Tópicos: {{topics}}
- Entidades: {{entities}}

## CONTEÚDO DA FONTE
Título: {{title}}
URL: {{url}}

{{content}}

## INSTRUÇÕES

Extraia os fatos principais do conteúdo acima que são relevantes para responder à query do usuário.

Para cada fato:
- Seja específico e factual
- Inclua entidades mencionadas (pessoas, lugares, datas, conceitos)
- Mantenha o contexto necessário para entender o fato
- Evite informações genéricas ou óbvias

## FORMATO DE SAÍDA

Retorne APENAS um JSON válido com um array de fatos:

[
  {
    "fact": "Fato específico extraído do conteúdo",
    "entities": ["entidade1", "entidade2"],
    "confidence": 0.9
  },
  ...
]

IMPORTANTE:
- Retorne APENAS o JSON, sem markdown, sem explicações
- Confidence deve ser entre 0 e 1 (0.9 = muito confiável, 0.5 = incerto)
- Extraia 3-8 fatos principais, não mais
- Fatos devem ser independentes e específicos`;

/**
 * Extrai fatos principais de uma entrada de pesquisa
 */
export async function extractKeyFacts(
  entry: ResearchEntry,
  query: string,
  context: QueryContext | null,
  model: string
): Promise<ExtractedFact[]> {
  try {
    const entitiesStr = context?.entities.map(e => `${e.type}: ${e.value}`).join(', ') || 'nenhuma';
    const topicsStr = context?.topics.join(', ') || 'nenhum';
    const intentStr = context?.intent || 'unknown';

    const prompt = FACT_EXTRACTION_PROMPT
      .replace('{{query}}', query)
      .replace('{{intent}}', intentStr)
      .replace('{{topics}}', topicsStr)
      .replace('{{entities}}', entitiesStr)
      .replace('{{title}}', entry.title)
      .replace('{{url}}', entry.sourceUrl)
      .replace('{{content}}', entry.content.substring(0, 4000)); // Limitar tamanho

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 600,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawResponse = (data.response || '').trim();

    // Limpar e extrair JSON
    let jsonText = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const facts = JSON.parse(jsonText) as Array<{
      fact: string;
      entities?: string[];
      confidence: number;
    }>;

    return facts.map(f => ({
      fact: f.fact,
      sourceId: entry.id,
      sourceUrl: entry.sourceUrl,
      sourceTitle: entry.title,
      confidence: f.confidence || 0.7,
      entities: f.entities || [],
    }));
  } catch (error) {
    chatLog.warn(`[ContextUnifier] Erro ao extrair fatos de ${entry.title}: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback: criar fato básico do título
    return [{
      fact: entry.title,
      sourceId: entry.id,
      sourceUrl: entry.sourceUrl,
      sourceTitle: entry.title,
      confidence: 0.5,
    }];
  }
}

/**
 * Detecta contradições entre fatos
 */
function detectContradictions(facts: ExtractedFact[]): Array<{
  fact1: ExtractedFact;
  fact2: ExtractedFact;
  description: string;
}> {
  const contradictions: Array<{
    fact1: ExtractedFact;
    fact2: ExtractedFact;
    description: string;
  }> = [];

  // Comparar fatos por similaridade de entidades
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const fact1 = facts[i];
      const fact2 = facts[j];

      // Verificar se mencionam as mesmas entidades
      const sharedEntities = fact1.entities?.filter(e => 
        fact2.entities?.includes(e)
      ) || [];

      if (sharedEntities.length > 0) {
        // Verificar se os fatos são contraditórios (heurística simples)
        const fact1Lower = fact1.fact.toLowerCase();
        const fact2Lower = fact2.fact.toLowerCase();

        // Palavras que indicam contradição
        const contradictionIndicators = [
          fact1Lower.includes('não') && fact2Lower.includes('sim'),
          fact1Lower.includes('sim') && fact2Lower.includes('não'),
          fact1Lower.includes('falso') && !fact2Lower.includes('falso'),
          !fact1Lower.includes('falso') && fact2Lower.includes('falso'),
        ];

        if (contradictionIndicators.some(Boolean)) {
          contradictions.push({
            fact1,
            fact2,
            description: `Possível contradição sobre ${sharedEntities.join(', ')}`,
          });
        }
      }
    }
  }

  return contradictions;
}

/**
 * Agrupa fatos similares
 */
function groupSimilarFacts(facts: ExtractedFact[]): Map<string, ExtractedFact[]> {
  const groups = new Map<string, ExtractedFact[]>();

  for (const fact of facts) {
    // Criar chave baseada em entidades principais
    const key = fact.entities?.slice(0, 2).join('|') || fact.fact.substring(0, 50);
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(fact);
  }

  return groups;
}

/**
 * Unifica contexto de múltiplas fontes
 */
export async function unifyContext(
  entries: ResearchEntry[],
  query: string,
  context: QueryContext | null,
  model: string
): Promise<UnifiedContext> {
  chatLog.info(`[ContextUnifier] Unificando contexto de ${entries.length} fontes`);

  // Extrair fatos de todas as fontes
  const allFacts: ExtractedFact[] = [];
  const factPromises = entries.map(entry => extractKeyFacts(entry, query, context, model));
  const factArrays = await Promise.all(factPromises);
  
  for (const facts of factArrays) {
    allFacts.push(...facts);
  }

  chatLog.info(`[ContextUnifier] Extraídos ${allFacts.length} fatos de ${entries.length} fontes`);

  // Agrupar fatos similares
  const factGroups = groupSimilarFacts(allFacts);

  // Detectar contradições
  const contradictions = detectContradictions(allFacts);

  if (contradictions.length > 0) {
    chatLog.warn(`[ContextUnifier] Detectadas ${contradictions.length} possíveis contradições`);
  }

  // Criar texto unificado
  const unifiedSections: string[] = [];
  const sourceMap = new Map<string, { id: string; title: string; url: string; factsCount: number }>();

  // Agrupar por fonte
  for (const entry of entries) {
    const entryFacts = allFacts.filter(f => f.sourceId === entry.id);
    
    if (entryFacts.length > 0) {
      sourceMap.set(entry.id, {
        id: entry.id,
        title: entry.title,
        url: entry.sourceUrl,
        factsCount: entryFacts.length,
      });

      unifiedSections.push(`## ${entry.title}`);
      unifiedSections.push(`Fonte: ${entry.sourceUrl}\n`);
      
      // Adicionar fatos principais
      entryFacts
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5) // Top 5 fatos por fonte
        .forEach(fact => {
          unifiedSections.push(`- ${fact.fact}`);
        });
      
      unifiedSections.push('');
    }
  }

  const unifiedText = unifiedSections.join('\n');

  // Remover duplicatas de fatos (mesmo texto)
  const uniqueFacts = Array.from(
    new Map(allFacts.map(f => [f.fact.toLowerCase(), f])).values()
  );

  return {
    unifiedText,
    keyFacts: allFacts.sort((a, b) => b.confidence - a.confidence),
    contradictions,
    sources: Array.from(sourceMap.values()),
    totalFacts: allFacts.length,
    uniqueFacts: uniqueFacts.length,
  };
}

