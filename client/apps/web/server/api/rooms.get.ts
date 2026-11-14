import type { ListedRoom } from "#shared/types";

// The rooms that have been added (docs/web.md, 「Sidebar」) that the signed-in user reads: every one for the
// administrator, and for anyone else the rooms they are a member of and hold the console grant in. Each
// carries how many of its messages that user has not read, the first of them, and the place read to they
// are counted from.
export default defineEventHandler(async (event): Promise<ListedRoom[]> => {
  const signed = await signedInUser(event);

  const rooms = await readableRooms(event);
  const listed = await listRooms();
  const readable = rooms === "all" ? listed : listed.filter((room) => rooms.has(room.chatId));
  const unread = await unreadCounts(signed, await ownSenders(signed, await ownerChat()), readable.map(roomLast), nowSeconds());

  return readable.map((room) => {
    const read = unread.get(room.chatId);

    return { ...room, unread: read?.count ?? 0, firstUnread: read?.first ?? null, readTo: read?.from ?? null };
  });
});
