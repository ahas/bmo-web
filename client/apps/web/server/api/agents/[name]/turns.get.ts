import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import { requireReadableAgent } from "../../../utils/agent-reach";

import type { TurnFigures } from "#shared/types";

// What the chat turns a log page shows ran and spent, asked by the runs the page holds: the roads each walked
// and what it spent, which the agency records and serves no route for yet, so each run stands without its
// figures (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<{ turns: TurnFigures[] }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!isAgentName(name)) {
    throw fail(400, wording("agents.error.bad_agent_name"));
  }

  await requireReadableAgent(event, name);

  return { turns: [] };
});
