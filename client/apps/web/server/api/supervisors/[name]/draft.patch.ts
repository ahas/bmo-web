import { wording } from "#shared/wording";

import type { SupervisorDraftView } from "#shared/drafting";

// One save of a supervisor's draft settings: the texts set, its process set or taken away, and the texts taken away
// (the receiver's `docs/drafting.md`, 「The routes」). Whether the values stand is the receiver's to say; a body of the
// wrong shape goes no further. A part the save leaves out is left as it stands.
export default defineEventHandler(async (event): Promise<SupervisorDraftView> => {
  await requireUserSession(event);

  const name = axisName(getRouterParam(event, "name"));
  const save = draftSaveOf(await readBody<Record<string, unknown>>(event));

  if (save === null) throw fail(400, wording("common.error.bad_action"));

  return await writeSupervisorDraft(name, save);
});
