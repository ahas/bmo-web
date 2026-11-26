import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import { requireReadableAgent } from "../../../utils/agent-reach";

import type { JobPrompt } from "#shared/types";

// The prompt of the job a worker's screen keeps its line for, asked when the line is spread: the same job the
// line speaks of, its prompt in the deployment's language with the English its worker was handed, as bmo-job
// reads it.
export default defineEventHandler(async (event): Promise<{ prompt: JobPrompt | null }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!isAgentName(name)) {
    throw fail(400, wording("agents.error.bad_agent_name"));
  }

  await requireReadableAgent(event, name);

  const query = getQuery(event);

  return { prompt: await readWorkerJobPrompt(name, typeof query.run === "string" ? query.run : null, readJobId(query.job)) };
});
