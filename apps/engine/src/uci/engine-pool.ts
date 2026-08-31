import { config } from '../config.js';
import { UciClient } from './uci-client.js';
import { EngineEvalResult } from '../types.js';

export class EnginePool {
  private clients: UciClient[] = [];
  private waitQueue: Array<(client: UciClient) => void> = [];
  private reserved = new Set<UciClient>();
  private isInitialized = false;

  constructor(private size: number = config.enginePoolSize) {}

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    for (let i = 0; i < this.size; i++) {
      const client = new UciClient({
        enginePath: config.enginePath,
        coreId: i,
        hashMb: 1024,
        threads: 1,
        syzygyPath: config.syzygyPath,
      });

      try {
        await client.init();
        this.clients.push(client);
      } catch (err) {
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

    const { promise, resolve } = Promise.withResolvers<UciClient>();
    this.waitQueue.push((client) => {
      this.reserved.add(client);
      resolve(client);
    });
    return promise;
  }

  public release(client: UciClient): void {
    this.reserved.delete(client);
    if (this.waitQueue.length > 0) {
      const nextResolver = this.waitQueue.shift();
      if (nextResolver) {
        nextResolver(client);
        return;
      }
    }
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
    for (const client of this.clients) {
      await client.quit();
    }
    this.clients = [];
    this.reserved.clear();
    this.waitQueue = [];
    this.isInitialized = false;
  }
}

export const enginePool = new EnginePool();
