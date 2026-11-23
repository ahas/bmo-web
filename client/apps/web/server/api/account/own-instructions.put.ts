import { wording } from "#shared/wording";

import { setOwnInstructions } from "../../utils/own-agents";

import type { OwnInstructionsView } from "#shared/own-agents";

// The reader's own instructions written whole: `all`, a text or null, and `agents`, a text by an agent's name
// (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<OwnInstructionsView> => {
  const body = await readBody<{ all?: unknown; agents?: unknown }>(event).catch(() => ({}) as { all?: unknown; agents?: unknown });
  const all = body?.all === null || body?.all === undefined ? null : body.all;
  const agents = body?.agents ?? {};

  if ((all !== null && typeof all !== "string") || typeof agents !== "object" || agents === null || Array.isArray(agents)) throw fail(400, wording("organization.error.bad_request"));

  const texts = Object.fromEntries(Object.entries(agents).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""));

  return await setOwnInstructions(await signedInUser(event), typeof all === "string" && all.trim() !== "" ? all : null, texts);
});
