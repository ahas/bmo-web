import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { wording } from "#shared/wording";

// The invitations' refusals as the console says them (docs/web.md, 「Settings」, the invitations section, and 「The
// join page」): the account service's codes (docs/boundary.md, 「Invitations」) to the pack's keys.

const INVITE_CODES: Record<string, string> = {
  "invite-closed": "invites.error.closed",
  "name-taken": "invites.error.name_taken",
  "no-hub": "invites.error.no_hub",
  "not-ready": "invites.error.not_ready",
  "not-found": "invites.error.not_found",
  "bad-request": "invites.error.bad_request",
  forbidden: "invites.error.forbidden"
};

/** What a call came to, said in the pack's words. */
export function inviteFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("invites.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = INVITE_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "invites.error.failed"));
  }

  return fail(500, wording("invites.error.failed"));
}
