import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

import logger from '@/logger';
import { RESOURCES_DIR } from '@/constants';
import { getElectronApp, isDev } from '@/app';

type RunnerMessage =
  | { id: string; type: 'init'; model: string; cacheDir: string; device?: string }
  | { id: string; type: 'embed'; model: string; cacheDir: string; device?: string; text: string };

type RunnerResponse = { id: string; ok: boolean; embedding?: number[]; error?: string };

const resolveWorkerPath = (): string => {
  const envPath = process.env.AIDER_DESK_EMBEDDINGS_WORKER;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const app = getElectronApp();
  if (app && !isDev()) {
    const appCandidate = path.join(app.getAppPath(), 'out', 'main', 'embedding-worker.mjs');
    if (fs.existsSync(appCandidate)) {
      return appCandidate;
    }
  }
  const resourcesCandidate = path.join(RESOURCES_DIR, 'embedding-worker.mjs');
  if (fs.existsSync(resourcesCandidate)) {
    return resourcesCandidate;
  }
  throw new Error(`Embedding worker not found at ${resourcesCandidate}`);
};

export class EmbeddingRunner {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, { resolve: (value: RunnerResponse) => void; reject: (error: Error) => void }>();
  private requestId = 0;
  private readyPromise: Promise<void> | null = null;
  private activeDevice: string | null;
  private stderrBuffer = '';

  constructor(
    private readonly model: string,
    private readonly cacheDir: string,
    private readonly device?: string,
  ) {
    this.activeDevice = device ?? null;
  }

  async init(): Promise<void> {
    if (!this.child) {
      const workerPath = resolveWorkerPath();
      const nodeBin = process.env.AIDER_DESK_EMBEDDINGS_NODE_BIN || 'node';
      this.child = spawn(nodeBin, [workerPath], { stdio: ['pipe', 'pipe', 'pipe'] });

      const rl = readline.createInterface({ input: this.child.stdout });
      rl.on('line', (line) => this.handleLine(line));

      this.child.stderr.on('data', (chunk) => {
        const message = chunk.toString();
        this.stderrBuffer = `${this.stderrBuffer}${message}`;
        if (this.stderrBuffer.length > 8000) {
          this.stderrBuffer = this.stderrBuffer.slice(-8000);
        }
        logger.warn('Embedding worker stderr:', message);
      });

      this.child.on('exit', (code, signal) => {
        const details = this.stderrBuffer.trim();
        const error = new Error(`Embedding worker exited (code=${code}, signal=${signal})${details ? `: ${details}` : ''}`);
        for (const pending of this.pending.values()) {
          pending.reject(error);
        }
        this.pending.clear();
        this.child = null;
        this.stderrBuffer = '';
      });
    }

    const preferredDevice = this.device ?? null;
    let initResponse = await this.send({
      id: this.nextId(),
      type: 'init',
      model: this.model,
      cacheDir: this.cacheDir,
      device: preferredDevice ?? undefined,
    });

    if (!initResponse.ok && preferredDevice === 'cuda') {
      logger.warn('Embedding worker CUDA init failed, falling back to CPU', {
        error: initResponse.error,
      });
      initResponse = await this.send({
        id: this.nextId(),
        type: 'init',
        model: this.model,
        cacheDir: this.cacheDir,
        device: 'cpu',
      });
      if (initResponse.ok) {
        this.activeDevice = 'cpu';
        return;
      }
    }

    if (!initResponse.ok) {
      throw new Error(initResponse.error || 'Embedding worker failed to initialize');
    }

    this.activeDevice = preferredDevice;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.send({
      id: this.nextId(),
      type: 'embed',
      model: this.model,
      cacheDir: this.cacheDir,
      device: this.activeDevice ?? undefined,
      text,
    });

    if (!response.ok || !response.embedding) {
      throw new Error(response.error || 'Embedding worker failed to embed text');
    }

    return response.embedding;
  }

  getActiveDevice(): string | null {
    return this.activeDevice;
  }

  private handleLine(line: string): void {
    let message: RunnerResponse | null = null;
    try {
      message = JSON.parse(line) as RunnerResponse;
    } catch {
      logger.warn('Failed to parse embedding worker response:', line);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    pending.resolve(message);
  }

  private send(message: RunnerMessage): Promise<RunnerResponse> {
    if (!this.child) {
      return Promise.reject(new Error('Embedding worker process is not running'));
    }
    this.readyPromise ??= Promise.resolve();
    const payload = JSON.stringify(message);

    return new Promise<RunnerResponse>((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      this.child?.stdin.write(`${payload}\n`);
    });
  }

  private nextId(): string {
    this.requestId += 1;
    return String(this.requestId);
  }
}
