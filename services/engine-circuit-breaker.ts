/**
 * Circuit Breaker para motores de busca
 * Desabilita motores que estão falhando consistentemente
 */

export interface EngineHealth {
  engine: string;
  successCount: number;
  failureCount: number;
  totalAttempts: number;
  avgLatency: number; // ms
  lastFailure: number | null; // timestamp
  lastSuccess: number | null; // timestamp
  isOpen: boolean; // circuit breaker aberto?
  openedAt: number | null; // quando foi aberto
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Taxa de falha para abrir (0-1, padrão: 0.5 = 50%)
  cooldownPeriod: number; // Tempo em ms antes de tentar novamente (padrão: 5 minutos)
  trackingWindow: number; // Número de tentativas para rastrear (padrão: 10)
  minAttempts: number; // Mínimo de tentativas antes de considerar (padrão: 3)
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 0.5, // 50% de falha
  cooldownPeriod: 5 * 60 * 1000, // 5 minutos
  trackingWindow: 10,
  minAttempts: 3,
};

export class EngineCircuitBreaker {
  private health: Map<string, EngineHealth> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Registra uma tentativa de busca
   */
  recordAttempt(engine: string, success: boolean, latency: number): void {
    const health = this.getOrCreateHealth(engine);
    
    health.totalAttempts++;
    health.avgLatency = (health.avgLatency * (health.totalAttempts - 1) + latency) / health.totalAttempts;
    
    if (success) {
      health.successCount++;
      health.lastSuccess = Date.now();
      
      // Se teve sucesso e circuit estava aberto há tempo suficiente, tentar fechar
      if (health.isOpen && health.openedAt) {
        const timeSinceOpen = Date.now() - health.openedAt;
        if (timeSinceOpen >= this.config.cooldownPeriod) {
          health.isOpen = false;
          health.openedAt = null;
          console.log(`[CircuitBreaker] ${engine}: Circuit fechado após sucesso (${timeSinceOpen}ms desde abertura)`);
        }
      }
    } else {
      health.failureCount++;
      health.lastFailure = Date.now();
    }
    
    // Limitar histórico às últimas N tentativas
    if (health.totalAttempts > this.config.trackingWindow) {
      // Remover tentativas mais antigas (simplificado: resetar contadores)
      const successRate = health.successCount / health.totalAttempts;
      health.successCount = Math.floor(successRate * this.config.trackingWindow);
      health.failureCount = this.config.trackingWindow - health.successCount;
      health.totalAttempts = this.config.trackingWindow;
    }
    
    // Verificar se deve abrir circuit breaker
    if (!health.isOpen && health.totalAttempts >= this.config.minAttempts) {
      const failureRate = health.failureCount / health.totalAttempts;
      if (failureRate >= this.config.failureThreshold) {
        health.isOpen = true;
        health.openedAt = Date.now();
        console.warn(`[CircuitBreaker] ${engine}: Circuit aberto (taxa de falha: ${(failureRate * 100).toFixed(1)}%)`);
      }
    }
    
    this.health.set(engine, health);
  }

  /**
   * Verifica se um motor está disponível (circuit não está aberto)
   */
  isAvailable(engine: string): boolean {
    const health = this.getOrCreateHealth(engine);
    
    if (!health.isOpen) {
      return true;
    }
    
    // Se está aberto, verificar se passou tempo suficiente para tentar novamente
    if (health.openedAt) {
      const timeSinceOpen = Date.now() - health.openedAt;
      if (timeSinceOpen >= this.config.cooldownPeriod) {
        // Tentar fechar (half-open state)
        health.isOpen = false;
        this.health.set(engine, health);
        console.log(`[CircuitBreaker] ${engine}: Tentando fechar circuit (half-open state)`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Prioriza motores baseado em saúde
   */
  prioritizeEngines(engines: string[]): string[] {
    return [...engines].sort((a, b) => {
      const healthA = this.getOrCreateHealth(a);
      const healthB = this.getOrCreateHealth(b);
      
      // Motores não disponíveis vão para o final
      if (healthA.isOpen && !healthB.isOpen) return 1;
      if (!healthA.isOpen && healthB.isOpen) return -1;
      
      // Comparar taxa de sucesso
      const successRateA = healthA.totalAttempts > 0 
        ? healthA.successCount / healthA.totalAttempts 
        : 0.5;
      const successRateB = healthB.totalAttempts > 0 
        ? healthB.successCount / healthB.totalAttempts 
        : 0.5;
      
      if (Math.abs(successRateA - successRateB) > 0.1) {
        return successRateB - successRateA; // Maior taxa de sucesso primeiro
      }
      
      // Se taxa similar, comparar latência
      return healthA.avgLatency - healthB.avgLatency; // Menor latência primeiro
    });
  }

  /**
   * Obtém estatísticas de um motor
   */
  getHealth(engine: string): EngineHealth | null {
    return this.health.get(engine) || null;
  }

  /**
   * Obtém ou cria health para um motor
   */
  private getOrCreateHealth(engine: string): EngineHealth {
    if (!this.health.has(engine)) {
      this.health.set(engine, {
        engine,
        successCount: 0,
        failureCount: 0,
        totalAttempts: 0,
        avgLatency: 0,
        lastFailure: null,
        lastSuccess: null,
        isOpen: false,
        openedAt: null,
      });
    }
    return this.health.get(engine)!;
  }

  /**
   * Reseta estatísticas de um motor
   */
  reset(engine: string): void {
    this.health.delete(engine);
  }

  /**
   * Reseta todas as estatísticas
   */
  resetAll(): void {
    this.health.clear();
  }

  /**
   * Obtém todos os motores disponíveis
   */
  getAvailableEngines(engines: string[]): string[] {
    return engines.filter(engine => this.isAvailable(engine));
  }
}

