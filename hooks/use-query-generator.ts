import { useState, useCallback } from 'react';

/**
 * Hook para gerar query de busca otimizada usando a LLM
 */
export function useQueryGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * Gera uma query de busca otimizada baseada na pergunta do usuário
   * Retorna 'NO_SEARCH' se não precisar de busca
   */
  const generateQuery = useCallback(async (
    userInput: string,
    model: string
  ): Promise<string> => {
    if (!userInput || !userInput.trim()) {
      return 'NO_SEARCH';
    }

    setIsGenerating(true);

    try {
      // Prompt otimizado para gerar query
      const prompt = `Baseado na pergunta do usuário abaixo, gere APENAS uma query de busca otimizada para o Google/DuckDuckGo.

Regras:
- Se a pergunta NÃO precisar de informações da web (ex: "Olá", "Como você está?", cálculos simples, perguntas sobre você), retorne EXATAMENTE: NO_SEARCH
- Se precisar de informações recentes, fatos, notícias, ou dados atualizados, gere uma query curta e direta (máximo 8 palavras)
- A query deve ser em português se a pergunta for em português

Pergunta do usuário: "${userInput}"

Query de busca (ou NO_SEARCH):`;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.3, // Baixa temperatura para respostas mais determinísticas
            num_predict: 50, // Limitar tokens para resposta rápida
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao gerar query');
      }

      const data = await response.json();
      const generatedText = (data.response || '').trim();

      // Limpar resposta (remover aspas, pontos finais, etc)
      let query = generatedText
        .replace(/^["']|["']$/g, '') // Remover aspas
        .replace(/\.$/, '') // Remover ponto final
        .trim();

      // Verificar se é NO_SEARCH
      if (query.toUpperCase().includes('NO_SEARCH') || query.length < 3) {
        return 'NO_SEARCH';
      }

      return query;
    } catch (error) {
      console.error('Erro ao gerar query:', error);
      // Em caso de erro, tentar usar a própria pergunta como query
      // Mas apenas se parecer uma pergunta factual
      const lowerInput = userInput.toLowerCase();
      const needsSearch = lowerInput.includes('o que') ||
                         lowerInput.includes('quem') ||
                         lowerInput.includes('quando') ||
                         lowerInput.includes('onde') ||
                         lowerInput.includes('como') ||
                         lowerInput.includes('por que') ||
                         lowerInput.includes('qual') ||
                         lowerInput.includes('quais');

      return needsSearch ? userInput : 'NO_SEARCH';
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return { generateQuery, isGenerating };
}

