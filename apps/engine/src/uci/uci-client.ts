import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { EngineEvalResult, MultiPvInfo } from '../types.js';

const COMMAND_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 5_000;

export interface UciClientOptions {
  enginePath: string;
  coreId?: number;
  hashMb?: number;
  threads?: number;
  syzygyPath?: string;
  /** Deadline for a `go` search. Handshake commands keep COMMAND_TIMEOUT_MS. */
  searchTimeoutMs?: number;
  /** How long to wait for `bestmove` after `stop` before killing the process. */
  stopGraceMs?: number;
}

function isSearchCommand(cmd: string): boolean {
  return cmd === 'go' || cmd.startsWith('go ');
}

export class UciClient {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;
  private isReady = false;
  private busy = false;
  private retired = false;
  private readonly options: UciClientOptions;
  private readonly searchTimeoutMs: number;
  private readonly stopGraceMs: number;

  constructor(options: UciClientOptions) {
    this.options = {
      hashMb: 1024,
      threads: 1,
      ...options,
    };
    this.searchTimeoutMs = options.searchTimeoutMs ?? COMMAND_TIMEOUT_MS;
    this.stopGraceMs = options.stopGraceMs ?? STOP_GRACE_MS;
  }

  public async init(): Promise<void> {
    if (this.retired) throw new Error('UCI client is shut down');

    const { enginePath, coreId, hashMb, threads, syzygyPath } = this.options;

    const useTaskset = process.platform === 'linux' && typeof coreId === 'number';
    const binary = useTaskset ? 'taskset' : enginePath;
    const args = useTaskset ? ['-c', String(coreId), enginePath] : [];

    const child = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = child;
    // A fast exit (missing binary, restart that dies immediately) emits before
    // sendCommand attaches its own waiter. Swallow here so it cannot crash the process.
    child.on('error', () => {});
    child.on('exit', () => {
      // Ignore the process we already replaced. An unexpected exit must not
      // leave this client looking ready for the next game.
      if (this.process !== child) return;
      this.isReady = false;
    });

    if (!child.stdout || !child.stdin) {
      throw new Error('Failed to create Stockfish process streams');
    }

    // EPIPE when the engine dies mid-write must not crash the process.
    child.stdin.on('error', () => {});

    this.rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });
    this.rl.on('error', () => {});

    await this.sendCommand('uci', (line) => line === 'uciok');

    if (threads) {
      await this.sendRaw(`setoption name Threads value ${threads}`);
    }
    if (hashMb) {
      await this.sendRaw(`setoption name Hash value ${hashMb}`);
    }
    if (syzygyPath) {
      await this.sendRaw(`setoption name SyzygyPath value ${syzygyPath}`);
    }

    await this.isReadyCheck();
    if (this.retired) throw new Error('UCI client is shut down');
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
    if (!this.isReady || this.retired) {
      throw new Error('UCI client is not running');
    }
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
      // A failed restart leaves isReady false so this engine stays out of the pool.
      if (this.isReady && !this.retired) this.busy = false;
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
      const rl = this.rl;
      const child = this.process;
      if (!rl || !child?.stdin?.writable) {
        reject(new Error('Engine process is not running'));
        return;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        reject(new Error('Engine process exited'));
        return;
      }

      let settled = false;
      let draining = false;
      let onDrain: ((line: string) => void) | null = null;
      let timeout: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(timeout);
        rl.off('line', onLine);
        child.off('error', onError);
        child.off('exit', onExit);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const onLine = (line: string) => {
        const text = line.trim();
        if (draining) {
          onDrain?.(text);
          return;
        }
        if (settled) return;
        try {
          if (isTerminal(text)) {
            settled = true;
            cleanup();
            resolve();
          }
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      const onError = (err: Error) => {
        if (settled || draining) return;
        fail(err);
      };

      const onExit = () => {
        if (settled) return;
        // Our own kill at the end of a failed stop is not a second failure.
        if (draining && !this.retired) return;
        if (!this.retired) this.isReady = false;
        fail(new Error('Engine process exited'));
      };

      const deadline = isSearchCommand(cmd) ? this.searchTimeoutMs : COMMAND_TIMEOUT_MS;
      timeout = setTimeout(() => {
        if (settled) return;
        if (!isSearchCommand(cmd)) {
          fail(new Error(`UCI command '${cmd}' timed out`));
          return;
        }
        // Reject only after stop or restart. Resolving here would publish the
        // late bestmove as this evaluation's result and free a live search.
        draining = true;
        void this.recoverSearch((listener) => {
          onDrain = listener;
        }).then(
          () => fail(new Error(`UCI command '${cmd}' timed out`)),
          () => fail(new Error(`UCI command '${cmd}' timed out`)),
        );
      }, deadline);

      rl.on('line', onLine);
      child.on('error', onError);
      child.on('exit', onExit);
      child.stdin.write(`${cmd}\n`);
    });
  }

  /**
   * Stop the timed-out search and discard its bestmove. If the engine never
   * answers, replace the process. isReady stays true until that replacement
   * fails so waiters keep queueing on this client instead of being failed
   * while a new process is starting.
   */
  private async recoverSearch(arm: (listener: (line: string) => void) => void): Promise<void> {
    const stopped = await this.stopAndDrain(arm);
    if (stopped || this.retired) return;
    console.warn('[UciClient] Search ignored stop; restarting engine');
    try {
      this.destroyProcess();
      await this.init();
    } catch (err) {
      this.isReady = false;
      this.destroyProcess();
      console.warn('[UciClient] Engine restart failed:', err);
    }
  }

  private stopAndDrain(arm: (listener: (line: string) => void) => void): Promise<boolean> {
    const child = this.process;
    return new Promise((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        child?.off('exit', onExit);
        resolve(ok);
      };
      const onExit = () => finish(false);
      arm((line) => {
        if (line.startsWith('bestmove ')) finish(true);
      });
      const stdin = child?.stdin;
      if (!child || !stdin?.writable || child.exitCode !== null || child.signalCode !== null) {
        finish(false);
        return;
      }
      child.once('exit', onExit);
      timer = setTimeout(() => finish(false), this.stopGraceMs);
      try {
        stdin.write('stop\n');
      } catch {
        finish(false);
      }
    });
  }

  private destroyProcess(): void {
    const child = this.process;
    const rl = this.rl;
    this.process = null;
    this.rl = null;
    if (rl) {
      try { rl.close(); } catch { /* already closed */ }
    }
    if (!child) return;
    child.stdin?.on('error', () => {});
    try {
      if (child.stdin?.writable) child.stdin.write('quit\n');
    } catch { /* engine already gone */ }
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }

  public async quit(): Promise<void> {
    this.retired = true;
    this.isReady = false;
    this.destroyProcess();
    this.busy = false;
  }

  public isAvailable(): boolean {
    return this.isReady && !this.busy && !this.retired;
  }

  /** False after quit or a restart that did not come back. Busy engines stay usable. */
  public isUsable(): boolean {
    return this.isReady && !this.retired;
  }
}
