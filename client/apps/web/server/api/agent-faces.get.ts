import { agentFaces } from "../utils/agent-faces";

import type { AgentFace } from "#shared/types";

// The person number each chat agent's words stand under, by which every screen draws that agent's face (docs/web.md,
// 「Profile photos」).
export default defineEventHandler(async (event): Promise<AgentFace[]> => {
  await requireUserSession(event);

  return await agentFaces();
});
