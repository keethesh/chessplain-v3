import { config } from '../config.js';
import { UciClient, type UciClientOptions } from './uci-client.js';
import { EngineEvalResult } from '../types.js';

type Waiter = {
  resolve: (client: UciClient) => void;
  reject: (err: Error) => void;
};

export class EnginePool {
  private clients: UciClient[] = [];
  private waitQueue: Waiter[] = [];
  private reserved = new Set<UciClient>();
  private isInitialized = false;

  constructor(
    private size: number = config.enginePoolSize,
    private readonly clientOptions?: Partial<UciClientOptions>,
  ) {}

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    for (let i = 0; i < this.size; i++) {
      const client = new UciClient({
        enginePath: config.enginePath,
        hashMb: config.engineHashMb,
        threads: config.engineThreads,
        syzygyPath: config.syzygyPath,
        ...this.clientOptions,
      });

      try {
        await client.init();
        this.clients.push(client);
      } catch (err) {
        await client.quit();
        console.warn(`[EnginePool] Worker ${i} initialization failed:`, err);
      }
    }

    if (this.clients.length === 0) {
      throw new Error(`EnginePool failed to initialize any UCI instances (engine path: ${config.enginePath})`);
    }

    this.isInitialized = true;
  }

  public get availableCount(): number {
    return this.clients.filter((c) => !this.reserved.has(c) && c.isAvailable()).length;
  }

  public get totalCount(): number {
    return this.clients.length;
  }

  public async acquire(): Promise<UciClient> {
    const available = this.clients.find((c) => !this.reserved.has(c) && c.isAvailable());
    if (available) {
      this.reserved.add(available);
      return available;
    }

    if (!this.clients.some((c) => c.isUsable())) {
      throw new Error('No usable UCI engines');
    }

    const { promise, resolve, reject } = Promise.withResolvers<UciClient>();
    this.waitQueue.push({ resolve, reject });
    return promise;
  }

  public release(client: UciClient): void {
    this.reserved.delete(client);
    if (!this.isInitialized) return;
    if (!client.isUsable()) {
      this.clients = this.clients.filter((c) => c !== client);
    }
    this.serveWaiters();
  }

  public async evaluate(
    fen: string,
    options: { nodes?: number; depth?: number; multiPv?: number } = {}
  ): Promise<EngineEvalResult> {
    const client = await this.acquire();
    try {
      return await client.evaluateFen(fen, options);
    } finally {
      this.release(client);
    }
  }

  public async shutdown(): Promise<void> {
    this.isInitialized = false;
    this.rejectWaiters(new Error('Engine pool shut down'));
    const clients = this.clients.splice(0);
    this.reserved.clear();
    for (const client of clients) {
      await client.quit();
    }
  }

  private serveWaiters(): void {
    while (this.waitQueue.length > 0) {
      const next = this.clients.find((c) => !this.reserved.has(c) && c.isAvailable());
      if (!next) {
        if (!this.clients.some((c) => c.isUsable())) {
          this.rejectWaiters(new Error('No usable UCI engines'));
        }
        return;
      }
      const waiter = this.waitQueue.shift();
      if (!waiter) return;
      this.reserved.add(next);
      waiter.resolve(next);
    }
  }

  private rejectWaiters(err: Error): void {
    const pending = this.waitQueue.splice(0);
    for (const waiter of pending) waiter.reject(err);
  }
}

export const enginePool = new EnginePool();
