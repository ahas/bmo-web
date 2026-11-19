import { wording } from "#shared/wording";

import type { MonitorNode, NodeOwnershipChange } from "#shared/types";

// A node's ownership and account set by the administrator from its screen or the node list (docs/web.md, 「Monitor
// screen」): the node service judges the account, and its refusal comes back in the pack's words. What is refused
// here is only a request whose ownership is neither of the two, or whose account is not text.
export default defineEventHandler(async (event): Promise<MonitorNode> => {
  await requireAdministrator(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";
  const body = await readBody<{ ownership?: unknown; account?: unknown }>(event);
  const account = body?.account ?? null;

  if ((body?.ownership !== "shared" && body?.ownership !== "personal") || (account !== null && typeof account !== "string")) {
    throw fail(400, wording("hardware.error.ownership_shape"));
  }

  const change: NodeOwnershipChange = { ownership: body.ownership, account };

  return await changeNodeOwnership(name, change);
});
