export class DeadlineExceeded extends Error {
  constructor(label: string, ms: number) {
    super(`deadline exceeded for ${label} after ${ms}ms`);
    this.name = "DeadlineExceeded";
  }
}

export async function withDeadline<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(label, ms)), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
