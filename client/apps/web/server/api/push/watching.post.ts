import { wording } from "#shared/wording";
import { reportWatching } from "../../utils/account-service";
import { signedInUser } from "../../utils/accounts";
import { isOwnRoom, requireReadableRoom } from "../../utils/room-reach";

import type { H3Event } from "h3";

// Whether a tab showing a room looks unseen: the administrator's on a room that is not his own, whose read leaves
// nothing its people can see (docs/web.md, 「Access」); a console login standing before the account model is the owner's,
// with no other person's room beside his. A room whose ownership cannot be told is looked at unseen, so no trace is
// left by mistake.
async function unseen(event: H3Event, chatId: number | null): Promise<boolean> {
  if (chatId === null) return false;

  const signed = await signedInUser(event);

  if (!signed.administrator || signed.id === null) return false;

  return !(await isOwnRoom(event, chatId).catch(() => false));
}

// An open tab saying which room it shows and whether it can be seen (docs/web.md, 「Notifications」).
// It is written against the account logged in, so a room's notification passes over exactly the
// devices of whoever is looking at it. A room the account does not read is refused as if it did not stand, so
// nobody's looking moves another's count for a room they cannot read.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const session = await requireUserSession(event);
  const body = (await readBody(event)) as { tab?: unknown; chatId?: unknown; visible?: unknown } | null;
  const tab = typeof body?.tab === "string" ? body.tab.trim() : "";

  if (tab === "" || tab.length > 100 || typeof body?.visible !== "boolean") {
    throw fail(400, wording("push.error.bad_watch"));
  }

  const chatId = Number.isSafeInteger(body.chatId) ? (body.chatId as number) : null;

  if (chatId !== null) await requireReadableRoom(event, chatId);

  roomWatchers.report({ tab, user: session.user.name, chatId, visible: body.visible, unseen: await unseen(event, chatId) }, Date.now());

  // The receiver reads the rooms open from the account service at its start; a report that cannot reach it is
  // said here and the next report tries again.
  try {
    await reportWatching(roomWatchers.visibleRooms(Date.now()));
  } catch (error) {
    console.warn("the watching rooms were not reported to the account service", error);
  }

  return { ok: true };
});
