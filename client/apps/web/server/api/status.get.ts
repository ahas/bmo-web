import { readLiveRuns, readRecentJobs } from "../utils/job-runs";

import type { JobRecord, StatusView } from "#shared/types";

// What is running now: the chat's turns and the rooms folding, from the receiver's live picture at the moment it
// was read, and the jobs running beside the chat, from the agency's job list. The other runs going on beside the
// chat and the other records of what has just run are lists no unit serves, so they stand empty (docs/boundary.md,
// 「Gaps the console meets」). A unit that does not answer leaves its part of the picture empty rather than
// failing the route.
export default defineEventHandler(async (event): Promise<StatusView> => {
  await requireUserSession(event);

  const [snapshot, jobs, live] = await Promise.all([
    receiverCall(receiver().GET("/live")).then(
      (read) => ({ read: { at: read.at, compacting: read.compacting.map((one) => ({ chatId: one.room, since: one.since })) }, error: null }),
      (error: unknown) => ({ read: null, error })
    ),
    // Only the finished jobs stand among what has just run; the ones under way stand in the live runs.
    readRecentJobs().then(
      (read) => read.filter((job) => job.finishedAt !== null),
      (): JobRecord[] => []
    ),
    readLiveRuns().catch((): [] => [])
  ]);
  const history = { executions: [], watches: [], gates: [], runners: [], jobs, machine: null, nodes: null };

  return snapshot.read === null
    ? { reachable: false, slow: unitSlow(snapshot.error), live, compacting: [], liveAt: null, ...history }
    : { reachable: true, live, compacting: snapshot.read.compacting ?? [], liveAt: snapshot.read.at, ...history };
});
