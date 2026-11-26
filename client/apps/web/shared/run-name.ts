// The one name of a run, as every reader that shows it names it (docs/web.md, 「Where the log comes from」,
// 「One run reads one name, everywhere」). A job's run is named by its job, which is how the agency builds the
// name, how the run ledger keys its row, and how every line the run left carries it. A screen never reaches for a turn's ledger row,
// a checkout's name or a session id in its place: those name the turn, the folder and the session, not the run.
//
// The rule is stated once here because the server reads it off the agency's job record and the client names a run
// it holds only as a number.

// The head of a job's run name, before its number.
const JOB_RUN_HEAD = "job-";

/** A job record's run name, or the name its run carries wherever the record has not been given one yet. */
export function jobRunName(job: { id: number; runName: string | null }): string {
  return job.runName ?? `${JOB_RUN_HEAD}${job.id}`;
}

/** A job's run name, built from its number alone. */
export function jobRunNameOf(jobId: number): string {
  return `${JOB_RUN_HEAD}${jobId}`;
}

/** The number of the job a run name speaks of, or null for a name that is no job's. */
export function jobOfRunName(name: string | null | undefined): number | null {
  if (name === null || name === undefined || !name.startsWith(JOB_RUN_HEAD)) return null;

  const id = Number(name.slice(JOB_RUN_HEAD.length));

  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** One run, named as it is named everywhere, with what stands beside it. */
export interface RunIdentity {
  // The run's one name.
  run: string;
  // The item its job is a run of, where one is named.
  item: number | null;
  // The agent whose log its lines stand under, where one is named.
  agent: string | null;
}

/** What stands beside a run's name: its item, then the agent that did the work. Numbers and names only, so the
 * line needs no sentence of its own and reads the same in every language. */
export function runBeside(run: RunIdentity): string {
  return [run.item === null || run.item <= 0 ? null : `#${run.item}`, run.agent === null || run.agent === "" ? null : run.agent]
    .filter((part): part is string => part !== null)
    .join(" · ");
}
