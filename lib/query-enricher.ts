import type { QueryContext } from './contextual-analyzer';
import { chatLog } from './terminal-logger';

/**
 * Queries enriquecidas por categoria
 */
export interface EnrichedQueries {
  literal: string[];      // Queries literais (original + variações diretas)
  semantic: string[];     // Variantes semânticas (sinônimos, reformulações)
  related: string[];       // Perguntas relacionadas
  expanded: string[];     // Expansões temáticas (autores, eventos, tipos)
  contextual: string[];   // Queries com contexto adicional (datas, locais)
}

/**
 * Prompt para enriquecimento de queries usando LLM
 */
const QUERY_ENRICHMENT_PROMPT = `Você é um especialista em otimização de queries de busca e expansão semântica.

Com base na query original e no contexto analisado, gere múltiplas variantes de queries enriquecidas para maximizar a cobertura de resultados relevantes.

## QUERY ORIGINAL
"{{originalQuery}}"

## CONTEXTO ANALISADO
- Intenção: {{intent}}
- Tópicos: {{topics}}
- Entidades: {{entities}}
- Contexto Temporal: {{temporalContext}}
- Contexto Geográfico: {{geographicContext}}
- Palavras-chave: {{keywords}}
- Sinônimos: {{synonyms}}
- Domínio: {{domain}}

## INSTRUÇÕES

Gere queries enriquecidas nas seguintes categorias:

1. **LITERAL**: Variações diretas da query original (preservar termos principais)
   - Ex: "resultados acadêmicos premiados" → ["resultados academicos premiados", "ultimos resultados academicos premiados"]

2. **SEMANTIC**: Variantes semânticas usando sinônimos e reformulações
   - Ex: "resultados acadêmicos" → "pesquisas científicas", "estudos acadêmicos", "trabalhos científicos"
   - Manter o significado, mas usar termos alternativos

3. **RELATED**: Perguntas relacionadas e FAQs
   - Ex: "premios academicos 2024", "conferencias academicas premiadas", "descobertas cientificas premiadas"
   - Explorar aspectos adjacentes do tópico

4. **EXPANDED**: Expansões temáticas específicas
   - Ex: "Nobel Prize 2024", "Turing Award winners", "Fields Medal recentes"
   - Incluir tipos específicos, categorias, exemplos concretos

5. **CONTEXTUAL**: Queries com contexto adicional (datas, locais, domínios)
   - Ex: "resultados academicos brasileiros premiados 2024", "pesquisas premiadas universidades"
   - Combinar tópico principal com contexto temporal/geográfico

## REGRAS CRÍTICAS

- **PRESERVAR ENTIDADES**: Se a query menciona "Garuva", TODAS as queries devem mencionar "Garuva"
- **NÃO TRADUZIR**: Preservar nomes próprios, termos técnicos na forma original
- **OTIMIZAR PARA BUSCA**: Usar termos que aparecem em resultados reais
- **COBERTURA AMPLA**: Cada categoria deve explorar diferentes ângulos
- **QUALIDADE > QUANTIDADE**: 3-5 queries por categoria é suficiente
- **RELEVÂNCIA**: Todas as queries devem ser relevantes para responder a query original

## FORMATO DE SAÍDA

Retorne APENAS um JSON válido no seguinte formato:

{
  "literal": ["query literal 1", "query literal 2"],
  "semantic": ["variante semantica 1", "variante semantica 2"],
  "related": ["pergunta relacionada 1", "pergunta relacionada 2"],
  "expanded": ["expansao tematica 1", "expansao tematica 2"],
  "contextual": ["query contextual 1", "query contextual 2"]
}

IMPORTANTE:
- Retorne APENAS o JSON, sem markdown, sem explicações
- Cada array deve ter 3-5 queries
- Queries devem ser em português se a query original for em português
- Preservar termos técnicos e nomes próprios`;

/**
 * Enriquece queries baseado no contexto analisado
 * 
 * @param originalQuery - Query original do usuário
 * @param context - Contexto analisado da query
 * @param model - Modelo LLM a ser usado
 * @returns Queries enriquecidas por categoria
 */
export async function enrichQueries(
  originalQuery: string,
  context: QueryContext,
  model: string
): Promise<EnrichedQueries> {
  chatLog.info(`[QueryEnricher] Enriquecendo queries para: "${originalQuery}"`);

  try {
    // Preparar contexto para o prompt
    const entitiesStr = context.entities.map(e => `${e.type}: ${e.value}`).join(', ') || 'nenhuma';
    const temporalStr = context.temporalContext 
      ? JSON.stringify(context.temporalContext)
      : 'nenhum';
    const geographicStr = context.geographicContext
      ? JSON.stringify(context.geographicContext)
      : 'nenhum';

    const prompt = QUERY_ENRICHMENT_PROMPT
      .replace('{{originalQuery}}', originalQuery)
      .replace('{{intent}}', context.intent)
      .replace('{{topics}}', context.topics.join(', ') || 'nenhum')
      .replace('{{entities}}', entitiesStr)
      .replace('{{temporalContext}}', temporalStr)
      .replace('{{geographicContext}}', geographicStr)
      .replace('{{keywords}}', context.keywords.join(', ') || 'nenhuma')
      .replace('{{synonyms}}', context.synonyms.join(', ') || 'nenhum')
      .replace('{{domain}}', context.domain || 'geral');

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.5, // Temperatura média para criatividade controlada
          num_predict: 1000, // Espaço suficiente para múltiplas queries
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

    const enriched = JSON.parse(jsonText) as Partial<EnrichedQueries>;

    // Validar e preencher campos
    const result: EnrichedQueries = {
      literal: enriched.literal || [originalQuery],
      semantic: enriched.semantic || [],
      related: enriched.related || [],
      expanded: enriched.expanded || [],
      contextual: enriched.contextual || [],
    };

    // Garantir que sempre há pelo menos a query original
    if (result.literal.length === 0) {
      result.literal = [originalQuery];
    }

    // Log estatísticas
    const totalQueries = 
      result.literal.length +
      result.semantic.length +
      result.related.length +
      result.expanded.length +
      result.contextual.length;

    chatLog.success(
      `[QueryEnricher] ${totalQueries} queries geradas: ` +
      `${result.literal.length} literal, ${result.semantic.length} semântica, ` +
      `${result.related.length} relacionadas, ${result.expanded.length} expandidas, ` +
      `${result.contextual.length} contextuais`
    );

    return result;
  } catch (error) {
    chatLog.error(`[QueryEnricher] Erro ao enriquecer queries:`, error);

    // Fallback: usar apenas query original
    return createFallbackEnrichment(originalQuery, context);
  }
}

/**
 * Cria enriquecimento básico usando heurísticas quando a análise LLM falha
 */
function createFallbackEnrichment(
  originalQuery: string,
  context: QueryContext
): EnrichedQueries {
  const literal = [originalQuery];

  // Adicionar variações básicas usando sinônimos do contexto
  const semantic: string[] = [];
  if (context.synonyms.length > 0) {
    // Substituir algumas palavras por sinônimos
    let semanticQuery = originalQuery;
    context.synonyms.slice(0, 2).forEach(synonym => {
      // Tentar substituir palavra-chave por sinônimo
      const keywords = context.keywords;
      if (keywords.length > 0) {
        const keyword = keywords[0];
        semanticQuery = semanticQuery.replace(
          new RegExp(keyword, 'gi'),
          synonym
        );
        if (semanticQuery !== originalQuery) {
          semantic.push(semanticQuery);
        }
      }
    });
  }

  // Adicionar contexto temporal se disponível
  const contextual: string[] = [];
  if (context.temporalContext?.period) {
    contextual.push(`${originalQuery} ${context.temporalContext.period}`);
  }
  if (context.temporalContext?.relative === 'recente') {
    contextual.push(`${originalQuery} recente`);
  }

  // Adicionar contexto geográfico se disponível
  if (context.geographicContext?.location) {
    contextual.push(`${originalQuery} ${context.geographicContext.location}`);
  }

  return {
    literal,
    semantic: semantic.length > 0 ? semantic : [],
    related: [],
    expanded: [],
    contextual,
  };
}

/**
 * Combina todas as queries enriquecidas em uma lista única para busca
 * 
 * @param enriched - Queries enriquecidas
 * @param strategy - Estratégia de combinação
 * @returns Lista de queries para buscar
 */
export function combineEnrichedQueries(
  enriched: EnrichedQueries,
  strategy: 'all' | 'prioritize-literal' | 'prioritize-semantic' = 'prioritize-literal'
): string[] {
  const queries: string[] = [];

  switch (strategy) {
    case 'all':
      queries.push(...enriched.literal);
      queries.push(...enriched.semantic);
      queries.push(...enriched.related);
      queries.push(...enriched.expanded);
      queries.push(...enriched.contextual);
      break;

    case 'prioritize-literal':
      queries.push(...enriched.literal);
      queries.push(...enriched.semantic);
      queries.push(...enriched.contextual);
      queries.push(...enriched.related);
      queries.push(...enriched.expanded);
      break;

    case 'prioritize-semantic':
      queries.push(...enriched.semantic);
      queries.push(...enriched.literal);
      queries.push(...enriched.contextual);
      queries.push(...enriched.related);
      queries.push(...enriched.expanded);
      break;
  }

  // Remover duplicatas mantendo ordem
  const unique = Array.from(new Set(queries.map(q => q.toLowerCase())))
    .map(lower => queries.find(q => q.toLowerCase() === lower)!)
    .filter(Boolean);

  return unique;
}

