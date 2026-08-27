/**
 * Run an async function over a list with a ceiling on how many run at once.
 *
 * Why this exists: a pass is a browser, and a browser is the resource that runs
 * out. Before 2026-08-27 every crawler walked its properties strictly one at a
 * time, so LOTTE spent one request per branch per window and HANWHA spent
 * sixteen — and HANWHA's first window of every pass therefore hit the budget
 * gate and returned 120 rows for a full 30-second browser launch. Fewer, fuller
 * passes mean fewer launches on the one warm instance they all share, which is
 * what the `/tmp` ratchet actually counts.
 *
 * **It never rejects.** Each item resolves to `{ ok: true, value }` or
 * `{ ok: false, error }`, in the order the items were given. That shape is not
 * a convenience: both callers already hold the rule that one property failing
 * must not cost the others (LOTTE logs and continues; HANWHA only throws when
 * *every* attempted property failed, because SUCCESS with zero rows is
 * indistinguishable from a sold-out resort). A helper that rejected on the
 * first error would quietly repeal that rule at the moment it matters most.
 *
 * Results keep input order even though completion order will not — callers
 * index back into their own list, and a reordered result array would silently
 * attach one property's rows to another's name.
 */
export type PoolResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function mapPool<I, O>(
  items: readonly I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<PoolResult<O>[]> {
  const out: PoolResult<O>[] = new Array(items.length);
  if (items.length === 0) return out;

  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        try {
          out[i] = { ok: true, value: await fn(items[i], i) };
        } catch (error) {
          out[i] = { ok: false, error };
        }
      }
    },
  );

  await Promise.all(workers);
  return out;
}

/** Split a list into consecutive runs of at most `size`, preserving order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) {
    out.push(items.slice(i, i + Math.max(1, size)));
  }
  return out;
}
