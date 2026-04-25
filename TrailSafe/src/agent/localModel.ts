import { generate } from '../zetic/ZeticMLange';

export class LocalModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalModelError';
  }
}

const TIMEOUT_MS = 10_000;
const ARTIFACT_REGEX = /<\|[^|>]+\|>|<\/?s>|\[\/?INST\]/g;

let healthChecked = false;
let healthy = false;

async function checkHealthOnce(): Promise<void> {
  if (healthChecked) return;
  healthChecked = true;
  try {
    const mod: { testLocalModel?: () => Promise<boolean> } =
      // @ts-ignore — module may not exist yet (ZETIC agent ships separately)
      require('../zetic/modelConfig');
    if (typeof mod.testLocalModel !== 'function') {
      healthy = false;
      return;
    }
    healthy = await mod.testLocalModel();
  } catch {
    healthy = false;
  }
}

export async function callLocalModel(prompt: string): Promise<string> {
  await checkHealthOnce();
  if (!healthy) {
    throw new LocalModelError('local model unavailable');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      generate(prompt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new LocalModelError('local model timed out')), TIMEOUT_MS);
      }),
    ]);

    if (!raw) {
      throw new LocalModelError('local model returned empty response');
    }

    return raw.replace(ARTIFACT_REGEX, '').trim();
  } catch (err) {
    if (err instanceof LocalModelError) throw err;
    throw new LocalModelError(
      err instanceof Error ? `local model: ${err.message}` : 'local model failed',
    );
  } finally {
    clearTimeout(timer);
  }
}
