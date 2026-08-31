import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { EngineEvalResult, MultiPvInfo } from '../types.js';

export interface UciClientOptions {
  enginePath: string;
  coreId?: number;
  hashMb?: number;
  threads?: number;
  syzygyPath?: string;
}

export class UciClient {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private isReady = false;
  private busy = false;
  private options: UciClientOptions;

  constructor(options: UciClientOptions) {
    this.options = {
      hashMb: 1024,
      threads: 1,
      ...options,
    };
  }

  public async init(): Promise<void> {
    const { enginePath, coreId, hashMb, threads, syzygyPath } = this.options;

    const useTaskset = process.platform === 'linux' && typeof coreId === 'number';
    const binary = useTaskset ? 'taskset' : enginePath;
    const args = useTaskset ? ['-c', String(coreId), enginePath] : [];

    this.process = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to create Stockfish process streams');
    }

    this.rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity,
    });

    await this.sendCommand('uci', (line) => line === 'uciok');

    if (hashMb) {
      await this.sendRaw(`setoption name Hash value ${hashMb}`);
    }
    if (threads) {
      await this.sendRaw(`setoption name Threads value ${threads}`);
    }
    if (syzygyPath) {
      await this.sendRaw(`setoption name SyzygyPath value ${syzygyPath}`);
    }

    await this.isReadyCheck();
    this.isReady = true;
  }

  public async isReadyCheck(): Promise<void> {
    await this.sendCommand('isready', (line) => line === 'readyok');
  }

  public async newGame(): Promise<void> {
    await this.sendRaw('ucinewgame');
    await this.isReadyCheck();
  }

  public async evaluateFen(
    fen: string,
    options: { nodes?: number; depth?: number; multiPv?: number } = {}
  ): Promise<EngineEvalResult> {
    if (this.busy) {
      throw new Error('UCI client is busy');
    }
    this.busy = true;

    try {
      const { nodes, depth, multiPv = 1 } = options;

      await this.sendRaw(`setoption name MultiPV value ${multiPv}`);
      await this.sendRaw(`position fen ${fen}`);

      let goCommand = 'go';
      if (nodes) {
        goCommand += ` nodes ${nodes}`;
      } else if (depth) {
        goCommand += ` depth ${depth}`;
      } else {
        goCommand += ' nodes 15000';
      }

      const multiPvMap = new Map<number, MultiPvInfo>();
      let finalBestMove = '';

      // Determine side to move from FEN for perspective adjustment
      const isBlackToMove = fen.split(' ')[1] === 'b';

      await this.sendCommand(goCommand, (line) => {
        if (line.startsWith('info ') && line.includes(' score ')) {
          const parsed = this.parseInfoLine(line, isBlackToMove);
          if (parsed) {
            multiPvMap.set(parsed.multipv, parsed);
          }
        }
        if (line.startsWith('bestmove ')) {
          const parts = line.split(' ');
          finalBestMove = parts[1] || '';
          return true;
        }
        return false;
      });

      const multiPvList = Array.from(multiPvMap.values()).sort((a, b) => a.multipv - b.multipv);
      const primary = multiPvList[0];

      // Primary eval in White's perspective
      const evalPawns = primary ? primary.evalPawns : 0;
      const bestMove = finalBestMove || (primary ? primary.bestMove : '');
      const pv = primary ? primary.pv : '';

      return {
        fen,
        evalPawns,
        bestMove,
        pv,
        multipv: multiPvList,
        depth: primary?.depth,
      };
    } finally {
      this.busy = false;
    }
  }

  private parseInfoLine(line: string, isBlackToMove: boolean): MultiPvInfo | null {
    const tokens = line.split(' ');
    let multipv = 1;
    let depth = 0;
    let scoreCp: number | undefined;
    let scoreMate: number | undefined;
    let pv = '';

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'multipv' && i + 1 < tokens.length) {
        multipv = parseInt(tokens[i + 1], 10);
      } else if (tokens[i] === 'depth' && i + 1 < tokens.length) {
        depth = parseInt(tokens[i + 1], 10);
      } else if (tokens[i] === 'score') {
        const scoreType = tokens[i + 1];
        const scoreVal = parseInt(tokens[i + 2], 10);
        if (scoreType === 'cp') {
          scoreCp = scoreVal;
        } else if (scoreType === 'mate') {
          scoreMate = scoreVal;
        }
      } else if (tokens[i] === 'pv') {
        pv = tokens.slice(i + 1).join(' ');
        break;
      }
    }

    // Engine score is in side-to-move perspective.
    // Convert to White's perspective for consistent evalPawns.
    let evalPawns = 0;
    if (typeof scoreCp === 'number') {
      const sideMultiplier = isBlackToMove ? -1 : 1;
      evalPawns = (scoreCp / 100.0) * sideMultiplier;
    } else if (typeof scoreMate === 'number') {
      const sideMultiplier = isBlackToMove ? -1 : 1;
      evalPawns = (scoreMate > 0 ? 100 - scoreMate : -100 - scoreMate) * sideMultiplier;
    }

    const bestMove = pv.split(' ')[0] || '';

    return {
      multipv,
      depth,
      scoreCp,
      scoreMate,
      evalPawns,
      pv,
      bestMove,
    };
  }

  private async sendRaw(cmd: string): Promise<void> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Engine stdin is not writable');
    }
    this.process.stdin.write(`${cmd}\n`);
  }

  private sendCommand(cmd: string, isTerminal: (line: string) => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.rl || !this.process?.stdin?.writable) {
        return reject(new Error('Engine process is not running'));
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`UCI command '${cmd}' timed out`));
      }, 30000);

      const onLine = (line: string) => {
        try {
          if (isTerminal(line.trim())) {
            cleanup();
            resolve();
          }
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.rl?.off('line', onLine);
        this.process?.off('error', onError);
      };

      this.rl.on('line', onLine);
      this.process.on('error', onError);
      this.process.stdin.write(`${cmd}\n`);
    });
  }

  public async quit(): Promise<void> {
    try {
      if (this.process?.stdin?.writable) {
        this.process.stdin.write('quit\n');
      }
      this.rl?.close();
      this.process?.kill();
    } catch {
      // Ignore cleanup error
    } finally {
      this.process = null;
      this.rl = null;
      this.isReady = false;
      this.busy = false;
    }
  }

  public isAvailable(): boolean {
    return this.isReady && !this.busy;
  }
}
