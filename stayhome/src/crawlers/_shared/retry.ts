export interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  factor?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts = opts.attempts ?? 2;
  const initial = opts.initialDelayMs ?? 500;
  const factor = opts.factor ?? 2;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1 || !shouldRetry(e)) break;
      const wait = initial * Math.pow(factor, i);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(
    `${label} failed after ${attempts} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
  );
}
