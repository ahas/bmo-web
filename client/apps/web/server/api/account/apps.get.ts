import { appsFailure, ownApps } from "../../utils/apps";

import type { OwnApp } from "#shared/apps";

// The apps offered to the signed-in reader, each with what stands for them (docs/web.md, 「Settings」, the own apps
// section).
export default defineEventHandler(async (event): Promise<OwnApp[]> => {
  try {
    return await ownApps(await signedInUser(event));
  } catch (error) {
    throw appsFailure(error);
  }
});
