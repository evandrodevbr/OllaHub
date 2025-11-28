import removeAccents from 'remove-accents';

/**
 * Normaliza texto removendo acentos, padronizando caixa e limpando caracteres especiais
 * 
 * @param text - Texto a ser normalizado
 * @returns Texto normalizado
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove acentos
  let normalized = removeAccents(text);

  // Padroniza para lowercase
  normalized = normalized.toLowerCase();

  // Remove caracteres especiais não alfanuméricos (exceto espaços e pontuação básica)
  // Mantém: letras, números, espaços, ponto, vírgula, interrogação, exclamação, dois pontos, ponto e vírgula
  normalized = normalized.replace(/[^\w\s.,?!:;]/g, '');

  // Normaliza espaços em branco múltiplos para um único espaço
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * Normaliza texto de forma mais agressiva para busca
 * Remove pontuação e normaliza completamente
 * 
 * @param text - Texto a ser normalizado para busca
 * @returns Texto normalizado para busca
 */
export function normalizeForSearch(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove acentos
  let normalized = removeAccents(text);

  // Padroniza para lowercase
  normalized = normalized.toLowerCase();

  // Remove toda pontuação e caracteres especiais
  normalized = normalized.replace(/[^\w\s]/g, '');

  // Normaliza espaços em branco múltiplos para um único espaço
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}

/**
 * Preserva nomes próprios quando possível (versão menos agressiva)
 * Mantém capitalização inicial de palavras que podem ser nomes próprios
 * 
 * @param text - Texto a ser normalizado
 * @returns Texto normalizado preservando possível capitalização de nomes
 */
export function normalizeTextPreserveCase(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove acentos
  let normalized = removeAccents(text);

  // Remove caracteres especiais não alfanuméricos (exceto espaços e pontuação básica)
  normalized = normalized.replace(/[^\w\s.,?!:;]/g, '');

  // Normaliza espaços em branco múltiplos para um único espaço
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized.trim();
}


