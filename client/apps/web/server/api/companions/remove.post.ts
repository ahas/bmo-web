import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import type { CompanionView } from "#shared/agency";

// A companion the console added taken out with its room and everything it kept, carried to the receiver under
// the administrator's name (the receiver's `docs/api.md`, 「Companions」). It resets the companion first, which may
// wait out a person-book run's stop and the brain's editing lock, and the call waits for all of it.

export default defineEventHandler(async (event): Promise<CompanionView[]> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ agent?: unknown }>(event);

  if (!isAgentName(body?.agent)) throw fail(400, wording("agents.error.no_such_agent_name"));

  const removed = await removeCompanion(body.agent, signed.name);

  return removed.items.map(companionViewOf);
});
