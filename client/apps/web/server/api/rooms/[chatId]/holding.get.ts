import { readHoldingPage } from "../../../utils/archive";
import { ROOM_HOLDINGS } from "#shared/types";

import type { RoomHolding, RoomHoldingPage } from "#shared/types";

function holdingOf(value: unknown): RoomHolding | null {
  return ROOM_HOLDINGS.find((kind) => kind === value) ?? null;
}

// A room's messages holding one kind, a page at a time walking back from `before`, for whoever reads the room
// (docs/web.md, the room screen's room information).
export default defineEventHandler(async (event): Promise<RoomHoldingPage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  const holding = holdingOf(query.kind);

  if (holding === null) throw createError({ statusCode: 400, statusMessage: `kind must be one of ${ROOM_HOLDINGS.join(", ")}` });

  const page = await readHoldingPage(chatId, holding, readMessageCursor(query.before), readLimit(query.limit));

  // A member reads the conversation; how its answers were drafted is the administrator's (docs/web.md, 「Access」).
  return await readableRooms(event) === "all" ? page : { ...page, messages: page.messages.map((message) => ({ ...message, drafts: null })) };
});
