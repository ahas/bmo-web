import type { DefaultAnswererView } from "#shared/axes";

// The supervisor that answers every room naming none, as the receiver's setting holds it (docs/web.md, 「Agent
// management screen」, the supervisors tab).
export default defineEventHandler(async (event): Promise<DefaultAnswererView> => {
  await requireUserSession(event);

  return { supervisor: (await receiverCall(receiver().GET("/default-answerer"))).supervisor };
});
