export const BATCH_VERIFY_PROMPTS = {
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

  VALIDATION: `Role: Fact Checker.
Task: Analyze the following search results from multiple sources. Identify consensus and discrepancies.

Search Results:
{{searchResults}}

Output structure:
1. Consensus: Facts agreed upon by multiple sources.
2. Discrepancies: Conflicts between sources (cite sources).
3. Reliability: Which sources seem most authoritative?
4. Verdict: Can we answer the user's query with high confidence? (YES/NO/PARTIAL)

Keep it concise and factual.`,

  SYNTHESIS: `Role: Senior Analyst.
Task: Generate a final response based on the validation report and search results.

Validation Report:
{{validationReport}}

Original Query: "{{userQuery}}"

Protocol:
1. Veredito Direto: The consolidated answer.
2. Evidências Cruzadas: A comparison table or list showing consensus.
3. Fontes: List key URLs used.
4. If data is insufficient/conflicting, state it clearly.

Language: Portuguese (Brazil).`
};
