import { AccountRefusal, AccountServiceDown, checkEntry } from "./account-service";
import { privacyOf } from "./console-rooms";
import { fail } from "./fail";

import { wording } from "#shared/wording";

import type { SignedIn } from "./accounts";

// Who lets a person into a room and takes them out (docs/accounts.md, 「A room's callers」): the account service's to
// say — the room's opener, a head of the opener's unit or the administrator, never across the room's company — asked
// before the receiver is told anything (docs/web.md, the room screen's section on opening a room and letting people in).

/** Whether the signed-in login may let people into the room at all, for the members sheet: nobody in a private room,
 * whose members the receiver keeps as they stand; a check that cannot be made offers nothing. */
export async function mayLetIn(signed: SignedIn, room: number): Promise<boolean> {
  // A private room, a sealed one, or one whose privacy cannot be read, offers nobody.
  const privacy = await privacyOf(room).catch(() => null);

  if (privacy === null || privacy.privateOf !== null || privacy.sealed) return false;
  if (signed.administrator) return true;
  if (signed.id === null) return false;

  try {
    return (await checkEntry(room, signed.id, signed.id)).allowed;
  } catch (error) {
    if (error instanceof AccountServiceDown || error instanceof AccountRefusal) return false;

    throw error;
  }
}

/** The login may let `user` into the room or take them out, or a refusal in the pack's words. */
export async function requireEntry(signed: SignedIn, room: number, user: string): Promise<void> {
  if (signed.id === null) throw fail(403, wording("members.error.entry_forbidden"));

  let allowed: boolean;

  try {
    allowed = (await checkEntry(room, signed.id, user)).allowed;
  } catch (error) {
    if (error instanceof AccountServiceDown) throw fail(503, wording("members.error.accounts_failed"));
    if (error instanceof AccountRefusal && error.code === "not-found") throw fail(404, wording("members.error.entry_unknown"));
    if (error instanceof AccountRefusal) throw fail(502, wording("members.error.entry_failed"));

    throw error;
  }

  if (!allowed) throw fail(403, wording("members.error.entry_forbidden"));
}
