import { wording } from "#shared/wording";

// The screen's stop of its reads (docs/web.md, 「DB screen」): each read named by the key the screen put on it is
// stopped at once, its process asking the database to cancel the statement it runs and ending.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const body = await readBody<{ reads?: unknown }>(event);
  const keys = Array.isArray(body?.reads) ? body.reads.filter((key): key is string => typeof key === "string") : null;

  if (keys === null) throw fail(400, wording("db.error.read_failed"));

  for (const key of keys) stopDbRead(key);

  return { ok: true };
});
