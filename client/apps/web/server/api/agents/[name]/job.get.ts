import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import { requireReadableAgent } from "../../../utils/agent-reach";

import type { JobLine } from "#shared/types";

// The job a worker's screen keeps a line for at its foot: the job its link names, or the run the screen was opened
// at where that is one of this worker's jobs, otherwise the one it is running, otherwise its last. The job number
// reaches it whole whatever name the screen was opened under, since a job's own work is one thing and the agent,
// the checkout and the turn behind it are three names the agency may each change.
export default defineEventHandler(async (event): Promise<{ job: JobLine | null }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!isAgentName(name)) {
    throw fail(400, wording("agents.error.bad_agent_name"));
  }

  await requireReadableAgent(event, name);

  const query = getQuery(event);

  return { job: await readWorkerJob(name, typeof query.run === "string" ? query.run : null, readJobId(query.job)) };
});
