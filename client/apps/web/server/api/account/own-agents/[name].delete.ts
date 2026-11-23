import { removeOwnAgent } from "../../../utils/own-agents";

// An agent of the reader's own removed (docs/web.md, 「Settings」, the own-agents section).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await removeOwnAgent(await signedInUser(event), getRouterParam(event, "name") ?? "");

  return { ok: true };
});
