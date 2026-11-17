import { wording } from "#shared/wording";
import { reportWatching } from "../../utils/account-service";
import { signedInUser } from "../../utils/accounts";
import { tellPresenceChanges } from "../../utils/console-presence";
import { looksUnseen, requireReadableRoom } from "../../utils/room-reach";

// An open tab saying which room it shows and whether it can be seen (docs/web.md, 「Notifications」).
// It is written against the account logged in, so a room's notification passes over exactly the
// devices of whoever is looking at it, and the account's presence in the console follows it (docs/web.md, 「Presence
// and typing」). A room the account does not read is refused as if it did not stand, so
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

  const now = Date.now();
  const signed = await signedInUser(event);

  roomWatchers.report({ tab, user: session.user.name, account: signed.id, chatId, visible: body.visible, unseen: chatId !== null && (await looksUnseen(event, chatId)) }, now);
  tellPresenceChanges(now);

  // The receiver reads the rooms open from the account service at its start; a report that cannot reach it is
  // said here and the next report tries again.
  try {
    await reportWatching(roomWatchers.visibleRooms(Date.now()));
  } catch (error) {
    console.warn("the watching rooms were not reported to the account service", error);
  }

  return { ok: true };
});
