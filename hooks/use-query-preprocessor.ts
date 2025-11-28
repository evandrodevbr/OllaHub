import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { normalizeText } from '@/lib/text-normalization';
import { validateQuery, ValidationResult } from '@/lib/query-validation';
import { splitQuestions, SplitResult } from '@/lib/question-splitter';
import { useSettingsStore } from '@/store/settings-store';

export type QueryIntent = 
  | 'factual'
  | 'conversational'
  | 'technical'
  | 'opinion'
  | 'calculation'
  | 'unknown';

export interface PreprocessedQuery {
  original: string;
  normalized: string;
  questions: string[];
  intent: QueryIntent;
  validation: ValidationResult;
  shouldSearch: boolean;
  splitResult: SplitResult;
}

export interface PreprocessOptions {
  skipValidation?: boolean;
  skipSplit?: boolean;
  skipIntentClassification?: boolean;
}

/**
 * Hook para pré-processamento de queries do usuário
 * Orquestra normalização, validação, split e classificação de intenção
 */
export function useQueryPreprocessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const settings = useSettingsStore();

  /**
   * Pré-processa uma query do usuário
   * 
   * @param text - Texto original da query
   * @param options - Opções de pré-processamento
   * @returns Query pré-processada
   */
  const preprocess = useCallback(
    async (
      text: string,
      options: PreprocessOptions = {}
    ): Promise<PreprocessedQuery> => {
      setIsProcessing(true);

      try {
        const original = text;
        const normalized = normalizeText(text);

        // 1. Validação
        let validation: ValidationResult;
        if (options.skipValidation) {
          validation = {
            isValid: true,
            errors: [],
            warnings: [],
            normalizedLength: normalized.length,
          };
        } else {
          const preprocessingConfig = settings.queryPreprocessing || {
            enabled: true,
            minLength: 3,
            maxLength: 2000,
            autoSplitQuestions: true,
            irrelevantPatterns: [],
          };

          validation = validateQuery(text, {
            minLength: preprocessingConfig.minLength,
            maxLength: preprocessingConfig.maxLength,
            irrelevantPatterns: preprocessingConfig.irrelevantPatterns.length > 0
              ? preprocessingConfig.irrelevantPatterns
              : undefined,
          });
        }

        // Se inválida, retornar com erro
        if (!validation.isValid) {
          return {
            original,
            normalized,
            questions: [],
            intent: 'unknown',
            validation,
            shouldSearch: false,
            splitResult: {
              questions: [],
              originalText: original,
              splitCount: 0,
            },
          };
        }

        // 2. Split de perguntas
        let splitResult: SplitResult;
        if (options.skipSplit) {
          splitResult = {
            questions: [original],
            originalText: original,
            splitCount: 1,
          };
        } else {
          splitResult = splitQuestions(original);
        }

        // 3. Classificação de intenção
        let intent: QueryIntent = 'unknown';
        if (!options.skipIntentClassification) {
          try {
            const intentStr = await invoke<string>('classify_intent', {
              query: normalized,
            });
            intent = intentStr as QueryIntent;
          } catch (error) {
            console.error('Erro ao classificar intent:', error);
            // Fallback para unknown
            intent = 'unknown';
          }
        }

        // 4. Decidir se deve buscar
        // Busca é necessária se:
        // - Intent é factual ou technical (e webSearch está habilitado)
        // - Intent é unknown (comportamento padrão: permitir busca)
        const shouldSearch =
          settings.webSearch.enabled &&
          (intent === 'factual' ||
            intent === 'technical' ||
            intent === 'unknown');

        return {
          original,
          normalized,
          questions: splitResult.questions,
          intent,
          validation,
          shouldSearch,
          splitResult,
        };
      } catch (error) {
        console.error('Erro no pré-processamento:', error);
        // Retornar resultado com erro
        return {
          original: text,
          normalized: normalizeText(text),
          questions: [],
          intent: 'unknown',
          validation: {
            isValid: false,
            errors: ['Erro ao pré-processar query'],
            warnings: [],
            normalizedLength: 0,
          },
          shouldSearch: false,
          splitResult: {
            questions: [],
            originalText: text,
            splitCount: 0,
          },
        };
      } finally {
        setIsProcessing(false);
      }
    },
    [settings]
  );

  return {
    preprocess,
    isProcessing,
  };
}


