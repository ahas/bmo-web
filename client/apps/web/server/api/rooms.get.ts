import type { ListedRoom } from "#shared/types";

// The rooms that have been added (docs/web.md, 「Sidebar」) that the signed-in user's lists hold (「Access」): for the
// administrator his own and the deployment's, never another account's he reaches only as the administrator, and for
// anyone else the rooms they read by their account. Each carries how many of its messages that user has not read, the
// first of them, and the place read to they are counted from, and whether they may change it.
export default defineEventHandler(async (event): Promise<ListedRoom[]> => {
  const signed = await signedInUser(event);

  const rooms = await listedRooms(event);
  const [listed, privacies] = await Promise.all([listRooms(), roomPrivacies()]);
  const judge = changeJudge(signed);
  const readable = listed.filter((room) => rooms.has(room.chatId));
  const unread = await unreadCounts(signed, await ownSenders(signed, await ownerChat()), readable.map(roomLast), nowSeconds());

  return await Promise.all(
    readable.map(async (room) => {
      const read = unread.get(room.chatId);
      const writable = await judge(room.chatId, privacies.get(room.chatId) ?? SHARED);

      return { ...room, unread: read?.count ?? 0, firstUnread: read?.first ?? null, readTo: read?.from ?? null, writable };
    })
  );
});
