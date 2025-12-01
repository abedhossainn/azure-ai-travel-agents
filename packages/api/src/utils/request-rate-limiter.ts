/**
 * Client-side Request Rate Limiter
 * 
 * This utility helps prevent rapid successive requests from hitting
 * the Google Gemini API 429 rate limit (30 requests per minute).
 * 
 * Usage in browser:
 * const limiter = new RequestRateLimiter({ minDelayMs: 3000 });
 * const result = await limiter.execute(() => fetch('/api/v2/chat', ...));
 */

export interface RateLimiterConfig {
  minDelayMs?: number; // Minimum delay between requests (default: 3000ms = 3 seconds)
  maxQueueSize?: number; // Maximum queue size before rejecting requests (default: 10)
}

export interface RateLimiterStatus {
  queued: number;
  lastRequestTime: number | null;
  timeSinceLastRequest: number;
  isReady: boolean;
}

/**
 * Rate limiter to prevent rapid API requests
 * Useful for client-side implementations (e.g., in Open WebUI)
 */
export class RequestRateLimiter {
  private minDelayMs: number;
  private maxQueueSize: number;
  private queue: Array<{
    fn: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private lastRequestTime: number | null = null;
  private isProcessing = false;

  constructor(config: RateLimiterConfig = {}) {
    this.minDelayMs = config.minDelayMs || 3000; // 3 seconds default
    this.maxQueueSize = config.maxQueueSize || 10;
  }

  /**
   * Execute a request with rate limiting
   * @param fn - Async function that makes the request
   * @returns Promise that resolves when request completes
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Get current limiter status
   */
  public getStatus(): RateLimiterStatus {
    const timeSinceLastRequest = this.lastRequestTime
      ? Date.now() - this.lastRequestTime
      : Infinity;

    return {
      queued: this.queue.length,
      lastRequestTime: this.lastRequestTime,
      timeSinceLastRequest,
      isReady: timeSinceLastRequest >= this.minDelayMs,
    };
  }

  /**
   * Reset the limiter
   */
  public reset(): void {
    this.queue = [];
    this.lastRequestTime = null;
    this.isProcessing = false;
  }

  /**
   * Set minimum delay between requests
   */
  public setMinDelay(delayMs: number): void {
    this.minDelayMs = Math.max(0, delayMs);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      // Check if we've exceeded queue size
      if (this.queue.length > this.maxQueueSize) {
        const item = this.queue.shift();
        if (item) {
          item.reject(
            new Error(
              `Request queue exceeded maximum size (${this.maxQueueSize}). ` +
              `Please wait before submitting more queries.`
            )
          );
        }
        continue;
      }

      // Wait for minimum delay since last request
      if (this.lastRequestTime !== null) {
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.minDelayMs) {
          const delayNeeded = this.minDelayMs - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, delayNeeded));
        }
      }

      // Execute the next request
      const item = this.queue.shift();
      if (!item) break;

      try {
        this.lastRequestTime = Date.now();
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }

      // Small delay between items to allow browser breathing room
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    this.isProcessing = false;
  }
}

/**
 * Browser-injectable rate limiter script
 * Can be injected into Open WebUI to prevent rapid requests
 */
export const injectClientRateLimiter = (): string => {
  return `
(function() {
  // Client-side rate limiter for preventing 429 errors
  window._travelAgentRateLimiter = {
    minDelay: 3000, // 3 seconds between requests
    lastRequestTime: null,
    
    async execute(fn) {
      const timeSinceLastRequest = this.lastRequestTime ? Date.now() - this.lastRequestTime : Infinity;
      if (timeSinceLastRequest < this.minDelay) {
        const delayNeeded = this.minDelay - timeSinceLastRequest;
        console.log(\`[Rate Limiter] Delaying request by \${delayNeeded}ms\`);
        await new Promise(r => setTimeout(r, delayNeeded));
      }
      this.lastRequestTime = Date.now();
      return fn();
    },
    
    getStatus() {
      return {
        minDelay: this.minDelay,
        lastRequestTime: this.lastRequestTime,
        timeSinceLastRequest: this.lastRequestTime ? Date.now() - this.lastRequestTime : null
      };
    }
  };
  console.log('[Travel Agent] Rate limiter injected. Use window._travelAgentRateLimiter.execute(fetchFn)');
})();
`;
};
