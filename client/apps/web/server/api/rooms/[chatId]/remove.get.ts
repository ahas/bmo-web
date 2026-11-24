import { removalQuery } from "../../../utils/console-rooms";
import { receiverRoute } from "../../../utils/receiver";
import { removalWarnings } from "../../../utils/room-removal";
import { requireReadableRoom } from "../../../utils/room-reach";

import type { RoomRemovalPreview } from "#shared/types";

// What removing this room's registration would take and leave, read by the receiver with nothing written, for the
// administrator alone. It asks every holder and counts the room's files, and waits for that answer however long it
// takes under load. He removes any room he reads, another account's private room and a sealed one among them
// (docs/web.md, 「Access」, the room menu's removal of its registration).

// The answer the receiver gives a removal, preview or carried out; the fields the console's screen does not show
// stand aside.
interface RemovalRead {
  goes?: RoomRemovalPreview["goes"];
  stays?: RoomRemovalPreview["stays"];
  pictures?: string[];
  settings?: RoomRemovalPreview["settings"];
  folders?: RoomRemovalPreview["folders"];
  // Each a warning code with its fields, said here in the pack's sentence for it.
  warned?: unknown[];
}

export default defineEventHandler(async (event): Promise<RoomRemovalPreview> => {
  const signed = await requireAdministrator(event);
  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const answer = await receiverRoute<RemovalRead>(`/rooms/${chatId}?${removalQuery(signed, true)}`, { method: "DELETE" }, { passStatus: [403] });

  return {
    chat: chatId,
    refused: null,
    warnings: removalWarnings(answer.warned),
    goes: answer.goes ?? [],
    stays: answer.stays ?? [],
    pictures: answer.pictures ?? [],
    settings: answer.settings ?? { taken: [], undeclared: [] },
    folders: answer.folders ?? [],
    copies: []
  };
});
