export const DEEP_RESEARCH_PROMPTS = {
  DECOMPOSITION: `Role: Research Lead specializing in web search optimization.
Task: Decompose the user's query into 3-5 atomic, search-friendly questions optimized for web search engines.

User Query: "{{userQuery}}"

## CRITICAL INSTRUCTIONS

1. **PRESERVE THE SUBJECT**: If the user asks about "Garuva", ALL queries must mention "Garuva".
2. **USE SPECIFIC KEYWORDS**: Include relevant technical terms, proper names, locations, dates, or context that will help search engines find precise results.
3. **AVOID GENERIC QUERIES**: Never create queries like "what is this" or "tell me about" without specific context. Instead, use descriptive terms.
4. **OPTIMIZE FOR SEARCH ENGINES**: 
   - Use terms that are likely to appear in search results
   - Include synonyms or related terms when appropriate
   - For academic/research queries, include terms like "estudo", "pesquisa", "resultado", "premiado"
   - For location queries, include geographic context (state, country, region)
5. **COVER DIFFERENT ANGLES**: Each query should explore a different aspect or perspective of the original question.
6. **DO NOT TRANSLATE**: Preserve proper names, technical terms, and specific terminology in their original form.
7. **OUTPUT FORMAT**: Return ONLY a JSON array of strings. No markdown, no explanations, no additional text.

## EXAMPLES

Input: "Onde fica Garuva?"
Output: ["localização garuva sc", "mapa garuva santa catarina", "história cidade garuva"]

Input: "quais os ultimos resultados academicos mais premiados?"
Output: ["resultados academicos premiados 2024", "pesquisas cientificas premiadas recentes", "estudos academicos reconhecidos premios", "descobertas academicas premiadas"]

Input: "como funciona inteligencia artificial?"
Output: ["inteligencia artificial como funciona", "IA machine learning algoritmos", "sistemas inteligencia artificial aplicacoes"]

## YOUR TASK

Decompose this query into search-optimized sub-queries:
"{{userQuery}}"

Return ONLY a JSON array of strings:`,

  CONTEXT_CHECK: `Role: Fact Checker.
Task: Analyze the Knowledge Base below and determine if it contains sufficient information to answer the user's query.

## KNOWLEDGE BASE
{{knowledgeBase}}

## USER QUERY
"{{userQuery}}"

## OUTPUT
1. **Sufficiency**: Does the Knowledge Base contain enough information to answer the query? (YES/NO/PARTIAL)
2. **Key Facts Found**: List the main facts relevant to the query (bullet points).
3. **Missing Information**: What information is NOT in the Knowledge Base but would be needed?
4. **Reliability Assessment**: Rate the overall reliability of sources (HIGH/MEDIUM/LOW).

Be concise and factual.`,

  STRICT_GENERATION: `Role: Rigorous Fact-Based Reporter.

## CRITICAL INSTRUCTIONS
You are a reporter who can ONLY write what is explicitly stated in the KNOWLEDGE BASE below.
- EVERY claim MUST be supported by the Knowledge Base.
- Use citations in the format [ID: X] after each fact.
- If a fact is NOT in the Knowledge Base, DO NOT WRITE IT.
- If you cannot answer the question from the Knowledge Base, say: "Não encontrei informações suficientes nas fontes consultadas para responder completamente."
- DO NOT use your internal knowledge. Pretend you know NOTHING except what is in the Knowledge Base.
- Language: Portuguese (Brazil).

## KNOWLEDGE BASE (Your ONLY source of truth)
{{knowledgeBase}}

## VALIDATION REPORT
{{validationReport}}

## USER QUERY
"{{userQuery}}"

## YOUR RESPONSE
Write a comprehensive answer using ONLY the Knowledge Base above. Cite sources using [ID: X].`,

  CITATION_FORMAT: `
When citing sources, use this format:
- For inline citations: "Garuva está localizada em Santa Catarina [ID: 1]."
- For multiple sources: "A cidade possui praias e montanhas [ID: 1, 3]."
- At the end, list all sources used with their URLs.
`,

  QUERY_ENRICHMENT: `Você é um especialista em otimização de queries de busca e expansão semântica.

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
2. **SEMANTIC**: Variantes semânticas usando sinônimos e reformulações
3. **RELATED**: Perguntas relacionadas e FAQs
4. **EXPANDED**: Expansões temáticas específicas
5. **CONTEXTUAL**: Queries com contexto adicional (datas, locais, domínios)

## REGRAS CRÍTICAS

- **PRESERVAR ENTIDADES**: Se a query menciona uma entidade, TODAS as queries devem mencioná-la
- **NÃO TRADUZIR**: Preservar nomes próprios, termos técnicos na forma original
- **OTIMIZAR PARA BUSCA**: Usar termos que aparecem em resultados reais
- **COBERTURA AMPLA**: Cada categoria deve explorar diferentes ângulos
- **QUALIDADE > QUANTIDADE**: 3-5 queries por categoria é suficiente

Retorne APENAS um JSON válido com arrays para cada categoria.`
};





