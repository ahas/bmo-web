import { wording } from "#shared/wording";

import type { DefaultAnswererView } from "#shared/axes";

// The default answerer chosen, for a reader who may write the supervisors tab (the receiver's `docs/api.md`, 「Supervisors」, `PUT
// /default-answerer`): a supervisor the agency registers. The answer is the setting as the receiver then holds it.
export default defineEventHandler(async (event): Promise<DefaultAnswererView> => {
  await signedInUser(event);

  const body = await readBody<{ supervisor?: unknown }>(event);

  if (typeof body?.supervisor !== "string" || body.supervisor === "") throw fail(400, wording("common.error.bad_action"));

  const held = await receiverCall(receiver().PUT("/default-answerer", { body: { supervisor: body.supervisor } }), { codes: SUPERVISOR_CODES });

  return { supervisor: held.supervisor };
});
