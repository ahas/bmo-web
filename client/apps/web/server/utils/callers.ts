import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { wording } from "#shared/wording";

// A room's callers as the console says their refusals (docs/web.md, the room screen's callers entry): the account
// service's codes (docs/boundary.md, 「A room's callers」) to the pack's keys.

const CALLER_CODES: Record<string, string> = {
  forbidden: "callers.error.forbidden",
  "not-found": "callers.error.not_found",
  "bad-request": "callers.error.failed",
  "upstream-failed": "callers.error.failed"
};

/** What a call came to, said in the pack's words. */
export function callerFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("callers.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = CALLER_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "callers.error.failed"));
  }

  return fail(500, wording("callers.error.failed"));
}
