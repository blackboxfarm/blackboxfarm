/**
 * EXECUTION LOGGER - Comprehensive trade execution logging
 * 
 * Tracks every step of buy/sell execution with timestamps and intermediate values
 * for easier debugging of trade issues.
 */

export interface ExecutionStep {
  step: string;
  timestamp: number;
  durationMs?: number;
  data?: Record<string, unknown>;
  error?: string;
}

export class ExecutionLogger {
  private steps: ExecutionStep[] = [];
  private startTime: number;
  private lastStepTime: number;
  private tradeId: string;
  private tradeType: 'buy' | 'sell';
  private tokenMint: string;

  constructor(tradeType: 'buy' | 'sell', tokenMint: string, positionId?: string) {
    this.startTime = Date.now();
    this.lastStepTime = this.startTime;
    this.tradeType = tradeType;
    this.tokenMint = tokenMint.slice(0, 12);
    this.tradeId = positionId?.slice(0, 8) || `${tradeType}-${Date.now()}`;
    
    this.log('INIT', { 
      tradeType, 
      tokenMint: this.tokenMint,
      positionId: positionId?.slice(0, 8),
      startTime: new Date(this.startTime).toISOString()
    });
  }

  log(step: string, data?: Record<string, unknown>, error?: string) {
    const now = Date.now();
    const durationMs = now - this.lastStepTime;
    this.lastStepTime = now;

    const entry: ExecutionStep = {
      step,
      timestamp: now,
      durationMs,
      data,
      error
    };
    this.steps.push(entry);

    // Format console output
    const elapsed = now - this.startTime;
    const prefix = `[${this.tradeType.toUpperCase()}][${this.tradeId}][+${elapsed}ms]`;
    
    if (error) {
      console.error(`${prefix} ❌ ${step}:`, error, data ? JSON.stringify(data) : '');
    } else {
      const dataStr = data ? ` | ${this.formatData(data)}` : '';
      console.log(`${prefix} ${step}${dataStr}`);
    }
  }

  private formatData(data: Record<string, unknown>): string {
    const entries = Object.entries(data).map(([k, v]) => {
      if (typeof v === 'number') {
        // Format numbers appropriately
        if (k.includes('Price') || k.includes('price')) {
          return `${k}=$${v.toFixed(10)}`;
        }
        if (k.includes('Sol') || k.includes('sol') || k.includes('SOL')) {
          return `${k}=${v.toFixed(6)} SOL`;
        }
        if (k.includes('Usd') || k.includes('usd') || k.includes('USD')) {
          return `${k}=$${v.toFixed(4)}`;
        }
        return `${k}=${v}`;
      }
      if (typeof v === 'string' && v.length > 20) {
        return `${k}=${v.slice(0, 12)}...`;
      }
      return `${k}=${v}`;
    });
    return entries.join(', ');
  }

  logValue(name: string, value: unknown) {
    this.log('VALUE', { [name]: value });
  }

  logPhaseStart(phase: string) {
    this.log(`▶ ${phase} START`);
  }

  logPhaseEnd(phase: string, data?: Record<string, unknown>) {
    this.log(`◀ ${phase} END`, data);
  }

  logSuccess(signature?: string) {
    const totalDuration = Date.now() - this.startTime;
    this.log('✅ SUCCESS', {
      signature: signature?.slice(0, 20),
      totalDurationMs: totalDuration,
      stepCount: this.steps.length
    });
  }

  logFailure(error: string, data?: Record<string, unknown>) {
    const totalDuration = Date.now() - this.startTime;
    this.log('FAILURE', {
      ...data,
      totalDurationMs: totalDuration,
      stepCount: this.steps.length
    }, error);
  }

  getSummary(): { steps: ExecutionStep[]; totalDurationMs: number } {
    return {
      steps: this.steps,
      totalDurationMs: Date.now() - this.startTime
    };
  }

  // Get formatted log for storage in DB
  getLogString(): string {
    return this.steps.map(s => {
      const dataStr = s.data ? ` ${JSON.stringify(s.data)}` : '';
      const errStr = s.error ? ` ERROR: ${s.error}` : '';
      return `[+${s.durationMs}ms] ${s.step}${dataStr}${errStr}`;
    }).join('\n');
  }
}

/**
 * Quick logging helper for simple step tracking
 */
export function createExecutionLogger(tradeType: 'buy' | 'sell', tokenMint: string, positionId?: string): ExecutionLogger {
  return new ExecutionLogger(tradeType, tokenMint, positionId);
}
