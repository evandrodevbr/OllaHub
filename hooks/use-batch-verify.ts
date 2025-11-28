import { useState, useCallback } from 'react';
import { BATCH_VERIFY_PROMPTS } from '@/data/prompts/batch-verify';
import type { ScrapedContent } from '@/services/webSearch';

export type BatchVerifyStep = 'idle' | 'planning' | 'searching' | 'validating' | 'formulating' | 'complete' | 'error';

export interface BatchVerifyLog {
  stage: 'decomposition' | 'validation' | 'fallback';
  timestamp: number;
  input: string;
  rawOutput?: string;
  parsedOutput?: any;
  error?: string;
}

export interface BatchVerifyState {
  step: BatchVerifyStep;
  plan: string[];
  results: Map<string, ScrapedContent[]>;
  validationReport: string;
  error?: string;
  logs: BatchVerifyLog[];
}

export function useBatchVerify() {
  const [state, setState] = useState<BatchVerifyState>({
    step: 'idle',
    plan: [],
    results: new Map(),
    validationReport: '',
    logs: [],
  });

  const addLog = (log: BatchVerifyLog) => {
    setState(s => ({ ...s, logs: [...s.logs, log] }));
  };

  const callLLM = async (model: string, prompt: string, json = false) => {
    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: json ? 'json' : undefined,
          options: {
            temperature: 0.3,
            num_predict: 1024,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to call LLM');
      const data = await response.json();
      return data.response;
    } catch (e) {
      console.error('LLM Call Error:', e);
      throw e;
    }
  };

  const decompose = useCallback(async (query: string, model: string) => {
    setState(s => ({ ...s, step: 'planning', error: undefined, logs: [] }));
    const startTime = Date.now();
    
    try {
      const prompt = BATCH_VERIFY_PROMPTS.DECOMPOSITION.replace('{{userQuery}}', query);
      const response = await callLLM(model, prompt, true);
      
      // Parse JSON response
      let plan: string[] = [];
      let parseError = undefined;
      try {
        plan = JSON.parse(response);
        if (!Array.isArray(plan)) throw new Error('Not an array');
      } catch (e) {
        console.warn('Failed to parse JSON plan, falling back to raw split', e);
        parseError = 'JSON Parse Failed';
        plan = response.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 3);
      }

      // --- Safety Check ---
      // Ensure at least one generated query contains keywords from the original query
      // This prevents hallucinations like "Garuva" -> "brackets"
      const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3); // filter small words
      const isRelevant = plan.some(q => 
        keywords.some(k => q.toLowerCase().includes(k))
      );

      if (!isRelevant && keywords.length > 0) {
        console.warn('Decomposition Safety Check Failed: Generated queries are irrelevant.', { plan, query });
        
        addLog({
            stage: 'decomposition',
            timestamp: Date.now(),
            input: prompt,
            rawOutput: response,
            parsedOutput: plan,
            error: 'Safety Check Failed: Plan irrelevant to query'
        });
        
        // Fallback to original query
        plan = [query];
      } else {
          addLog({
            stage: 'decomposition',
            timestamp: Date.now(),
            input: prompt,
            rawOutput: response,
            parsedOutput: plan,
            error: parseError
          });
      }

      setState(s => ({ ...s, plan }));
      return plan;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(s => ({ ...s, step: 'error', error: 'Failed to create research plan' }));
      
      addLog({
        stage: 'decomposition',
        timestamp: Date.now(),
        input: query,
        error: errorMessage
      });
      
      return [];
    }
  }, []);

  const validate = useCallback(async (results: Map<string, ScrapedContent[]>, model: string) => {
    setState(s => ({ ...s, step: 'validating', results }));
    try {
      let resultsText = '';
      results.forEach((docs, query) => {
        resultsText += `\nQuery: "${query}"\n`;
        docs.forEach(doc => {
          resultsText += `- [${doc.title}](${doc.url}): ${doc.markdown.substring(0, 300)}...\n`;
        });
      });

      const prompt = BATCH_VERIFY_PROMPTS.VALIDATION.replace('{{searchResults}}', resultsText);
      const report = await callLLM(model, prompt);
      
      addLog({
        stage: 'validation',
        timestamp: Date.now(),
        input: prompt,
        rawOutput: report,
        parsedOutput: report
      });

      setState(s => ({ ...s, validationReport: report }));
      return report;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(s => ({ ...s, step: 'error', error: 'Validation failed' }));
      
      addLog({
        stage: 'validation',
        timestamp: Date.now(),
        input: 'Validation phase',
        error: errorMessage
      });

      return '';
    }
  }, []);

  const reset = useCallback(() => {
    setState({
      step: 'idle',
      plan: [],
      results: new Map(),
      validationReport: '',
      logs: [],
    });
  }, []);

  return {
    state,
    decompose,
    validate,
    reset,
    setStep: (step: BatchVerifyStep) => setState(s => ({ ...s, step }))
  };
}
