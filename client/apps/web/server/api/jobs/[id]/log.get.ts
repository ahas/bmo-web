import { wording } from "#shared/wording";

import { readJobLog } from "../../../utils/agentlog";

import type { AgentLogPage } from "#shared/types";

// One page of one job's own log, for every screen that follows what a job is doing (docs/web.md,
// 「Where the log comes from」, the TODO panel's Job log entry). A job's lines stand under the agent that did its
// work and carry their job, so the job number is what reaches them: a screen need not know which agent a turn ran
// on, which checkout it ran in, or whether the run ledger holds a row for a turn that has published none.
//
// The job is read as the person signed in, so a job the agency holds back from them is a job that stands nowhere
// here, and the agent its lines stand under is then read as every other agent is: the administrator reads any, and
// anyone else only the agents their own account owns (docs/web.md, 「Access」).
export default defineEventHandler(async (event): Promise<AgentLogPage> => {
  await requireUserSession(event);

  const jobId = readJobId(getRouterParam(event, "id", { decode: true }));

  if (jobId === null) throw fail(400, wording("agents.error.bad_job_id"));

  if ((await readableJob(event, jobId)) === null) throw fail(404, wording("agents.error.no_such_job"));

  const query = getQuery(event);
  const before = readCursor(query.before);
  const after = readCursor(query.after);

  return await readJobLog(jobId, { ...(before === null ? {} : { before }), ...(after === null ? {} : { after }) }, readLimit(query.limit));
});
