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
