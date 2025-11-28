/**
 * Sanitiza conteúdo extraído da web antes de injetar no prompt da IA
 * Remove caracteres de controle, limita tamanho e previne prompt injection
 */

export interface SanitizeOptions {
  maxLength?: number;
  removeControlChars?: boolean;
  removeHiddenText?: boolean;
}

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxLength: 10000, // Limite padrão de ~10k caracteres
  removeControlChars: true,
  removeHiddenText: true,
};

/**
 * Remove caracteres de controle invisíveis que podem ser usados para prompt injection
 */
function removeControlCharacters(text: string): string {
  // Remove caracteres de controle (0x00-0x1F, exceto \n, \r, \t)
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Remove texto oculto (zero-width spaces, directional markers, etc)
 */
function removeHiddenText(text: string): string {
  // Remove zero-width spaces e outros caracteres invisíveis
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/[\u202A-\u202E]/g, '') // Directional markers
    .replace(/[\u2060-\u206F]/g, ''); // Word joiners e outros
}

/**
 * Remove tags HTML/XML que podem conter instruções maliciosas
 */
function removeSuspiciousTags(text: string): string {
  // Remove tags script, style, meta que podem conter instruções
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, ''); // Remove comentários HTML
}

/**
 * Limita o tamanho do texto e adiciona indicador se foi truncado
 */
function limitLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Truncar em um ponto "seguro" (final de palavra/sentença)
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = Math.max(lastSpace, lastNewline);
  
  if (cutPoint > maxLength * 0.9) {
    // Se encontrou um bom ponto de corte próximo ao limite
    return truncated.substring(0, cutPoint) + '\n\n[... conteúdo truncado para economizar tokens ...]';
  }
  
  return truncated + '\n\n[... conteúdo truncado para economizar tokens ...]';
}

/**
 * Sanitiza conteúdo web para prevenir prompt injection e controlar tamanho
 * 
 * @param content - Conteúdo bruto extraído da web
 * @param options - Opções de sanitização
 * @returns Conteúdo sanitizado e seguro para injetar no prompt
 */
export function sanitizeWebContent(
  content: string,
  options: SanitizeOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = content;

  // 1. Remover tags suspeitas primeiro
  sanitized = removeSuspiciousTags(sanitized);

  // 2. Remover caracteres de controle
  if (opts.removeControlChars) {
    sanitized = removeControlCharacters(sanitized);
  }

  // 3. Remover texto oculto
  if (opts.removeHiddenText) {
    sanitized = removeHiddenText(sanitized);
  }

  // 4. Normalizar espaços em branco excessivos
  sanitized = sanitized.replace(/\s{3,}/g, ' '); // Múltiplos espaços -> um espaço
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n'); // Múltiplas quebras -> máximo 3

  // 5. Limitar tamanho
  sanitized = limitLength(sanitized, opts.maxLength);

  return sanitized.trim();
}

/**
 * Sanitiza múltiplas fontes e combina
 */
export function sanitizeWebSources(
  sources: Array<{ markdown: string; url: string; title: string }>,
  options: SanitizeOptions = {}
): string {
  const sanitizedSources = sources.map((source, index) => {
    const sanitized = sanitizeWebContent(source.markdown, options);
    return `---\nFonte ${index + 1}: ${source.title}\nURL: ${source.url}\n---\n\n${sanitized}`;
  });

  return sanitizedSources.join('\n\n---\n\n');
}

