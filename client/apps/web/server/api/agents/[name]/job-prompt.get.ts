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

  const query = getQuery(event);
  const jobId = readJobId(query.job);

  // The same job the line was read by and judged the same way: the prompt is one of the job's own parts, whatever
  // name the screen was opened under (docs/web.md, 「Access」).
  if (jobId !== null) {
    const job = await readableJob(event, jobId);

    if (job === null) throw fail(404, wording("agents.error.no_such_job"));

    return { prompt: await readJobPrompt(job) };
  }

  await requireReadableAgent(event, name);

  return { prompt: await readWorkerJobPrompt(name, typeof query.run === "string" ? query.run : null) };
});
