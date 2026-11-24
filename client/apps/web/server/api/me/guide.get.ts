import { guideViewOf } from "../../utils/guides";

import type { GuideView } from "#shared/guide";

// The start guide as it stands for the signed-in reader (docs/web.md, 「The start guide」): the flow, its steps, the
// step reached and the roads its provider step offers.
export default defineEventHandler(async (event): Promise<GuideView> => {
  return await guideViewOf(event, await signedInUser(event));
});
