/**
 * The stored session is no longer good, discovered after it had already passed
 * validation.
 *
 * Every crawler has a moment where the site answers as a stranger: SONO's
 * `userinfo` with no member number, RESOM with no bearer token, OAKVALLEY
 * unable to open the condo screen, HANWHA's booking host with an empty
 * `sCustNo`. All five already said so with a `SESSION_LOST:` message prefix —
 * this class is that convention made load-bearing.
 *
 * Why it needs to be a type rather than a string: `run.ts` decides whether to
 * throw away the cached `storageState` from the *stage* it failed in, and these
 * throws all happen in `SEARCH`, which is not one of the stages that clears it.
 * So the dead session survived into the next attempt, `validateSession` passed
 * it (HANWHA validates the login host while the booking host is the one that
 * lost the session — two hosts, one check), login was skipped, and the same
 * failure came back. That is exactly the pair of `SESSION_LOST` failures at
 * 09:05 on 2026-08-25; the third attempt only recovered by accident.
 *
 * `withDeadline` rethrows the original error untouched, so `instanceof`
 * survives the wrapper `run.ts` calls crawlers through.
 */
export class SessionLostError extends Error {
  constructor(message: string) {
    super(message.startsWith("SESSION_LOST") ? message : `SESSION_LOST: ${message}`);
    this.name = "SessionLostError";
  }
}

/**
 * The container's `/tmp` is too full to run a browser in, discovered before one
 * was launched.
 *
 * This exists because the failure it names does not look like itself. `/tmp` on
 * a Vercel function is 525MB and the extracted Chromium already lives there, so
 * a warm instance that has been crawling all morning launches a browser that
 * then dies mid-navigation — and what lands in `crawl_logs` is
 * `net::ERR_INSUFFICIENT_RESOURCES` or "Target page, context or browser has
 * been closed", both of which read as the resort site's fault. On 2026-08-27
 * eight consecutive failures across four resorts were recorded that way; the
 * instance had been poisoned since 09:05:20 and nothing in the log said so.
 *
 * Throwing before the launch converts that into one honest sentence, and costs
 * milliseconds instead of a browser startup — which matters because Inngest
 * will retry into the same warm instance, where a second launch attempt is
 * worthless (`browser.ts`: a resource-exhaustion launch failure is never
 * retried, for the same reason).
 *
 * It is deliberately *not* a session problem: it is raised before any context
 * exists, so `run.ts`'s `sessionUsable` is still false and the stored
 * `storageState` survives. Discarding it would make the next attempt pay for a
 * cold login on top of a full disk.
 */
export class TmpExhaustedError extends Error {
  constructor(message: string) {
    super(message.startsWith("TMP_EXHAUSTED") ? message : `TMP_EXHAUSTED: ${message}`);
    this.name = "TmpExhaustedError";
  }
}
