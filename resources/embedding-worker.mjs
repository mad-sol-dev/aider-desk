import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

const send = (id, payload) => {
  process.stdout.write(`${JSON.stringify({ id, ...payload })}\n`);
};

let transformers = null;

const getTransformers = async () => {
  if (!transformers) {
    transformers = await import('@huggingface/transformers');
  }
  return transformers;
};

const configureEnv = async (cacheDir) => {
  const { env } = await getTransformers();
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
  env.useFS = true;
  env.useFSCache = true;
  env.cacheDir = cacheDir;
  env.localModelPath = cacheDir;
};

let embedder = null;
let currentModel = null;
let currentDevice = null;
let currentCacheDir = null;

const initModel = async ({ model, cacheDir, device }) => {
  const normalizedCacheDir = cacheDir ?? currentCacheDir;
  if (!normalizedCacheDir) {
    throw new Error('cacheDir is required for embeddings');
  }
  await configureEnv(normalizedCacheDir);
  if (!embedder || model !== currentModel || device !== currentDevice || normalizedCacheDir !== currentCacheDir) {
    const { pipeline } = await getTransformers();
    embedder = await pipeline('feature-extraction', model, {
      cache_dir: normalizedCacheDir,
      device: device || undefined,
    });
    currentModel = model;
    currentDevice = device ?? null;
    currentCacheDir = normalizedCacheDir;
  }
};

rl.on('line', async (line) => {
  if (!line) {
    return;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    process.stderr.write(`Invalid JSON message: ${line}\n`);
    return;
  }

  const { id, type } = message;
  if (!id || !type) {
    return;
  }

  try {
    if (type === 'init') {
      await initModel(message);
      send(id, { ok: true });
      return;
    }

    if (type === 'embed') {
      await initModel(message);
      const result = await embedder(message.text, { pooling: 'mean', normalize: true });
      send(id, { ok: true, embedding: Array.from(result.data) });
      return;
    }

    send(id, { ok: false, error: `Unknown message type: ${type}` });
  } catch (error) {
    send(id, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

process.on('uncaughtException', (error) => {
  process.stderr.write(`Embedding worker crash: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  process.stderr.write(`Embedding worker unhandled rejection: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
