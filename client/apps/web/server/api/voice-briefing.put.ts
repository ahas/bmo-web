import { wording } from "#shared/wording";

import type { BriefingSwitches } from "#shared/types";

// The voice briefing's switch set (its `docs/api.md`, `PUT /voice-briefing`): whether anything is spoken at all. A
// briefing it speaks plays as it arrives, so there is nothing else to set.
export default defineEventHandler(async (event): Promise<BriefingSwitches> => {
  await requireAdministrator(event);

  const body = await readBody<{ on?: unknown }>(event);

  if (typeof body?.on !== "boolean") throw fail(400, wording("briefing.error.one_switch"));

  const set = await unitFetch<{ on?: unknown }>(
    "RECEIVER",
    "/voice-briefing",
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: body.on }) },
    { codes: { ...RECEIVER_CODES, "one-switch": "briefing.error.one_switch" } }
  );

  return { on: set?.on !== false };
});
