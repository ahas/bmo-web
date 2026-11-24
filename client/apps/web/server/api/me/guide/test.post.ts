import { wording } from "#shared/wording";

import { testedRoad } from "../../../utils/guides";

import type { GuideTest } from "#shared/guide";

// A supply source tried now for the start guide's test step (docs/web.md, 「The start guide」; the agency's
// `docs/supply.md`, 「Testing a source」): asked in the signed-in reader's name, so a member tries their own source on
// the road and the administrator the platform's, a local AI by its registration's name.
export default defineEventHandler(async (event): Promise<GuideTest> => {
  await signedInUser(event);

  const body = await readBody<{ road?: unknown; model?: unknown }>(event);
  const road = testedRoad(body?.road);
  const model = typeof body?.model === "string" && body.model.trim() !== "" ? body.model.trim() : undefined;

  if (road === null) throw fail(400, wording("common.error.bad_action"));

  const tried = await agencyCall(agency(event).POST("/supply-test", { body: { road, ...(model === undefined ? {} : { model }) } }));

  return { ok: tried.ok, reasonCode: tried.reasonCode ?? null };
});
