import { normalizeText } from './text-normalization';

export interface SplitResult {
  questions: string[];
  originalText: string;
  splitCount: number;
}

// Palavras interrogativas em português e inglês
const INTERROGATIVE_WORDS = [
  'o que',
  'que',
  'qual',
  'quais',
  'quem',
  'onde',
  'quando',
  'como',
  'por que',
  'porque',
  'por quê',
  'porquê',
  'quantos',
  'quantas',
  'what',
  'which',
  'who',
  'where',
  'when',
  'how',
  'why',
  'how many',
  'how much',
];

// Conectores que podem separar perguntas
const QUESTION_SEPARATORS = [
  /\s+e\s+/gi,  // " e "
  /\s+ou\s+/gi, // " ou "
  /[.!?]\s+/g,  // ". ", "! ", "? "
];

/**
 * Verifica se um texto é uma pergunta
 * 
 * @param text - Texto a ser verificado
 * @returns true se for uma pergunta
 */
export function isQuestion(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  // Verifica se termina com ponto de interrogação
  if (trimmed.endsWith('?')) {
    return true;
  }

  // Verifica se começa com palavra interrogativa
  const normalized = normalizeText(trimmed);
  for (const word of INTERROGATIVE_WORDS) {
    const normalizedWord = normalizeText(word);
    if (normalized.startsWith(normalizedWord + ' ')) {
      return true;
    }
  }

  // Verifica padrões de pergunta
  const questionPatterns = [
    /^(o que|que|qual|quais|quem|onde|quando|como|por que|porque|quantos|quantas)/i,
    /^(what|which|who|where|when|how|why|how many|how much)/i,
    /\?$/,
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Calcula similaridade básica entre duas strings (Jaccard similarity simplificada)
 * 
 * @param str1 - Primeira string
 * @param str2 - Segunda string
 * @returns Similaridade entre 0 e 1
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(normalizeText(str1).split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(normalizeText(str2).split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 && words2.size === 0) {
    return 1;
  }
  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Remove perguntas duplicadas ou muito similares
 * 
 * @param questions - Array de perguntas
 * @param similarityThreshold - Limiar de similaridade (0-1)
 * @returns Array de perguntas únicas
 */
function removeDuplicates(
  questions: string[],
  similarityThreshold: number = 0.7
): string[] {
  const unique: string[] = [];

  for (const question of questions) {
    let isDuplicate = false;

    for (const existing of unique) {
      const similarity = calculateSimilarity(question, existing);
      if (similarity >= similarityThreshold) {
        isDuplicate = true;
        // Manter a versão mais longa (geralmente mais completa)
        if (question.length > existing.length) {
          const index = unique.indexOf(existing);
          unique[index] = question;
        }
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(question);
    }
  }

  return unique;
}

/**
 * Divide um texto em múltiplas perguntas
 * 
 * @param text - Texto a ser dividido
 * @returns Resultado com array de perguntas
 */
export function splitQuestions(text: string): SplitResult {
  if (!text || typeof text !== 'string') {
    return {
      questions: [],
      originalText: text || '',
      splitCount: 0,
    };
  }

  const originalText = text.trim();
  if (originalText.length === 0) {
    return {
      questions: [],
      originalText: '',
      splitCount: 0,
    };
  }

  // Tentar dividir por separadores de sentenças primeiro
  let parts: string[] = [originalText];

  // Dividir por pontuação de fim de sentença
  const sentenceSplit = originalText.split(/[.!?]\s+/);
  if (sentenceSplit.length > 1) {
    parts = sentenceSplit.map((p) => p.trim()).filter((p) => p.length > 0);
  } else {
    // Tentar dividir por conectores
    for (const separator of QUESTION_SEPARATORS) {
      const split = originalText.split(separator);
      if (split.length > 1) {
        parts = split.map((p) => p.trim()).filter((p) => p.length > 0);
        break;
      }
    }
  }

  // Filtrar apenas partes que são perguntas
  const questions = parts.filter((part) => {
    // Adicionar "?" se não tiver mas for pergunta
    const withQuestionMark = part.endsWith('?') ? part : part + '?';
    return isQuestion(withQuestionMark);
  });

  // Se nenhuma parte foi identificada como pergunta, tratar o texto inteiro como uma pergunta
  if (questions.length === 0) {
    return {
      questions: [originalText],
      originalText,
      splitCount: 1,
    };
  }

  // Remover duplicatas
  const uniqueQuestions = removeDuplicates(questions);

  return {
    questions: uniqueQuestions,
    originalText,
    splitCount: uniqueQuestions.length,
  };
}

