import { chatLog } from './terminal-logger';

/**
 * Tipos de intenção da query
 */
export type QueryIntent = 
  | 'factual'      // Busca por fatos específicos
  | 'comparison'   // Comparação entre entidades
  | 'how-to'       // Instruções ou tutoriais
  | 'definition'   // Definição de conceito
  | 'list'         // Listagem de itens
  | 'opinion'      // Opiniões ou análises
  | 'temporal'     // Informações temporais (quando, histórico)
  | 'causal'       // Causa e efeito (por que, como funciona)
  | 'unknown';      // Não identificado

/**
 * Entidade extraída da query
 */
export interface ExtractedEntity {
  type: 'person' | 'location' | 'date' | 'concept' | 'organization' | 'event' | 'product' | 'other';
  value: string;
  confidence: number; // 0-1
}

/**
 * Relacionamento entre entidades
 */
export interface EntityRelationship {
  from: string;
  to: string;
  relation: string; // ex: "localizado em", "criado por", "relacionado com"
  confidence: number;
}

/**
 * Contexto temporal extraído
 */
export interface TemporalContext {
  period?: string;      // ex: "2024", "últimos 5 anos"
  date?: string;        // Data específica
  relative?: string;    // ex: "recente", "atual", "histórico"
}

/**
 * Contexto geográfico extraído
 */
export interface GeographicContext {
  location?: string;   // Cidade, estado, país
  region?: string;      // Região, continente
  coordinates?: { lat: number; lng: number };
}

/**
 * Análise contextual completa da query
 */
export interface QueryContext {
  originalQuery: string;
  intent: QueryIntent;
  entities: ExtractedEntity[];
  topics: string[];                    // Tópicos principais identificados
  relationships: EntityRelationship[]; // Relacionamentos entre entidades
  implicitQuestions: string[];         // Perguntas implícitas na query
  temporalContext?: TemporalContext;
  geographicContext?: GeographicContext;
  keywords: string[];                   // Palavras-chave importantes
  synonyms: string[];                   // Sinônimos relevantes
  domain?: string;                      // Domínio (ex: "acadêmico", "tecnologia", "saúde")
  complexity: 'simple' | 'moderate' | 'complex';
}

/**
 * Prompt para análise contextual usando LLM
 */
const CONTEXTUAL_ANALYSIS_PROMPT = `Você é um especialista em análise semântica e extração de contexto de queries de busca.

Analise a query abaixo e extraia TODAS as informações contextuais relevantes.

Query: "{{query}}"

## INSTRUÇÕES

1. **INTENÇÃO**: Identifique o tipo de intenção (factual, comparison, how-to, definition, list, opinion, temporal, causal)
2. **ENTIDADES**: Extraia todas as entidades mencionadas (pessoas, lugares, datas, conceitos, organizações, eventos, produtos)
3. **TÓPICOS**: Identifique os tópicos principais abordados
4. **RELACIONAMENTOS**: Identifique relacionamentos implícitos entre entidades
5. **PERGUNTAS IMPLÍCITAS**: Quais perguntas relacionadas estão implícitas?
6. **CONTEXTO TEMPORAL**: Há referências a tempo? (datas, períodos, "recente", "atual", "histórico")
7. **CONTEXTO GEOGRÁFICO**: Há referências a localização? (cidades, estados, países, regiões)
8. **PALAVRAS-CHAVE**: Identifique palavras-chave importantes (remover stop words)
9. **SINÔNIMOS**: Liste sinônimos relevantes para os termos principais
10. **DOMÍNIO**: Identifique o domínio da query (acadêmico, tecnologia, saúde, negócios, etc.)
11. **COMPLEXIDADE**: Avalie a complexidade (simple, moderate, complex)

## FORMATO DE SAÍDA

Retorne APENAS um JSON válido no seguinte formato:

{
  "intent": "list",
  "entities": [
    {"type": "concept", "value": "resultados acadêmicos", "confidence": 0.9},
    {"type": "concept", "value": "prêmios", "confidence": 0.9}
  ],
  "topics": ["pesquisa científica", "reconhecimento acadêmico", "premiações"],
  "relationships": [
    {"from": "resultados acadêmicos", "to": "prêmios", "relation": "recebem", "confidence": 0.8}
  ],
  "implicitQuestions": [
    "Quais foram os prêmios acadêmicos mais recentes?",
    "Quem recebeu prêmios acadêmicos?"
  ],
  "temporalContext": {"relative": "recente", "period": "2024"},
  "geographicContext": null,
  "keywords": ["resultados", "acadêmicos", "premiados", "últimos"],
  "synonyms": ["pesquisas", "estudos", "trabalhos científicos", "reconhecimento", "distinções"],
  "domain": "acadêmico",
  "complexity": "moderate"
}

IMPORTANTE:
- Retorne APENAS o JSON, sem markdown, sem explicações
- Use null para campos não aplicáveis
- Confidence deve ser entre 0 e 1
- Preserve nomes próprios e termos técnicos na forma original`;

/**
 * Analisa o contexto de uma query usando LLM
 * 
 * @param query - Query original do usuário
 * @param model - Modelo LLM a ser usado
 * @returns Análise contextual completa
 */
export async function analyzeQueryContext(
  query: string,
  model: string
): Promise<QueryContext> {
  if (!query || !query.trim()) {
    return {
      originalQuery: query,
      intent: 'unknown',
      entities: [],
      topics: [],
      relationships: [],
      implicitQuestions: [],
      keywords: [],
      synonyms: [],
      complexity: 'simple',
    };
  }

  chatLog.info(`[ContextualAnalysis] Analisando contexto da query: "${query}"`);

  try {
    const prompt = CONTEXTUAL_ANALYSIS_PROMPT.replace('{{query}}', query);

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3, // Baixa temperatura para análise mais determinística
          num_predict: 800,  // Espaço suficiente para JSON completo
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const rawResponse = (data.response || '').trim();

    // Limpar resposta (remover markdown code blocks se houver)
    let jsonText = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    // Tentar extrair JSON se houver texto antes/depois
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const analysis = JSON.parse(jsonText) as Partial<QueryContext>;

    // Validar e preencher campos obrigatórios
    const context: QueryContext = {
      originalQuery: query,
      intent: (analysis.intent as QueryIntent) || 'unknown',
      entities: analysis.entities || [],
      topics: analysis.topics || [],
      relationships: analysis.relationships || [],
      implicitQuestions: analysis.implicitQuestions || [],
      temporalContext: analysis.temporalContext,
      geographicContext: analysis.geographicContext,
      keywords: analysis.keywords || [],
      synonyms: analysis.synonyms || [],
      domain: analysis.domain,
      complexity: analysis.complexity || 'moderate',
    };

    chatLog.success(`[ContextualAnalysis] Contexto extraído: ${context.intent}, ${context.entities.length} entidades, ${context.topics.length} tópicos`);

    return context;
  } catch (error) {
    chatLog.error(`[ContextualAnalysis] Erro ao analisar contexto:`, error);

    // Fallback: análise básica usando heurísticas
    return createFallbackContext(query);
  }
}

/**
 * Cria contexto básico usando heurísticas quando a análise LLM falha
 */
function createFallbackContext(query: string): QueryContext {
  const lowerQuery = query.toLowerCase();
  
  // Detectar intenção básica
  let intent: QueryIntent = 'factual';
  if (lowerQuery.includes('como') || lowerQuery.includes('tutorial')) {
    intent = 'how-to';
  } else if (lowerQuery.includes('o que é') || lowerQuery.includes('definição')) {
    intent = 'definition';
  } else if (lowerQuery.includes('quais') || lowerQuery.includes('lista')) {
    intent = 'list';
  } else if (lowerQuery.includes('comparar') || lowerQuery.includes('vs')) {
    intent = 'comparison';
  } else if (lowerQuery.includes('por que') || lowerQuery.includes('causa')) {
    intent = 'causal';
  }

  // Extrair palavras-chave básicas
  const stopWords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos',
    'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem',
    'que', 'qual', 'quais', 'onde', 'quando', 'como', 'porque',
  ]);

  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));

  // Detectar contexto temporal
  let temporalContext: TemporalContext | undefined;
  if (lowerQuery.includes('último') || lowerQuery.includes('recente') || lowerQuery.includes('atual')) {
    temporalContext = { relative: 'recente' };
  } else if (lowerQuery.includes('2024') || lowerQuery.includes('2023')) {
    const yearMatch = query.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      temporalContext = { period: yearMatch[1] };
    }
  }

  return {
    originalQuery: query,
    intent,
    entities: [],
    topics: keywords.slice(0, 5), // Usar keywords como tópicos
    relationships: [],
    implicitQuestions: [],
    temporalContext,
    keywords,
    synonyms: [],
    complexity: keywords.length > 5 ? 'complex' : keywords.length > 2 ? 'moderate' : 'simple',
  };
}

