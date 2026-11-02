import { wording } from "#shared/wording";

import type { CompanionAdded } from "#shared/agency";

// A supervisor added on the console, as a companion added on the console is (the agency's `docs/companions.md`,
// 「Where a companion and its rooms come from」): the receiver adds it with a room of the console's own that it
// answers alone, on the first entry of its order and with the repository its items go to, and the order is then
// set whole with its quota share. The receiver checks the first step's fields and the agency the order's.
export default defineEventHandler(async (event): Promise<CompanionAdded> => {
  await requireAdministrator(event);

  const body = await readBody<Record<string, unknown>>(event);
  const fields = typeof body === "object" && body !== null ? body : {};
  const order = orderAsked(fields.order);
  const named = (field: string): string => (typeof fields[field] === "string" ? (fields[field] as string).trim() : "");
  const first = order?.[0];

  if (order === null || first === undefined || typeof fields.quotaShare !== "number") throw fail(400, wording("agents.error.companion_add"));

  const added = await addCompanion({ name: named("name"), label: named("label"), provider: first.provider, model: first.model, worker: named("repository"), room: named("room") });

  await changeSupervisor(named("name"), { order: orderBody(order), quotaShare: fields.quotaShare });

  const room = added.room;

  return {
    companions: added.items.map(companionViewOf),
    room: {
      chatId: room?.id ?? 0,
      takenBack: room?.takenBack ?? false,
      said: room?.takenBack === true ? wording("agents.message.companion_room_taken_back", { room: named("room") }) : null
    }
  };
});
