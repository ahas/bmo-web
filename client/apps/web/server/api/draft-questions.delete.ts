import { wording } from "#shared/wording";

// The console's text of one question taken away (the receiver's `docs/drafting.md`, 「The routes」): a question the
// console added leaves the catalogue, and one the policy holds stands again in the policy's text. Whether it may
// go is the receiver's to say; a body that names no question goes no further.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (name === "") throw fail(400, wording("common.error.bad_action"));

  await eraseDraftQuestion(name);

  return { ok: true };
});
