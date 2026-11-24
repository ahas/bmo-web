import { wording } from "#shared/wording";
import { isGuideStep } from "#shared/guide";

import { changeGuide } from "../../utils/guides";

import type { GuideChange, GuideView } from "#shared/guide";

// The signed-in reader's progress through the start guide written as a step is passed (docs/web.md, 「The start
// guide」): the step reached, the supply put off or taken up, the road chosen, and the guide finished, put aside or
// begun again. The answer is the guide as it then stands.
export default defineEventHandler(async (event): Promise<GuideView> => {
  const signed = await signedInUser(event);
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const change: GuideChange = {};

  if (body.step !== undefined) {
    if (!isGuideStep(body.step)) throw fail(400, wording("common.error.bad_action"));
    change.step = body.step;
  }
  if (body.supplyLater !== undefined) {
    if (typeof body.supplyLater !== "boolean") throw fail(400, wording("common.error.bad_action"));
    change.supplyLater = body.supplyLater;
  }
  if (body.road !== undefined) {
    if (body.road !== null && (typeof body.road !== "string" || body.road.length > 64)) throw fail(400, wording("common.error.bad_action"));
    change.road = body.road;
  }
  if (body.finish === true) change.finish = true;
  if (body.leave === true) change.leave = true;
  if (body.restart === true) change.restart = true;

  return await changeGuide(event, signed, change);
});
