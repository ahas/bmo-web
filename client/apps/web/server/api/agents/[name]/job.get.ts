import { isAgentName } from "#shared/config";
import { wording } from "#shared/wording";

import { requireReadableAgent } from "../../../utils/agent-reach";

import type { JobLine } from "#shared/types";

// The job a worker's screen keeps a line for at its foot, as bmo-job reads it: the run the screen was opened at
// where that is one of this worker's jobs, otherwise the one it is running, otherwise its last.
export default defineEventHandler(async (event): Promise<{ job: JobLine | null }> => {
  await requireUserSession(event);

  const name = getRouterParam(event, "name", { decode: true }) ?? "";

  if (!isAgentName(name)) {
    throw fail(400, wording("agents.error.bad_agent_name"));
  }

  await requireReadableAgent(event, name);

  const run = getQuery(event).run;

  return { job: await readWorkerJob(name, typeof run === "string" ? run : null) };
});
