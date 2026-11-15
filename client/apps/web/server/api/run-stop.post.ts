import { wording } from "#shared/wording";

import type { RunStopAll, RunStopped, StopTarget } from "#shared/types";

interface RunStopBody {
  target?: unknown;
  unit?: unknown;
  all?: unknown;
  why?: unknown;
}

const kinds: readonly StopTarget["kind"][] = ["execution", "unit", "item"];

function target(value: unknown): StopTarget | null {
  const asked = value as Partial<StopTarget> | null | undefined;

  return typeof asked?.id === "string" && asked.id.trim() !== "" && kinds.some((kind) => kind === asked.kind)
    ? { kind: asked.kind as StopTarget["kind"], id: asked.id.trim() }
    : null;
}

// Ending what is running, from an agent's row on agent management's agents tab or an agent's own screen. The agency's fixed API keeps the jobs and the runs: a job is
// stopped by its state, and a run by its own close. Nothing here decides what a stop means or which kind is
// reached by what: the target travels to the agency, whose own routes have the whole of that. `all` is the
// owner's one press for everything running.
export default defineEventHandler(async (event): Promise<RunStopped | RunStopAll> => {
  await requireUserSession(event);

  const body = await readBody<RunStopBody>(event);
  const why = typeof body?.why === "string" ? body.why : null;
  const asked = target(body?.target)
    ?? (typeof body?.unit === "string" && body.unit.trim() !== "" ? { kind: "unit" as const, id: body.unit.trim() } : null);

  if (body?.all !== true && asked === null) {
    throw fail(400, wording("live.error.stop_target_needed"));
  }

  if (body?.all === true) {
    const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { state: "running,starting" } } }));

    await Promise.all(jobs.items.map((job) => stopJob(job.id, why)));

    return {
      ok: true,
      stopped: jobs.items.map((job) => ({ target: { kind: "item" as const, id: String(job.itemId) }, state: "asked" as const, runs: 1 })),
      refused: []
    };
  }

  const demanded = asked as StopTarget;

  if (demanded.kind === "item") {
    const itemId = Number(demanded.id);
    const jobs = await agencyCall(agency().GET("/jobs", { params: { query: { state: "running,starting" } } }));
    const job = jobs.items.find((one) => one.itemId === itemId);

    if (job === undefined) throw fail(404, wording("live.error.stop_target_absent"));

    await stopJob(job.id, why);
  } else {
    const runId = Number(demanded.id);

    if (!Number.isSafeInteger(runId)) throw fail(400, wording("live.error.stop_target_wrong"));

    await agencyCall(agency().PATCH("/runs/{runId}", {
      params: { path: { runId } },
      body: { state: "stopped", outcome: "stopped", finishedAt: Date.now(), contextTokens: null, messageId: null, finished_at: null, context_tokens: null }
    }));
  }

  return { ok: true, target: demanded, state: "asked", runs: 1 };
});

async function stopJob(jobId: number, why: string | null): Promise<void> {
  await agencyCall(agency().PATCH("/jobs/{jobId}", {
    params: { path: { jobId } },
    body: { state: "stopped", outcome: "stopped", report: why }
  }));
}
