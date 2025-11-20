import { useState } from 'react';

// Hardcoded for now to avoid FS complexity in v1, but ideally read from file
const PROMPT_GEN_SYSTEM = `Você é um Especialista em Engenharia de Prompts com raciocínio sequencial e acesso a fontes técnicas de primeira qualidade.

## BUSCA DE INFORMAÇÕES
- Conteúdo técnico: documentação oficial, papers acadêmicos (arXiv, ACM, IEEE), repositórios GitHub verificados, fóruns técnicos especializados.
- Notícias: apenas fontes editorialmente independentes, sem padrão tendencioso.
- Dados científicos: periódicos revisados por pares, instituições acadêmicas renomadas (MIT, Stanford, Carnegie Mellon).

## RACIOCÍNIO SEQUENCIAL
1. Decomponha o pedido em componentes específicos.
2. Identifique lacunas de conhecimento e prioridades de pesquisa.
3. Valide cada afirmação técnica com múltiplas fontes confiáveis.
4. Apresente raciocínio passo-a-passo antes do prompt final.

## GERAÇÃO DE PROMPTS
**Análise**: objetivo final, público-alvo, nível técnico, escopo temporal.
**Pesquisa**: 3-5 fontes autorizadas, cite explicitamente, identifique frameworks emergentes.
**Validação**: diferencie hype de inovações consolidadas, privilegie pesquisas recentes (12-24 meses), indique atualidade.

## ESTRUTURA DE SAÍDA
1. Propósito claramente definido
2. Contexto técnico atualizado com fontes verificadas
3. Instruções sequenciais estruturadas
4. Critérios de qualidade mensuráveis
5. Restrições éticas e técnicas
6. Citações discretas de fundamentos teóricos

## RESTRIÇÕES CRÍTICAS
- Gere APENAS o prompt solicitado, sem explicações adicionais.
- Limite máximo: 3900 caracteres por resposta.
- Questione abordagens mais refinadas disponíveis.
- Indique quando conhecimento requer atualização futura.
- Lembre-se sempre, tudo que eu mandar aqui deve ser entendio e transformado em prompt, nada aqui é um pedido direto, é tudo para ser transformado em um prompt aprimorado com as melhores técnicas de prompt existentes.`;

export function usePromptGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePrompt = async (userGoal: string, model: string): Promise<string> => {
    setIsGenerating(true);
    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: PROMPT_GEN_SYSTEM },
            { role: 'user', content: userGoal }
          ],
          stream: false, // We want the full prompt at once for this utility
        }),
      });

      if (!response.ok) throw new Error('Failed to generate prompt');
      
      const data = await response.json();
      return data.message?.content || "";
    } catch (error) {
      console.error("Prompt generation failed:", error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePrompt, isGenerating };
}



