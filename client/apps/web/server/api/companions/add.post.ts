import { wording } from "#shared/wording";

import type { CompanionAdded } from "#shared/agency";

// A companion added with a room of the console's own, carried to the receiver for the administrator
// (the receiver's `docs/api.md`, 「Companions」). The receiver checks every field, asks the agency for the agent's
// half, and answers every companion as it then stands with the room the added one answers and whether it took
// that room back.
const FIELDS = ["name", "label", "provider", "model", "worker", "room"] as const;

export default defineEventHandler(async (event): Promise<CompanionAdded> => {
  await requireAdministrator(event);
  const body = await readBody<Record<string, string>>(event);

  if (typeof body !== "object" || body === null || FIELDS.some((field) => typeof body[field] !== "string")) throw fail(400, wording("agents.error.companion_add"));

  const added = await addCompanion(
    { name: body.name!, label: body.label!, provider: body.provider!, model: body.model!, worker: body.worker!, room: body.room! }
  );
  const room = added.room;

  return {
    companions: added.items.map(companionViewOf),
    room: {
      chatId: room?.id ?? 0,
      takenBack: room?.takenBack ?? false,
      said: room?.takenBack === true ? wording("agents.message.companion_room_taken_back", { room: String(body.room) }) : null
    }
  };
});
