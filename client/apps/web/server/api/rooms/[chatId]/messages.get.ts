import type { MessagePage } from "#shared/types";

export default defineEventHandler(async (event): Promise<MessagePage> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);

  const query = getQuery(event);
  // Three ways to ask, and a reader uses one of them. `before` walks back into the room's past a
  // page at a time and `after` asks only for what stands past a message already held, which is one
  // row on the ordinary turn instead of the whole end of the room again; both name a row the reader
  // holds, and read its position in the room's line. `at` names a message by its own number and
  // brings back that row alone — what the reader wants when a message it holds was edited, and the
  // one question a cursor cannot ask, since the number before a given one names no row at all as
  // often as not. Each names its message by the exact digits the receiver wrote, since a chat service may number
  // its messages past what a JavaScript number holds.
  const at = readMessageCursor(query.at);
  const after = readMessageCursor(query.after);
  const page = at !== null
    ? await readOneMessage(chatId, at)
    : after === null
      ? await readMessagePage(chatId, readMessageCursor(query.before), readLimit(query.limit))
      : await readMessagesAfter(chatId, after, readLimit(query.limit));

  // A member reads the conversation; the verdicts recorded on it and how its answers were drafted are the
  // administrator's (docs/web.md, 「Access」).
  return await readableRooms(event) === "all" ? page : { ...page, messages: page.messages.map((message) => ({ ...message, drafts: null })), judgements: [] };
});
