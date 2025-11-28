import emojiRegex from 'emoji-regex';
import { normalizeText } from './text-normalization';

export interface ValidationOptions {
  minLength?: number;
  maxLength?: number;
  irrelevantPatterns?: string[];
  allowEmojis?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedLength: number;
}

const DEFAULT_OPTIONS: Required<ValidationOptions> = {
  minLength: 3,
  maxLength: 2000,
  irrelevantPatterns: [
    'oi',
    'olá',
    'ola',
    'teste',
    'test',
    'hello',
    'hi',
    'hey',
    'ok',
    'okay',
    'sim',
    'não',
    'nao',
    'yes',
    'no',
  ],
  allowEmojis: false,
};

/**
 * Valida uma query do usuário
 * 
 * @param text - Texto a ser validado
 * @param options - Opções de validação
 * @returns Resultado da validação
 */
export function validateQuery(
  text: string,
  options: ValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];
  let normalizedLength = 0;

  // Verificar se o texto existe e é string
  if (!text || typeof text !== 'string') {
    return {
      isValid: false,
      errors: ['Texto vazio ou inválido'],
      warnings: [],
      normalizedLength: 0,
    };
  }

  // Normalizar texto para validação
  const normalized = normalizeText(text);
  normalizedLength = normalized.length;

  // Verificar comprimento mínimo
  if (normalizedLength < opts.minLength) {
    errors.push(
      `Texto muito curto. Mínimo de ${opts.minLength} caracteres necessário.`
    );
  }

  // Verificar comprimento máximo
  if (normalizedLength > opts.maxLength) {
    errors.push(
      `Texto muito longo. Máximo de ${opts.maxLength} caracteres permitido.`
    );
  }

  // Verificar se é apenas espaços em branco após normalização
  if (normalized.trim().length === 0) {
    errors.push('Texto contém apenas espaços em branco ou caracteres especiais.');
  }

  // Verificar se contém apenas emojis
  if (!opts.allowEmojis) {
    const emojiPattern = emojiRegex();
    const textWithoutEmojis = text.replace(emojiPattern, '').trim();
    if (textWithoutEmojis.length === 0 && text.trim().length > 0) {
      errors.push('Texto contém apenas emojis.');
    }
  }

  // Verificar se contém apenas pontuação
  const textWithoutPunctuation = normalized.replace(/[.,?!:;]/g, '').trim();
  if (textWithoutPunctuation.length === 0 && normalized.length > 0) {
    errors.push('Texto contém apenas pontuação.');
  }

  // Verificar padrões irrelevantes
  if (isIrrelevantQuery(normalized, opts.irrelevantPatterns)) {
    warnings.push(
      'Pergunta pode ser irrelevante ou muito simples. Considere ser mais específico.'
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    normalizedLength,
  };
}

/**
 * Verifica se uma query é irrelevante baseado em padrões
 * 
 * @param text - Texto normalizado a ser verificado
 * @param patterns - Lista de padrões irrelevantes
 * @returns true se a query for irrelevante
 */
export function isIrrelevantQuery(
  text: string,
  patterns: string[] = DEFAULT_OPTIONS.irrelevantPatterns
): boolean {
  if (!text || typeof text !== 'string') {
    return true;
  }

  const normalized = normalizeText(text);
  const normalizedPatterns = patterns.map((p) => normalizeText(p));

  // Verificar se o texto normalizado está exatamente na lista de padrões
  if (normalizedPatterns.includes(normalized)) {
    return true;
  }

  // Verificar se o texto começa com um padrão irrelevante seguido apenas de pontuação/espaços
  for (const pattern of normalizedPatterns) {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s.,?!]*$`, 'i');
    if (regex.test(normalized)) {
      return true;
    }
  }

  return false;
}

/**
 * Validação rápida (apenas comprimento)
 * Útil para validação em tempo real no input
 * 
 * @param text - Texto a ser validado
 * @param minLength - Comprimento mínimo
 * @param maxLength - Comprimento máximo
 * @returns true se válido
 */
export function quickValidate(
  text: string,
  minLength: number = DEFAULT_OPTIONS.minLength,
  maxLength: number = DEFAULT_OPTIONS.maxLength
): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const normalized = normalizeText(text);
  return (
    normalized.length >= minLength && normalized.length <= maxLength
  );
}

