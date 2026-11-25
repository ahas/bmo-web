import { AccountRefusal, AccountServiceDown, checkEntry } from "./account-service";
import { privacyOf } from "./room-privacy";
import { fail } from "./fail";
import { sectionAccessOf } from "./section-access";

import { mayWrite } from "#shared/sections";
import { wording } from "#shared/wording";

import type { SignedIn } from "./accounts";
import type { EntryAct } from "@web/server-client";
import type { RoomEntry } from "#shared/types";

// Who lets a person into a room and who takes one out (docs/accounts.md, 「A room's callers」): the account service's to
// say — every member lets in, the room's opener, a head of the opener's unit or the administrator takes out, never
// across the room's company — asked before the receiver is told anything (docs/web.md, the room screen's section on
// opening a room and letting people in). Whether the login writes in the room at all is the console's own word, asked
// first.

const NEITHER: RoomEntry = { letIn: false, takeOut: false };

/** What the signed-in login may do to the room's members, for the room's screen and its members tab: nothing in a
 * private or sealed room, whose members the receiver keeps as they stand, nor for a login whose rooms section only
 * reads; a check that cannot be made offers nothing. */
export async function roomEntry(signed: SignedIn, room: number): Promise<RoomEntry> {
  // A private room, a sealed one, or one whose privacy cannot be read, offers nobody.
  const privacy = await privacyOf(room).catch(() => null);

  if (privacy === null || privacy.privateOf !== null || privacy.sealed) return NEITHER;
  if (signed.administrator) return { letIn: true, takeOut: true };
  if (signed.id === null || !(await writesRooms(signed.id))) return NEITHER;

  const [letIn, takeOut] = await Promise.all([mayDo(signed.id, room, "let-in"), mayDo(signed.id, room, "take-out")]);

  return { letIn, takeOut };
}

/** The login may do `act` to `user` in the room, or a refusal in the pack's words. */
export async function requireEntry(signed: SignedIn, room: number, user: string, act: EntryAct): Promise<void> {
  if (signed.id === null) throw fail(403, wording("members.error.entry_forbidden"));

  let allowed: boolean;

  try {
    allowed = (await checkEntry(room, signed.id, user, act)).allowed;
  } catch (error) {
    if (error instanceof AccountServiceDown) throw fail(503, wording("members.error.accounts_failed"));
    if (error instanceof AccountRefusal && error.code === "not-found") throw fail(404, wording("members.error.entry_unknown"));
    if (error instanceof AccountRefusal) throw fail(502, wording("members.error.entry_failed"));

    throw error;
  }

  if (!allowed) throw fail(403, wording("members.error.entry_forbidden"));
}

/** Whether a member's rooms section writes; a section the service cannot say writes nothing. */
async function writesRooms(id: number): Promise<boolean> {
  const key = String(id);

  try {
    return mayWrite(await sectionAccessOf(key, { key, role: "member" }), "rooms");
  } catch {
    return false;
  }
}

/** Whether the login may do `act` in the room at all, asked of the account service as the login acting on itself; a
 * check that cannot be made answers no. */
async function mayDo(id: number, room: number, act: EntryAct): Promise<boolean> {
  try {
    return (await checkEntry(room, id, id, act)).allowed;
  } catch (error) {
    if (error instanceof AccountServiceDown || error instanceof AccountRefusal) return false;

    throw error;
  }
}
