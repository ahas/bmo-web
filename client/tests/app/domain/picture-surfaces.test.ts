import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { avatarFor, avatarIndex } from "../../../apps/web/app/domain/avatars";
import { ownSenderOf } from "../../../apps/web/app/domain/picture-setting";
import { archivedRows } from "../../../apps/web/app/domain/room";
import { roomItems } from "../../../apps/web/app/domain/screens";

import type { ArchivedMessage, AvatarRef, ListedRoom } from "../../../apps/web/shared/types";
import { OWNER_ID, ROOM_ID } from "../../support/ids";

// Every surface wears the picture the receiver's road brings (docs/web.md, 「Profile photos」): the console's one list
// of pictures, as its `/api/avatars` answers it from the receiver alone (its server's test shows no chat service is
// asked), is the index every surface reads its faces from. Here a room's, a person's and the owner's own picture,
// each in that list and nowhere else, stand on the conversation list, beside a sender's message, in the room's header
// and in one's own account; a room's member wears it in the members sheet's own test.

const SENDER = 4_218_991;

const refs: AvatarRef[] = [
  { kind: "room", id: ROOM_ID, url: `/api/avatars/room/${ROOM_ID}?v=500` },
  { kind: "person", id: SENDER, url: `/api/avatars/person/${SENDER}?v=3000` },
  { kind: "person", id: OWNER_ID, url: `/api/avatars/person/${OWNER_ID}?v=5000` }
];

const index = avatarIndex(refs, (path) => `/console${path}`);

const room: ListedRoom = { chatId: ROOM_ID, title: "room-a", agent: null, messageCount: 1, lastMessageAt: null, pinned: false, unread: 0, firstUnread: null, readTo: null, writable: true };

function said(senderId: number, senderName: string): ArchivedMessage {
  return { chatId: ROOM_ID, messageId: "1", senderId, senderName, agent: false, sentAt: 1_788_000_000, text: "a line", imagePath: null, replyToMessageId: null };
}

describe("a picture the receiver's road alone brings", () => {
  test("stands on the room's row of the conversation list", () => {
    const [row] = roomItems(wording, [room], index, "/");

    expect(row?.avatar).toMatchObject({ src: `/console/api/avatars/room/${ROOM_ID}?v=500` });
  });

  test("stands beside a message its sender sent", () => {
    const [row] = archivedRows([said(SENDER, "person-a")], new Map(), () => "", index);

    expect(row?.look.avatar).toMatchObject({ src: `/console/api/avatars/person/${SENDER}?v=3000` });
  });

  test("stands as the room's picture in its header", () => {
    expect(avatarFor(index, "room", ROOM_ID, room.title)).toMatchObject({ src: `/console/api/avatars/room/${ROOM_ID}?v=500` });
  });

  test("stands as one's own picture in one's account, the owner's sender chosen for the administrator", () => {
    const own = ownSenderOf({ chatId: OWNER_ID, senderId: OWNER_ID, senders: [SENDER, OWNER_ID], administrator: true, owner: true });

    expect(own).toBe(OWNER_ID);
    expect(avatarFor(index, "person", own, "owner")).toMatchObject({ src: `/console/api/avatars/person/${OWNER_ID}?v=5000` });
  });

  test("stands as one's own picture for a member by the first sender linked to the account", () => {
    const own = ownSenderOf({ chatId: null, senderId: OWNER_ID, senders: [SENDER], administrator: false, owner: false });

    expect(avatarFor(index, "person", own, "member")).toMatchObject({ src: `/console/api/avatars/person/${SENDER}?v=3000` });
  });
});
