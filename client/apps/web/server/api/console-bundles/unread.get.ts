import { appGateOf } from "../../utils/app-gate";
import { attachedBundles } from "../../utils/console-manifests";
import { readSidebarCounts } from "../../utils/sidebar-unread";

import type { SidebarCounts } from "../../utils/sidebar-unread";

// The sidebar counts of the bundles the signed-in reader may open, no app off for them among them (docs/web.md,
// 「Sidebar」): the console reads each from its unit as itself and answers those that answered, by the address of the
// screen each stands on.
export default defineEventHandler(async (event): Promise<SidebarCounts> => {
  await requireUserSession(event);

  const signed = await signedInUser(event);

  return readSidebarCounts(signed, await appGateOf(event, signed).openBundles(attachedBundles()));
});
