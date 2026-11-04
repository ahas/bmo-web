import { wording } from "#shared/wording";

// One quiet instruction's whole text, for the room whose turn it opened, as the receiver reads it.
export default defineEventHandler(async (event): Promise<{ id: number; text: string }> => {
  await requireUserSession(event);

  const chatId = requireChatId(event);

  await requireReadableRoom(event, chatId);
  const id = Number(getRouterParam(event, "id") ?? "");

  if (!Number.isSafeInteger(id)) {
    throw fail(400, wording("room.error.bad_instruction_id"));
  }

  return await readInstructionText(chatId, id);
});
