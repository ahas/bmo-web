import { wording } from "#shared/wording";

import type { BriefingSwitches } from "#shared/types";

// One of the voice briefing's switches set, the other left as it stands: the receiver takes exactly one at a time
// (its `docs/api.md`, `PUT /voice-briefing`).
export default defineEventHandler(async (event): Promise<BriefingSwitches> => {
  await requireAdministrator(event);

  const body = await readBody<{ on?: unknown; autoplay?: unknown }>(event);
  const change =
    typeof body?.on === "boolean" && body.autoplay === undefined
      ? { on: body.on }
      : typeof body?.autoplay === "boolean" && body.on === undefined
        ? { autoplay: body.autoplay }
        : null;

  if (change === null) throw fail(400, wording("briefing.error.one_switch"));

  const set = await unitFetch<{ on?: unknown; autoplay?: unknown }>(
    "RECEIVER",
    "/voice-briefing",
    { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(change) },
    { codes: { ...RECEIVER_CODES, "one-switch": "briefing.error.one_switch" } }
  );

  return { on: set?.on !== false, autoplay: set?.autoplay !== false };
});
