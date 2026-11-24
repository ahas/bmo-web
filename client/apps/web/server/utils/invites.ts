import { AccountRefusal, AccountServiceDown } from "./account-service";
import { fail } from "./fail";

import { wording } from "#shared/wording";

// The invitations' refusals as the console says them (docs/web.md, 「Organisation settings」, the invitations tab, and
// 「The join page」): the account service's codes (docs/boundary.md, 「Invitations」) to the pack's keys.

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

// The account service's codes on the join page's pairing approval (docs/boundary.md, 「Invitations」), each with its
// sentence: the pairing's own and the invitation's.
const JOIN_PAIRING_CODES: Readonly<Record<string, string>> = {
  "pairing-closed": "join.error.code_closed",
  "not-found": "join.error.code_not_found",
  "account-active": "join.error.account_active",
  "invite-open": "invites.error.failed",
  "no-hub": "invites.error.no_hub",
  left: "pairing.error.left"
};

/** What the join page's pairing approval came to, said in the pack's words. */
export function joinPairingFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("invites.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = JOIN_PAIRING_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "pairing.error.failed"));
  }

  return fail(500, wording("pairing.error.failed"));
}

// The account service's codes on the join page's ask to share a machine (docs/boundary.md, 「Invitations」).
const JOIN_SHARE_CODES: Readonly<Record<string, string>> = {
  "no-machine": "join.error.share_no_machine",
  "bad-request": "join.error.share_bad_name",
  "account-active": "join.error.account_active",
  "invite-open": "invites.error.failed",
  "no-hub": "invites.error.no_hub",
  "not-found": "invites.error.not_found"
};

/** What the join page's ask to share a machine came to, said in the pack's words. */
export function joinShareFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("invites.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = JOIN_SHARE_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "invites.error.failed"));
  }

  return fail(500, wording("invites.error.failed"));
}

// The account service's codes on a decision of an ask to share a machine.
const SHARE_DECISION_CODES: Readonly<Record<string, string>> = {
  forbidden: "invites.error.share_forbidden",
  "not-found": "invites.error.share_gone",
  "no-hub": "invites.error.no_hub"
};

/** What a decision of an ask to share a machine came to, said in the pack's words. */
export function shareDecisionFailure(error: unknown): Error {
  if (error instanceof AccountServiceDown) return fail(503, wording("invites.error.unreachable"));

  if (error instanceof AccountRefusal) {
    const key = SHARE_DECISION_CODES[error.code];

    return fail(key === undefined ? 502 : error.status, wording(key ?? "invites.error.failed"));
  }

  return fail(500, wording("invites.error.failed"));
}
