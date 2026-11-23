import { ownAgentBack } from "../../../../utils/own-agents";

// A seat supplied to the reader standing again as supplied (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await ownAgentBack(await signedInUser(event), getRouterParam(event, "name") ?? "");

  return { ok: true };
});
