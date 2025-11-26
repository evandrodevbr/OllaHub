/**
 * Utilitários para retry com backoff exponencial
 */

export interface RetryConfig {
  maxAttempts: number; // Máximo de tentativas (padrão: 3)
  initialDelay: number; // Delay inicial em ms (padrão: 1000)
  maxDelay: number; // Delay máximo em ms (padrão: 10000)
  backoffMultiplier: number; // Multiplicador do backoff (padrão: 2)
  retryableErrors?: string[]; // Padrões de erro que devem ser retentados
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'timeout',
    'network',
    'connection',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'sending request',
  ],
};

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  lastError?: Error;
}

/**
 * Classifica se um erro é recuperável (deve ser retentado)
 */
export function isRetryableError(error: unknown, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (!error) return false;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorString = errorMessage.toLowerCase();
  
  // Verificar padrões de erro recuperáveis
  if (config.retryableErrors) {
    return config.retryableErrors.some(pattern => 
      errorString.includes(pattern.toLowerCase())
    );
  }
  
  // Erros de rede/timeout são geralmente recuperáveis
  return errorString.includes('timeout') || 
         errorString.includes('network') || 
         errorString.includes('connection');
}

/**
 * Calcula o delay para a próxima tentativa usando backoff exponencial
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Executa uma função com retry e backoff exponencial
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Se não for erro recuperável, não tenta novamente
      if (!isRetryableError(error, finalConfig)) {
        return {
          success: false,
          error: lastError,
          attempts: attempt,
          lastError,
        };
      }
      
      // Se não for a última tentativa, aguarda antes de tentar novamente
      if (attempt < finalConfig.maxAttempts) {
        const delay = calculateDelay(attempt, finalConfig);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return {
    success: false,
    error: lastError,
    attempts: finalConfig.maxAttempts,
    lastError,
  };
}

/**
 * Cria um timeout para uma promise
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
    ),
  ]);
}



