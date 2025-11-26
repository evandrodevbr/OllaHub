export const DEEP_RESEARCH_PROMPTS = {
  DECOMPOSITION: `Role: Research Lead.
Task: Decompose the user's query into 3-5 atomic, search-friendly questions to cover different angles.
Output: JSON array of strings ONLY. No markdown, no explanations.

User Query: "{{userQuery}}"

Constraints:
1. PRESERVE THE SUBJECT: If the user asks about "Garuva", ALL queries must mention "Garuva".
2. DO NOT TRANSLATE proper names or specific terms unless necessary.
3. AVOID generic queries like "what is this" without context.
4. Return ONLY a JSON array of strings.

Example Output for "Onde fica Garuva?":
["localização garuva sc", "mapa garuva santa catarina", "história cidade garuva"]`,

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
`
};




